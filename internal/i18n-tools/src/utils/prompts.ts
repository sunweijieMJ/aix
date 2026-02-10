import type { LocaleConfig, PromptsConfig } from '../config';

/**
 * 语言名称映射
 */
const LOCALE_NAMES: Record<string, string> = {
  'zh-CN': 'Chinese',
  'en-US': 'English',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'fr-FR': 'French',
  'de-DE': 'German',
  'es-ES': 'Spanish',
  'pt-BR': 'Portuguese',
  'ru-RU': 'Russian',
  'ar-SA': 'Arabic',
  'th-TH': 'Thai',
  'vi-VN': 'Vietnamese',
};

function getLocaleName(code: string): string {
  return LOCALE_NAMES[code] || code;
}

/**
 * ID 生成 System Prompt
 */
export function getIdGenerationSystemPrompt(
  locale?: LocaleConfig,
  customPrompts?: PromptsConfig,
): string {
  if (customPrompts?.idGeneration?.system) {
    return customPrompts.idGeneration.system;
  }

  const sourceName = getLocaleName(locale?.source || 'zh-CN');

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
  locale?: LocaleConfig,
  customPrompts?: PromptsConfig,
): string {
  if (customPrompts?.idGeneration?.user) {
    return customPrompts.idGeneration.user
      .replace('{count}', String(textList.length))
      .replace('{textList}', JSON.stringify(textList, null, 2));
  }

  const sourceName = getLocaleName(locale?.source || 'zh-CN');
  return `Generate semantic IDs for the following ${textList.length} ${sourceName} texts:\n${JSON.stringify(textList, null, 2)}`;
}

/**
 * 翻译 System Prompt
 */
export function getTranslationSystemPrompt(
  locale?: LocaleConfig,
  customPrompts?: PromptsConfig,
): string {
  if (customPrompts?.translation?.system) {
    return customPrompts.translation.system;
  }

  const sourceCode = locale?.source || 'zh-CN';
  const targetCode = locale?.target || 'en-US';
  const sourceName = getLocaleName(sourceCode);
  const targetName = getLocaleName(targetCode);

  return `You are a professional translator. Translate the ${sourceName} values (${sourceCode}) in the given JSON to ${targetName} (${targetCode}).

Rules:
1. Keep the JSON structure exactly the same
2. Only translate ${sourceCode} values to ${targetCode}, do not modify keys or ${sourceCode} values
3. If ${targetCode} already has a value, keep it unchanged
4. Translations should be natural and professional
5. NEVER translate interpolation variables like {name}, {count}, {0} — keep them as-is
6. NEVER translate HTML tags like <strong>, <br/>, <span> — keep them as-is
7. Return valid JSON only, no markdown code fences

Example:
Input: {"loginWelcome": {"${sourceCode}": "欢迎 {name}，您有 {count} 条消息", "${targetCode}": ""}}
Output: {"loginWelcome": {"${sourceCode}": "欢迎 {name}，您有 {count} 条消息", "${targetCode}": "Welcome {name}, you have {count} messages"}}`;
}

/**
 * 翻译 User Prompt
 */
export function getTranslationUserPrompt(
  jsonText: string,
  locale?: LocaleConfig,
  customPrompts?: PromptsConfig,
): string {
  if (customPrompts?.translation?.user) {
    return customPrompts.translation.user.replace('{jsonText}', jsonText);
  }

  const sourceName = getLocaleName(locale?.source || 'zh-CN');
  const targetName = getLocaleName(locale?.target || 'en-US');
  return `Translate the following i18n entries from ${sourceName} to ${targetName}:\n${jsonText}`;
}
