import type { Meta, StoryObj } from '@storybook/vue3';
import { Camera } from '../src';

const meta: Meta<typeof Camera> = {
  title: 'Icons',
  component: Camera,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Camera>;

export const IconGallery: Story = {
  render: () => ({
    components: { Camera },
    template: `
      <div style="display: flex; gap: 16px; padding: 16px;">
        <div style="display: flex; flex-direction: column; align-items: center;">
          <Camera :width="50" :height="50" color="red" />
          <span style="font-size: 14px; margin-top: 8px;">Camera</span>
        </div>
      </div>
    `,
  }),
};
