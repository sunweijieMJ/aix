---
id: admin/form-table-pattern
title: 表单与表格模式
description: 中后台表单验证、表格交互和 CRUD 模式
layer: domain
priority: 210
platforms: []
tags: [admin, form, table, agent]
version: "1.0.0"
---

## 职责

负责中后台系统表单和表格的设计模式指导。

---

## 表单模式

### 表单验证

```typescript
// 统一的校验规则定义
const rules = {
  name: [
    { required: true, message: '请输入名称' },
    { min: 2, max: 50, message: '名称长度 2-50 个字符' },
  ],
  email: [
    { required: true, message: '请输入邮箱' },
    { type: 'email', message: '邮箱格式不正确' },
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
  ],
};
```

### 新建/编辑复用

```typescript
// 通过路由参数区分新建和编辑
const isEdit = computed(() => !!route.params.id);

// 编辑模式加载数据
if (isEdit.value) {
  const data = await fetchDetail(route.params.id as string);
  Object.assign(formData, data);
}

// 提交时区分 API
async function handleSubmit() {
  if (isEdit.value) {
    await updateItem(route.params.id as string, formData);
  } else {
    await createItem(formData);
  }
}
```

## 表格模式

### 标准表格功能

| 功能 | 必须 | 说明 |
|------|------|------|
| 分页 | ✅ | 支持切换 pageSize |
| 排序 | 可选 | 列头点击排序 |
| 筛选 | 可选 | 列筛选器 |
| 多选 | 可选 | 批量操作 |
| 操作列 | ✅ | 查看/编辑/删除 |
| 空状态 | ✅ | 无数据提示 |
| 加载状态 | ✅ | skeleton 或 loading |

### CRUD Composable

```typescript
// 封装通用 CRUD 逻辑
function useCrud<T>(api: CrudApi<T>) {
  const list = ref<T[]>([]);
  const loading = ref(false);
  const pagination = reactive({ page: 1, pageSize: 20, total: 0 });

  async function fetchList(params?: Record<string, unknown>) {
    loading.value = true;
    try {
      const { data, total } = await api.list({
        ...params,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
      list.value = data;
      pagination.total = total;
    } finally {
      loading.value = false;
    }
  }

  async function remove(id: string) {
    await api.delete(id);
    await fetchList();
  }

  return { list, loading, pagination, fetchList, remove };
}
```

## 规范要点

- 删除操作必须**二次确认**
- 表单提交防止**重复提交**（loading + disabled）
- 列表页 URL 参数持久化搜索条件
- 长列表使用虚拟滚动
