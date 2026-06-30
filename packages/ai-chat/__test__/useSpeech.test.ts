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
