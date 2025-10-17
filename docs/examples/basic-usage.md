---
title: 基础用法
---

<script setup>
import { Button } from '@aix/button'
</script>

# 基础用法

本节演示 Aix 组件的基础用法。

## 简单示例

最简单的用法，使用默认配置。

<div class="demo-block">
  <Button>默认按钮</Button>
  <Button type="primary">主要按钮</Button>
</div>

```vue
<template>
  <Button>默认按钮</Button>
  <Button type="primary">主要按钮</Button>
</template>

<script setup>
import { Button } from '@aix/button';
import '@aix/theme/dist/index.css';
</script>
```

## 组合使用

多个组件组合使用的示例。

<div class="demo-block">
  <div style="display: flex; gap: 12px; flex-wrap: wrap;">
    <Button size="small">小按钮</Button>
    <Button>中按钮</Button>
    <Button size="large">大按钮</Button>
  </div>
</div>

```vue
<template>
  <div style="display: flex; gap: 12px;">
    <Button size="small">小按钮</Button>
    <Button>中按钮</Button>
    <Button size="large">大按钮</Button>
  </div>
</template>
```

## 响应式布局

在不同屏幕尺寸下的响应式表现。

<div class="demo-block">
  <div style="display: flex; gap: 12px; flex-wrap: wrap;">
    <Button type="primary">操作1</Button>
    <Button>操作2</Button>
    <Button type="dashed">操作3</Button>
  </div>
</div>

## 实际应用场景

### 表单提交

<div class="demo-block">
  <div style="display: flex; gap: 12px;">
    <Button type="primary">提交</Button>
    <Button>取消</Button>
  </div>
</div>

```vue
<template>
  <div style="display: flex; gap: 12px;">
    <Button type="primary" @click="handleSubmit">提交</Button>
    <Button @click="handleCancel">取消</Button>
  </div>
</template>

<script setup>
const handleSubmit = () => {
  console.log('提交表单');
};

const handleCancel = () => {
  console.log('取消操作');
};
</script>
```

### 操作确认

<div class="demo-block">
  <div style="display: flex; gap: 12px;">
    <Button type="primary">确定</Button>
    <Button type="text">取消</Button>
  </div>
</div>

### 数据加载

<div class="demo-block">
  <Button type="primary" loading>加载中...</Button>
</div>

```vue
<template>
  <Button type="primary" :loading="loading" @click="fetchData">
    {{ loading ? '加载中...' : '加载数据' }}
  </Button>
</template>

<script setup>
import { ref } from 'vue';

const loading = ref(false);

const fetchData = async () => {
  loading.value = true;
  try {
    // 模拟 API 请求
    await new Promise(resolve => setTimeout(resolve, 2000));
  } finally {
    loading.value = false;
  }
};
</script>
```

## 最佳实践

1. **使用合适的按钮类型**：主要操作使用 `primary`，次要操作使用 `default`
2. **保持一致性**：同一页面的按钮尺寸应保持一致
3. **避免过度使用**：一个区域内主要按钮不要超过一个
4. **提供反馈**：异步操作时使用 `loading` 状态
