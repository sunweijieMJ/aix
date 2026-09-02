import { PLACEHOLDER_NAME_CHARS } from './constants';

// 含中文范围：生成端 getVariableNameFromExpression 保留中文标识符作占位符名
// （`共{数量}个`），doctor/translate 的占位符采集必须同字符集，否则对中文占位符失明。
// 字符集与 message-shape 的 PLACEHOLDER_NAME 同源，见 PLACEHOLDER_NAME_CHARS 注释。
const IDENT_RE = new RegExp(`^[${PLACEHOLDER_NAME_CHARS}]+`);

/**
 * 提取一段 i18n 文案里所有占位符的「参数名」集合（忽略出现次数与顺序）。
 *
 * 兼容：
 *  - vue-i18n / react-intl（单花括号库）：`{name}` / `{name, plural, ...}` / `{name, select, ...}`
 *  - vue-i18next / react-i18next（双花括号库）：`{{name}}`
 *  - i18next 非转义插值：`{{- name}}`（剥掉前导 `-` 标记取真实名）
 *
 * 用于 doctor 的 placeholder-mismatch 校验、translate 的译文占位符一致性校验：
 * 对比 source 与 target 的名集是否一致。
 *
 * ⚠️ 与 message-shape 的 PLACEHOLDER_TOKEN_SOURCE 是同一问题的第二套口径：本实现按花括号
 * 深度扫描，多支持 ICU select/plural 嵌套子消息，但只取名字、不产出切分位置。两者应收口成
 * 单一 tokenizer；在此之前，任一处补规则都要同步核对另一处的结论是否仍一致。
 *
 * @param usesDoubleBrace - 当前 i18n 库的插值语法是否为双花括号（对应各
 *   `strategies/*\/libraries/*.ts` 的 `usesDoubleBracePlaceholders`）。
 *   双花括号库下，孤立的单花括号 `{...}` 不是插值占位符、只是字面量文本
 *   （i18next 系库运行时对单花括号不做插值），不参与占位符采集——否则会把
 *   源文里恰好出现花括号的普通文本（如「包含{大括号}的文本」）误当占位符，
 *   导致翻译时被禁止改动、审校时被当作真占位符比对，产出错误结果。
 *
 * 只采集**顶层参数名**：按花括号深度遍历，仅在「进入一个顶层花括号」时取紧随的标识符。
 * Why：ICU 的 select/plural 子消息文本本身用花括号包裹（如 `male {He} female {She}`），
 * 不按深度、直接全局正则取名，会把子消息字面量 `He`/`She`/`They` 误当占位符名。由于子消息
 * 文本天然随语言不同，doctor 的 source/target 名集对比会对每条 select/plural 误报 mismatch。
 * 深度法跳过所有嵌套子消息，只保留 `gender`/`count` 这类真正的参数名。
 * 代价：嵌套在子消息内的真实参数（如 plural other 分支里的二级占位符）不被采集，
 * 但 source/target 两侧对称漏采，不产生误报，可接受。
 */
export function extractPlaceholderNames(
  value: string,
  usesDoubleBrace: boolean = false,
): Set<string> {
  const names = new Set<string>();
  let depth = 0;
  let i = 0;

  while (i < value.length) {
    const ch = value[i];

    if (ch === '{') {
      const enteringTopLevel = depth === 0;
      const isDoubleBraceStart = enteringTopLevel && value[i + 1] === '{';

      // 双花括号库下，孤立的单花括号是字面量文本，不进入占位符捕获逻辑，
      // 也不计入深度（其配对的 `}` 会在下方被对称跳过）。
      if (enteringTopLevel && usesDoubleBrace && !isDoubleBraceStart) {
        i++;
        continue;
      }

      depth++;
      i++;
      if (enteringTopLevel) {
        // 双花括号 `{{name}}`：吃掉第二个 `{`
        if (isDoubleBraceStart) {
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

/** 两个占位符名集是否完全一致（translate 丢弃失配译文、merge 告警共用同一判定）。 */
export function placeholderNamesEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) {
    if (!b.has(k)) return false;
  }
  return true;
}
