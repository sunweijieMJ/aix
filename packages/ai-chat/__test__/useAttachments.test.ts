import { describe, it, expect, vi } from 'vitest';
import { effectScope } from 'vue';
import { useAttachments } from '../src/composables/useAttachments';
import type { AttachmentItem } from '../src/types';

/** upload 的真实返回契约（与 UseAttachmentsOptions.upload 对齐，含 extra 等可选字段） */
type UploadResult = Omit<AttachmentItem, 'id'>;

const file = (name = 'a.pdf', size = 100) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

/** 可手动 resolve/reject 的 upload mock */
const deferredUpload = () => {
  const resolvers: Array<{
    resolve: (v: UploadResult) => void;
    reject: (e: unknown) => void;
    signal: AbortSignal;
    onProgress: (p: number) => void;
  }> = [];
  const upload = vi.fn(
    // 参数前缀下划线表明有意不使用，规避 noUnusedParameters 报错
    (_f: File, ctx: { onProgress: (p: number) => void; signal: AbortSignal }) =>
      new Promise<UploadResult>((resolve, reject) => {
        resolvers.push({ resolve, reject, signal: ctx.signal, onProgress: ctx.onProgress });
      }),
  );
  return { upload, resolvers };
};

/** 等上传 promise 链落定 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('useAttachments', () => {
  it('add → uploading（进度回报）→ done 全路径', async () => {
    const { upload, resolvers } = deferredUpload();
    const api = useAttachments({ upload });
    expect(api.items.value).toEqual([]);
    api.add([file()]);
    expect(api.items.value[0]!.status).toBe('uploading');
    expect(api.items.value[0]!.name).toBe('a.pdf');
    expect(api.isUploading.value).toBe(true);
    resolvers[0]!.onProgress(30);
    expect(api.items.value[0]!.percent).toBe(30);
    resolvers[0]!.onProgress(NaN); // upload 实现除零等误传：忽略，保持上一次有效值
    expect(api.items.value[0]!.percent).toBe(30);
    resolvers[0]!.resolve({ name: 'a.pdf', url: '/f/1' });
    await flush();
    expect(api.items.value[0]!.status).toBe('done');
    expect(api.items.value[0]!.url).toBe('/f/1');
    expect(api.items.value[0]!.id).toBeTruthy();
    expect(api.isUploading.value).toBe(false);
  });

  it('上传失败 → error 态并触发 onReject(file,"upload",err)', async () => {
    const { upload, resolvers } = deferredUpload();
    const onReject = vi.fn();
    const api = useAttachments({ upload, onReject });
    const f = file();
    api.add([f]);
    const err = new Error('boom');
    resolvers[0]!.reject(err);
    await flush();
    expect(api.items.value[0]!.status).toBe('error');
    expect(api.items.value[0]!.error).toBe(err);
    expect(onReject).toHaveBeenCalledWith(f, 'upload', err);
  });

  it('retry 重新上传同一文件', async () => {
    const { upload, resolvers } = deferredUpload();
    const api = useAttachments({ upload });
    const f = file();
    api.add([f]);
    resolvers[0]!.reject(new Error('boom'));
    await flush();
    api.retry(api.items.value[0]!.id);
    expect(api.items.value[0]!.status).toBe('uploading');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1]![0]).toBe(f);
  });

  it('快速 retry：旧 Promise 的 finally 不应删除新 controller', async () => {
    const { upload, resolvers } = deferredUpload();
    const api = useAttachments({ upload });
    api.add([file()]);
    resolvers[0]!.reject(new Error('first fail'));
    // 精确推进 2 个微任务：让旧 Promise 的 .catch 执行（status → error），
    // 但旧 .finally（第 3 个微任务）尚未执行——复现「旧 finally 晚于新 set」窗口
    await Promise.resolve();
    await Promise.resolve();
    expect(api.items.value[0]!.status).toBe('error');

    api.retry(api.items.value[0]!.id); // 开新传，ctrls.set(id, ctrl_B)
    await flush(); // 旧 .finally 在此期间执行（旧逻辑会误删 ctrl_B）

    const id = api.items.value[0]!.id;
    api.remove(id);
    expect(resolvers[1]!.signal.aborted).toBe(true); // 修复后才能 abort 到新上传
  });

  it('remove 上传中条目：移除并 abort 其上传', () => {
    const { upload, resolvers } = deferredUpload();
    const api = useAttachments({ upload });
    api.add([file()]);
    api.remove(api.items.value[0]!.id);
    expect(api.items.value).toHaveLength(0);
    expect(resolvers[0]!.signal.aborted).toBe(true);
  });

  it('maxCount 超出：不入列并 onReject(file,"count")', () => {
    const { upload } = deferredUpload();
    const onReject = vi.fn();
    const api = useAttachments({ upload, maxCount: 1, onReject });
    const f2 = file('b.pdf');
    api.add([file(), f2]);
    expect(api.items.value).toHaveLength(1);
    expect(onReject).toHaveBeenCalledWith(f2, 'count');
  });

  it('maxSize 超出：不入列并 onReject(file,"size")', () => {
    const { upload } = deferredUpload();
    const onReject = vi.fn();
    const api = useAttachments({ upload, maxSize: 50, onReject });
    const big = file('big.pdf', 100);
    api.add([big]);
    expect(api.items.value).toHaveLength(0);
    expect(onReject).toHaveBeenCalledWith(big, 'size');
  });

  describe('accept 类型过滤（对 add 的所有入口生效，含拖拽/粘贴）', () => {
    const typed = (name: string, type: string) => new File([new Uint8Array(10)], name, { type });

    it('扩展名形态 ".pdf"：不匹配的文件 onReject(file,"accept")，匹配的入列', () => {
      const { upload } = deferredUpload();
      const onReject = vi.fn();
      const api = useAttachments({ upload, accept: '.pdf', onReject });
      const txt = typed('note.txt', 'text/plain');
      api.add([typed('doc.pdf', 'application/pdf'), txt]);
      expect(api.items.value).toHaveLength(1);
      expect(api.items.value[0]!.name).toBe('doc.pdf');
      expect(onReject).toHaveBeenCalledWith(txt, 'accept');
    });

    it('mime 通配形态 "image/*"：按 file.type 主类型匹配', () => {
      const { upload } = deferredUpload();
      const onReject = vi.fn();
      const api = useAttachments({ upload, accept: 'image/*', onReject });
      const pdf = typed('doc.pdf', 'application/pdf');
      api.add([typed('pic.png', 'image/png'), pdf]);
      expect(api.items.value).toHaveLength(1);
      expect(api.items.value[0]!.name).toBe('pic.png');
      expect(onReject).toHaveBeenCalledWith(pdf, 'accept');
    });

    it('精确 mime 形态 "application/pdf" 与多 token 组合（含空格），扩展名大小写不敏感', () => {
      const { upload } = deferredUpload();
      const onReject = vi.fn();
      const api = useAttachments({ upload, accept: '.PNG, application/pdf', onReject });
      const exe = typed('virus.exe', 'application/x-msdownload');
      api.add([typed('PIC.png', 'image/png'), typed('doc.pdf', 'application/pdf'), exe]);
      expect(api.items.value.map((it) => it.name)).toEqual(['PIC.png', 'doc.pdf']);
      expect(onReject).toHaveBeenCalledWith(exe, 'accept');
    });

    it('不传 accept：不过滤（保持原行为）', () => {
      const { upload } = deferredUpload();
      const onReject = vi.fn();
      const api = useAttachments({ upload, onReject });
      api.add([typed('any.exe', 'application/x-msdownload')]);
      expect(api.items.value).toHaveLength(1);
      expect(onReject).not.toHaveBeenCalled();
    });
  });

  it('drain 仅取 done 条目（剥离过程态字段）并保留未完成条目', async () => {
    const { upload, resolvers } = deferredUpload();
    const api = useAttachments({ upload });
    api.add([file('done.pdf'), file('pending.pdf')]);
    resolvers[0]!.resolve({ name: 'done.pdf', url: '/f/1' });
    await flush();
    const drained = api.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ name: 'done.pdf', url: '/f/1' });
    // 过程态字段已剥离
    expect(Object.keys(drained[0]!)).not.toEqual(
      expect.arrayContaining(['status', 'percent', 'file', 'error']),
    );
    // uploading 条目保留
    expect(api.items.value).toHaveLength(1);
    expect(api.items.value[0]!.name).toBe('pending.pdf');
  });

  describe('onRemove（供业务回收服务端资源）', () => {
    it('remove 单条：带 extra 的条目原样回调', async () => {
      const { upload, resolvers } = deferredUpload();
      const onRemove = vi.fn();
      const api = useAttachments({ upload, onRemove });
      api.add([file('a.pdf')]);
      resolvers[0]!.resolve({ name: 'a.pdf', url: '/f/1', extra: { nid: 'n1' } } as never);
      await flush();
      api.remove(api.items.value[0]!.id);
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove.mock.calls[0]![0]).toMatchObject({
        name: 'a.pdf',
        status: 'done',
        extra: { nid: 'n1' },
      });
    });

    it('remove 上传中条目：同样回调，业务据 status 自行判断', () => {
      const { upload } = deferredUpload();
      const onRemove = vi.fn();
      const api = useAttachments({ upload, onRemove });
      api.add([file()]);
      api.remove(api.items.value[0]!.id);
      expect(onRemove.mock.calls[0]![0]).toMatchObject({ status: 'uploading' });
    });

    it('remove 不存在的 id：不回调', () => {
      const { upload } = deferredUpload();
      const onRemove = vi.fn();
      const api = useAttachments({ upload, onRemove });
      api.add([file()]);
      api.remove('nope');
      expect(onRemove).not.toHaveBeenCalled();
      expect(api.items.value).toHaveLength(1);
    });

    it('clear：逐条回调', () => {
      const { upload } = deferredUpload();
      const onRemove = vi.fn();
      const api = useAttachments({ upload, onRemove });
      api.add([file('a.pdf'), file('b.pdf')]);
      api.clear();
      expect(onRemove).toHaveBeenCalledTimes(2);
      expect(api.items.value).toEqual([]);
    });

    it('drain 不触发：那是发送路径，回收会把刚发出去的附件删掉', async () => {
      const { upload, resolvers } = deferredUpload();
      const onRemove = vi.fn();
      const api = useAttachments({ upload, onRemove });
      api.add([file('a.pdf')]);
      resolvers[0]!.resolve({ name: 'a.pdf', url: '/f/1' });
      await flush();
      api.drain();
      expect(onRemove).not.toHaveBeenCalled();
    });
  });

  it('作用域销毁：进行中上传全部 abort', () => {
    const { upload, resolvers } = deferredUpload();
    const scope = effectScope();
    scope.run(() => {
      const api = useAttachments({ upload });
      api.add([file()]);
    });
    scope.stop();
    expect(resolvers[0]!.signal.aborted).toBe(true);
  });

  // 销毁同样是「丢弃」语义：已传完的条目在服务端有真实文件，不给 onRemove 就成了孤儿。
  // 典型触发场景是把 AiChat 挂在 v-if 侧边栏里，用户传完附件没发就关掉面板。
  it('作用域销毁：已传完的条目逐条走 onRemove，供业务回收服务端资源', async () => {
    const { upload, resolvers } = deferredUpload();
    const onRemove = vi.fn();
    const scope = effectScope();
    let api!: ReturnType<typeof useAttachments>;
    scope.run(() => {
      api = useAttachments({ upload, onRemove });
      api.add([file('a.pdf'), file('b.pdf')]);
    });
    resolvers[0]!.resolve({ name: 'a.pdf', url: '/f/1', extra: { nid: 'n1' } });
    resolvers[1]!.resolve({ name: 'b.pdf', url: '/f/2', extra: { nid: 'n2' } });
    await flush();

    scope.stop();
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(
      onRemove.mock.calls.map((c) => (c[0] as { extra?: { nid?: string } }).extra?.nid),
    ).toEqual(['n1', 'n2']);
    expect(api.items.value).toEqual([]);
  });

  it('作用域销毁：未启用 onRemove 时不报错（仅 abort + 清空）', () => {
    const { upload, resolvers } = deferredUpload();
    const scope = effectScope();
    let api!: ReturnType<typeof useAttachments>;
    scope.run(() => {
      api = useAttachments({ upload });
      api.add([file()]);
    });
    expect(() => scope.stop()).not.toThrow();
    expect(resolvers[0]!.signal.aborted).toBe(true);
    expect(api.items.value).toEqual([]);
  });
});
