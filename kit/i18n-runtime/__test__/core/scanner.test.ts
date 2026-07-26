import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scanner, ensureOriginalAttrRecorded } from '../../src/core/scanner.js';
import { NodeRegistry } from '../../src/core/node-registry.js';

describe('ensureOriginalAttrRecorded', () => {
  it('首次调用应写入 data-i18n-orig-* 属性', () => {
    const el = document.createElement('input');
    ensureOriginalAttrRecorded(el, 'placeholder', '请输入姓名');
    expect(el.getAttribute('data-i18n-orig-placeholder')).toBe('请输入姓名');
  });

  it('已存在 data-i18n-orig-* 时重复调用不应覆盖', () => {
    const el = document.createElement('input');
    el.setAttribute('data-i18n-orig-placeholder', '请输入姓名');
    ensureOriginalAttrRecorded(el, 'placeholder', 'Please enter name');
    expect(el.getAttribute('data-i18n-orig-placeholder')).toBe('请输入姓名');
  });
});

function createScanner(
  onBatch: (c: unknown[]) => void,
  overrides: Partial<{ debounceMs: number; maxBatchSize: number }> = {},
) {
  return new Scanner({
    registry: new NodeRegistry(),
    sourceLang: 'zh',
    targetLang: 'en',
    debounceMs: overrides.debounceMs,
    maxBatchSize: overrides.maxBatchSize,
    onBatch,
    scheduleIdle: (work) => work(), // 测试用同步调度器，避免依赖 requestIdleCallback
  });
}

