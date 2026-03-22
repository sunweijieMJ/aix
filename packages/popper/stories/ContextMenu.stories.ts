import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { ContextMenu, DropdownItem } from '../src';

const meta: Meta<typeof ContextMenu> = {
  title: 'Components/Popper/ContextMenu',
  component: ContextMenu,
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
      description: '是否禁用',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
  parameters: {
    docs: {
      description: {
        component: '右键菜单组件，在指定区域右键点击弹出菜单。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => ({
    components: { ContextMenu, DropdownItem },
    setup() {
      const onCommand = (cmd: string | number) => {
        alert(`选择了: ${cmd}`);
      };
      return { onCommand };
    },
    template: `
      <div style="padding: 40px;">
        <ContextMenu @command="onCommand">
          <div style="width: 400px; height: 200px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #999; user-select: none;">
            在此区域右键点击
          </div>
          <template #menu>
            <DropdownItem command="cut" label="剪切" />
            <DropdownItem command="copy" label="复制" />
            <DropdownItem command="paste" label="粘贴" />
            <DropdownItem command="delete" label="删除" divided />
          </template>
        </ContextMenu>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: { ContextMenu, DropdownItem },
    template: `
      <div style="padding: 40px; display: flex; gap: 24px;">
        <ContextMenu>
          <div style="width: 200px; height: 120px; border: 2px dashed #4caf50; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #4caf50; user-select: none;">
            正常区域
          </div>
          <template #menu>
            <DropdownItem command="action" label="操作" />
          </template>
        </ContextMenu>
        <ContextMenu disabled>
          <div style="width: 200px; height: 120px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #999; user-select: none; opacity: 0.5;">
            禁用区域
          </div>
          <template #menu>
            <DropdownItem command="action" label="操作" />
          </template>
        </ContextMenu>
      </div>
    `,
  }),
};

export const VisibleChange: Story = {
  render: () => ({
    components: { ContextMenu, DropdownItem },
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
      <div style="padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
        <ContextMenu @visible-change="onVisibleChange" @command="onCommand">
          <div style="width: 400px; height: 200px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #999; user-select: none;">
            在此区域右键点击
          </div>
          <template #menu>
            <DropdownItem command="cut" label="剪切" />
            <DropdownItem command="copy" label="复制" />
            <DropdownItem command="paste" label="粘贴" />
          </template>
        </ContextMenu>
        <div style="font-family: monospace; font-size: 13px; background: #f5f5f5; padding: 12px; border-radius: 4px; min-width: 320px; min-height: 80px;">
          <div v-for="(entry, i) in log" :key="i">{{ entry }}</div>
          <div v-if="!log.length" style="color: #999;">右键操作后此处显示事件日志</div>
        </div>
      </div>
    `,
  }),
};
