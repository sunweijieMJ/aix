import type { Meta, StoryObj } from '@storybook/vue3';
import { AiChat, createSpeechSynthesisSynthesizer } from '../src';
import type {
  ChatMessage,
  SpeechConfig,
  SpeechSynthesizer,
  SpeechSynthesizerCtx,
  SpeechSession,
  RoleConfig,
} from '../src';
import { createMessage, textBlock } from '../src/utils/helpers';

// ============ 头像（内联 SVG data URI，无需网络，与 AiChat.stories 保持一致） ============

const avatar = (bg: string, text: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">` +
      `<rect width="72" height="72" rx="36" fill="${bg}"/>` +
      `<text x="36" y="47" font-size="28" fill="#fff" text-anchor="middle" ` +
      `font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="600">${text}</text>` +
      `</svg>`,
  );

const AI_AVATAR = avatar('#13c2c2', 'AI');
const USER_AVATAR = avatar('#8c8c8c', '我');

const ASSISTANT_ROLES: Record<string, RoleConfig> = {
  ai: { placement: 'start', variant: 'filled', avatar: AI_AVATAR },
  user: { placement: 'end', variant: 'filled', avatar: USER_AVATAR },
};

// ============ 流式 mock（对齐 AiChat.stories 的 streamSSE 写法） ============

