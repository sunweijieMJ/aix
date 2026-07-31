import { describe, it, expect } from 'vitest';
import { useTriggerDetect } from '../src/composables/useTriggerDetect';
import type { TriggerConfig } from '../src/types';
import { detectTrigger } from '../src/utils/triggerDetect';

const at: TriggerConfig = { char: '@', items: [] };
const slash: TriggerConfig = { char: '/', items: [] };

describe('detectTrigger', () => {
  it('@ 行首触发，query 为触发字符后到光标', () => {
    const d = detectTrigger('@zh', 3, [at]);
    expect(d).toMatchObject({ char: '@', startIndex: 0, query: 'zh' });
  });

  it('@ 前一字符为空白时任意位置触发', () => {
    const d = detectTrigger('问下 @张', 5, [at]);
    expect(d).toMatchObject({ char: '@', startIndex: 3, query: '张' });
  });

  it('@ 前一字符非空白不触发（防 email）', () => {
    expect(detectTrigger('a@b', 3, [at])).toBeNull();
  });

  it('query 含空白退出触发态', () => {
    expect(detectTrigger('@zh 后续', 5, [at])).toBeNull();
  });

  it('/ 仅行首触发：前面全空白可触发', () => {
    expect(detectTrigger('  /tr', 5, [slash])).toMatchObject({
      char: '/',
      startIndex: 2,
      query: 'tr',
    });
  });

  it('/ 正文中不触发（路径/分数不误弹）', () => {
    expect(detectTrigger('看下 src/utils', 12, [slash])).toBeNull();
  });

  it('/ 多行输入：第二行行首可触发（行首语义而非全文首）', () => {
    // '第一行\n/tr'：'/' 在下标 4，光标 7
    expect(detectTrigger('第一行\n/tr', 7, [slash])).toMatchObject({
      char: '/',
      startIndex: 4,
      query: 'tr',
    });
    // 第二行行首前导空格也可触发
    expect(detectTrigger('第一行\n  /tr', 9, [slash])).toMatchObject({ startIndex: 6 });
  });

  it('/ 多行输入：第二行行内正文不触发', () => {
    // '第一行\nab /x'：'/' 前同行有非空白 'ab'
    expect(detectTrigger('第一行\nab /x', 9, [slash])).toBeNull();
  });

  it('position 显式 anywhere 覆盖 / 的默认 start', () => {
    const anySlash: TriggerConfig = { char: '/', position: 'anywhere', items: [] };
    expect(detectTrigger('a /x', 4, [anySlash])).toMatchObject({ char: '/', startIndex: 2 });
  });

  it('光标在 0 或无 triggers 返回 null', () => {
    expect(detectTrigger('@a', 0, [at])).toBeNull();
    expect(detectTrigger('@a', 2, [])).toBeNull();
  });

  it('取距光标最近的触发字符', () => {
    const d = detectTrigger('@a @b', 5, [at]);
    expect(d).toMatchObject({ startIndex: 3, query: 'b' });
  });
});

describe('useTriggerDetect', () => {
  it('detect/clear 驱动响应式状态', () => {
    const t = useTriggerDetect([at]);
    expect(t.active.value).toBe(false);
    t.detect('@z', 2);
    expect(t.active.value).toBe(true);
    expect(t.detection.value?.query).toBe('z');
    t.clear();
    expect(t.detection.value).toBeNull();
  });

  it('等值检测不替换对象（防高亮重置/异步重发）', () => {
    const t = useTriggerDetect([at]);
    t.detect('@z', 2);
    const first = t.detection.value;
    t.detect('@z', 2);
    expect(t.detection.value).toBe(first); // 同一引用
  });

  it('dismiss 后同签名 detect 保持关闭（Esc keyup 复检不重开）', () => {
    const t = useTriggerDetect([at]);
    t.detect('@z', 2);
    t.dismiss();
    expect(t.detection.value).toBeNull();
    t.detect('@z', 2); // 同一按键 keyup 复检：同签名
    expect(t.detection.value).toBeNull();
  });

  it('dismiss 后不同签名 detect 解除驳回（继续键入恢复菜单）', () => {
    const t = useTriggerDetect([at]);
    t.detect('@z', 2);
    t.dismiss();
    t.detect('@zh', 3); // query 变化：解除驳回
    expect(t.detection.value?.query).toBe('zh');
  });

  it('clear 不留驳回记录（失焦后再检测可正常打开）', () => {
    const t = useTriggerDetect([at]);
    t.detect('@z', 2);
    t.clear();
    t.detect('@z', 2);
    expect(t.active.value).toBe(true);
  });
});
