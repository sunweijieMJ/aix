import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useSpeech } from '../src/composables/useSpeech';
import type { SpeechSynthesizer, SpeechSynthesizerCtx, SpeechSession } from '../src/types';
import { textMessage } from '../src/utils/helpers';

/** 可手动驱动回调的合成器 mock：记录 enqueue 文本与 finish/stop 调用 */
const fakeSynth = () => {
  let ctx: SpeechSynthesizerCtx | null = null;
  const enqueue = vi.fn<(text: string) => void>();
  const finish = vi.fn();
  const stop = vi.fn();
  const synthesizer: SpeechSynthesizer = (c): SpeechSession => {
    ctx = c;
    return { enqueue, finish, stop };
  };
  return { synthesizer, enqueue, finish, stop, drive: () => ctx! };
};

const aiMsg = (id: string, text: string, status: 'updating' | 'success' = 'success') => {
  const m = textMessage('ai', text);
  m.id = id;
  m.status = status;
  return m;
};

afterEach(() => vi.unstubAllGlobals());

describe('useSpeech', () => {
  it('注入 synthesizer：isSupported 恒 true', () => {
    const { synthesizer } = fakeSynth();
    const s = useSpeech({ config: { synthesizer } });
    expect(s.isSupported.value).toBe(true);
  });

  it('toggle：起播整段文本（enqueue 全文 + finish），speakingId 置为该消息', () => {
    const { synthesizer, enqueue, finish } = fakeSynth();
    const s = useSpeech({ config: { synthesizer } });
    s.toggle(aiMsg('m1', '你好世界'));
    expect(enqueue).toHaveBeenCalledWith('你好世界');
    expect(finish).toHaveBeenCalledOnce();
    expect(s.speakingId.value).toBe('m1');
  });

  it('toggle 同一条正在朗读 → 停止', () => {
    const { synthesizer, stop } = fakeSynth();
    const s = useSpeech({ config: { synthesizer } });
    const m = aiMsg('m1', '你好');
    s.toggle(m);
    s.toggle(m);
    expect(stop).toHaveBeenCalledOnce();
    expect(s.speakingId.value).toBe(null);
  });

  it('onEnd 回调复位 speakingId', () => {
    const { synthesizer, drive } = fakeSynth();
    const s = useSpeech({ config: { synthesizer } });
    s.toggle(aiMsg('m1', '你好'));
    drive().onEnd();
    expect(s.speakingId.value).toBe(null);
  });

  it('feed 流式增量：只 enqueue 完整句，半句留存到下次', () => {
    const { synthesizer, enqueue, finish } = fakeSynth();
    const s = useSpeech({
      config: { synthesizer, getText: (m) => (m.content[0] as { text: string }).text },
    });
    s.feed(aiMsg('m1', '第一句。第二', 'updating'));
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenLastCalledWith('第一句。');
    expect(finish).not.toHaveBeenCalled();
    // 续流补全第二句 + 第三句开头
    s.feed(aiMsg('m1', '第一句。第二句！第三', 'updating'));
    expect(enqueue).toHaveBeenLastCalledWith('第二句！');
    // 流结束：flush 残余尾巴 + finish
    s.feed(aiMsg('m1', '第一句。第二句！第三句', 'success'));
    expect(enqueue).toHaveBeenLastCalledWith('第三句');
    expect(finish).toHaveBeenCalledOnce();
  });

  it('feed：英文句点不切断小数/版本号，行末待续句点也不提前切', () => {
    const { synthesizer, enqueue } = fakeSynth();
    const s = useSpeech({
      config: { synthesizer, getText: (m) => (m.content[0] as { text: string }).text },
    });
    // "版本 4." 末尾句点 next 未定 → 不作边界；无其他句末标点 → 不 enqueue
    s.feed(aiMsg('m1', '版本 4.', 'updating'));
    expect(enqueue).not.toHaveBeenCalled();
    // 续流补全："4.5" 的点被数字包围不切，末尾。作边界 → 整句一次性 enqueue
    s.feed(aiMsg('m1', '版本 4.5 已发布。', 'updating'));
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenLastCalledWith('版本 4.5 已发布。');
  });

  it('feed 切到另一条消息：停旧起新', () => {
    const { synthesizer, stop } = fakeSynth();
    const s = useSpeech({
      config: { synthesizer, getText: (m) => (m.content[0] as { text: string }).text },
    });
    s.feed(aiMsg('m1', '甲。', 'updating'));
    s.feed(aiMsg('m2', '乙。', 'updating'));
    expect(stop).toHaveBeenCalledOnce();
    expect(s.speakingId.value).toBe('m2');
  });

  // 用户手动停止后，流仍在继续 → 后续 chunk 不得把会话复活并从头重读已朗读内容。
  // 该守卫必须落在 useSpeech 自身（它是公开导出的 composable，headless 消费方会直接
  // `watch(msg, () => speech.feed(msg))`），而非只由 AiChat 的 autoStartedId 兜住。
  it('feed：手动 stop 后同一条消息不被后续增量复活', () => {
    const { synthesizer, enqueue } = fakeSynth();
    const s = useSpeech({
      config: { synthesizer, getText: (m) => (m.content[0] as { text: string }).text },
    });
    const msg = aiMsg('m1', '第一句。', 'updating');
    s.feed(msg);
    expect(enqueue).toHaveBeenCalledWith('第一句。');

    s.stop();
    expect(s.speakingId.value).toBeNull();

    // 流继续推进
    (msg.content[0] as { text: string }).text = '第一句。第二句。';
    s.feed(msg);
    msg.status = 'success';
    s.feed(msg);

    expect(enqueue).toHaveBeenCalledTimes(1); // 未重读、未续读
    expect(s.speakingId.value).toBeNull(); // 未复活
  });

  it('feed：手动 stop 后换一条新消息照常起播', () => {
    const { synthesizer, enqueue } = fakeSynth();
    const s = useSpeech({
      config: { synthesizer, getText: (m) => (m.content[0] as { text: string }).text },
    });
    s.feed(aiMsg('m1', '甲。', 'updating'));
    s.stop();
    s.feed(aiMsg('m2', '乙。', 'updating'));
    expect(enqueue).toHaveBeenLastCalledWith('乙。');
    expect(s.speakingId.value).toBe('m2');
  });

  it('toggle 是显式意图：可解除手动停止标记，重新朗读同一条', () => {
    const { synthesizer, enqueue } = fakeSynth();
    const s = useSpeech({
      config: { synthesizer, getText: (m) => (m.content[0] as { text: string }).text },
    });
    const msg = aiMsg('m1', '第一句。', 'updating');
    s.feed(msg);
    s.stop();
    s.toggle(msg); // 用户重新点朗读
    expect(s.speakingId.value).toBe('m1');
    // 此后流式增量可继续喂入
    (msg.content[0] as { text: string }).text = '第一句。第二句。';
    s.feed(msg);
    expect(enqueue).toHaveBeenLastCalledWith('第二句。');
  });

  it('stop 后迟到的 onEnd（旧会话令牌失配）不复位新会话', () => {
    const { synthesizer, drive } = fakeSynth();
    const s = useSpeech({ config: { synthesizer } });
    s.toggle(aiMsg('m1', '你好'));
    const stale = drive(); // 抓住旧会话 ctx
    s.stop();
    s.toggle(aiMsg('m2', '世界'));
    stale.onEnd(); // 旧会话迟到回调
    expect(s.speakingId.value).toBe('m2');
  });

  it('未注入 synthesizer 且浏览器不支持：isSupported=false，toggle 无副作用', () => {
    vi.stubGlobal('window', {}); // 无 speechSynthesis
    const s = useSpeech({ config: {} });
    expect(s.isSupported.value).toBe(false);
    s.toggle(aiMsg('m1', '你好'));
    expect(s.speakingId.value).toBe(null);
  });

  it('resolveText 默认：剥离 markdown', () => {
    const { synthesizer } = fakeSynth();
    const s = useSpeech({ config: { synthesizer } });
    const m = textMessage('ai', '## 标题 **粗**');
    expect(s.resolveText(m)).toBe('标题 粗');
  });

  it('toggle：enqueue 内同步调用 onError 不抛异常，onError 收到通知且状态复位', () => {
    const onError = vi.fn();
    const finish = vi.fn();
    const err = new Error('synth failed');
    // 合成器在 enqueue 内同步报错（云端 TTS 参数非法等场景）
    const synthesizer: SpeechSynthesizer = (ctx): SpeechSession => ({
      enqueue: () => ctx.onError(err),
      finish,
      stop: () => {},
    });
    const s = useSpeech({ config: { synthesizer, onError } });
    expect(() => s.toggle(aiMsg('m1', '你好'))).not.toThrow();
    expect(onError).toHaveBeenCalledWith(err);
    // onError 已置空会话，不应再触碰 finish
    expect(finish).not.toHaveBeenCalled();
    expect(s.speakingId.value).toBe(null);
  });

  it('feed：enqueue 内同步 onError 不抛异常且中止后续 finish，状态复位', () => {
    const onError = vi.fn();
    const finish = vi.fn();
    const err = new Error('synth failed');
    const synthesizer: SpeechSynthesizer = (ctx): SpeechSession => ({
      enqueue: () => ctx.onError(err),
      finish,
      stop: () => {},
    });
    const s = useSpeech({
      config: { synthesizer, onError, getText: (m) => (m.content[0] as { text: string }).text },
    });
    expect(() => s.feed(aiMsg('m1', '第一句。', 'success'))).not.toThrow();
    expect(onError).toHaveBeenCalledWith(err);
    expect(finish).not.toHaveBeenCalled();
    expect(s.speakingId.value).toBe(null);
  });

  it('onScopeDispose 自动停止', () => {
    const { synthesizer, stop } = fakeSynth();
    const scope = effectScope();
    let s!: ReturnType<typeof useSpeech>;
    scope.run(() => {
      s = useSpeech({ config: { synthesizer } });
    });
    s.toggle(aiMsg('m1', '你好'));
    scope.stop();
    expect(stop).toHaveBeenCalled();
  });
});
