<template>
  <!-- ==================== Vue Options API i18n 提取测试 ==================== -->
  <!-- 与 test-i18n.vue（script setup）配对，验证 Options API 路径的提取行为。
       关注点：data() / methods / computed / watch / 生命周期内的中文文案，
       以及 componentType 字段在非 'setup' 上下文下的取值（当前实现硬编码为
       'setup'，本文件作为对照基准，便于后续修复时验证差异）。 -->
  <div class="options-api-page">
    <h1>{{ pageTitle }}</h1>
    <p>{{ pageDescription }}</p>

    <section>
      <h2>状态展示</h2>
      <p>当前状态：{{ statusLabel }}</p>
      <p>{{ tooltipText }}</p>
      <button @click="handleAction">{{ actionButtonLabel }}</button>
    </section>

    <section>
      <h2>用户列表</h2>
      <ul>
        <li v-for="user in users" :key="user.id">{{ user.name }} - {{ user.role }}</li>
      </ul>
      <p v-if="users.length === 0">暂无用户数据</p>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

interface UserItem {
  id: number;
  name: string;
  role: string;
}

export default defineComponent({
  name: 'TestI18nOptionsAPI',

  // ==================== data() 中的中文（应被提取）====================
  data() {
    return {
      // ✅ 应提取：data 返回的中文 UI 文案
      pageTitle: 'Options API 国际化测试页面',
      pageDescription: '验证 data() / methods / computed 路径下的提取行为',
      tooltipText: '提示：使用 Options API 时也应正确提取',
      actionButtonLabel: '执行操作',

      // ✅ 应提取：数组元素中的中文
      users: [
        { id: 1, name: '管理员', role: '系统管理员' },
        { id: 2, name: '编辑员', role: '内容编辑' },
        { id: 3, name: '访客', role: '只读访问' },
      ] as UserItem[],

      // ❌ 不应提取：对象属性 key 是中文（破坏数据结构风险）
      // 这里复用 H2 修复对应的回归用例
      labelMap: {
        姓名: 'name',
        角色: 'role',
        部门: 'department',
      } as Record<string, string>,
    };
  },

  // ==================== computed 中的中文（应被提取）====================
  computed: {
    statusLabel(): string {
      // ✅ 应提取
      return this.users.length > 0 ? '已就绪' : '初始化中';
    },

    summary(): string {
      // ✅ 应提取：模板字符串 + 变量
      return `共 ${this.users.length} 位用户，当前状态：${this.statusLabel}`;
    },
  },

  // ==================== watch 中的中文 ====================
  watch: {
    'users.length'(newVal: number) {
      if (newVal === 0) {
        this.tooltipText = '用户列表已清空'; // ✅
      } else {
        this.tooltipText = `用户数量已更新为 ${newVal}`; // ✅
      }
    },
  },

  // ==================== 生命周期钩子中的中文 ====================
  mounted(): void {
    console.log('页面已挂载'); // ❌ console 不提取
    this.tooltipText = '页面初始化完成'; // ✅ 赋值的字符串应提取
  },

  // ==================== methods 中的中文 ====================
  methods: {
    handleAction(): string {
      // ✅ 应提取
      console.log('调试：handleAction 被调用'); // ❌ console 调用不应提取
      return '通过 Options API 方法返回的提示信息';
    },

    formatUser(user: UserItem): string {
      // ✅ 应提取：模板字符串 + 字面量插值（H1 修复对应：${'分隔符'} 应被内联）
      return `${user.name}（${user.role}）${' · '}已激活`;
    },

    // ❌ 不应提取：比较运算符的字符串操作数
    isAdmin(role: string): boolean {
      return role === '系统管理员';
    },
  },
});
</script>

<style scoped lang="scss">
.options-api-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

section {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--aix-colorBorder, #e5e7eb);
  border-radius: 8px;
}

button {
  padding: 6px 16px;
  border: 1px solid var(--aix-colorPrimary, #1677ff);
  border-radius: 4px;
  background: #fff;
  color: var(--aix-colorPrimary, #1677ff);
  cursor: pointer;
}
</style>
