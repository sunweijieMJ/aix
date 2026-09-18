<template>
  <label :class="[ns.b(), { [ns.m('focused')]: focused, [ns.m('filled')]: !!modelValue }]">
    <MenuIcon :src="searchIcon" :class="ns.e('icon')" />
    <input
      ref="inputRef"
      :class="ns.e('input')"
      type="text"
      autocomplete="off"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="placeholder"
      @input="onInput"
      @focus="focused = true"
      @blur="focused = false"
      @keydown.esc="onEscape"
    />
    <button
      v-if="clearable && modelValue"
      type="button"
      :class="ns.e('clear')"
      :aria-label="clearLabel"
      @click.prevent="onClear"
    >
      <MenuIcon :src="clearIcon" />
    </button>
  </label>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { nextTick, ref } from 'vue';
import clearIcon from '../assets/clear.svg';
import searchIcon from '../assets/search.svg';
import MenuIcon from './MenuIcon.vue';

defineOptions({
  name: 'AixMenuSearch',
});

const props = defineProps<{
  /** 搜索框文本 */
  modelValue: string;
  /** 占位文案，同时作为输入框的 aria-label */
  placeholder?: string;
  /** 有关键字时在右侧显示清除按钮 */
  clearable?: boolean;
  /** 清除按钮的 aria-label */
  clearLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const ns = useNamespace('menu-search');
const focused = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

/** 受控模式下父级拒绝更新时，把输入框文本回写为当前 modelValue */
function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  emit('update:modelValue', input.value);
  nextTick(() => {
    if (input.value !== props.modelValue) input.value = props.modelValue;
  });
}

/** Esc 清空关键字并拦下事件，输入框保持焦点，外层弹窗不受影响 */
function onEscape(event: KeyboardEvent) {
  if (!(event.target as HTMLInputElement).value) return;
  event.preventDefault();
  event.stopPropagation();
  emit('update:modelValue', '');
}

/**
 * 按钮嵌在 label 里，阻止默认行为挡掉 label 的聚焦转发。
 * 指针点击后主动失焦，搜索框回到默认态；detail 为 0 说明由键盘触发，
 * 此时按钮随关键字清空一起卸载，焦点要还给输入框才不会掉回文档开头。
 */
function onClear(event: MouseEvent) {
  emit('update:modelValue', '');
  if (event.detail === 0) {
    nextTick(() => inputRef.value?.focus());
    return;
  }
  focused.value = false;
  inputRef.value?.blur();
}
</script>
