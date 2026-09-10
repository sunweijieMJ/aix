/**
 * 子组件名识别
 *
 * 一个包的 README 里常有多个子组件各自的 API 表（@aix/popper 一个包里就有
 * Popper / Tooltip / Popover / Dropdown / DropdownItem / ContextMenu 六个），
 * 章节标题是唯一的归属线索。提取和查询两端都要用同一套判据，所以放在这里。
 */

/** 章节标题里表示 API 种类的后缀，剥掉后剩下的才可能是组件名 */
const API_KIND_SUFFIX = /\s*(Props|Emits|Events|Slots|属性|事件|插槽)\s*$/;

/**
 * 从章节标题识别子组件名
 *
 * 判据是「剥掉 API 种类后缀后是严格的 PascalCase 标识符」。
 * 这条判据能把 `Tooltip Props` → Tooltip、`WaveformCanvas` → WaveformCanvas 认出来，
 * 同时排除 `Props`（种类名，属于包本身）、`createLocale`（camelCase，是函数不是组件）、
 * `音频来源契约` / `命名插槽穿透块内部（…）`（说明性标题）。
 */
export function toSubComponentName(section: string | undefined): string | null {
  if (!section) return null;
  const name = section.replace(API_KIND_SUFFIX, '').trim();
  return /^[A-Z][A-Za-z0-9]*$/.test(name) ? name : null;
}
