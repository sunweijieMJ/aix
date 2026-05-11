<template>
  <!-- ==================== Vue 3 双 <script> 块共存场景 ====================
       VueTextExtractor.ts:55-58 明确声称："Vue 3 官方允许 <script> 与
       <script setup> 共存，两个块的中文文案都需要提取"。
       本文件验证该能力：普通 <script> 用于声明组件选项（如 inheritAttrs、
       errorCaptured 钩子），<script setup> 写 Composition API。两个块内的
       中文字符串都应被提取到 generate 产物中。 -->
  <div class="dual-script-page">
    <h1>{{ pageTitle }}</h1>
    <p>{{ greeting }}</p>
    <button @click="handleClick">{{ buttonLabel }}</button>
  </div>
</template>

<!-- 普通 <script> 块：声明组件选项（不能写在 setup 中的部分）
     注意：vue 的所有 import 合并到此处声明，<script setup> 块直接复用（Vue 3
     SFC 编译时两个块共享模块作用域）。这是为了满足 eslint import/order 规则
     newlines-between=never，避免跨 script 块产生 import 间隔违规。 -->
<script lang="ts">
import { computed, defineComponent, ref } from 'vue';

// ✅ 应提取：组件选项 <script> 中的中文常量
const FALLBACK_TITLE = '双脚本共存测试页';

export default defineComponent({
  name: 'TestI18nDualScript',
  inheritAttrs: false,

  // ✅ 应提取：组件选项 data() 中的中文（与 setup 块独立提取）
  data() {
    return {
      legacyFooterText: '版权所有 © 公司名称',
      legacyHelpText: '如需帮助，请联系系统管理员',
    };
  },

  // ✅ 应提取：组件选项 mounted 钩子里的中文
  mounted(): void {
    console.log('页面已挂载'); // ❌ console 不提取
    this.legacyHelpText = '页面初始化完成';
  },
});

// 导出给同 SFC 的其它消费者可用（Vue 3 SFC 编译后共享模块作用域）
export { FALLBACK_TITLE };
</script>

<script setup lang="ts">
// 注：ref / computed 已在上方普通 <script> 块导入；Vue 3 SFC 编译时两个 script
// 块的顶层作用域共享，setup 块直接复用即可（无需重复 import）。

// ==================== <script setup> 中的中文（应被提取）====================
// ✅ 应提取：ref 初始值（与上方普通 script 的字符串相互独立，两块都应被提取）
const userName = ref('访客');

// ✅ 应提取：computed 返回的中文
const pageTitle = computed(() => userName.value || '欢迎页');
const greeting = computed(() => `${userName.value}，欢迎使用本系统`);
const buttonLabel = ref('立即开始体验');

// ✅ 应提取：函数内部的中文
const handleClick = () => {
  alert('按钮被点击：开始执行操作');
};
</script>

<style scoped>
.dual-script-page {
  padding: 24px;
}
</style>
