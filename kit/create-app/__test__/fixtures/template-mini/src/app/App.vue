<template>
  <div class="app">
    <!-- #if i18n -->
    <LanguageSwitcher />
    <!-- #else -->
    <span>{{ project - title }}</span>
    <!-- #endif -->
  </div>
</template>

<script setup lang="ts">
// #if !qiankun
const standalone = true;
// #endif
</script>
