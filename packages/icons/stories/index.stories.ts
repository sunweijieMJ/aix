import type { Meta, StoryObj } from '@storybook/vue3';
import {
  Camera,
  IconSearch,
  Home,
  Edit,
  Delete,
  Setting,
  Play,
  Pause,
  Notifications,
  LocationOn,
} from '../src';

const meta: Meta<typeof Camera> = {
  title: 'Components/Icons',
  component: Camera,
  tags: ['autodocs'],
  argTypes: {
    width: {
      control: { type: 'text' },
      description: '图标宽度',
      defaultValue: '1em',
    },
    height: {
      control: { type: 'text' },
      description: '图标高度',
      defaultValue: '1em',
    },
    color: {
      control: { type: 'color' },
      description: '图标颜色',
      defaultValue: 'currentColor',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Camera>;

// 基础示例
export const Basic: Story = {
  args: {
    width: 24,
    height: 24,
    color: '#1890ff',
  },
  render: (args) => ({
    components: { Camera },
    setup() {
      return { args };
    },
    template: '<Camera v-bind="args" />',
  }),
};

// 不同尺寸
export const Sizes: Story = {
  render: () => ({
    components: { Camera },
    template: `
      <div style="display: flex; gap: 24px; align-items: center; padding: 16px;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <Camera :width="16" :height="16" />
          <span style="font-size: 12px;">16px</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <Camera :width="24" :height="24" />
          <span style="font-size: 12px;">24px</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <Camera :width="32" :height="32" />
          <span style="font-size: 12px;">32px</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <Camera :width="48" :height="48" />
          <span style="font-size: 12px;">48px</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <Camera :width="64" :height="64" />
          <span style="font-size: 12px;">64px</span>
        </div>
      </div>
    `,
  }),
};

// 不同颜色
export const Colors: Story = {
  render: () => ({
    components: { IconSearch },
    template: `
      <div style="display: flex; gap: 24px; align-items: center; padding: 16px;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <IconSearch :width="32" :height="32" color="#1890ff" />
          <span style="font-size: 12px;">#1890ff</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <IconSearch :width="32" :height="32" color="#52c41a" />
          <span style="font-size: 12px;">#52c41a</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <IconSearch :width="32" :height="32" color="#fa8c16" />
          <span style="font-size: 12px;">#fa8c16</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <IconSearch :width="32" :height="32" color="#ff4d4f" />
          <span style="font-size: 12px;">#ff4d4f</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <IconSearch :width="32" :height="32" color="#722ed1" />
          <span style="font-size: 12px;">#722ed1</span>
        </div>
      </div>
    `,
  }),
};

// 使用 style 属性
export const WithStyle: Story = {
  render: () => ({
    components: { Camera, IconSearch, Home },
    template: `
      <div style="padding: 16px;">
        <h3 style="margin-bottom: 16px;">Style 对象形式</h3>
        <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
          <Camera :style="{ fontSize: '32px', color: '#1890ff' }" />
          <IconSearch :style="{ fontSize: '32px', color: '#52c41a', transform: 'rotate(45deg)' }" />
          <Home :style="{ fontSize: '32px', color: '#ff4d4f', opacity: 0.6 }" />
        </div>

        <h3 style="margin-bottom: 16px;">组合 props 和 style</h3>
        <div style="display: flex; gap: 24px; align-items: center;">
          <Camera :width="32" :height="32" color="blue" :style="{ transform: 'scale(1.2)' }" />
          <IconSearch :width="32" :height="32" :style="{ color: 'green', filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))' }" />
        </div>
      </div>
    `,
  }),
};

// 动画效果
export const WithAnimation: Story = {
  render: () => ({
    components: { IconSearch, Setting },
    template: `
      <div style="padding: 16px;">
        <h3 style="margin-bottom: 16px;">旋转动画</h3>
        <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
          <IconSearch
            :style="{
              fontSize: '32px',
              color: '#1890ff',
              animation: 'spin 2s linear infinite'
            }"
          />
          <Setting
            :style="{
              fontSize: '32px',
              color: '#52c41a',
              animation: 'spin 3s linear infinite'
            }"
          />
        </div>

        <h3 style="margin-bottom: 16px;">悬停效果</h3>
        <div style="display: flex; gap: 24px; align-items: center;">
          <Setting
            class="hover-icon"
            :style="{
              fontSize: '32px',
              color: '#722ed1',
              cursor: 'pointer'
            }"
          />
          <span style="font-size: 14px; color: #666;">鼠标悬停查看效果</span>
        </div>

        <style>
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .hover-icon {
            transition: transform 0.3s ease;
          }
          .hover-icon:hover {
            transform: rotate(180deg) scale(1.2);
          }
        </style>
      </div>
    `,
  }),
};

// 事件处理
export const WithEvents: Story = {
  render: () => ({
    components: { Camera, IconSearch, Delete },
    setup() {
      const handleClick = (name: string) => {
        alert(`${name} 图标被点击了！`);
      };
      return { handleClick };
    },
    template: `
      <div style="padding: 16px;">
        <h3 style="margin-bottom: 16px;">点击图标触发事件</h3>
        <div style="display: flex; gap: 24px; align-items: center;">
          <Camera
            :style="{ fontSize: '32px', color: '#1890ff', cursor: 'pointer' }"
            @click="handleClick('Camera')"
            title="点击相机图标"
          />
          <IconSearch
            :style="{ fontSize: '32px', color: '#52c41a', cursor: 'pointer' }"
            @click="handleClick('Search')"
            title="点击搜索图标"
          />
          <Delete
            :style="{ fontSize: '32px', color: '#ff4d4f', cursor: 'pointer' }"
            @click="handleClick('Delete')"
            title="点击删除图标"
          />
        </div>
      </div>
    `,
  }),
};

// 图标画廊
export const IconGallery: Story = {
  render: () => ({
    components: {
      Camera,
      IconSearch,
      Home,
      Edit,
      Delete,
      Setting,
      Play,
      Pause,
      Notifications,
      LocationOn,
    },
    template: `
      <div style="padding: 16px;">
        <h3 style="margin-bottom: 16px;">常用图标展示</h3>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 24px;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Camera :width="32" :height="32" color="#1890ff" />
            <span style="font-size: 12px;">Camera</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <IconSearch :width="32" :height="32" color="#52c41a" />
            <span style="font-size: 12px;">Search</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Home :width="32" :height="32" color="#fa8c16" />
            <span style="font-size: 12px;">Home</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Edit :width="32" :height="32" color="#722ed1" />
            <span style="font-size: 12px;">Edit</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Delete :width="32" :height="32" color="#ff4d4f" />
            <span style="font-size: 12px;">Delete</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Setting :width="32" :height="32" color="#13c2c2" />
            <span style="font-size: 12px;">Setting</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Play :width="32" :height="32" color="#1890ff" />
            <span style="font-size: 12px;">Play</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Pause :width="32" :height="32" color="#52c41a" />
            <span style="font-size: 12px;">Pause</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <Notifications :width="32" :height="32" color="#fa8c16" />
            <span style="font-size: 12px;">Notifications</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <LocationOn :width="32" :height="32" color="#722ed1" />
            <span style="font-size: 12px;">LocationOn</span>
          </div>
        </div>
      </div>
    `,
  }),
};