describe('Scanner.scanFull', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('应跳过 script/style/noscript 子树', () => {
    document.body.innerHTML = `
      <script>var x = "你好";</script>
      <style>.a { content: "你好"; }</style>
      <p>正常文本</p>
    `;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['正常文本']);
  });

  it('应跳过 translate="no" 标记的子树', () => {
    document.body.innerHTML = `<div translate="no"><p>品牌名不翻</p></div><p>正常文本</p>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['正常文本']);
  });

  it('应跳过 data-i18n-skip 标记的子树', () => {
    document.body.innerHTML = `<div data-i18n-skip><p>不翻译</p></div><p>正常文本</p>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['正常文本']);
  });

  it('应跳过 contenteditable 元素', () => {
    document.body.innerHTML = `<div contenteditable="true">用户正在编辑</div><p>正常文本</p>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['正常文本']);
  });

  it('扫描根节点自身带跳过标记时，它的属性和整棵子树都不应被采集', () => {
    // TreeWalker 的 root 不参与自身的 filter 判定，root 上的跳过标记必须显式检查一次，
    // 否则 <body data-i18n-skip>（整页临时关闭翻译）这种用法会完全失效
    document.body.setAttribute('data-i18n-skip', '');
    document.body.innerHTML = `<p>整页都不该翻译</p>`;
    document.body.setAttribute('title', '也不该翻译的提示');
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    document.body.removeAttribute('data-i18n-skip');
    document.body.removeAttribute('title');
    expect(texts).toEqual([]);
  });

  it('scanFull 不应采集扫描根自身的属性（只有 addRoot 显式传入的 root 才连自身一起采集）', () => {
    document.body.innerHTML = `<p>正常文本</p>`;
    document.body.setAttribute('title', 'body 自身的提示');
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    document.body.removeAttribute('title');
    expect(texts).toEqual(['正常文本']);
  });

  it('应跳过 textarea 内的文本（那是用户表单值，翻译会篡改提交内容）', () => {
    document.body.innerHTML = `<textarea>用户草稿内容</textarea><p>正常文本</p>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['正常文本']);
  });

  it('应收集 placeholder/title/alt 属性为 attr candidate', () => {
    document.body.innerHTML = `<input placeholder="请输入姓名" /><img alt="示意图" /><span title="提示文案"></span>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const attrCandidates = onBatch.mock.calls
      .flatMap(([batch]) => batch)
      .filter((c: any) => c.kind === 'attr')
      .map((c: any) => ({ attrName: c.attrName, text: c.normalizedText }));

    expect(attrCandidates).toEqual(
      expect.arrayContaining([
        { attrName: 'placeholder', text: '请输入姓名' },
        { attrName: 'alt', text: '示意图' },
        { attrName: 'title', text: '提示文案' },
      ]),
    );
  });

  it('属性已被翻译过且未被业务改写时，应从原始值重新入队而不是把当前译文当新原文', () => {
    // data-i18n-translated-placeholder 记录的是"我们自己上次写回的译文"，当前属性值与它一致
    // 说明自那以后没人动过这个属性，data-i18n-orig-placeholder 里的原文可信
    document.body.innerHTML = `<input placeholder="Please enter name" data-i18n-orig-placeholder="请输入姓名" data-i18n-translated-placeholder="Please enter name" />`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const attrCandidates = onBatch.mock.calls
      .flatMap(([batch]) => batch)
      .filter((c: any) => c.kind === 'attr')
      .map((c: any) => c.normalizedText);

    expect(attrCandidates).toEqual(['请输入姓名']);
  });

  it('属性被业务改写后（当前值与上次写回的译文对不上）应把当前值当新原文重新入队，而不是沿用陈旧的 data-i18n-orig-*', () => {
    // 业务把 placeholder 改成了全新的中文文案，但 data-i18n-translated-placeholder 还停留在旧译文，
    // 说明 data-i18n-orig-placeholder 记录的原文已经过期，必须改用当前属性值
    document.body.innerHTML = `<input placeholder="请输入公司名称" data-i18n-orig-placeholder="请输入姓名" data-i18n-translated-placeholder="Please enter name" />`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const attrCandidates = onBatch.mock.calls
      .flatMap(([batch]) => batch)
      .filter((c: any) => c.kind === 'attr')
      .map((c: any) => c.normalizedText);

    expect(attrCandidates).toEqual(['请输入公司名称']);
  });

  it('内容相同的多个独立节点都应该入队，不能因为 hash 相同就丢弃后面的候选', () => {
    document.body.innerHTML = '<p>确定</p><p>确定</p><p>确定</p>';
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const textCandidates = onBatch.mock.calls
      .flatMap(([batch]) => batch)
      .filter((c: any) => c.kind === 'text');

    expect(textCandidates).toHaveLength(3);
    const nodes = new Set(textCandidates.map((c: any) => c.node));
    expect(nodes.size).toBe(3); // 三个候选分别对应三个不同的 DOM 节点，不是同一个节点入队了三次
  });

  it('不应收集纯数字/符号文本', () => {
    document.body.innerHTML = `<p>2026-07-15</p><p>100%</p><p>正常文本</p>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch).scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['正常文本']);
  });

  it('超过 maxBatchSize 应立即触发 onBatch，不等 debounce', () => {
    // 用互不相同的词而非"文本0".."文本4"——后者会被 normalize() 的数字占位符化
    // 全部归一化成同一个模板"文本{N0}"，hash 相同导致只产生 1 个候选，永远达不到 maxBatchSize
    document.body.innerHTML = ['苹果', '香蕉', '橙子', '葡萄', '西瓜']
      .map((word) => `<p>${word}</p>`)
      .join('');
    const onBatch = vi.fn();
    createScanner(onBatch, { maxBatchSize: 2, debounceMs: 10_000 }).scanFull(document.body);

    // maxBatchSize=2，5 个候选应至少触发 2 次 onBatch（不需要等 10s 的 debounce）
    expect(onBatch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('未超过 maxBatchSize 时应在 debounceMs 后统一触发一次 onBatch', () => {
    document.body.innerHTML = `<p>只有一段文本</p>`;
    const onBatch = vi.fn();
    vi.useFakeTimers();
    createScanner(onBatch, { debounceMs: 200 }).scanFull(document.body);

    expect(onBatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(onBatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });
});

describe('Scanner.observe', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function flushMicrotasks(): Promise<void> {
    // debounceMs:0 场景下 Scanner 的 flush 仍然走 setTimeout(fn, 0)，且是在
    // MutationObserver 回调（微任务）内部才被调度进宏任务队列的，时间上晚于这里
    // 如果同样用 0ms 定时器等待会先于它 resolve（先注册的 0ms 定时器先触发）。
    // 用 10ms 保证一定排在 Scanner 内部的 0ms flush 定时器之后触发。
    return new Promise((resolve) => setTimeout(resolve, 10));
  }

  it('新增子树应触发增量扫描', async () => {
    document.body.innerHTML = '';
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    const p = document.createElement('p');
    p.textContent = '新增内容';
    document.body.appendChild(p);

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toContain('新增内容');
  });

  it('Text 节点内容变化且是自身回写时（registry 命中）不应重复入队', async () => {
    document.body.innerHTML = '<p>原文</p>';
    const textNode = document.body.querySelector('p')!.firstChild as Text;
    const registry = new NodeRegistry();
    registry.record(textNode, { originalText: '原文', translatedText: '译文', lang: 'en' });

    const onBatch = vi.fn();
    const scanner = new Scanner({
      registry,
      sourceLang: 'zh',
      targetLang: 'en',
      debounceMs: 0,
      onBatch,
      scheduleIdle: (work) => work(),
    });
    scanner.observe(document.body);

    textNode.textContent = '译文'; // 模拟 engine 写回译文触发的 mutation

    await flushMicrotasks();
    scanner.disconnect();

    expect(onBatch).not.toHaveBeenCalled();
  });

  it('Text 节点内容变化且不是自身回写时应重新入队', async () => {
    document.body.innerHTML = '<p>原文</p>';
    const textNode = document.body.querySelector('p')!.firstChild as Text;
    const registry = new NodeRegistry();
    registry.record(textNode, { originalText: '原文', translatedText: '译文', lang: 'en' });

    const onBatch = vi.fn();
    const scanner = new Scanner({
      registry,
      sourceLang: 'zh',
      targetLang: 'en',
      debounceMs: 0,
      onBatch,
      scheduleIdle: (work) => work(),
    });
    scanner.observe(document.body);

    textNode.textContent = '业务渲染了新原文'; // 与 registry 记录的 translatedText 不同

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toContain('业务渲染了新原文');
  });

  it('data-i18n-skip 容器整体作为新增子树插入时，内部文本不应被采集', async () => {
    document.body.innerHTML = '';
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-i18n-skip', '');
    wrapper.innerHTML = '<p>不应该被翻译的内容</p>';
    document.body.appendChild(wrapper);

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).not.toContain('不应该被翻译的内容');
  });

  it('已存在的 data-i18n-skip 容器内动态新增子节点，不应被采集（容器本身未变化，只是内部增量新增）', async () => {
    document.body.innerHTML = '<div data-i18n-skip></div>';
    const skipContainer = document.querySelector('[data-i18n-skip]')!;
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    const p = document.createElement('p');
    p.textContent = '动态插入的不该翻译的文本';
    skipContainer.appendChild(p);

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).not.toContain('动态插入的不该翻译的文本');
  });

  it('已存在的 data-i18n-skip 容器内已有文本节点发生 characterData 变化，不应被采集', async () => {
    document.body.innerHTML = '<div data-i18n-skip><p>初始文本</p></div>';
    const textNode = document.querySelector('[data-i18n-skip] p')!.firstChild as Text;
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    textNode.textContent = '改变后的文本不该翻译';

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).not.toContain('改变后的文本不该翻译');
  });

  it('同一个 shadow root 被反复扫描到时不应重复建立 MutationObserver（否则 observer 泄漏、候选成倍放大）', async () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span>影子里的初始文本</span>';
    const wrapper = document.createElement('section');
    wrapper.appendChild(host);

    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    // 模拟 v-if / keep-alive 反复切换：同一个 shadow host 随父容器多次进出 DOM，
    // 每次进入都会被 scanSubtree 重新走到，但 shadow root 始终是同一个对象
    for (let i = 0; i < 3; i++) {
      document.body.appendChild(wrapper);
      await flushMicrotasks();
      wrapper.remove();
      await flushMicrotasks();
    }
    document.body.appendChild(wrapper);
    await flushMicrotasks();

    onBatch.mockClear();
    const p = document.createElement('p');
    p.textContent = '影子里新增的文本';
    shadow.appendChild(p);
    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    // 重复注册 observer 会让同一次 mutation 被回调多次，候选按注册次数成倍出现
    expect(texts).toEqual(['影子里新增的文本']);
  });

  it('新增节点自身就是带 data-i18n-skip 的 shadow host 时，其 shadow root 内容不应被扫描', async () => {
    document.body.innerHTML = '';
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    // MutationObserver 的 childList 分支对 addedNode 自身的 shadowRoot 单独走一遍
    // scanFull(sr)，这条路径必须也能看见挂在 host 上的跳过标记
    const host = document.createElement('div');
    host.setAttribute('data-i18n-skip', '');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span>影子里不该翻译的文本</span>';
    document.body.appendChild(host);

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual([]);
  });

  it('shadow host 带 data-i18n-skip 时，shadow root 内部的增量变化也不应被采集', async () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    host.setAttribute('data-i18n-skip', '');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span>影子里的初始文本</span>';
    document.body.appendChild(host);

    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });
    scanner.observe(document.body);

    const p = document.createElement('p');
    p.textContent = '影子里新增的文本';
    shadow.appendChild(p);

    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    // 跳过标记挂在 shadow host 上，parentElement 上溯到不了 host，必须显式跨 shadow 边界判断
    expect(texts).toEqual([]);
  });
});

