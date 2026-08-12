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
  /**
   * 条目被丢弃时通知（`remove` 单条移除 / `clear` 整体清空 / **所在 scope 销毁**），
   * 供业务回收 upload 时在服务端产生的资源（典型是按 `extra` 里的文件 id 调删除接口）。
   *
   * **`drain` 不触发**：那是「发送」路径，条目虽然也离开了列表，但文件正要交给后端使用，
   * 此时回收会把刚发出去的附件删掉。
   *
   * 组件卸载（scope 销毁）走的是 `clear` 同一条路，故实现须**幂等且能容忍在卸载后调用**：
   * 里面通常是一次 fire-and-forget 的删除请求，不要依赖组件自身的响应式状态。
   *
   * 回调拿到的是带过程态的条目：`status !== 'done'` 说明上传还没完成（此时通常没有服务端
   * 资源可回收，`extra` 也可能是空的），业务需要自行判断。
   */
  onRemove?: (item: PendingAttachment) => void;
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
  /**
   * 回显传入的 `accept`（不参与任何内部逻辑，内部过滤走闭包里的 options.accept）。
   * 存在的理由：`Sender` 支持直接注入本实例（而非配置对象），此时它拿不到原始 options，
   * 却仍要把 accept 喂给隐藏 `<input accept>` 做原生选择器过滤。缺了它只会**软降级**
   * （文件仍会被 add 里的 matchesAccept 拒掉并触发 onReject），但体验从「选不中」退化成
   * 「选了才被拒」，故补上这一路回显。
   */
  accept?: string;
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
  const { upload, accept, maxCount = 9, maxSize, onReject, onRemove } = options;
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
    if (idx === -1) return;
    // 先取出再摘除：splice 之后拿不到条目，业务就没法按 extra 回收服务端资源
    const [removed] = items.value.splice(idx, 1);
    if (removed) onRemove?.(removed);
  };

  const retry = (id: string) => {
    const cur = items.value.find((it) => it.id === id);
    if (!cur || cur.status !== 'error' || !cur.file) return;
    startUpload(cur, cur.file);
  };

  const clear = () => {
    for (const c of ctrls.values()) c.abort();
    ctrls.clear();
    const dropped = items.value;
    items.value = [];
    // 与 remove 同样是「丢弃」语义，逐条通知业务回收
    if (onRemove) for (const it of dropped) onRemove(it);
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
      // 走 clear() 而不是只 abort：销毁同样是「丢弃」语义，条目再也回不来了，
      // 业务在 upload 里于服务端产生的资源必须有机会回收。此前只中断在途请求，
      // 已经**传完**（status 'done'）的条目连同它们的 extra 一起被静默丢掉——
      // onRemove 永不触发，服务端文件就成了没人认领的孤儿。典型触发场景是把 AiChat
      // 挂在 v-if 侧边栏里：用户传完附件没发就关掉面板，每关一次漏一批。
      //
      // clear() 内部已含 abort 全部在途请求 + 清空 ctrls，故不必重复。
      // 宿主注入实例（UseAttachmentsReturn）时本钩子归属**宿主自己**的 scope
      // （Sender 那条路不会再 useAttachments），不存在「Sender 卸载清空宿主状态」。
      clear();
    });
  }

  return { items, add, remove, retry, clear, isUploading, drain, accept };
}
