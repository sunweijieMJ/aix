<template>
  <div class="test-i18n-page">
    <h1>Vue 国际化测试页面</h1>
    <p>此页面包含各种 Vue 多语言场景，用于测试 i18n 工具的提取能力</p>

    <!-- ==================== 1. Template 文本节点 ==================== -->
    <section class="test-section">
      <h2>1. Template 文本节点</h2>
      <div>
        <p>这是一个简单的文本节点</p>
        <span>嵌套的文本内容</span>
        <div>包含多个文字的段落文本</div>
      </div>
    </section>

    <!-- ==================== 2. Template 属性值 ==================== -->
    <section class="test-section">
      <h2>2. Template 属性绑定</h2>
      <div class="demo-row">
        <button title="这是按钮提示">静态属性</button>
        <button :title="dynamicTitle">动态属性</button>
        <input v-model="inputValue" :placeholder="inputPlaceholder" />
      </div>
    </section>

    <!-- ==================== 3. Template 插值表达式 ==================== -->
    <section class="test-section">
      <h2>3. 插值表达式</h2>
      <div>
        <p>{{ simpleMessage }}</p>
        <p>用户名: {{ userName }}</p>
        <p>{{ computedMessage }}</p>
        <p>{{ isActive ? '当前状态：活跃' : '当前状态：未激活' }}</p>
      </div>
    </section>

    <!-- ==================== 4. 条件渲染 ==================== -->
    <section class="test-section">
      <h2>4. 条件渲染</h2>
      <div>
        <button @click="showContent = !showContent">
          {{ showContent ? '隐藏内容' : '显示内容' }}
        </button>

        <div v-if="showContent" class="conditional-content">
          <p v-if="userType === 'admin'">管理员专属内容</p>
          <p v-else-if="userType === 'user'">普通用户内容</p>
          <p v-else>访客内容</p>

          <p>{{ status === 'success' ? '操作成功' : '操作失败' }}</p>
        </div>
      </div>
    </section>

    <!-- ==================== 5. 列表渲染 ==================== -->
    <section class="test-section">
      <h2>5. 列表渲染</h2>
      <div>
        <h4>商品列表</h4>
        <div v-for="item in products" :key="item.id" class="list-item">
          <span>商品名称: {{ item.name }}</span>
          <span>价格: ¥{{ item.price }}</span>
          <button class="btn-small">添加到购物车</button>
        </div>
        <p>总共 {{ products.length }} 件商品</p>
      </div>
    </section>

    <!-- ==================== 6. 表单控件 ==================== -->
    <section class="test-section">
      <h2>6. 表单控件</h2>
      <form class="test-form" @submit.prevent="handleSubmit">
        <div class="form-item">
          <label>用户名</label>
          <input v-model="formData.username" placeholder="请输入用户名" />
        </div>

        <div class="form-item">
          <label>邮箱</label>
          <input v-model="formData.email" placeholder="请输入邮箱地址" />
        </div>

        <div class="form-item">
          <label>性别</label>
          <select v-model="formData.gender">
            <option value="" disabled>请选择性别</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div class="form-item">
          <label>简介</label>
          <textarea v-model="formData.bio" rows="3" placeholder="请输入个人简介" />
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary">提交表单</button>
          <button type="button" @click="handleReset">重置</button>
        </div>
      </form>
    </section>

    <!-- ==================== 7. 模板字符串（在 script 中） ==================== -->
    <section class="test-section">
      <h2>7. 模板字符串</h2>
      <div>
        <p>{{ welcomeMessage }}</p>
        <p>{{ messageCount }}</p>
        <p>{{ timeRange }}</p>
        <button @click="testTemplateStrings">测试模板字符串</button>
      </div>
    </section>

    <!-- ==================== 8. 特殊字符 ==================== -->
    <section class="test-section">
      <h2>8. 特殊字符处理</h2>
      <div>
        <p>包含"双引号"的文本</p>
        <p>包含'单引号'的文本</p>
        <p>包含{大括号}的文本</p>
        <p>包含🎉emoji的文本</p>
        <p>包含换行的 文本内容</p>
        <p>18px</p>
        <p>123@test.com</p>
      </div>
    </section>

    <!-- ==================== 9. 消息提示 ==================== -->
    <section class="test-section">
      <h2>9. 消息提示</h2>
      <div class="demo-row">
        <button @click="showMessage('success', '操作成功完成')">成功提示</button>
        <button @click="showMessage('error', '操作失败，请重试')">错误提示</button>
        <button @click="showMessage('warning', '请注意检查输入内容')">警告提示</button>
      </div>
      <p v-if="lastMessage" :class="['message-toast', `message-${lastMessage.type}`]">
        {{ lastMessage.text }}
      </p>
    </section>

    <!-- ==================== 10. 确认对话框 ==================== -->
    <section class="test-section">
      <h2>10. 对话框和确认</h2>
      <div class="demo-row">
        <button class="btn-danger" @click="handleDelete">删除记录</button>
        <button @click="showConfirmDialog">显示确认对话框</button>
      </div>
      <div v-if="confirmResult" class="confirm-result">
        {{ confirmResult }}
      </div>
    </section>

    <!-- ==================== 11. 复杂场景 ==================== -->
    <section class="test-section">
      <h2>11. 复杂嵌套场景</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>项目名称</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableData" :key="row.id">
            <td>{{ row.name }}</td>
            <td>
              <span :class="['status-tag', row.status === '进行中' ? 'tag-success' : 'tag-info']">
                {{ row.status }}
              </span>
            </td>
            <td>
              <button class="btn-small" @click="handleEdit(row)">编辑</button>
              <button class="btn-small btn-danger" @click="handleRemove(row)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        {{ tableData.length > 0 ? `共有 ${tableData.length} 个项目` : '暂无数据' }}
      </p>
    </section>

    <!-- ==================== 测试说明 ==================== -->
    <div class="test-description">
      <h3>测试说明</h3>
      <ul>
        <li>✅ 应该被提取：包含中文的用户界面文本</li>
        <li>❌ 不应该被提取：console 调用、技术属性、英文技术术语</li>
        <li>🔄 模板字符串：包含变量的中文文本</li>
        <li>🎯 组件类型：Composition API (script setup)、Options API (可选)</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';

