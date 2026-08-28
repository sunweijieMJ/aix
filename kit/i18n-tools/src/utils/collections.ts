/**
 * 与文件、locale、AST 都无关的通用集合操作。
 *
 * 职责边界：只做纯数据变换（入参出参都是普通 JS 值），不做 IO、不认业务语义。
 * 这里的函数原先挂在 FileUtils 上——那是"文件工具类"当杂物抽屉用的遗留，
 * 与其文件 IO 职责毫无关系。
 */

export function groupBy<T>(items: T[], getKey: (item: T) => string): Record<string, T[]> {
  return items.reduce(
    (groups, item) => {
      const key = getKey(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<string, T[]>,
  );
}
