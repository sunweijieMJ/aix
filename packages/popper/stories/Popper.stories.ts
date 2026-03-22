import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, watch, onMounted } from 'vue';
import { Popper } from '../src';
import type { PopperProps } from '../src/types';

const meta: Meta<typeof Popper> = {
  title: 'Components/Popper/Popper',
  component: Popper,
  tags: ['autodocs'],
  argTypes: {
    placement: {
      control: 'select',
      options: [
        'top',
        'top-start',
        'top-end',
        'bottom',
        'bottom-start',
        'bottom-end',
        'left',
        'left-start',
        'left-end',
        'right',
        'right-start',
        'right-end',
      ],
      description: '弹出位置',
      table: {
        type: { summary: 'Placement' },
        defaultValue: { summary: 'bottom' },
      },
    },
    offset: {
      control: 'number',
      description: '偏移距离 (px)',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '8' },
      },
    },
    arrow: {
      control: 'boolean',
      description: '是否显示箭头',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
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
  },
  parameters: {
    docs: {
      description: {
        component:
          '底层定位组件，提供纯浮动层定位能力。适合高级用户自定义触发逻辑。上层组件 Tooltip/Popover/Dropdown/ContextMenu 基于此组件封装。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - 底层 Popper 组件，需手动绑定 referenceRef
 */
export const Basic: Story = {
  args: {
    placement: 'bottom',
    offset: 8,
    arrow: true,
    disabled: false,
  },
  render: (args: PopperProps) => ({
    components: { Popper },
    setup() {
      const popperRef = ref<InstanceType<typeof Popper> | null>(null);
      const triggerRef = ref<HTMLElement | null>(null);
      const isOpen = ref(false);

      function toggle() {
        isOpen.value = !isOpen.value;
      }

      // defineExpose 的 ref 通过 proxyRefs 访问，直接赋值即可（不需要 .value）
      onMounted(() => {
        if (popperRef.value && triggerRef.value) {
          (popperRef.value as any).referenceRef = triggerRef.value;
        }
      });

      // 监听 args.disabled 变化，禁用时自动关闭
      watch(
        () => args.disabled,
        (val) => {
          if (val) isOpen.value = false;
        },
      );

      return { args, popperRef, triggerRef, isOpen, toggle };
    },
    template: `
      <div style="padding: 120px; display: flex; justify-content: center;">
        <button ref="triggerRef" style="padding: 8px 16px; cursor: pointer;" @click="toggle">
          {{ isOpen ? '关闭' : '打开' }} Popper
        </button>
        <Popper
          ref="popperRef"
          v-model:open="isOpen"
          :placement="args.placement"
          :offset="args.offset"
          :arrow="args.arrow"
          :disabled="args.disabled"
          transition="aix-popper-fade"
        >
          <div style="padding: 12px 16px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            底层 Popper 内容
          </div>
        </Popper>
      </div>
    `,
  }),
};
