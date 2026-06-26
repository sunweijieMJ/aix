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

    <!-- ==================== 10. 无障碍属性（aria-label / img alt 等）==================== -->
    <section class="test-section">
      <h2>10. 无障碍属性（aria-* / alt）</h2>
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

        <!-- ✅ img alt 是面向无障碍/SEO 的可见文本，应被提取（与 aria-label 同类）-->
        <img src="/placeholder.png" alt="产品封面图" />
        <img :src="dynamicSrc" :alt="dynamicAlt" />
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

    <!-- ==================== 14. HTML 注释中的中文（负向用例）==================== -->
    <section class="test-section">
      <h2>14. HTML 注释中的中文（不应被提取）</h2>
      <!-- ❌ 不应提取：模板编译器使用 comments:true 解析，但提取器只处理
           ELEMENT/TEXT/INTERPOLATION 三类节点，不应触达 COMMENT(type=3) 节点。
           本 section 显式断言：以下中文注释不会出现在任何 generate 产物中。 -->
      <!-- 这是一段中文注释：调试用，可随时删除 -->
      <!-- TODO: 后续补充错误处理逻辑 -->
      <!-- 警告：此节点暂未对接后端接口 -->
      <div>真正的可见文本（应被提取）</div>
    </section>

    <!-- ==================== 15. emit() 第二参数中的中文 ==================== -->
    <section class="test-section">
      <h2>15. emit() 调用参数（Composition API 子组件通信）</h2>
      <div class="demo-row">
        <button @click="handleEmitDemo">触发 emit 事件</button>
      </div>
    </section>

    <!-- ==================== 16. 文本节点中的 HTML 实体（B1 回归）==================== -->
    <section class="test-section">
      <h2>16. 文本节点中的 HTML 实体</h2>
      <!-- ✅ 应提取并替换：@vue/compiler-dom 会把 &copy;/&amp;/&nbsp; 等实体解码进文本节点
           content。提取端 original 须保留「原始源码（含实体）」供 Transformer indexOf 匹配，
           processedMessage / locale 值则用「解码后文案」（$t 渲染时输出 © 而非字面 &copy;）。
           手动核对要点：
             1) generate 后这两段中文被替换为 {{ $t('...') }}，源码里不再残留 &copy;/&amp;；
             2) locale 文件中对应 key 的值是解码形态（含真正的 ©，而非 "&copy;" 字符串）；
             3) 不得出现「生成了 key 却没替换源码」的孤儿 key。 -->
      <p>版权&copy;所有 &amp; 保留所有规则</p>
      <div>提示&nbsp;：请先阅读使用须知</div>
    </section>

    <!-- ==================== 17. 技术前缀撞车的静态属性（B2 回归）==================== -->
    <section class="test-section">
      <h2>17. 属性名前缀撞车</h2>
      <!-- ✅ 应提取：以下属性名虽以技术词「前缀」开头，但本身是面向用户的自定义属性，
           其中文值应被提取。技术属性名单必须用「精确相等」判定，不能用 startsWith，
           否则会被误杀：forecast→'for'、namespace→'name'、typeahead→'type'、sizeLabel→'size'。 -->
      <div
        forecast="今日天气预报"
        namespace="命名空间标签"
        typeahead="智能联想提示"
        sizeLabel="尺寸说明文字"
      ></div>
      <!-- ❌ 不应提取：真正的技术属性——精确命中名单（for）、data- 前缀、aria-*ID 引用。
           注意 data-track 的值虽是中文，但 data- 属于「前缀模式」整体跳过，验证 B2 修复
           没有误伤合法的前缀匹配。 -->
      <div for="field-id" data-track="点击埋点不提取" aria-labelledby="hdr-id"></div>
    </section>

    <!-- ==================== 18. <code> / <pre> 内的中文（负向用例）==================== -->
    <section class="test-section">
      <h2>18. &lt;code&gt; / &lt;pre&gt; 内的中文（不应被提取）</h2>
      <!-- ❌ 不应提取：constants 的 SKIP_ELEMENTS 把 <code>/<pre> 整棵子树跳过，
           内部中文是「代码 / 命令示例」，翻译会破坏其可复制性与正确性。本 section
           断言以下 <code>/<pre> 内的中文不出现在任何 generate 产物中，且不会阻断
           其外围同级文本的提取（与单测 code-pre-skip.test.ts 形成 e2e 对照）。 -->
      <pre>启动命令：请先执行初始化脚本再继续</pre>
      <code>这段行内代码里的中文不应被提取</code>
      <p>
        说明文字（应被提取）：
        <code>保留原样的中文代码片段</code>
        ，结尾文字（应被提取）
      </p>
    </section>

    <!-- ==================== 19. 已国际化字符串的幂等跳过（重跑安全）==================== -->
    <section class="test-section">
      <h2>19. 已国际化（$t / t）—— 二次提取应跳过</h2>
      <!-- ❌ 不应再次提取或二次包裹：以下已是 $t() / t() 调用，重跑 extract 必须幂等：
           既不能把 key 字符串当作中文提取，也不能把调用包成 $t($t(...))。
           template 走 $t（vue-i18n templateFunctionName），script 走模块级 t
           （本项目 tImport=@/plugins/locale），两条路径都应被识别为「已国际化」而跳过。 -->
      <p>{{ $t('views__demo__alreadyDone') }}</p>
      <button :title="$t('views__demo__alreadyTitle')">
        {{ $t('views__demo__alreadyBtn') }}
      </button>
      <p>{{ alreadyTranslatedText }}</p>
    </section>

    <!-- ==================== 20. 动态绑定属性中的中文（三元 / 模板字符串应提取）==================== -->
    <section class="test-section">
      <h2>20. 动态绑定属性中的中文</h2>
      <!-- ✅ 应提取：与 section 2/12 的「静态属性 / 自定义指令」不同，这里走的是
           VueTextExtractor 的「绑定属性表达式」路径——属性值本身是含中文的 TS 表达式。 -->
      <div class="demo-row">
        <!-- ✅ 应提取：:title 绑定三元的两个中文分支 -->
        <button :title="isActive ? '点击以停用功能' : '点击以启用功能'">切换状态</button>
        <!-- ✅ 应提取：:placeholder 绑定模板字符串中的中文（${fieldLabel} 保留为占位符）-->
        <input :placeholder="`请输入${fieldLabel}，该项不能为空`" />
        <!-- ✅ 应提取：:aria-label 绑定三元的中文分支（面向无障碍的可见文案）-->
        <span :aria-label="isActive ? '当前功能已开启' : '当前功能已关闭'">●</span>
      </div>
    </section>

    <!-- ==================== 21. 多段插值的 mixed-content（B4：3+ 插值同行合并）==================== -->
    <section class="test-section">
      <h2>21. 多段插值的混合文本</h2>
      <!-- ✅ 应提取为单条：TEXT+INTERPOLATION 的 while 合并循环把同一行连续的
           「文本 + 插值」拼成一个模板字符串（如 `${year}年${month}月${day}日 发布`），
           变量保留为占位符、词序不变。现有 section 3 只覆盖单插值，此处验证 3+ 段合并。 -->
      <p>{{ year }}年{{ month }}月{{ day }}日 发布</p>
      <p>共 {{ totalCount }} 项、已读 {{ readCount }} 项、未读 {{ unreadCount }} 项</p>
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
// ✅ 已国际化路径：从配置的 tImport（@/plugins/locale）导入 t，
//    用于 template section 19「已是 t() 调用 → 二次提取应跳过」的幂等回归。
import { t } from '@/plugins/locale';

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