// ==================== 接口定义 ====================
interface Product {
  id: number;
  name: string;
  price: number;
}

interface TableItem {
  id: string;
  name: string;
  status: string;
}

interface FormData {
  username: string;
  email: string;
  gender: string;
  bio: string;
}

// ==================== 状态定义 ====================
const userName = ref('张三');
const simpleMessage = ref('这是一个简单的消息');
const isActive = ref(true);
const showContent = ref(false);
const userType = ref<'admin' | 'user' | 'guest'>('admin');
const status = ref<'success' | 'error'>('success');

const dynamicTitle = ref('这是动态的按钮提示');
const inputPlaceholder = ref('请输入内容');
const inputValue = ref('');

const products = ref<Product[]>([
  { id: 1, name: '苹果', price: 5 },
  { id: 2, name: '香蕉', price: 3 },
  { id: 3, name: '橙子', price: 4 },
]);

const tableData = ref<TableItem[]>([
  { id: '1', name: '项目A', status: '进行中' },
  { id: '2', name: '项目B', status: '已完成' },
  { id: '3', name: '项目C', status: '暂停' },
]);

const formData = reactive<FormData>({
  username: '',
  email: '',
  gender: '',
  bio: '',
});

const lastMessage = ref<{ type: string; text: string } | null>(null);
const confirmResult = ref('');

// ==================== 计算属性 ====================
const computedMessage = computed(() => `欢迎回来，${userName.value}`);
const welcomeMessage = computed(() => `欢迎 ${userName.value} 使用系统`);
const messageCount = computed(() => `您有 ${5} 条未读消息`);
const timeRange = computed(() => `处理时间从 ${'开始'} 到 ${'结束'}`);

// ==================== 事件处理 ====================
const showMessage = (type: string, text: string) => {
  lastMessage.value = { type, text };
  setTimeout(() => {
    lastMessage.value = null;
  }, 3000);
};

const handleSubmit = () => {
  console.log('提交表单:', formData);
  showMessage('success', '表单提交成功');
};

