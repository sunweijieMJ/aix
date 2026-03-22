import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, screen, userEvent } from 'storybook/test';
import { ref } from 'vue';
import { Dropdown, DropdownItem } from '../src';
import type { DropdownMenuItem } from '../src';

const meta: Meta<typeof Dropdown> = {
  title: 'Components/Popper/Dropdown',
  component: Dropdown,
  tags: ['autodocs'],
  argTypes: {
    trigger: {
      control: 'select',
      options: ['click', 'hover'],
      description: '触发方式',
      table: {
        type: { summary: "'click' | 'hover'" },
        defaultValue: { summary: 'click' },
      },
    },
    placement: {
      control: 'select',
      options: [
        'bottom-start',
        'bottom',
        'bottom-end',
        'top-start',
        'top',
        'top-end',
      ],
      description: '弹出位置',
      table: {
        type: { summary: 'Placement' },
        defaultValue: { summary: 'bottom-start' },
      },
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    hideOnClick: {
      control: 'boolean',
      description: '选择后是否自动关闭',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    showDelay: {
      control: 'number',
      description: '显示延迟 (ms，hover 模式)',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '150' },
      },
    },
    hideDelay: {
      control: 'number',
      description: '隐藏延迟 (ms，hover 模式)',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '150' },
      },
    },
  },
  parameters: {
    docs: {
      description: {
        component: '下拉菜单组件，支持 slot 和 options 数据两种使用方式。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - click 后验证菜单出现
 */
export const Basic: Story = {
  render: () => ({
    components: { Dropdown, DropdownItem },
    setup() {
      const onCommand = (cmd: string | number) => {
        alert(`选择了: ${cmd}`);
      };
      return { onCommand };
    },
    template: `
      <div style="padding: 80px; display: flex; justify-content: center;">
        <Dropdown @command="onCommand">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">下拉菜单 ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="edit" label="编辑" />
            <DropdownItem command="copy" label="复制" />
            <DropdownItem command="delete" label="删除" divided />
            <DropdownItem command="disabled" label="禁用项" disabled />
          </template>
        </Dropdown>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: '下拉菜单 ▾' });
    await expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    // Dropdown 通过 Teleport 渲染到 body，需要用 screen 而非 canvas 查找
    const menuItem = await screen.findByText('编辑');
    await expect(menuItem).toBeInTheDocument();
  },
};

export const WithOptions: Story = {
  render: () => ({
    components: { Dropdown },
    setup() {
      const options: DropdownMenuItem[] = [
        { command: 'new', label: '新建' },
        { command: 'open', label: '打开' },
        { command: 'save', label: '保存' },
        { command: 'close', label: '关闭', divided: true },
      ];
      const onCommand = (cmd: string | number) => {
        alert(`选择了: ${cmd}`);
      };
      return { options, onCommand };
    },
    template: `
      <div style="padding: 80px; display: flex; justify-content: center;">
        <Dropdown :options="options" @command="onCommand">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">Options 模式 ▾</button>
          </template>
        </Dropdown>
      </div>
    `,
  }),
};

export const HoverTrigger: Story = {
  render: () => ({
    components: { Dropdown, DropdownItem },
    setup() {
      const onCommand = (cmd: string | number) => {
        alert(`选择了: ${cmd}`);
      };
      return { onCommand };
    },
    template: `
      <div style="padding: 80px; display: flex; gap: 24px; justify-content: center;">
        <Dropdown trigger="hover" @command="onCommand">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">默认延迟 ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="a" label="选项 A" />
            <DropdownItem command="b" label="选项 B" />
            <DropdownItem command="c" label="选项 C" />
          </template>
        </Dropdown>
        <Dropdown trigger="hover" :show-delay="500" :hide-delay="300" @command="onCommand">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">慢延迟 (500/300ms) ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="a" label="选项 A" />
            <DropdownItem command="b" label="选项 B" />
            <DropdownItem command="c" label="选项 C" />
          </template>
        </Dropdown>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: { Dropdown, DropdownItem },
    template: `
      <div style="padding: 80px; display: flex; gap: 16px; justify-content: center;">
        <Dropdown>
          <template #reference>
            <button style="padding: 8px 16px;">正常 ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="a" label="选项 A" />
          </template>
        </Dropdown>
        <Dropdown disabled>
          <template #reference>
            <button style="padding: 8px 16px; opacity: 0.5;">禁用 ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="a" label="选项 A" />
          </template>
        </Dropdown>
      </div>
    `,
  }),
};

export const Controlled: Story = {
  render: () => ({
    components: { Dropdown, DropdownItem },
    setup() {
      const open = ref(false);
      return { open };
    },
    template: `
      <div style="padding: 80px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <label>
          <input type="checkbox" v-model="open" />
          受控模式：{{ open ? '显示' : '隐藏' }}
        </label>
        <Dropdown v-model:open="open">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">受控下拉菜单 ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="a" label="选项 A" />
            <DropdownItem command="b" label="选项 B" />
            <DropdownItem command="c" label="选项 C" />
          </template>
        </Dropdown>
      </div>
    `,
  }),
};

export const VisibleChange: Story = {
  render: () => ({
    components: { Dropdown, DropdownItem },
    setup() {
      const log = ref<string[]>([]);
      const onVisibleChange = (visible: boolean) => {
        log.value.push(
          `${new Date().toLocaleTimeString()} — visible-change: ${visible}`,
        );
        if (log.value.length > 5) log.value.shift();
      };
      const onCommand = (cmd: string | number) => {
        log.value.push(`${new Date().toLocaleTimeString()} — command: ${cmd}`);
        if (log.value.length > 5) log.value.shift();
      };
      return { log, onVisibleChange, onCommand };
    },
    template: `
      <div style="padding: 80px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <Dropdown @visible-change="onVisibleChange" @command="onCommand">
          <template #reference>
            <button style="padding: 8px 16px; cursor: pointer;">打开/关闭菜单 ▾</button>
          </template>
          <template #dropdown>
            <DropdownItem command="a" label="选项 A" />
            <DropdownItem command="b" label="选项 B" />
          </template>
        </Dropdown>
        <div style="font-family: monospace; font-size: 13px; background: #f5f5f5; padding: 12px; border-radius: 4px; min-width: 320px; min-height: 80px;">
          <div v-for="(entry, i) in log" :key="i">{{ entry }}</div>
          <div v-if="!log.length" style="color: #999;">操作菜单后此处显示事件日志</div>
        </div>
      </div>
    `,
  }),
};
