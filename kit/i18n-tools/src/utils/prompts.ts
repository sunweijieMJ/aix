import type { ResolvedConfig, ResolvedLLMTaskConfig } from '../config';

/**
 * 用字面量填充自定义 prompt 模板中的 `{token}` 占位符。
 *
 * Why split/join 而非 String.prototype.replace：
 *  - replace 的字符串 replacement 会解析 `$&`/`$1`/`` $` ``/`$'`/`$$` 特殊序列，
 *    待翻译文案里的 `$100`、`a$b` 等会被静默改写/丢字 → 模型收到错误文本。
 *  - replace(string, string) 只替换首个匹配，模板里重复占位符时第二个不生效。
 * split(token).join(value) 两个问题都规避：替换全部出现、value 按字面量插入。
 */
function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
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
 */
export function getTranslationSystemPrompt(
  locales: ResolvedConfig['locales'],
  task: ResolvedLLMTaskConfig,
  targetLocale: string,
): string {
  if (task.prompt.system) {
    return task.prompt.system;
  }

  const sourceCode = locales.source;
  const sourceName = getLocaleName(sourceCode, locales);
  const targetName = getLocaleName(targetLocale, locales);

  return `You are a professional translator. Translate the ${sourceName} values (${sourceCode}) in the given JSON to ${targetName} (${targetLocale}).

Rules:
1. Keep the JSON structure exactly the same
2. Only translate ${sourceCode} values to ${targetLocale}, do not modify keys or ${sourceCode} values
3. If ${targetLocale} already has a value, keep it unchanged
4. Translations should be natural and professional
5. CRITICAL — NEVER translate interpolation placeholders. The text inside curly braces \`{...}\` is a variable identifier that must be preserved EXACTLY:
   - Do NOT translate the words inside \`{}\` (e.g., \`{userName}\` must NOT become \`{user name}\` or \`{用户名}\`)
   - Do NOT change case (\`{count}\` must NOT become \`{Count}\`)
   - Do NOT add/remove spaces or punctuation inside \`{}\`
   - Do NOT split or merge placeholders
   - The set of placeholders in your output MUST be identical to the input (same names, same count)
6. NEVER translate HTML tags like <strong>, <br/>, <span> — keep them as-is
7. Return valid JSON only, no markdown code fences

Example (correct):
Input: {"loginWelcome": {"${sourceCode}": "欢迎 {userName}，您有 {count} 条消息", "${targetLocale}": ""}}
Output: {"loginWelcome": {"${sourceCode}": "欢迎 {userName}，您有 {count} 条消息", "${targetLocale}": "Welcome {userName}, you have {count} messages"}}

Example (WRONG — placeholder translated, do not do this):
Input  placeholder: \`{内部错误网络异常}\`
WRONG output:       \`{internal error network exception}\`   ← runtime cannot match this key
RIGHT output:       \`{内部错误网络异常}\`                    ← keep identifier verbatim`;
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
  if (task.prompt.user) {
    return fillTemplate(task.prompt.user, { jsonText });
  }

  const sourceName = getLocaleName(locales.source, locales);
  const targetName = getLocaleName(targetLocale, locales);
  return `Translate the following i18n entries from ${sourceName} to ${targetName}:\n${jsonText}`;
}
