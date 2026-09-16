<template>
  <label :class="[ns.b(), { [ns.m('focused')]: focused }]">
    <MenuIcon :src="searchIcon" :class="ns.e('icon')" />
    <input
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
  </label>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { nextTick, ref } from 'vue';
import searchIcon from '../assets/search.svg';
import MenuIcon from './MenuIcon.vue';

defineOptions({
  name: 'AixMenuSearch',
});

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const ns = useNamespace('menu-search');
const focused = ref(false);

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
</script>