function streamSSE(
  text: string,
  signal?: AbortSignal,
  stepMs = 22,
  chunkSize = 2,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const finish = () => {
        try {
          c.close();
        } catch {
          /* 已关闭则忽略 */
        }
      };
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          finish();
          return;
        }
        if (i >= text.length) {
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          clearInterval(timer);
          finish();
          return;
        }
        const slice = text.slice(i, i + chunkSize);
        i += chunkSize;
        c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: slice })}\n\n`));
      }, stepMs);
      signal?.addEventListener('abort', () => {
        clearInterval(timer);
        finish();
      });
    },
  });
}

/** autoPlay story 专用固定回复：含足够多的句末标点，触发分句入队演示 */
const AUTO_PLAY_TEXT = [
  '语音播报演示：这是一段支持自动朗读的 AI 流式回复。',
  '',
  '当流式文本中出现句末标点（句号、感叹号、问号等），',
  '内置 useSpeech 会自动将已完整的句子推入语音合成队列，实现边生成边朗读的效果。',
  '',
  '云端 TTS 接入时，只需提供 SpeechConfig.synthesizer 工厂函数！',
  '其余分句逻辑均由 useSpeech 内部处理，业务无需感知。',
].join('\n');

/** autoPlay story 的 mock 后端：流式输出固定文本，不读 messages */
function autoPlayRequest() {
  return async ({ signal }: { messages: ChatMessage[]; signal: AbortSignal }) =>
    streamSSE(AUTO_PLAY_TEXT, signal);
}

/** 手动朗读 story 的 mock 后端：用户追问时返回简短固定回复 */
function manualRequest() {
  const answer = 'AI 收到你的消息了。点击本气泡右下角的喇叭图标即可朗读，再次点击停止。';
  return async ({ signal }: { messages: ChatMessage[]; signal: AbortSignal }) =>
    streamSSE(answer, signal);
}

// ============ 助手应用外壳 render（与 AiChat.stories 保持一致） ============

const shellRender: Meta<typeof AiChat>['render'] = (args) => ({
  components: { AiChat },
  setup: () => ({ args, AI_AVATAR }),
  template: `
    <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
      <div style="display:flex;flex-direction:column;width:100%;max-width:760px;height:640px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:16px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
        <header style="display:flex;flex:none;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--aix-colorBorderSecondary);">
          <img :src="AI_AVATAR" alt="" style="width:38px;height:38px;border-radius:50%;" />
          <div style="display:flex;flex-direction:column;gap:2px;line-height:1.3;">
            <strong style="font-size:15px;color:var(--aix-colorText);">AIX 智能助手</strong>
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--aix-colorTextTertiary);">
              <i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--aix-colorSuccess);"></i>在线，随时为你服务
            </span>
          </div>
        </header>
        <div style="flex:1;min-height:0;">
          <AiChat v-bind="args" />
        </div>
      </div>
    </div>
  `,
});

// ============ meta ============

/**
 * 语音能力示例（@aix/ai-chat：ASR 语音输入 `voice` + TTS 语音播报 `speech`）。
 *
 * 演示四个场景：
 * - VoiceConversation：全链路语音对话——麦克风说话→转文字→发送→AI 回复自动朗读
 * - SpeechManual：语音输入 + 点击喇叭手动朗读 / 停止（默认 speechSynthesis）
 * - SpeechAutoPlay：autoPlay 边流式边朗读
 * - SpeechCustomSynthesizer：自定义合成器对接云端 TTS（委托浏览器引擎发声）
 *
 * 真实声音收集 / 播放说明（必须在真实浏览器中验证，Storybook 即可）：
 * - ASR（收声）：基于 Web Speech `SpeechRecognition`，仅 Chrome / Edge 支持；
 *   首次点麦克风需在浏览器弹窗中**允许麦克风权限**，之后说话会实时转写进输入框。
 * - TTS（出声）：基于浏览器 `speechSynthesis`，点击 AI 气泡操作条上的喇叭按钮即朗读。
 *   jsdom / 不支持的浏览器下 isSupported=false，对应按钮自动隐藏（非报错）。
 */
const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/语音能力',
  component: AiChat,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '语音能力 Story：ASR 语音输入（voice prop，Web Speech 识别，需允许麦克风权限，Chrome/Edge）' +
          ' + TTS 语音播报（speech prop，speechSynthesis）。' +
          'VoiceConversation 演示全链路语音对话；其余演示手动朗读 / autoPlay / 自定义云端合成器。',
      },
    },
  },
  render: shellRender,
  args: {
    roles: ASSISTANT_ROLES,
    placeholder: '点击麦克风说话，或输入消息后按 Enter 发送…',
  },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

// ============ Story 0：全链路语音对话（ASR 收声 + TTS 出声） ============

/**
 * VoiceConversation：全链路语音对话演示——同时启用 `voice`（语音输入）与 `speech`（自动播报）。
 *
 * 操作流程（真实 Chrome/Edge）：
 * 1. 点击输入框右侧麦克风按钮，浏览器弹窗中**允许麦克风权限**；
 * 2. 对着麦克风说话，识别结果实时写入输入框（再次点麦克风或按 Esc 停止）；
 * 3. 按 Enter 发送，AI 流式回复并**自动朗读**（autoPlay）。
 *
 * 即「说话→转文字→发送→AI 回复出声」的闭环。不支持 Web Speech 的浏览器麦克风按钮会自动隐藏。
 */
export const VoiceConversation: Story = {
  args: {
    voice: true,
    speech: { autoPlay: true } satisfies SpeechConfig,
    request: autoPlayRequest(),
    welcomeTitle: '全链路语音对话',
    welcomeDescription:
      '点击麦克风说话（需允许权限）→ 转文字 → 发送 → AI 回复自动朗读。仅 Chrome/Edge 支持语音识别。',
    prompts: [{ key: '1', label: '你也可以直接点这里发一条试试' }],
  },
};

// ============ Story 1：语音输入 + 手动朗读 ============

/** 预置历史消息（手动朗读演示用） */
const MANUAL_MESSAGES = [
  createMessage('user', [textBlock('请介绍一下你自己。')], { id: 'm1', status: 'local' }),
  createMessage(
    'ai',
    [
      textBlock(
        [
          '你好！我是 AIX 智能助手。',
          '',
          '**手动朗读演示**：将鼠标悬停到本气泡上，点击操作条中的喇叭图标即可朗读，再次点击停止。',
          '默认使用浏览器内置 speechSynthesis，在真实浏览器中可直接听到声音。',
          '',
          '如需对接讯飞、阿里云等云端 TTS，传入 `SpeechConfig.synthesizer` 即可——',
          '见 SpeechCustomSynthesizer 示例。',
        ].join('\n'),
      ),
    ],
    { id: 'm2', status: 'success' },
  ),
];

/**
 * SpeechManual：语音输入 + 手动点击朗读 / 停止。
 *
 * 同时启用 `voice: true`（麦克风语音输入）与 `speech: true`（默认 speechSynthesis 播报）。
 * - 收声：点输入框麦克风按钮（允许权限）说话，实时转写进输入框，发送给 AI。
 * - 出声：AI 气泡操作条上的喇叭按钮，点击朗读、再次点击停止（真实浏览器可直接听到）。
 * jsdom / 不支持的浏览器下对应按钮自动隐藏（isSupported=false）。
 */
export const SpeechManual: Story = {
  args: {
    voice: true,
    speech: true,
    request: manualRequest(),
    defaultMessages: MANUAL_MESSAGES,
  },
};

// ============ Story 2：autoPlay 流式朗读 ============

/**
 * SpeechAutoPlay：autoPlay 边流式边朗读。
 *
 * 传入 `speech: { autoPlay: true }`，每次 AI 流式回复时自动跟进朗读：
 * 分句游标在每个句末标点处 enqueue 到合成器，status=success 后 flush 尾句并 finish。
 * 发送消息后，浏览器（真实 speechSynthesis）会自动开始朗读流式文本，无需手动点击。
 */
export const SpeechAutoPlay: Story = {
  args: {
    voice: true,
    speech: { autoPlay: true } satisfies SpeechConfig,
    request: autoPlayRequest(),
    welcomeTitle: 'autoPlay 流式朗读演示',
    welcomeDescription:
      '发送任意消息（或点麦克风说话），AI 回复生成过程中自动朗读（需浏览器支持 speechSynthesis）',
    prompts: [{ key: '1', label: '开始 autoPlay 演示' }],
  },
};

// ============ Story 3：自定义合成器（接入点演示） ============

/**
 * SpeechCustomSynthesizer：自定义合成器接入点演示。
 *
 * 提供一个自定义 `SpeechSynthesizer`，演示如何对接讯飞 / 阿里云等云端 TTS——
 * 这里委托浏览器 speechSynthesis 真实发声，真实接入时把对 base 的委托替换为
 * 「在 enqueue 中调用云端 API 取回音频并播放」即可。点击 AI 气泡喇叭按钮即朗读。
 */
export const SpeechCustomSynthesizer: Story = {
  render: () => ({
    components: { AiChat },
    setup() {
      // 自定义合成器：演示接入点形态。此处委托浏览器 speechSynthesis 真实发声；
      // 真实接入讯飞 / 阿里云时，把对 base 的委托替换为「调用云端 API 取回音频并播放」即可。
      const base = createSpeechSynthesisSynthesizer();
      const customSynthesizer: SpeechSynthesizer = (ctx: SpeechSynthesizerCtx): SpeechSession => {
        const inner = base ? base(ctx) : null;
        return {
          enqueue: (text: string) => inner?.enqueue(text),
          finish: () => (inner ? inner.finish() : ctx.onEnd()),
          stop: () => inner?.stop(),
        };
      };

      const speechConfig: SpeechConfig = { synthesizer: customSynthesizer };

      const request = async ({ signal }: { messages: ChatMessage[]; signal: AbortSignal }) =>
        streamSSE('这是一条 mock 回复，点击喇叭图标即可由自定义合成器朗读。', signal);

      const messages = [
        createMessage('user', [textBlock('帮我介绍云端 TTS 接入方式。')], {
          id: 'c1',
          status: 'local',
        }),
        createMessage(
          'ai',
          [
            textBlock(
              [
                '云端 TTS 接入只需三步：',
                '',
                '1. 实现 `SpeechSynthesizer` 工厂函数，接收 `SpeechSynthesizerCtx`，返回 `SpeechSession`。',
                '2. 在 `enqueue(text)` 中调用云端 API 播放分句文本。',
                '3. 播放完毕后调用 `ctx.onEnd()` 通知 SDK 更新朗读状态。',
                '',
                '点击本气泡操作条中的喇叭图标，即可由自定义合成器朗读。',
              ].join('\n'),
            ),
          ],
          { id: 'c2', status: 'success' },
        ),
      ];

      return { speechConfig, request, messages, AI_AVATAR, USER_AVATAR };
    },
    template: `
      <div style="display:flex;justify-content:center;box-sizing:border-box;min-height:100vh;padding:24px;background:var(--aix-colorBgLayout);">
        <div style="display:flex;flex-direction:column;width:100%;max-width:760px;height:560px;overflow:hidden;border:1px solid var(--aix-colorBorderSecondary);border-radius:16px;background:var(--aix-colorBgContainer);box-shadow:var(--aix-shadowMD);">
          <header style="display:flex;flex:none;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--aix-colorBorderSecondary);">
            <img :src="AI_AVATAR" alt="" style="width:38px;height:38px;border-radius:50%;" />
            <strong style="font-size:15px;color:var(--aix-colorText);">自定义合成器演示</strong>
          </header>
          <div style="flex:1;min-height:0;">
            <AiChat
              :voice="true"
              :speech="speechConfig"
              :request="request"
              :default-messages="messages"
              :roles="{ ai: { placement: 'start', variant: 'filled', avatar: AI_AVATAR }, user: { placement: 'end', variant: 'filled', avatar: USER_AVATAR } }"
              placeholder="点击麦克风说话，或输入消息后按 Enter 发送…"
            />
          </div>
        </div>
      </div>
    `,
  }),
};
