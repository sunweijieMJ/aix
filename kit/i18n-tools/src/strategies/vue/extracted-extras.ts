import type { ExtractedString } from '../../utils/types';

/**
 * Vue 提取器附加在 ExtractedString 上的**框架私有**字段。
 *
 * Why 不进 utils/types.ts：ExtractedString 是框架无关契约，这两项只有 Vue 的
 * 提取器写、Vue 的转换器读（同一进程内对象直传，不经序列化裁剪），放进公共契约
 * 会让 React 侧多背两个永远为空的字段。
 */
export interface VueExtractedExtras {
  /**
   * 该字符串所属 script 块的内容起始偏移（`block.loc.start.offset`；纯 .ts/.js 为 0）。
   *
   * Why 需要它：SFC 允许 `</script><script setup>` 写在同一行，按「行号区间」把 script
   * 字符串分派给块时，边界行上的字符串会同时落进两个块 → 同一条被替换两次 → 第二次在
   * 已改写的内容上按旧行列换算位置，抛无线索的 ts Debug Failure。块起点是绝对偏移，
   * 一条字符串只可能属于一个块。
   */
  scriptBlockStart?: number;
  /**
   * 该字符串所在**动态属性值的外层引号**（`:title='...'` 为 `'`，`:title="..."` 为 `"`）。
   *
   * 替换体 `$t(...)` 里的 key 需要用与外层不冲突的引号，否则 `:title='a ? $t('k') : b'`
   * 在外层单引号处提前闭合，产出坏模板。
   */
  attributeQuote?: '"' | "'";
}

export type VueExtractedString = ExtractedString & VueExtractedExtras;

/** 读取 Vue 私有字段（调用点拿到的静态类型是框架无关的 ExtractedString）。 */
export function vueExtras(extracted: ExtractedString): VueExtractedExtras {
  return extracted as VueExtractedString;
}
