import type { ResolvedConfig, ResolvedLLMTaskConfig } from '../config';
import { LoggerUtils } from './logger';

/**
 * 用字面量填充自定义 prompt 模板中的 `{token}` 占位符。
 *
 * 单遍扫描（一次正则、命中即查表），而非逐 token 依次替换整串：后者第二轮会扫到第一轮
 * 刚插入的内容，`{jsonText}` 填进去的待翻译文案里若含 `{targetLocale}` 这类字面量
 * （单花括号库下完全合法），会被当占位符二次替换，模型收到被改写过的原文。
 *
 * 替换值按字面量插入、不走 replace 的字符串 replacement 通道，`$&`/`$1`/`$$` 等序列
 * 不被解析——待翻译文案里的 `$100`、`a$b` 原样保留。未知 token 原样保留（模板作者可能
 * 就是想写字面花括号），不静默清空。
 */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, token: string) =>
    Object.prototype.hasOwnProperty.call(vars, token) ? vars[token]! : match,
  );
}

// =============================================================================
// LLM Prompts
//
// 设计要点：
//  - 接受 locales 配置（含 names 扩展表）以解析展示名
//  - 接受 ResolvedLLMTaskConfig（含 prompt.system/user）以支持用户覆盖
//  - 翻译 prompt 显式接受单 targetLocale：多目标场景由调用方循环
// =============================================================================

/**
 * 内置语言展示名表。用户可通过 `locales.names` 增量扩展或覆盖。
 */
const BUILTIN_LOCALE_NAMES: Record<string, string> = {
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
  th: 'Thai',
  vi: 'Vietnamese',
  'zh-CN': 'Chinese',
  'zh-HK': 'Traditional Chinese (Hong Kong)',
  'zh-TW': 'Traditional Chinese (Taiwan)',
  'en-US': 'English',
  'en-GB': 'English (UK)',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'fr-FR': 'French',
  'de-DE': 'German',
  'es-ES': 'Spanish',
  'pt-BR': 'Portuguese',
  'pt-PT': 'Portuguese',
  'ru-RU': 'Russian',
  'ar-SA': 'Arabic',
  'th-TH': 'Thai',
  'vi-VN': 'Vietnamese',
};

/** 已就「缺 {jsonText}」告警过的模板；翻译按 batch × target 循环调用，不去重会刷屏。 */
const warnedUserTemplates = new Set<string>();

/**
 * 自定义翻译 user prompt 缺 `{jsonText}` 占位符时告警。
 *
 * 不抛错也不回退内置模板（用户可能有意只在 system 里给数据），但必须提示：
 * 待翻译 JSON 无处可插 → 模型收到一段没有数据的指令，整批译文静默为空。
 */
function warnIfMissingJsonTextToken(template: string): void {
  if (template.includes('{jsonText}')) return;
  if (warnedUserTemplates.has(template)) return;
  warnedUserTemplates.add(template);
  LoggerUtils.warn(
    '⚠️ 自定义翻译 user prompt 未包含 {jsonText} 占位符，待翻译数据不会被注入 prompt。\n' +
      '   影响：模型收不到任何待翻译条目，本轮译文可能整批为空。\n' +
      '   建议：在 llm.translation.prompt.user 模板中加入 {jsonText}。',
  );
}

/**
 * 解析语言代码到展示名。优先 locales.names，回退内置表，再回退 code 本身。
 */
function getLocaleName(code: string, locales: ResolvedConfig['locales']): string {
  return locales.names[code] ?? BUILTIN_LOCALE_NAMES[code] ?? code;
}

/**
 * ID 生成 System Prompt
 */
export function getIdGenerationSystemPrompt(
  locales: ResolvedConfig['locales'],
  task: ResolvedLLMTaskConfig,
): string {
  if (task.prompt.system) {
    return task.prompt.system;
  }

  const sourceName = getLocaleName(locales.source, locales);

  return `You are an i18n key ID generator. Given a list of ${sourceName} texts, generate semantic camelCase English IDs for each text.

Rules:
1. Each ID should be a concise, semantic camelCase English identifier (e.g., "submitButton", "confirmDelete", "userNameLabel")
2. IDs should reflect the meaning of the ${sourceName} text
3. Keep IDs short but descriptive (2-4 words combined)
4. Use common abbreviations where appropriate (e.g., "btn" for button, "msg" for message, "info" for information)
5. The number of returned IDs MUST exactly match the number of input texts
6. Return valid JSON only

Output format: {"id_list": ["id1", "id2", ...]}`;
}

/**
 * ID 生成 User Prompt
 */
export function getIdGenerationUserPrompt(
  textList: string[],
  locales: ResolvedConfig['locales'],
  task: ResolvedLLMTaskConfig,
): string {
  if (task.prompt.user) {
    return fillTemplate(task.prompt.user, {
      count: String(textList.length),
      textList: JSON.stringify(textList, null, 2),
    });
  }

  const sourceName = getLocaleName(locales.source, locales);
  return `Generate semantic IDs for the following ${textList.length} ${sourceName} texts:\n${JSON.stringify(textList, null, 2)}`;
}

/**
 * 翻译 System Prompt（单目标语种）
 *
 * @param usesDoubleBracePlaceholders - 当前 i18n 库的插值语法是否为双花括号
 *   `{{name}}`（react-i18next / vue-i18next）；否则为单花括号 `{name}`
 *   （vue-i18n / react-intl ICU）。与 `extractPlaceholderNames` 的同名参数
 *   同源（均取自 library.usesDoubleBracePlaceholders），两处必须保持一致：
 *   prompt 告诉模型"什么是占位符、什么可以正常翻译"，validator 用同一套
 *   标准校验译文，标准不一致会导致 validator 拒绝模型认为正确的输出，
 *   或放行模型未受保护、错误处理的文本（双花括号库下若不传本参数，模型会把源文里
 *   恰好出现的单花括号内容当占位符原样保留，validator 用同一套 ASCII 标识符规则也
 *   判断不出，中文/非标识符内容就混进了目标语言的 locale 文件）。
 */
