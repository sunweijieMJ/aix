<template>
  <template v-for="(part, index) in parts" :key="index">
    <mark v-if="part.hit" :class="ns.b()">{{ part.text }}</mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed } from 'vue';
import { useMenuContext } from '../composables/useMenuContext';

defineOptions({
  name: 'AixMenuHighlight',
});

const props = defineProps<{
  /** 原文；命中搜索关键字的片段包进 <mark> */
  text?: string;
}>();

interface Part {
  text: string;
  hit: boolean;
}

/** 不区分大小写地按关键字切分；关键字为空或没命中时整段原样返回 */
function split(text: string, keyword: string): Part[] {
  if (!keyword) return [{ text, hit: false }];
  const haystack = text.toLowerCase();
  const needle = keyword.toLowerCase();
  const parts: Part[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

const ns = useNamespace('menu-highlight');
const ctx = useMenuContext();
const parts = computed(() => split(props.text ?? '', ctx.highlightKeyword.value));
</script>
