import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, effectScope } from 'vue';
import { useTypewriter } from '../src/composables/useTypewriter';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTypewriter', () => {
  it('逐步逼近源文本，最终一致', async () => {
    const source = ref('');
    const { displayed } = useTypewriter(source, { step: 2, interval: 10 });
    source.value = 'abcdef';
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value.length).toBe(2);
    vi.advanceTimersByTime(30);
    expect(displayed.value).toBe('abcdef');
  });

  it('源文本追加时保留已显示前缀（keepPrefix）', async () => {
    const source = ref('abc');
    const { displayed } = useTypewriter(source, { step: 10, interval: 10 });
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value).toBe('abc');
    source.value = 'abcdef';
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value).toBe('abcdef');
  });

  it('enabled=false 时直接同步全显，不走逐帧动画', async () => {
    const source = ref('');
    const { displayed } = useTypewriter(source, { step: 2, interval: 10, enabled: false });
    source.value = 'hello world';
    await nextTick();
    // 未推进定时器即应全显
    expect(displayed.value).toBe('hello world');
  });

  it('源文本被整体替换（不再以已显示内容为前缀）时回退重置后重新追赶', async () => {
    const source = ref('hello');
    const { displayed } = useTypewriter(source, { step: 100, interval: 10 });
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value).toBe('hello');
    // 整体替换为无公共前缀的新文本 → 应先重置再重新逐帧
    source.value = 'world';
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value).toBe('world');
  });

  it('enabled 响应式：从开启切到关闭时立即全显当前源文本', async () => {
    // 用「挂载后增长」制造逐帧途中态（初始非空会直接全显，见下方重新挂载用例）
    const source = ref('');
    const enabled = ref(true);
    const { displayed } = useTypewriter(source, { step: 1, interval: 10, enabled });
    source.value = 'abcdef';
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value.length).toBeLessThan(6); // 仍在逐帧途中
    enabled.value = false;
    await nextTick();
    expect(displayed.value).toBe('abcdef'); // 关闭后立即全显
  });

  it('stop() 停止逐帧推进', async () => {
    const source = ref('');
    const { displayed, stop } = useTypewriter(source, { step: 1, interval: 10 });
    source.value = 'abcdef';
    await nextTick();
    vi.advanceTimersByTime(10);
    const snapshot = displayed.value;
    stop();
    vi.advanceTimersByTime(100);
    expect(displayed.value).toBe(snapshot); // stop 后不再增长
  });

  it('scope.stop() 销毁时清理定时器，displayed 不再增长', async () => {
    const source = ref('');
    const scope = effectScope();
    let displayed!: ReturnType<typeof useTypewriter>['displayed'];
    scope.run(() => {
      ({ displayed } = useTypewriter(source, { step: 1, interval: 10 }));
    });
    source.value = 'abcdefghij'; // 较长，使其处于逐帧追赶状态
    await nextTick();
    vi.advanceTimersByTime(10);
    const snapshot = displayed.value;
    expect(snapshot.length).toBeLessThan(10); // 仍在途中
    scope.stop(); // onScopeDispose → stop()，清理 interval
    vi.advanceTimersByTime(1000);
    expect(displayed.value).toBe(snapshot); // 不再增长
  });

  it('高频流式更新（更新间隔 < interval）时持续逐帧前进，不被反复重启饿死', async () => {
    // 复现真实流式场景：source 每 10ms 追加，远快于 30ms 的 tick 间隔。
    // 旧实现每次 source 变化都 stop()+重建 timer，timer 在 30ms 首帧触发前就被
    // 下一次（10ms 后）变化清除，displayed 永远停在 ''，导致 UI 无打字效果、最终一次性全显。
    const source = ref('');
    const { displayed } = useTypewriter(source, { step: 2, interval: 30 });
    for (let i = 0; i < 12; i++) {
      source.value += 'xy';
      await nextTick();
      vi.advanceTimersByTime(10);
    }
    // 修复后：timer 持续运行、逐帧读取最新 source 追赶，displayed 必已前进
    expect(displayed.value.length).toBeGreaterThan(0);
    // 源停止增长后继续推进，最终追平
    vi.advanceTimersByTime(30 * 20);
    expect(displayed.value).toBe(source.value);
  });

  it('enabled 响应式：从关闭切到开启后对新增源文本重新进入逐帧追赶', async () => {
    const source = ref('');
    const enabled = ref(false);
    const { displayed } = useTypewriter(source, { step: 1, interval: 10, enabled });
    source.value = 'abc';
    await nextTick();
    // enabled=false：设值后立即全显，不走逐帧
    expect(displayed.value).toBe('abc');
    // 开启 enabled：进入 startTyping 分支（displayed 已等于源，无需重置）
    enabled.value = true;
    await nextTick();
    expect(displayed.value).toBe('abc');
    // 此后源继续增长，应走逐帧追赶而非立即全显
    source.value = 'abcdef';
    await nextTick();
    expect(displayed.value).toBe('abc'); // 未推进定时器，仍停在旧前缀
    vi.advanceTimersByTime(10);
    expect(displayed.value).toBe('abcd'); // 逐帧前进
    vi.advanceTimersByTime(20);
    expect(displayed.value).toBe('abcdef'); // 最终追平
  });

  // 回归：virtua 滚动使 Bubble 卸载又重新挂载，TextBlock 重建 useTypewriter。
  // 若 displayed 初始为空，会把已完整的历史回复从头逐字重播一遍（用户实测 bug）。
  it('初始 source 非空（虚拟列表重新挂载已完成消息）时直接全显，不从头重播', async () => {
    const full = '这是一段已经回答完成的完整内容';
    const source = ref(full);
    const { displayed } = useTypewriter(source, { step: 1, interval: 10, enabled: true });
    // 挂载即为完整内容：不推进定时器也不应是空/部分
    expect(displayed.value).toBe(full);
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(displayed.value).toBe(full); // 始终全显，无重播
  });

  it('按 Unicode 码位切分，emoji 不被截成乱码', async () => {
    vi.useFakeTimers();
    const src = ref('');
    const { displayed } = useTypewriter(src, { step: 1, interval: 30 });
    src.value = '👍🎉'; // 两个 emoji，各占 2 个 UTF-16 code unit
    await vi.advanceTimersByTimeAsync(30);
    // 第一帧应是完整的一个 emoji（'👍'），而非半个代理对
    expect(displayed.value).toBe('👍');
    await vi.advanceTimersByTimeAsync(30);
    expect(displayed.value).toBe('👍🎉');
    vi.useRealTimers();
  });

  it('step 为 [min,max] 区间时每帧按区间内随机整数步进', async () => {
    // 固定 Math.random 使步长可预测：0→取 min，0.999→取 max
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    const source = ref('');
    const { displayed } = useTypewriter(source, { step: [2, 5], interval: 10 });
    source.value = 'abcdefghij'; // 10 字符
    await nextTick();
    vi.advanceTimersByTime(10);
    expect(displayed.value.length).toBe(2); // random=0 → min=2
    rnd.mockReturnValue(0.999);
    vi.advanceTimersByTime(10);
    expect(displayed.value.length).toBe(7); // 2 + max(5)
    rnd.mockRestore();
  });
});
