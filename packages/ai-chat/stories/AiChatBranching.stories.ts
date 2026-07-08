import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { ref } from 'vue';
import { AiChat } from '../src';
import type { ExportedTree, ParsedChunk } from '../src';

/**
 * AiChat 多版本分支演示
 *
 * 演示「重新生成 / 编辑用户消息」升级为**无损分支**：
 * - 每次重新生成 AI 回复都在树中追加兄弟节点，旧版本不丢失
 * - 每次编辑用户消息都在树中追加兄弟节点，历史对话保留
 * - 气泡操作条底部出现 ‹ i/n › 切换器，可在各版本间来回切换
 * - `v-model:tree` 持久化整棵对话树（可配合 useConversations 落存储）
 */

const meta: Meta<typeof AiChat> = {
  title: 'AI Chat/场景演示/消息分支',
  tags: ['autodocs'],
  component: AiChat,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '演示 AiChat 多版本分支能力：重新生成与编辑用户消息均走无损分支树，气泡操作条出现 ‹ i/n › 切换器。' +
          '配置 `actions` 含 `regenerate` 即可开启重新生成；用户消息默认操作条内置 `edit`（非流式期间），无需额外配置；' +
          '`v-model:tree` 绑定 `ExportedTree` ref，结构变化时自动同步。',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof AiChat>;

// ============ 假流 request ============

let replyCounter = 0;

/** 立即结束的假流：推一段固定文本后关闭，用于在测试环境快速跑通分支逻辑 */
function makeBranchRequest() {
  return (): Promise<ReadableStream<Uint8Array>> => {
    replyCounter += 1;
    const text = `这是第 ${replyCounter} 个版本的回复。`;
    return Promise.resolve(
      new ReadableStream<Uint8Array>({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      }),
    );
  };
}

/** 与假流配套的 parseChunk：解析 `{ delta }` 增量与 `[DONE]` 终止帧 */
const branchParseChunk = (chunk: { data?: string }): ParsedChunk => {
  const raw = chunk.data ?? '';
  if (raw === '[DONE]') return { done: true };
  try {
    return JSON.parse(raw) as ParsedChunk;
  } catch {
    return {};
  }
};

const wrapperStyle =
  'height:540px;max-width:760px;margin:0 auto;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden';

/**
 * 重新生成分支：点击「重新生成」产生第二个 AI 版本，气泡底部出现 ‹ 1/2 › 切换器。
 * 点切换器可在两个版本之间来回，旧版本内容不丢失。
 */
export const RegenerateBranch: Story = {
  render: () => ({
    components: { AiChat },
    setup() {
      replyCounter = 0;
      const tree = ref<ExportedTree | undefined>(undefined);
      const request = makeBranchRequest();
      return { tree, request, branchParseChunk };
    },
    template: `
      <div style="${wrapperStyle}">
        <AiChat
          :request="request"
          :parse-chunk="branchParseChunk"
          :actions="['copy', 'regenerate']"
          v-model:tree="tree"
          placeholder="输入消息后点发送，然后点「重新生成」体验分支切换…"
          welcome-title="重新生成分支演示"
          welcome-description="发送消息 → 点「重新生成」→ 气泡底部出现 ‹ 1/2 › → 点 ‹ 切回第一版"
        />
      </div>
    `,
  }),
  play: async ({ canvas, step }) => {
    // 1) 发送第一条消息，等待 AI 回复
    await step('发送消息 → 等待 AI 第 1 次回复', async () => {
      const textarea = canvas.getByRole('textbox');
      await userEvent.click(textarea);
      await userEvent.type(textarea, '你好');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(canvas.getByText(/第 1 个版本的回复/)).toBeInTheDocument(), {
        timeout: 5000,
      });
    });

    // 2) 点「重新生成」，产生第 2 个版本
    await step('点「重新生成」→ 第 2 个版本出现', async () => {
      // 等待操作条渲染（虚拟列表异步）
      const regenBtn = await canvas.findByRole('button', { name: '重新生成' }, { timeout: 5000 });
      await userEvent.click(regenBtn, { pointerEventsCheck: 0 });
      await waitFor(() => expect(canvas.getByText(/第 2 个版本的回复/)).toBeInTheDocument(), {
        timeout: 5000,
      });
    });

    // 3) 断言 ‹ 2/2 › 切换器已出现
    await step('断言切换器 ‹ 2/2 › 可见', async () => {
      await waitFor(() => expect(canvas.getByText('2/2')).toBeInTheDocument(), { timeout: 3000 });
    });

    // 4) 点 ‹ 切回第 1 版本，断言内容变更
    await step('点 ‹ 切回第 1 版本', async () => {
      const prevBtn = await canvas.findByRole('button', { name: '上一个版本' }, { timeout: 3000 });
      await userEvent.click(prevBtn, { pointerEventsCheck: 0 });
      await waitFor(() => expect(canvas.getByText(/第 1 个版本的回复/)).toBeInTheDocument(), {
        timeout: 3000,
      });
      // 切换后显示 1/2
      expect(canvas.getByText('1/2')).toBeInTheDocument();
    });
  },
};

/**
 * 编辑用户消息分支：编辑后旧消息保留为第 1 版本，新消息成为第 2 版本。
 * 气泡底部同样出现切换器，可切回原始问题及其 AI 回复。
 */
export const EditBranch: Story = {
  render: () => ({
    components: { AiChat },
    setup() {
      replyCounter = 0;
      const tree = ref<ExportedTree | undefined>(undefined);
      const request = makeBranchRequest();
      return { tree, request, branchParseChunk };
    },
    template: `
      <div style="${wrapperStyle}">
        <AiChat
          :request="request"
          :parse-chunk="branchParseChunk"
          :actions="['copy', 'regenerate']"
          v-model:tree="tree"
          placeholder="输入消息发送，然后编辑用户消息体验分支…"
          welcome-title="编辑消息分支演示"
          welcome-description="发送消息 → 点「编辑」→ 修改内容并保存 → 用户气泡出现 ‹ 1/2 › 切换"
        />
      </div>
    `,
  }),
  play: async ({ canvas, step }) => {
    // 1) 发送第一条消息
    await step('发送原始消息 → 等 AI 回复', async () => {
      const textarea = canvas.getByRole('textbox');
      await userEvent.click(textarea);
      await userEvent.type(textarea, '原始问题');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(canvas.getByText(/第 1 个版本的回复/)).toBeInTheDocument(), {
        timeout: 5000,
      });
    });

    // 2) 点「编辑」，修改用户消息并保存
    await step('编辑用户消息 → 保存 → 新分支', async () => {
      const editBtn = await canvas.findByRole('button', { name: '编辑' }, { timeout: 5000 });
      await userEvent.click(editBtn, { pointerEventsCheck: 0 });
      const editArea = (await canvas.findByRole(
        'textbox',
        { name: '编辑' },
        { timeout: 3000 },
      )) as HTMLTextAreaElement;
      editArea.focus();
      editArea.select();
      await userEvent.type(editArea, '修改后的问题', { skipClick: true });
      await userEvent.click(canvas.getByRole('button', { name: '保存编辑' }), {
        pointerEventsCheck: 0,
      });
      await waitFor(() => expect(canvas.getByText(/第 2 个版本的回复/)).toBeInTheDocument(), {
        timeout: 5000,
      });
    });

    // 3) 断言用户气泡出现 ‹ 2/2 ›
    await step('断言用户消息切换器 ‹ 2/2 › 可见', async () => {
      await waitFor(() => expect(canvas.getByText('2/2')).toBeInTheDocument(), { timeout: 3000 });
    });
  },
};