const handleReset = () => {
  Object.assign(formData, { username: '', email: '', gender: '', bio: '' });
  showMessage('info', '表单已重置');
};

const testTemplateStrings = () => {
  const msg1 = `欢迎 ${userName.value} 使用系统`;
  const debugInfo = `Debug: user=${userName.value}`;
  console.log(debugInfo);
  alert(msg1);
};

const handleDelete = () => {
  if (confirm('您确定要删除这条记录吗？')) {
    showMessage('success', '删除成功');
  }
};

const showConfirmDialog = () => {
  if (confirm('此操作将永久删除该文件，是否继续？')) {
    confirmResult.value = '已确认删除';
    showMessage('success', '已确认删除');
  } else {
    confirmResult.value = '已取消删除';
  }
};

const handleEdit = (row: TableItem) => {
  console.log('编辑项目:', row.id);
  showMessage('info', `正在编辑项目：${row.name}`);
};

const handleRemove = (row: TableItem) => {
  if (confirm(`确定要删除项目"${row.name}"吗？`)) {
    tableData.value = tableData.value.filter((item) => item.id !== row.id);
    showMessage('success', '项目已删除');
  }
};
</script>

<style scoped lang="scss">
.test-i18n-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;

  h1 {
    margin-bottom: 16px;
    color: var(--aix-colorText);
  }
}

.test-section {
  margin-bottom: 24px;
  padding: 20px;
  border: 1px solid var(--aix-colorBorder, #e5e7eb);
  border-radius: var(--aix-borderRadiusLG, 8px);
  background: var(--aix-colorBgContainer, #fff);

  h2 {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 600;
  }
}

.demo-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.conditional-content {
  margin-top: 12px;
}

.list-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px 12px;
  border: 1px solid var(--aix-colorBorder, #e5e7eb);
  border-radius: 4px;
  gap: 16px;
}

.test-form {
  .form-item {
    margin-bottom: 16px;

    label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
    }

    input,
    select,
    textarea {
      box-sizing: border-box;
      width: 100%;
      max-width: 400px;
      padding: 6px 10px;
      border: 1px solid var(--aix-colorBorder, #d9d9d9);
      border-radius: 4px;
      font-size: 14px;
    }
  }

  .form-actions {
    display: flex;
    gap: 8px;
  }
}

button {
  padding: 6px 16px;
  border: 1px solid var(--aix-colorBorder, #d9d9d9);
  border-radius: 4px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    border-color: var(--aix-colorPrimary, #1677ff);
    color: var(--aix-colorPrimary, #1677ff);
  }
}

.btn-primary {
  border-color: var(--aix-colorPrimary, #1677ff);
  background: var(--aix-colorPrimary, #1677ff);
  color: #fff;

  &:hover {
    opacity: 0.85;
    color: #fff;
  }
}

.btn-danger {
  border-color: #ff4d4f;
  color: #ff4d4f;

  &:hover {
    background: #ff4d4f;
    color: #fff;
  }
}

.btn-small {
  padding: 2px 8px;
  font-size: 12px;
}

.message-toast {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.message-success {
  background: #f6ffed;
  color: #52c41a;
}

.message-error {
  background: #fff2f0;
  color: #ff4d4f;
}

.message-warning {
  background: #fffbe6;
  color: #faad14;
}

.message-info {
  background: #e6f4ff;
  color: #1677ff;
}

.confirm-result {
  margin-top: 8px;
  color: var(--aix-colorTextSecondary, #666);
}

.data-table {
  width: 100%;
  border-spacing: 0;
  border-collapse: collapse;

  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--aix-colorBorder, #e5e7eb);
    text-align: left;
  }

  th {
    background: var(--aix-colorBgLayout, #fafafa);
    font-weight: 600;
  }
}

.status-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.tag-success {
  background: #f6ffed;
  color: #52c41a;
}

.tag-info {
  background: #e6f4ff;
  color: #1677ff;
}

.test-description {
  margin-top: 32px;
  padding: 16px;
  border-radius: 4px;
  background: var(--aix-colorBgLayout, #fafafa);

  h3 {
    margin-top: 0;
    margin-bottom: 12px;
  }

  ul {
    margin: 0;
    padding-left: 24px;
  }
}
</style>