export function getTranslationSystemPrompt(
  locales: ResolvedConfig['locales'],
  task: ResolvedLLMTaskConfig,
  targetLocale: string,
  usesDoubleBracePlaceholders: boolean = false,
): string {
  const sourceCode = locales.source;
  const sourceName = getLocaleName(sourceCode, locales);
  const targetName = getLocaleName(targetLocale, locales);

  // 自定义 system prompt 同样做模板填充：翻译是 per-target 循环调用的，原样返回意味着
  // 所有语种收到字面完全相同的 system prompt，用户无法在自定义模板里指明目标语种。
  if (task.prompt.system) {
    return fillTemplate(task.prompt.system, {
      sourceLocale: sourceCode,
      sourceName,
      targetLocale,
      targetName,
    });
  }

  const placeholderRules = usesDoubleBracePlaceholders
    ? `5. CRITICAL — interpolation placeholders use DOUBLE curly braces \`{{name}}\`. The text inside \`{{...}}\` is a variable identifier that must be preserved EXACTLY:
   - Do NOT translate the words inside \`{{}}\` (e.g., \`{{userName}}\` must NOT become \`{{user name}}\` or \`{{用户名}}\`)
   - Do NOT change case (\`{{count}}\` must NOT become \`{{Count}}\`)
   - Do NOT add/remove spaces or punctuation inside \`{{}}\`
   - Do NOT split or merge placeholders
   - The set of \`{{...}}\` placeholders in your output MUST be identical to the input (same names, same count)
   - A SINGLE curly brace like \`{word}\` (not doubled) is ordinary literal text, NOT a placeholder — translate everything inside it normally, just like the surrounding text`
    : `5. CRITICAL — NEVER translate interpolation placeholders. The text inside curly braces \`{...}\` is a variable identifier that must be preserved EXACTLY:
   - Do NOT translate the words inside \`{}\` (e.g., \`{userName}\` must NOT become \`{user name}\` or \`{用户名}\`)
   - Do NOT change case (\`{count}\` must NOT become \`{Count}\`)
   - Do NOT add/remove spaces or punctuation inside \`{}\`
   - Do NOT split or merge placeholders
   - The set of placeholders in your output MUST be identical to the input (same names, same count)`;

  const examples = usesDoubleBracePlaceholders
    ? `Example (correct — double-brace placeholder preserved):
Input: {"loginWelcome": {"${sourceCode}": "欢迎 {{userName}}，您有 {{count}} 条消息", "${targetLocale}": ""}}
Output: {"loginWelcome": {"${sourceCode}": "欢迎 {{userName}}，您有 {{count}} 条消息", "${targetLocale}": "Welcome {{userName}}, you have {{count}} messages"}}

Example (correct — single brace is ordinary text, translate it normally):
Input: {"specialText": {"${sourceCode}": "包含{大括号}的文本", "${targetLocale}": ""}}
Output: {"specialText": {"${sourceCode}": "包含{大括号}的文本", "${targetLocale}": "Text containing braces"}}

Example (WRONG — double-brace placeholder translated, do not do this):
Input  placeholder: \`{{内部错误网络异常}}\`
WRONG output:       \`{{internal error network exception}}\`   ← runtime cannot match this key
RIGHT output:       \`{{内部错误网络异常}}\`                    ← keep identifier verbatim`
    : `Example (correct):
Input: {"loginWelcome": {"${sourceCode}": "欢迎 {userName}，您有 {count} 条消息", "${targetLocale}": ""}}
Output: {"loginWelcome": {"${sourceCode}": "欢迎 {userName}，您有 {count} 条消息", "${targetLocale}": "Welcome {userName}, you have {count} messages"}}

Example (WRONG — placeholder translated, do not do this):
Input  placeholder: \`{内部错误网络异常}\`
WRONG output:       \`{internal error network exception}\`   ← runtime cannot match this key
RIGHT output:       \`{内部错误网络异常}\`                    ← keep identifier verbatim`;

  return `You are a professional translator. Translate the ${sourceName} values (${sourceCode}) in the given JSON to ${targetName} (${targetLocale}).

Rules:
1. Keep the JSON structure exactly the same
2. Only translate ${sourceCode} values to ${targetLocale}, do not modify keys or ${sourceCode} values
3. If ${targetLocale} already has a value, keep it unchanged
4. Translations should be natural and professional
${placeholderRules}
6. NEVER translate HTML tags like <strong>, <br/>, <span> — keep them as-is
7. Return valid JSON only, no markdown code fences

${examples}`;
}

/**
 * 翻译 User Prompt（单目标语种）
 */
export function getTranslationUserPrompt(
  jsonText: string,
  locales: ResolvedConfig['locales'],
  task: ResolvedLLMTaskConfig,
  targetLocale: string,
): string {
  const sourceName = getLocaleName(locales.source, locales);
  const targetName = getLocaleName(targetLocale, locales);

  if (task.prompt.user) {
    warnIfMissingJsonTextToken(task.prompt.user);
    return fillTemplate(task.prompt.user, {
      jsonText,
      sourceLocale: locales.source,
      sourceName,
      targetLocale,
      targetName,
    });
  }

  return `Translate the following i18n entries from ${sourceName} to ${targetName}:\n${jsonText}`;
}
