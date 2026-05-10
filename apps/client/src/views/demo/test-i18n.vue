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

    <!-- ==================== 5. 表单控件 ==================== -->
    <section class="test-section">
      <h2>5. 表单控件</h2>
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

    <!-- ==================== 6. 模板字符串（在 script 中） ==================== -->
    <section class="test-section">
      <h2>6. 模板字符串</h2>
      <div>
        <p>{{ welcomeMessage }}</p>
        <p>{{ messageCount }}</p>
        <p>{{ timeRange }}</p>
        <button @click="testTemplateStrings">测试模板字符串</button>
      </div>
    </section>

    <!-- ==================== 7. 特殊字符 ==================== -->
    <section class="test-section">
      <h2>7. 特殊字符处理</h2>
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

    <!-- ==================== 8. 消息提示与对话框确认 ==================== -->
    <section class="test-section">
      <h2>8. 消息提示与对话框确认</h2>
      <div class="demo-row">
        <button @click="showMessage('success', '操作成功完成')">成功提示</button>
        <button @click="showMessage('error', '操作失败，请重试')">错误提示</button>
        <button @click="showMessage('warning', '请注意检查输入内容')">警告提示</button>
        <button class="btn-danger" @click="handleDelete">删除记录</button>
        <button @click="showConfirmDialog">显示确认对话框</button>
      </div>
      <p v-if="lastMessage" :class="['message-toast', `message-${lastMessage.type}`]">
        {{ lastMessage.text }}
      </p>
      <div v-if="confirmResult" class="confirm-result">
        {{ confirmResult }}
      </div>
    </section>

    <!-- ==================== 9. 复杂嵌套场景 ==================== -->
    <section class="test-section">
      <h2>9. 复杂嵌套场景</h2>
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

    <!-- ==================== 10. 无障碍属性（aria-label 等）==================== -->
    <section class="test-section">
      <h2>10. 无障碍属性（aria-*）</h2>
      <div class="demo-row">
        <!-- ✅ aria-label 是面向用户的文字，应该被提取 -->
        <button aria-label="关闭弹窗">×</button>
        <button aria-label="删除当前项目" class="btn-danger">🗑</button>
        <input aria-label="搜索关键词" placeholder="请输入关键词" />
        <nav aria-labelledby="nav-title">
          <span id="nav-title">主导航</span>
        </nav>
        <section aria-describedby="section-desc">
          <p id="section-desc">此区域用于展示用户操作历史记录</p>
        </section>
      </div>
    </section>

    <!-- ==================== 11. v-text 和 v-html 指令 ==================== -->
    <section class="test-section">
      <h2>11. v-text / v-html 指令</h2>
      <div class="demo-row">
        <!-- ✅ v-text 动态内容（字符串字面量应被提取）-->
        <span v-text="'加载中...'"></span>
        <span v-text="isActive ? '已启用' : '已禁用'"></span>

        <!-- ✅ v-html 中的字符串（字面量部分应被提取）-->
        <div v-html="'<strong>重要提示</strong>：请仔细阅读'"></div>
      </div>
    </section>

    <!-- ==================== 12. 自定义指令 / Tooltip ==================== -->
    <section class="test-section">
      <h2>12. 自定义指令字符串</h2>
      <div class="demo-row">
        <!-- ✅ 自定义指令的字符串参数应被提取 -->
        <button v-tooltip="'点击此处提交表单'">提交</button>
        <span v-tooltip="status === 'error' ? '功能暂时关闭' : '点击开始操作'">状态按钮</span>

        <!-- ✅ 动态绑定的提示文字 -->
        <input :title="'必填项，请勿留空'" placeholder="请输入" />
      </div>
    </section>

    <!-- ==================== 13. 中文对象 key（不应提取）==================== -->
    <section class="test-section">
      <h2>13. 中文对象 key（不应被提取）</h2>
      <p>
        验证 Vue SFC
        <code>&lt;script setup&gt;</code>
        中的对象字面量属性 key 不被误提取。
      </p>
      <ul>
        <li v-for="(value, key) in chineseKeyMap" :key="key">{{ key }} → {{ value }}</li>
      </ul>
    </section>

    <!-- ==================== 14. 已国际化代码（幂等性测试）==================== -->
    <section class="test-section">
      <h2>14. 已国际化代码（不应二次包裹）</h2>
      <div>
        <!-- 关键点：参数中含中文，但因外层是 $t / t 调用，提取器应识别为
             "已国际化"，跳过再次包裹（CommonASTUtils.isAlreadyInternationalized）-->
        <p>{{ $t('已确认') }}</p>
        <p>{{ t('用户登录') }}</p>
        <button :title="$t('点击查看详情')">{{ $t('查看') }}</button>
        <!-- 嵌套 t() 调用：内层 t() 也含中文，不应被双层包裹 -->
        <p>{{ $t('欢迎信息', { name: t('管理员') }) }}</p>
      </div>
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

// ==================== 中文对象 key（H2 修复对应的回归用例）====================
// SFC <script setup> 中对象字面量的属性 key 不应被国际化提取，
// 否则运行时键名变成翻译后的字符串，破坏数据结构。
const chineseKeyMap: Record<string, string> = {
  // ❌ 不应提取：以下三行的字符串是对象 key
  用户名: 'username',
  邮箱地址: 'email',
  手机号码: 'phone',
};

// ✅ 应提取：value 才是真正的 UI 文本，应该被国际化
const fieldDisplayNames: Record<string, string> = {
  username: '用户登录名',
  email: '电子邮箱地址',
};
void fieldDisplayNames;

// ==================== 已国际化代码的幂等性测试 ====================
// 模板里出现了 $t / t 调用，给 t 一个声明以通过 TS 校验；提取器靠
// CommonASTUtils.isAlreadyInternationalized 识别 t() / $t() 调用，
// 跳过对其字符串参数的提取（即便参数里含中文）。
declare const t: (key: string, params?: Record<string, unknown>) => string;
void t;
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
