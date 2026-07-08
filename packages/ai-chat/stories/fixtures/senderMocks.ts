import type { ModelOption, VoiceRecognizer } from '../../src';

// ──────────────────────────────────────────────
// mock 上传实现（带进度 + 可控失败），供 WithAttachments 使用
// ──────────────────────────────────────────────

export const mockUpload = async (
  file: File,
  ctx: { onProgress: (p: number) => void; signal: AbortSignal },
) => {
  for (let p = 0; p <= 100; p += 20) {
    if (ctx.signal.aborted) throw new DOMException('aborted', 'AbortError');
    ctx.onProgress(p);
    await new Promise((r) => setTimeout(r, 120));
  }
  if (file.name.includes('fail')) throw new Error('mock 上传失败');
  return {
    name: file.name,
    size: file.size,
    mime: file.type,
    url: `https://example.com/f/${file.name}`,
  };
};

// ──────────────────────────────────────────────
// mock 识别器（定时吐字，浏览器/测试两态皆可跑），供 WithVoice / toolbar 组合 story 使用
// ──────────────────────────────────────────────

export const mockRecognizer: VoiceRecognizer = (ctx) => {
  const words = ['帮我', '帮我总结', '帮我总结这份报告'];
  let i = 0;
  const timer = setInterval(() => {
    const w = words[i];
    if (w == null) {
      clearInterval(timer);
      ctx.onResult(words[words.length - 1]!, true);
      ctx.onEnd();
      return;
    }
    ctx.onResult(w, false);
    i++;
  }, 600);
  return {
    stop: () => {
      clearInterval(timer);
      ctx.onEnd();
    },
  };
};

/** ModelSelector 演示用固定选项，供 WithModelSelector / ToolbarItemsMixed / ToolbarItemsSpacer 共用 */
export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'Qwen3-Max' },
  { value: 'DeepSeek-V3' },
  { value: 'GPT-4o' },
];
