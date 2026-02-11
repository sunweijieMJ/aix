<template>
  <div class="test-i18n-page">
    <h1>Vue 国际化测试页面</h1>
    <p>此页面包含各种 Vue 多语言场景，用于测试 i18n 工具的提取能力</p>

    <!-- ==================== 1. Template 文本节点 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>1. Template 文本节点</h2>
      </template>
      <div>
        <p>这是一个简单的文本节点</p>
        <span>嵌套的文本内容</span>
        <div>包含多个文字的段落文本</div>
      </div>
    </el-card>

    <!-- ==================== 2. Template 属性值 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>2. Template 属性绑定</h2>
      </template>
      <div>
        <!-- 静态属性 -->
        <el-button title="这是按钮提示">静态属性</el-button>

        <!-- 动态属性绑定 -->
        <el-button :title="dynamicTitle">动态属性</el-button>
        <el-input v-model="inputValue" :placeholder="inputPlaceholder" />

        <!-- 组件属性 -->
        <el-tooltip :content="tooltipContent">
          <el-button>悬停查看提示</el-button>
        </el-tooltip>
      </div>
    </el-card>

    <!-- ==================== 3. Template 插值表达式 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>3. 插值表达式</h2>
      </template>
      <div>
        <p>{{ simpleMessage }}</p>
        <p>用户名: {{ userName }}</p>
        <p>{{ computedMessage }}</p>
        <p>{{ isActive ? '当前状态：活跃' : '当前状态：未激活' }}</p>
      </div>
    </el-card>

    <!-- ==================== 4. 条件渲染 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>4. 条件渲染</h2>
      </template>
      <div>
        <el-button @click="showContent = !showContent">
          {{ showContent ? '隐藏内容' : '显示内容' }}
        </el-button>

        <div v-if="showContent" style="margin-top: 12px">
          <p v-if="userType === 'admin'">管理员专属内容</p>
          <p v-else-if="userType === 'user'">普通用户内容</p>
          <p v-else>访客内容</p>

          <p>{{ status === 'success' ? '操作成功' : '操作失败' }}</p>
        </div>
      </div>
    </el-card>

    <!-- ==================== 5. 列表渲染 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>5. 列表渲染</h2>
      </template>
      <div>
        <h4>商品列表</h4>
        <div v-for="item in products" :key="item.id" class="list-item">
          <span>商品名称: {{ item.name }}</span>
          <span>价格: ¥{{ item.price }}</span>
          <el-button size="small">添加到购物车</el-button>
        </div>
        <p>总共 {{ products.length }} 件商品</p>
      </div>
    </el-card>

    <!-- ==================== 6. 表单控件 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>6. 表单控件</h2>
      </template>
      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="formData.username" placeholder="请输入用户名" />
        </el-form-item>

        <el-form-item label="邮箱">
          <el-input v-model="formData.email" placeholder="请输入邮箱地址" />
        </el-form-item>

        <el-form-item label="性别">
          <el-select v-model="formData.gender" placeholder="请选择性别">
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>

        <el-form-item label="简介">
          <el-input
            v-model="formData.bio"
            type="textarea"
            :rows="3"
            placeholder="请输入个人简介"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit">提交表单</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- ==================== 7. 模板字符串（在 script 中） ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>7. 模板字符串</h2>
      </template>
      <div>
        <p>{{ welcomeMessage }}</p>
        <p>{{ messageCount }}</p>
        <p>{{ timeRange }}</p>
        <el-button @click="testTemplateStrings">测试模板字符串</el-button>
      </div>
    </el-card>

    <!-- ==================== 8. 特殊字符 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>8. 特殊字符处理</h2>
      </template>
      <div>
        <p>包含"双引号"的文本</p>
        <p>包含'单引号'的文本</p>
        <p>包含{大括号}的文本</p>
        <p>包含🎉emoji的文本</p>
        <p>包含换行的 文本内容</p>
        <p>18px</p>
        <p>123@test.com</p>
      </div>
    </el-card>

    <!-- ==================== 9. 组件事件提示 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>9. 消息提示</h2>
      </template>
      <div>
        <el-button @click="showSuccessMessage">成功提示</el-button>
        <el-button @click="showErrorMessage">错误提示</el-button>
        <el-button @click="showWarningMessage">警告提示</el-button>
        <el-button @click="showNotification">通知提示</el-button>
      </div>
    </el-card>

    <!-- ==================== 10. 确认对话框 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>10. 对话框和确认</h2>
      </template>
      <div>
        <el-popconfirm
          title="您确定要删除这条记录吗？"
          confirm-button-text="确定"
          cancel-button-text="取消"
          @confirm="handleDelete"
        >
          <template #reference>
            <el-button type="danger">删除记录</el-button>
          </template>
        </el-popconfirm>

        <el-button style="margin-left: 8px" @click="showConfirmDialog">
          显示确认对话框
        </el-button>
      </div>
    </el-card>

    <!-- ==================== 11. 复杂场景 ==================== -->
    <el-card class="test-section">
      <template #header>
        <h2>11. 复杂嵌套场景</h2>
      </template>
      <div>
        <el-table :data="tableData" style="width: 100%">
          <el-table-column prop="name" label="项目名称" />
          <el-table-column prop="status" label="状态">
            <template #default="{ row }">
              <el-tag :type="row.status === '进行中' ? 'success' : 'info'">
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作">
            <template #default="{ row }">
              <el-button size="small" @click="handleEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="handleRemove(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <p style="margin-top: 16px">
          {{
            tableData.length > 0
              ? `共有 ${tableData.length} 个项目`
              : '暂无数据'
          }}
        </p>
      </div>
    </el-card>

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
import { ElMessage, ElNotification, ElMessageBox } from 'element-plus';
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
// 简单变量
const userName = ref('张三');
const simpleMessage = ref('这是一个简单的消息');
const isActive = ref(true);
const showContent = ref(false);
const userType = ref<'admin' | 'user' | 'guest'>('admin');
const status = ref<'success' | 'error'>('success');

// 属性绑定
const dynamicTitle = ref('这是动态的按钮提示');
const inputPlaceholder = ref('请输入内容');
const tooltipContent = ref('这是工具提示的内容');
const inputValue = ref('');

// 列表数据
const products = ref<Product[]>([
  { id: 1, name: '苹果', price: 5 },
  { id: 2, name: '香蕉', price: 3 },
  { id: 3, name: '橙子', price: 4 },
]);

// 表格数据
const tableData = ref<TableItem[]>([
  { id: '1', name: '项目A', status: '进行中' },
  { id: '2', name: '项目B', status: '已完成' },
  { id: '3', name: '项目C', status: '暂停' },
]);

// 表单数据
const formData = reactive<FormData>({
  username: '',
  email: '',
  gender: '',
  bio: '',
});

// ==================== 计算属性 ====================
const computedMessage = computed(() => {
  return `欢迎回来，${userName.value}`;
});

// 模板字符串示例
const welcomeMessage = computed(() => `欢迎 ${userName.value} 使用系统`);
const messageCount = computed(() => `您有 ${5} 条未读消息`);
const timeRange = computed(() => `处理时间从 ${'开始'} 到 ${'结束'}`);

// ==================== 事件处理 ====================
const handleSubmit = () => {
  console.log('提交表单:', formData); // 不应该被提取
  ElMessage.success('表单提交成功');
};

const handleReset = () => {
  Object.assign(formData, {
    username: '',
    email: '',
    gender: '',
    bio: '',
  });
  ElMessage.info('表单已重置');
};

const testTemplateStrings = () => {
  const msg1 = `欢迎 ${userName.value} 使用系统`;
  const msg2 = `您有 ${5} 条未读消息`;
  const debugInfo = `Debug: user=${userName.value}`; // 技术信息，不应该被提取

  console.log(debugInfo); // 不应该被提取
  alert(msg1);
  ElMessage.info(msg2);
};

const showSuccessMessage = () => {
  ElMessage.success('操作成功完成');
};

const showErrorMessage = () => {
  ElMessage.error('操作失败，请重试');
};

const showWarningMessage = () => {
  ElMessage.warning('请注意检查输入内容');
};

const showNotification = () => {
  ElNotification({
    title: '系统通知',
    message: '您有一条新的消息等待查看',
    type: 'info',
  });
};

const handleDelete = () => {
  console.log('执行删除操作'); // 不应该被提取
  ElMessage.success('删除成功');
};

const showConfirmDialog = () => {
  ElMessageBox.confirm('此操作将永久删除该文件，是否继续？', '警告提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      ElMessage.success('已确认删除');
    })
    .catch(() => {
      ElMessage.info('已取消删除');
    });
};

const handleEdit = (row: TableItem) => {
  console.log('编辑项目:', row.id); // 不应该被提取
  ElMessage.info(`正在编辑项目：${row.name}`);
};

const handleRemove = (row: TableItem) => {
  ElMessageBox.confirm(`确定要删除项目"${row.name}"吗？`, '删除确认', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'error',
  })
    .then(() => {
      tableData.value = tableData.value.filter((item) => item.id !== row.id);
      ElMessage.success('项目已删除');
    })
    .catch(() => {
      console.log('取消删除'); // 不应该被提取
    });
};
</script>

<style scoped lang="scss">
.test-i18n-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;

  h1 {
    margin-bottom: 16px;
    color: var(--el-text-color-primary);
  }

  .test-section {
    margin-bottom: 24px;

    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }

  .list-item {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    padding: 8px;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    gap: 16px;
  }

  .test-description {
    margin-top: 32px;
    padding: 16px;
    border-radius: 4px;
    background: var(--el-fill-color-light);

    h3 {
      margin-top: 0;
      margin-bottom: 12px;
    }

    ul {
      margin: 0;
      padding-left: 24px;
    }
  }
}
</style>
