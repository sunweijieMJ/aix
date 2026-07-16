import type { PackStorageAdapter } from '../../types.js';
import { IndexedDbAdapter } from './indexed-db.adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';

export { LocalStorageAdapter } from './local-storage.adapter.js';
export { IndexedDbAdapter } from './indexed-db.adapter.js';

export type StorageOption = 'localStorage' | 'indexedDB' | PackStorageAdapter;

export function resolveStorageAdapter(
  option: StorageOption | undefined,
  maxEntries: number | undefined,
): PackStorageAdapter {
  if (option === 'indexedDB') {
    if (maxEntries !== undefined) {
      console.warn(
        "[i18n-runtime] maxEntries 仅在 storage: 'localStorage'（默认）时生效，" +
          "storage: 'indexedDB' 时该配置会被忽略（IndexedDB 容量远大于 localStorage，不需要 LRU 淘汰兜底）",
      );
    }
    return new IndexedDbAdapter();
  }
  if (typeof option === 'object') return option;
  return new LocalStorageAdapter({ maxEntries });
}
