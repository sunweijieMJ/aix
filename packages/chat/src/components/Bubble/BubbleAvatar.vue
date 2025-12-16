<template>
  <div :class="['aix-bubble-avatar', `aix-bubble-avatar--${size}`]">
    <slot>
      <img v-if="src" :src="src" :alt="role" class="aix-bubble-avatar__img" />
      <div v-else class="aix-bubble-avatar__default">
        <Person v-if="role === 'user'" />
        <Face v-else-if="role === 'assistant'" />
        <Message v-else />
      </div>
    </slot>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleAvatar 组件
 * @see ./types.ts - 导出类型定义
 */
import type { MessageRole } from '@aix/chat-sdk';
import { Person, Face, Message } from '@aix/icons';

/** BubbleAvatar 组件 Props */
interface BubbleAvatarProps {
  role?: MessageRole;
  src?: string;
  size?: 'small' | 'medium' | 'large';
}

withDefaults(defineProps<BubbleAvatarProps>(), {
  role: 'assistant',
  size: 'medium',
});
</script>

<style scoped lang="scss">
.aix-bubble-avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: all var(--aix-transition-base);
  border-radius: var(--aix-bubble-avatar-radius);
  background: var(--aix-color-bg-container);
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.08);

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 3px 6px rgb(0 0 0 / 0.12);
  }

  &--small {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }

  &--medium {
    width: var(--aix-bubble-avatar-size);
    height: var(--aix-bubble-avatar-size);
    font-size: 18px;
  }

  &--large {
    width: 44px;
    height: 44px;
    font-size: 22px;
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__default {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

    span {
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.2));
    }
  }
}
</style>
