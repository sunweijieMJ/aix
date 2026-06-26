const IDENT_RE = /^[A-Za-z0-9_.-]+/;

/**
 * 提取一段 i18n 文案里所有占位符的「参数名」集合（忽略出现次数与顺序）。
 *
 * 兼容：
 *  - vue-i18n / vue-i18next / react-i18next：`{name}` / `{{name}}`
 *  - react-intl ICU：`{name}` / `{name, plural, ...}` / `{name, select, ...}`
 *  - i18next 非转义插值：`{{- name}}`（剥掉前导 `-` 标记取真实名）
 *
 * 用于 doctor 的 placeholder-mismatch 校验：对比 source 与 target 的名集是否一致。
 *
 * 只采集**顶层参数名**：按花括号深度遍历，仅在「进入一个顶层 `{`」时取紧随的标识符。
 * Why：ICU 的 select/plural 子消息文本本身用花括号包裹（如 `male {He} female {She}`），
 * 旧的全局正则会把子消息字面量 `He`/`She`/`They` 误当占位符名。由于子消息文本天然随
 * 语言不同，doctor 的 source/target 名集对比会对每条 select/plural 误报 mismatch。
 * 深度法跳过所有嵌套子消息，只保留 `gender`/`count` 这类真正的参数名。
 * 代价：嵌套在子消息内的真实参数（如 plural other 分支里的二级占位符）不被采集，
 * 但 source/target 两侧对称漏采，不产生误报，可接受。
 */
export function extractPlaceholderNames(value: string): Set<string> {
  const names = new Set<string>();
  let depth = 0;
  let i = 0;

  while (i < value.length) {
    const ch = value[i];

    if (ch === '{') {
      const enteringTopLevel = depth === 0;
      depth++;
      i++;
      if (enteringTopLevel) {
        // 双花括号 `{{name}}`：吃掉第二个 `{`
        if (value[i] === '{') {
          depth++;
          i++;
        }
        // 跳过空白与 i18next 非转义前缀 `-`
        while (i < value.length && /\s/.test(value[i]!)) i++;
        if (value[i] === '-') {
          i++;
          while (i < value.length && /\s/.test(value[i]!)) i++;
        }
        const m = IDENT_RE.exec(value.slice(i));
        if (m) {
          names.add(m[0]);
          i += m[0].length;
        }
      }
      continue;
    }

    if (ch === '}') {
      if (depth > 0) depth--;
      i++;
      continue;
    }

    i++;
  }

  return names;
}