describe('Scanner.addRoot', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }

  it('addRoot 传入元素时应采集该元素自身的属性（TreeWalker 不会 yield root 自身）', async () => {
    const input = document.createElement('input');
    input.setAttribute('placeholder', '请输入姓名');
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });

    scanner.addRoot(input);
    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['请输入姓名']);
  });

  it('addRoot 传入 shadow host 元素时应采集其 shadow root 内的文本', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span>影子里的文本</span>';
    const onBatch = vi.fn();
    const scanner = createScanner(onBatch, { debounceMs: 0 });

    scanner.addRoot(host);
    await flushMicrotasks();
    scanner.disconnect();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toContain('影子里的文本');
  });
});

describe('Scanner.disconnect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('disconnect 后即使外部强行触发已排队的分片扫描回调，也不应再收集新候选或调用 onBatch', () => {
    document.body.innerHTML = '<p>你好</p>';
    const pending: Array<() => void> = [];
    const onBatch = vi.fn();
    const scanner = new Scanner({
      registry: new NodeRegistry(),
      sourceLang: 'zh',
      targetLang: 'en',
      debounceMs: 0,
      onBatch,
      scheduleIdle: (work) => {
        pending.push(work);
      },
    });

    scanner.scanFull(document.body);
    expect(pending).toHaveLength(1);

    scanner.disconnect(); // 在分片回调真正执行之前就 disconnect

    pending[0]!(); // 模拟浏览器稍后仍然触发了这个已经排队的 requestIdleCallback/setTimeout 回调

    expect(onBatch).not.toHaveBeenCalled();
  });

  it('disconnect 后应清除尚未触发的防抖定时器，不再调用 onBatch', () => {
    document.body.innerHTML = '<p>你好</p>';
    const onBatch = vi.fn();
    vi.useFakeTimers();
    const scanner = createScanner(onBatch, { debounceMs: 200 });
    scanner.scanFull(document.body); // 测试用的 scheduleIdle 是同步的，这里已经 enqueue 并设置了 200ms 防抖定时器

    scanner.disconnect();
    vi.advanceTimersByTime(1000);

    expect(onBatch).not.toHaveBeenCalled();
  });
});

