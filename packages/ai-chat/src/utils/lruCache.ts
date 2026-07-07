// 共享 LRU 缓存工厂：以 Map 迭代顺序（ES2015 规范保证「插入顺序」）承载「最近使用」次序，
// 命中即把该项移到末尾刷新热度，容量越界时从头部淘汰最久未访问项。
// 高亮结果、mermaid SVG、已加载图片 URL 三处缓存共用同一策略，避免各自手写副本行为发散。

/** LRU 缓存实例接口：get/has 命中均刷新热度 */
export interface LruCache<K, V> {
  /** 取值：命中返回值并刷新热度，未命中返回 undefined */
  get(key: K): V | undefined;
  /** 存值：写入并刷新热度，越界时淘汰最旧项 */
  set(key: K, value: V): void;
  /** 判存：命中返回 true 并刷新热度（供以 value 为占位的「集合」语义复用） */
  has(key: K): boolean;
  /** 主动移除某项（如缓存直出后实际加载失败需清除该键） */
  delete(key: K): boolean;
  /** 清空（测试钩子复位缓存用） */
  clear(): void;
}

/**
 * 创建容量上限为 max 的 LRU 缓存。
 * 淘汰依据：Map 迭代顺序即插入/刷新顺序，keys().next() 恒取最久未访问项；
 * get/has 命中时 delete+set 把热键移到末尾，故越界删除的恒为最旧项。
 */
export function createLruCache<K, V>(max: number): LruCache<K, V> {
  const store = new Map<K, V>();
  // 刷新热度：删后重插，使该键落到迭代末尾（最新访问）
  const touch = (key: K, value: V) => {
    store.delete(key);
    store.set(key, value);
  };
  return {
    get(key) {
      const hit = store.get(key);
      if (hit !== undefined) touch(key, hit);
      return hit;
    },
    set(key, value) {
      touch(key, value);
      // 越界淘汰：迭代头部即最旧键
      if (store.size > max) store.delete(store.keys().next().value!);
    },
    has(key) {
      if (!store.has(key)) return false;
      touch(key, store.get(key)!);
      return true;
    },
    delete: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
