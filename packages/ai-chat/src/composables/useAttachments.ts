import { ref, computed, onScopeDispose, getCurrentScope, type Ref, type ComputedRef } from 'vue';
import type { AttachmentItem } from '../types';
import { genBlockId } from '../utils/helpers';

/** 输入区待发附件（在 AttachmentItem 上叠加上传过程态） */
export interface PendingAttachment extends AttachmentItem {
  status: 'uploading' | 'done' | 'error';
  /** 上传进度 0-100；upload 实现不回报则保持 undefined（UI 显示不确定态） */
  percent?: number;
  /** 原始文件（error 重试用） */
  file?: File;
  /** 失败原因（卡片 title 提示） */
  error?: unknown;
}

export interface UseAttachmentsOptions {
  /** 上传实现（必填）；ctx.signal 在条目被删除/作用域销毁时中断上传 */
  upload: (
    file: File,
    ctx: { onProgress: (percent: number) => void; signal: AbortSignal },
  ) => Promise<Omit<AttachmentItem, 'id'>>;
  /** 文件类型过滤（input accept 语法：".pdf" / "image/png" / "image/*"），默认不限。
   *  对 add 的所有入口生效（点击选择、拖拽、粘贴），与原生 input 的 accept 行为对齐 */
  accept?: string;
  /** 最大附件数，默认 9 */
  maxCount?: number;
  /** 单文件字节上限，默认不限 */
  maxSize?: number;
  /** 文件被拒（类型不符/超数量/超大小）或上传失败时通知；toast 等提示由业务做 */
  onReject?: (file: File, reason: 'accept' | 'count' | 'size' | 'upload', error?: unknown) => void;
}

export interface UseAttachmentsReturn {
  items: Ref<PendingAttachment[]>;
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  retry: (id: string) => void;
  clear: () => void;
  isUploading: ComputedRef<boolean>;
  /** 取出全部 done 条目（剥离过程态字段）并从列表移除，发送时调用 */
  drain: () => AttachmentItem[];
}

/** 判断文件是否匹配 input accept 语法（".ext" / "type/subtype" / "type/*"）；accept 为空视为全匹配 */
const matchesAccept = (file: File, accept?: string): boolean => {
  const tokens = (accept ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
};

export function useAttachments(options: UseAttachmentsOptions): UseAttachmentsReturn {
  const { upload, accept, maxCount = 9, maxSize, onReject } = options;
  const items = ref<PendingAttachment[]>([]);
  // 条目 id → 该条上传的中断器（remove/clear/scope 销毁时 abort）
  const ctrls = new Map<string, AbortController>();

  const startUpload = (entry: PendingAttachment, f: File) => {
    const ctrl = new AbortController();
    ctrls.set(entry.id, ctrl);
    entry.status = 'uploading';
    entry.percent = undefined;
    entry.error = undefined;
    upload(f, {
      onProgress: (p) => {
        if (Number.isNaN(p)) return; // 防御 upload 实现除零等误传 NaN（避免 UI 显示 "NaN%"）
        // 取回数组内响应式代理，确保 percent mutate 触发视图更新（响应式陷阱教训）
        const cur = items.value.find((it) => it.id === entry.id);
        if (cur) cur.percent = Math.max(0, Math.min(100, p));
      },
      signal: ctrl.signal,
    })
      .then((result) => {
        const cur = items.value.find((it) => it.id === entry.id);
        if (!cur) return; // 已被删除
        Object.assign(cur, result, { status: 'done' as const, file: undefined });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return; // 删除导致的中断不算失败
        const cur = items.value.find((it) => it.id === entry.id);
        if (!cur) return;
        cur.status = 'error';
        cur.error = err;
        onReject?.(f, 'upload', err);
      })
      .finally(() => {
        // 只删属于本次上传的 controller，防止快速 retry 时旧 finally 误删新 controller
        if (ctrls.get(entry.id) === ctrl) {
          ctrls.delete(entry.id);
        }
      });
  };

  const add = (files: File[] | FileList) => {
    for (const f of Array.from(files)) {
      // 类型过滤对所有入口统一生效：原生 input 的 accept 拦不住拖拽/粘贴，这里兜底
      if (!matchesAccept(f, accept)) {
        onReject?.(f, 'accept');
        continue;
      }
      if (items.value.length >= maxCount) {
        onReject?.(f, 'count');
        continue;
      }
      if (maxSize != null && f.size > maxSize) {
        onReject?.(f, 'size');
        continue;
      }
      const entry: PendingAttachment = {
        id: genBlockId(),
        name: f.name,
        size: f.size,
        mime: f.type || undefined,
        status: 'uploading',
        file: f,
      };
      items.value.push(entry);
      // 取数组内的响应式代理再启动，确保进度/结果写入能触发视图更新
      const proxy = items.value[items.value.length - 1] as PendingAttachment;
      startUpload(proxy, f);
    }
  };

  const remove = (id: string) => {
    ctrls.get(id)?.abort();
    ctrls.delete(id);
    const idx = items.value.findIndex((it) => it.id === id);
    if (idx !== -1) items.value.splice(idx, 1);
  };

  const retry = (id: string) => {
    const cur = items.value.find((it) => it.id === id);
    if (!cur || cur.status !== 'error' || !cur.file) return;
    startUpload(cur, cur.file);
  };

  const clear = () => {
    for (const c of ctrls.values()) c.abort();
    ctrls.clear();
    items.value = [];
  };

  const isUploading = computed(() => items.value.some((it) => it.status === 'uploading'));

  const drain = (): AttachmentItem[] => {
    const done = items.value.filter((it) => it.status === 'done');
    items.value = items.value.filter((it) => it.status !== 'done');
    // 剥离过程态字段，返回稳定的 AttachmentItem 形态
    return done.map(({ status: _s, percent: _p, file: _f, error: _e, ...rest }) => rest);
  };

  // 组件外调用（无活跃 scope）时跳过，与包内其他 composable 行为一致
  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const c of ctrls.values()) c.abort();
      ctrls.clear();
    });
  }

  return { items, add, remove, retry, clear, isUploading, drain };
}