describe('Scanner 语言切换场景', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('切换目标语言后，已翻译节点应基于 originalText 重新入队，而不是把当前译文当新原文', () => {
    document.body.innerHTML = '<p>你好</p>';
    const textNode = document.body.querySelector('p')!.firstChild as Text;
    const registry = new NodeRegistry();
    // 模拟已翻译成英文：textContent 现在是 "hello"，但 originalText 记录的仍是中文原文
    textNode.textContent = 'hello';
    registry.record(textNode, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    const onBatch = vi.fn();
    const scanner = new Scanner({
      registry,
      sourceLang: 'zh',
      targetLang: 'en',
      onBatch,
      scheduleIdle: (work) => work(),
    });
    scanner.setTargetLang('ja'); // 切换到日语

    vi.useFakeTimers();
    scanner.scanFull(document.body);
    vi.runAllTimers();

    const texts = onBatch.mock.calls.flatMap(([batch]) => batch.map((c: any) => c.normalizedText));
    expect(texts).toEqual(['你好']); // 应该是中文原文重新入队，不是 "hello" 被当新原文
  });

  it('切换回同一语言且内容未变时应被 shouldSkip 挡掉，不重复入队', () => {
    document.body.innerHTML = '<p>hello</p>';
    const textNode = document.body.querySelector('p')!.firstChild as Text;
    const registry = new NodeRegistry();
    registry.record(textNode, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    const onBatch = vi.fn();
    const scanner = new Scanner({
      registry,
      sourceLang: 'zh',
      targetLang: 'en',
      onBatch,
      scheduleIdle: (work) => work(),
    });

    vi.useFakeTimers();
    scanner.scanFull(document.body);
    vi.runAllTimers();

    expect(onBatch).not.toHaveBeenCalled();
  });
});
