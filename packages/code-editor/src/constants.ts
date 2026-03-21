import type { LanguageSupport } from '@codemirror/language';
import type { CodeLanguage } from './types';

/** 语言 → 动态 import 工厂映射（按需加载） */
const LANGUAGE_LOADERS: Record<CodeLanguage, () => Promise<LanguageSupport>> = {
  javascript: async () => {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript();
  },
  typescript: async () => {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ typescript: true });
  },
  json: async () => {
    const { json } = await import('@codemirror/lang-json');
    return json();
  },
  html: async () => {
    const { html } = await import('@codemirror/lang-html');
    return html();
  },
  css: async () => {
    const { css } = await import('@codemirror/lang-css');
    return css();
  },
  python: async () => {
    const { python } = await import('@codemirror/lang-python');
    return python();
  },
  java: async () => {
    const { java } = await import('@codemirror/lang-java');
    return java();
  },
  go: async () => {
    const { go } = await import('@codemirror/lang-go');
    return go();
  },
  rust: async () => {
    const { rust } = await import('@codemirror/lang-rust');
    return rust();
  },
  cpp: async () => {
    const { cpp } = await import('@codemirror/lang-cpp');
    return cpp();
  },
  php: async () => {
    const [{ php }, { html }] = await Promise.all([
      import('@codemirror/lang-php'),
      import('@codemirror/lang-html'),
    ]);
    return php({ baseLanguage: html().language });
  },
  sql: async () => {
    const { sql } = await import('@codemirror/lang-sql');
    return sql();
  },
  yaml: async () => {
    const { yaml } = await import('@codemirror/lang-yaml');
    return yaml();
  },
  xml: async () => {
    const { xml } = await import('@codemirror/lang-xml');
    return xml();
  },
  markdown: async () => {
    const { markdown } = await import('@codemirror/lang-markdown');
    return markdown();
  },
  sass: async () => {
    const { sass } = await import('@codemirror/lang-sass');
    return sass();
  },
  vue: async () => {
    const { vue } = await import('@codemirror/lang-vue');
    return vue();
  },
  angular: async () => {
    const { angular } = await import('@codemirror/lang-angular');
    return angular();
  },
  liquid: async () => {
    const { liquid } = await import('@codemirror/lang-liquid');
    return liquid();
  },
  wast: async () => {
    const { wast } = await import('@codemirror/lang-wast');
    return wast();
  },
};

/** 语言加载缓存（避免重复加载） */
const languageCache = new Map<CodeLanguage, LanguageSupport>();

/** 异步获取语言扩展（按需加载 + 缓存） */
export async function getLanguageExtension(
  lang: CodeLanguage,
): Promise<LanguageSupport> {
  const cached = languageCache.get(lang);
  if (cached) return cached;

  const loader = LANGUAGE_LOADERS[lang];
  if (!loader) {
    // fallback 到 javascript
    return getLanguageExtension('javascript');
  }

  const langSupport = await loader();
  languageCache.set(lang, langSupport);
  return langSupport;
}