interface DemoProps {
  title?: string;
  placeholder?: string;
  hint?: string;
}

// ==================== withDefaults(defineProps) 默认值中的中文（应被提取）====================
// Why: Composition API 高频场景。withDefaults 的第二参数对象 value 是字符串字面量，
// 提取器应识别为普通 script 段字符串并提取（key 是 props 字段名，不应提取）。
const props = withDefaults(defineProps<DemoProps>(), {
  title: '默认页面标题',
  placeholder: '请输入查询关键词',
  hint: '提示：未填写时使用默认值',
});
void props;

// defineEmits + emit 调用：第二参数为中文字符串字面量，应被提取
const emit = defineEmits<{
  (e: 'change', message: string): void;
  (e: 'error', reason: string): void;
}>();

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
const dynamicSrc = ref('/dynamic-cover.png');
const dynamicAlt = ref('动态封面：用户头像');
// ✅ 应提取：作为 section 20 动态属性模板字符串的插值变量
const fieldLabel = ref('用户昵称');

// section 21 多段插值 mixed-content 的占位变量（数值，模板侧保留为占位符）
const year = ref(2026);
const month = ref(6);
const day = ref(26);
const totalCount = ref(20);
const readCount = ref(8);
const unreadCount = ref(12);

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

// ❌ 不应再次提取：已是 t() 调用，二次 extract 必须幂等（见 template section 19）
const alreadyTranslatedText = computed(() => t('views__demo__alreadyComputed'));

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

// emit() 调用第二参数中的中文（应被提取）
const handleEmitDemo = () => {
  // ✅ 应提取：emit 的第二参数是普通字符串字面量
  emit('change', '配置已更新，请刷新页面查看');
  // ✅ 应提取：模板字符串中的中文也应被识别
  emit('error', `操作失败：${status.value === 'error' ? '内部错误' : '网络异常'}`);
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

// ==================== 带前导注释的字面量（B1 回归：nodeToText 跳过 trivia）====================
// 注释（块/行）不应阻断这些中文的提取与替换
const commentedTitle = ref(/* 页面标题 */ '数据监控看板');
const commentedHint = /* 输入提示 */ '请输入要查询的关键词';
void commentedTitle.value;
void commentedHint;
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
