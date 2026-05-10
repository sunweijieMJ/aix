// ==================== JS 独有特性的 i18n 提取测试 ====================
// 与 test-fn.ts 配对：基础提取场景（switch/常量/async/类）已在 .ts 中覆盖，
// 本文件只覆盖 JavaScript-only 的语法路径，避免与 .ts 重复。
//
// 关注点：
//  1) 无类型注解的 ES6 语法（generator、IIFE、computed property name）
//  2) JS-only 的 Error 子类
//  3) 默认参数解构、闭包工厂
//  4) 运行时计算的对象 key（验证不影响 key 提取规则）

// ==================== 1. 中文对象 key（H2 回归 - .js 路径）====================
// 与 test-i18n.vue script setup 中的 chineseKeyMap 配对，
// 走的是独立 .js 文件的 visitNode 路径，而非 SFC 的 visitScriptNode。
export const chineseKeyMap = {
  // ❌ 不应提取：以下三行字符串都是对象 key
  用户名: 'username',
  密码: 'password',
  邮箱: 'email',
};

// ❌ 不应提取：computed property name（运行时确定的 key 路径）
const fieldKey = '手机号';
export const fieldMap = {
  [fieldKey]: 'phone',
};

// ==================== 2. Generator 函数（JS-only 语法）====================

// ✅ 应提取：generator yield 出的中文
export function* generateOnboardingSteps() {
  yield '第一步：填写基本信息';
  yield '第二步：上传相关材料';
  yield '第三步：提交审核申请';
  yield '审核完成，请查收结果通知';
}

// ==================== 3. IIFE（立即执行函数表达式）====================

// ✅ 应提取：IIFE 返回对象中的中文 value
export const APP_META = (() => {
  return {
    name: '企业管理系统',
    description: '面向中小企业的一体化管理平台',
    // ❌ 不应提取：技术标识
    version: '2.1.0',
    author: 'dev-team',
  };
})();

// ==================== 4. 默认参数解构 + 闭包工厂 ====================

// ✅ 应提取：解构默认值中的中文
export function renderUserCard({ name = '未知用户', dept = '未分配部门', status = '在职' } = {}) {
  return `${name} · ${dept} · ${status}`;
}

// ✅ 应提取：闭包内动态拼接的中文模板字符串
export const createFieldValidator = (fieldName) => {
  return (value) => {
    if (!value || String(value).trim() === '') return `${fieldName}不能为空`;
    if (String(value).length > 200) return `${fieldName}不能超过200个字符`;
    return null;
  };
};

// ==================== 5. ES6 自定义 Error 类（无类型注解）====================

// ✅ 应提取：Error 子类构造器内的默认 message + name
export class BusinessError extends Error {
  constructor(code, message = '业务处理异常') {
    super(message);
    this.name = '业务错误';
    this.code = code;
  }
}

export class NetworkError extends Error {
  constructor(status) {
    // ✅ 应提取：模板字符串
    super(`网络请求失败，状态码：${status}`);
    this.name = '网络错误';
    this.status = status;
  }
}

// ==================== 6. Map / Set 字面量 ====================

// ✅ 应提取：Map 构造参数数组中的中文 value（key 为英文标识不提取）
export const ERROR_MESSAGES = new Map([
  ['auth_failed', '认证失败，请重新登录'],
  ['permission', '权限不足，无法执行此操作'],
  ['not_found', '请求的资源不存在'],
  ['server_error', '服务器内部错误，请联系管理员'],
  ['rate_limit', '操作过于频繁，请稍后再试'],
]);

// ✅ 数组字面量中的中文
export const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const STATUS_LIST = ['待处理', '进行中', '已完成', '已取消'];

// ❌ 数组中的技术值
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// ==================== 7. 比较运算符负向用例（与 .ts 路径相同，但 .js 单独验证）====================

// ❌ 不应提取：=== 右侧的字符串操作数（即便是中文）
export const getStatusText = (status) => {
  if (status === '进行中') return '处理中';
  if (status === '已完成') return '已结束';
  if (status === '已取消') return '取消';
  return '未知状态';
};

// ==================== 8. JSDoc 注释中的中文（不应提取）====================

/**
 * 格式化货币金额
 * 注意：此函数不处理汇率转换，仅做格式化输出
 * @param {number} amount - 金额（人民币）
 * @param {string} [currency='CNY'] - 货币代码
 * @returns {string} 格式化后的金额字符串，例如 "¥1,234.00"
 */
export function formatCurrency(amount, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount);
}

// ==================== 9. 模块顶层中文常量 ====================

// ✅ 应提取：模块顶层的中文字符串变量
export const DEFAULT_PAGE_TITLE = '控制台首页';
export const EMPTY_STATE_TEXT = '暂无数据，请稍后刷新';
export const LOADING_TEXT = '数据加载中，请稍候...';

// ❌ 不应提取：技术标识符
export const APP_ID = 'enterprise-console-v2';
export const BUILD_ENV = 'production';

console.log('test-fn.js 测试模块加载完成'); // ❌ console 不提取
