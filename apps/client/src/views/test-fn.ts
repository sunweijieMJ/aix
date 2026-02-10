// === 工具函数测试 ===

// 1. 验证函数
export const validateUserInput = (input: string): string | null => {
  if (!input || input.trim().length === 0) {
    return '输入内容不能为空';
  }

  if (input.length < 2) {
    return '输入内容至少需要2个字符';
  }

  if (input.length > 100) {
    return '输入内容不能超过100个字符';
  }

  return null;
};

// 2. 格式化函数
export const formatUserMessage = (
  type: 'success' | 'error' | 'warning',
  message: string,
): string => {
  switch (type) {
    case 'success':
      return `✅ 成功: ${message}`;
    case 'error':
      return `❌ 错误: ${message}`;
    case 'warning':
      return `⚠️ 警告: ${message}`;
    default:
      return message;
  }
};

// 3. API相关函数
export const getErrorMessage = (errorCode: number): string => {
  switch (errorCode) {
    case 400:
      return '请求参数错误';
    case 401:
      return '未授权访问';
    case 403:
      return '权限不足';
    case 404:
      return '资源未找到';
    case 500:
      return '服务器内部错误';
    default:
      return '未知错误';
  }
};

// 4. 业务逻辑函数
export const processOrderStatus = (status: string): string => {
  switch (status) {
    case 'pending':
      return '订单待处理';
    case 'processing':
      return '订单处理中';
    case 'completed':
      return '订单已完成';
    case 'cancelled':
      return '订单已取消';
    default:
      return '订单状态未知';
  }
};

// 5. 数据处理函数
export const formatDate = (date: Date): string => {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays <= 7) {
    return `${diffDays}天前`;
  }
  return date.toLocaleDateString();
};

// 6. 模板字符串函数
export const generateWelcomeMessage = (
  userName: string,
  loginCount: number,
): string => {
  return `欢迎回来，${userName}！这是您第${loginCount}次登录`;
};

export const generateProgressMessage = (
  current: number,
  total: number,
): string => {
  const percentage = Math.round((current / total) * 100);
  return `进度：${current}/${total} (${percentage}%)`;
};

export const generateTimeRangeMessage = (
  startTime: string,
  endTime: string,
): string => {
  return `时间范围：从${startTime}到${endTime}`;
};

// 7. 控制台调试函数（不应该被提取）
export const debugLog = (message: string, data?: any): void => {
  console.log(`调试信息: ${message}`, data); // console调用不应该被提取
  console.warn(`警告: 这是调试函数`); // console调用不应该被提取
  console.error(`错误: 调试模式下的错误信息`); // console调用不应该被提取
};

export const logApiCall = (url: string, method: string): void => {
  console.log(`API调用: ${method} ${url}`); // console调用不应该被提取
  console.time('API Response Time'); // console调用不应该被提取
};

// 8. 技术性函数（包含技术术语，部分不应该被提取）
export const validateApiResponse = (
  response: any,
): { valid: boolean; message: string } => {
  if (!response) {
    return { valid: false, message: '响应数据为空' };
  }

  if (response.status !== 200) {
    console.error('API Error:', response.status); // console调用不应该被提取
    return { valid: false, message: '服务器响应异常' };
  }

  return { valid: true, message: '数据验证通过' };
};

export const processHttpRequest = (method: string, url: string): string => {
  console.log(`HTTP ${method} request to ${url}`); // console调用不应该被提取
  return `正在发送${method}请求到服务器`;
};

// === 常量定义测试 ===

// 9. 用户提示常量
export const USER_MESSAGES = {
  WELCOME: '欢迎使用我们的系统',
  LOGIN_SUCCESS: '登录成功',
  LOGIN_FAILED: '登录失败，请检查用户名和密码',
  LOGOUT_CONFIRM: '确定要退出登录吗？',
  DATA_SAVED: '数据保存成功',
  DATA_LOADING: '正在加载数据...',
  NETWORK_ERROR: '网络连接失败，请稍后重试',
  SESSION_EXPIRED: '会话已过期，请重新登录',
  OPERATION_SUCCESS: '操作成功完成',
  OPERATION_FAILED: '操作失败，请重试',
  CONFIRM_DELETE: '确定要删除这个项目吗？',
  BATCH_DELETE_CONFIRM: '确定要批量删除选中的项目吗？',
  SAVE_DRAFT: '是否保存为草稿？',
  UNSAVED_CHANGES: '您有未保存的更改，确定要离开吗？',
};

// 10. 表单标签常量
export const FORM_LABELS = {
  USERNAME: '用户名',
  PASSWORD: '密码',
  EMAIL: '邮箱地址',
  PHONE: '手机号码',
  CONFIRM_PASSWORD: '确认密码',
  REMEMBER_ME: '记住我',
  FORGOT_PASSWORD: '忘记密码？',
  FIRST_NAME: '名',
  LAST_NAME: '姓',
  COMPANY: '公司名称',
  ADDRESS: '地址',
  CITY: '城市',
  PROVINCE: '省份',
  POSTAL_CODE: '邮政编码',
  BIRTH_DATE: '出生日期',
  GENDER: '性别',
};

// 11. 按钮文本常量
export const BUTTON_TEXTS = {
  SUBMIT: '提交',
  CANCEL: '取消',
  CONFIRM: '确认',
  DELETE: '删除',
  EDIT: '编辑',
  SAVE: '保存',
  RESET: '重置',
  SEARCH: '搜索',
  LOGIN: '登录',
  LOGOUT: '登出',
  REFRESH: '刷新',
  EXPORT: '导出',
  IMPORT: '导入',
  UPLOAD: '上传',
  DOWNLOAD: '下载',
  ADD: '添加',
  REMOVE: '移除',
  VIEW: '查看',
  PREVIEW: '预览',
  PRINT: '打印',
};

// 12. 状态文本常量
export const STATUS_TEXTS = {
  ACTIVE: '活跃',
  INACTIVE: '未激活',
  PENDING: '待处理',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  EXPIRED: '已过期',
};

// 13. 菜单项常量
export const MENU_ITEMS = {
  DASHBOARD: '仪表板',
  USERS: '用户管理',
  PRODUCTS: '产品管理',
  ORDERS: '订单管理',
  REPORTS: '报表统计',
  SETTINGS: '系统设置',
  PROFILE: '个人资料',
  HELP: '帮助中心',
  NOTIFICATIONS: '通知中心',
  SECURITY: '安全设置',
  BILLING: '账单管理',
  ANALYTICS: '数据分析',
};

// 14. 技术配置常量（不应该被提取）
export const API_CONFIG = {
  BASE_URL: 'https://api.example.com', // 不应该被提取
  TIMEOUT: 30000, // 不应该被提取
  RETRY_COUNT: 3, // 不应该被提取
  ENDPOINTS: {
    LOGIN: '/auth/login', // 不应该被提取
    LOGOUT: '/auth/logout', // 不应该被提取
    USER_PROFILE: '/user/profile', // 不应该被提取
    UPLOAD: '/upload', // 不应该被提取
  },
};

export const HTTP_METHODS = {
  GET: 'GET', // 不应该被提取
  POST: 'POST', // 不应该被提取
  PUT: 'PUT', // 不应该被提取
  DELETE: 'DELETE', // 不应该被提取
  PATCH: 'PATCH', // 不应该被提取
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken', // 不应该被提取
  USER_PREFERENCES: 'userPreferences', // 不应该被提取
  THEME: 'theme', // 不应该被提取
  LANGUAGE: 'language', // 不应该被提取
};

// === 复杂业务函数 ===

// 15. 权限检查函数
export const checkUserPermission = (
  userRole: string,
  requiredPermission: string,
): { allowed: boolean; message: string } => {
  const rolePermissions = {
    admin: ['read', 'write', 'delete', 'manage'], // 不应该被提取
    editor: ['read', 'write'], // 不应该被提取
    viewer: ['read'], // 不应该被提取
  };

  const permissions =
    rolePermissions[userRole as keyof typeof rolePermissions] || [];

  if (permissions.includes(requiredPermission)) {
    return { allowed: true, message: '权限验证通过' };
  }
  return { allowed: false, message: '权限不足，无法执行此操作' };
};

// 16. 数据验证函数
export const validateFormData = (
  data: Record<string, any>,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('姓名不能为空');
  }

  if (!data.email || !/\S+@\S+\.\S+/.test(data.email)) {
    errors.push('请输入有效的邮箱地址');
  }

  if (!data.phone || !/^1[3-9]\d{9}$/.test(data.phone)) {
    errors.push('请输入有效的手机号码');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// 17. 文件处理函数
export const validateFileUpload = (
  file: File,
): { valid: boolean; message: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB，不应该被提取
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']; // 不应该被提取

  if (file.size > maxSize) {
    return { valid: false, message: '文件大小不能超过10MB' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, message: '只支持JPG、PNG、GIF格式的图片' };
  }

  console.log(`文件验证通过: ${file.name}, ${file.size} bytes`); // console调用不应该被提取
  return { valid: true, message: '文件验证通过' };
};

// 18. 数据格式化函数
export const formatFileSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB']; // 技术单位，不应该被提取
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export const formatCurrency = (
  amount: number,
  currency: string = 'CNY',
): string => {
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency, // 不应该被提取
  });

  return formatter.format(amount);
};

// 19. 业务逻辑函数
export const calculateProgress = (
  completed: number,
  total: number,
): { percentage: number; description: string } => {
  const percentage = Math.round((completed / total) * 100);

  let description: string;
  if (percentage === 0) {
    description = '尚未开始';
  } else if (percentage < 25) {
    description = '刚刚开始';
  } else if (percentage < 50) {
    description = '进展顺利';
  } else if (percentage < 75) {
    description = '过半完成';
  } else if (percentage < 100) {
    description = '即将完成';
  } else {
    description = '全部完成';
  }

  return { percentage, description };
};

export const getNotificationText = (type: string, count: number): string => {
  switch (type) {
    case 'message':
      return count === 1 ? `您有1条新消息` : `您有${count}条新消息`;
    case 'order':
      return count === 1 ? `您有1个新订单` : `您有${count}个新订单`;
    case 'task':
      return count === 1 ? `您有1个待处理任务` : `您有${count}个待处理任务`;
    case 'reminder':
      return count === 1 ? `您有1个提醒` : `您有${count}个提醒`;
    default:
      return count === 1 ? `您有1个新通知` : `您有${count}个新通知`;
  }
};

// 20. 混合场景函数（包含应该和不应该被提取的内容）
export const processApiResponse = (
  response: any,
  operation: string,
): { success: boolean; message: string } => {
  console.log(`Processing API response for ${operation}`); // console调用不应该被提取

  if (!response) {
    console.error('Empty API response'); // console调用不应该被提取
    return { success: false, message: '服务器响应为空' };
  }

  if (response.status >= 200 && response.status < 300) {
    const successMessage = `${operation}操作成功完成`;
    console.log(`Success: ${successMessage}`); // console调用不应该被提取
    return { success: true, message: successMessage };
  }

  const errorMessage = `${operation}操作失败，请稍后重试`;
  console.error(`API Error: ${response.status} - ${response.statusText}`); // console调用不应该被提取
  return { success: false, message: errorMessage };
};

// 21. 国际化相关函数（模拟已经国际化的函数）
export const getLocalizedMessage = (
  key: string,
  params?: Record<string, any>,
): string => {
  // 模拟已经国际化的函数，这里的中文应该被提取
  const messages: Record<string, string> = {
    'user.welcome': '欢迎使用系统',
    'user.goodbye': '再见，期待下次见到您',
    'error.network': '网络连接错误',
    'success.save': '保存成功',
  };

  let message = messages[key] || '未找到对应的消息';

  if (params) {
    Object.keys(params).forEach((param) => {
      message = message.replace(`{${param}}`, String(params[param]));
    });
  }

  return message;
};

// 22. 条件性文本函数
export const getConditionalMessage = (
  condition: boolean,
  trueMessage: string,
  falseMessage: string,
): string => {
  return condition ? trueMessage : falseMessage;
};

export const getUserStatusMessage = (
  isOnline: boolean,
  lastSeen?: Date,
): string => {
  if (isOnline) {
    return '当前在线';
  }

  if (lastSeen) {
    const now = new Date();
    const diffMinutes = Math.floor(
      (now.getTime() - lastSeen.getTime()) / (1000 * 60),
    );

    if (diffMinutes < 60) {
      return `${diffMinutes}分钟前在线`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}小时前在线`;
    }
    const days = Math.floor(diffMinutes / 1440);
    return `${days}天前在线`;
  }

  return '离线状态';
};

// === 导出汇总（用于测试） ===
export const TEST_SCENARIOS = {
  // 应该被提取的场景
  SHOULD_EXTRACT: [
    '这些是用户界面文本',
    '包含中文的提示信息',
    '错误消息和成功提示',
    '表单标签和按钮文本',
    '状态描述和菜单项',
    '模板字符串中的中文部分',
    '业务逻辑相关的用户消息',
  ],

  // 不应该被提取的场景
  SHOULD_NOT_EXTRACT: [
    'API endpoints and URLs', // 技术术语
    'HTTP methods and status codes', // 技术术语
    'console.log debug messages', // 控制台调用
    'Technical configuration keys', // 技术配置
    'Database field names', // 数据库字段
    'CSS class names and IDs', // 样式相关
    'File extensions and MIME types', // 文件类型
  ],
};

// 23. 异步函数测试
export const fetchUserData = async (
  userId: string,
): Promise<{ success: boolean; message: string; data?: any }> => {
  try {
    console.log(`Fetching data for user: ${userId}`); // 不应该被提取

    // 模拟API调用
    const response = await fetch(`/api/users/${userId}`, {
      method: 'GET', // 不应该被提取
      headers: {
        'Content-Type': 'application/json', // 不应该被提取
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`); // 技术错误信息
    }

    const data = await response.json();
    return {
      success: true,
      message: '用户数据获取成功',
      data,
    };
  } catch (error) {
    console.error('API Error:', error); // 不应该被提取
    return {
      success: false,
      message: '获取用户数据失败，请检查网络连接',
    };
  }
};

// 24. 类方法测试
export class MessageManager {
  private messages: string[] = [];

  constructor() {
    console.log('MessageManager initialized'); // 不应该被提取
  }

  addMessage(message: string): string {
    this.messages.push(message);
    console.log(`Message added: ${message}`); // 不应该被提取
    return '消息添加成功';
  }

  getMessageCount(): string {
    const count = this.messages.length;
    if (count === 0) {
      return '暂无消息';
    } else if (count === 1) {
      return '您有1条消息';
    }
    return `您有${count}条消息`;
  }

  clearMessages(): string {
    const count = this.messages.length;
    this.messages = [];
    console.log(`Cleared ${count} messages`); // 不应该被提取
    return count > 0 ? '所有消息已清空' : '没有消息需要清空';
  }

  static getManagerInfo(): string {
    return '消息管理器版本 v1.0';
  }
}

// 25. 复杂模板字符串测试
export const generateComplexMessage = (
  userName: string,
  itemCount: number,
  totalPrice: number,
  discountRate: number,
): string => {
  const discount = totalPrice * discountRate;
  const finalPrice = totalPrice - discount;

  // 包含多个变量的复杂模板字符串
  const message = `尊敬的${userName}，您的订单包含${itemCount}件商品，原价¥${totalPrice.toFixed(2)}，享受${(discountRate * 100).toFixed(0)}%折扣优惠¥${discount.toFixed(2)}，实付金额¥${finalPrice.toFixed(2)}`;

  console.log(`Generated message: ${message}`); // 不应该被提取
  return message;
};

// 26. 嵌套对象和数组处理
export const processOrderData = (orderData: {
  id: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
}): { summary: string; details: string[] } => {
  console.log(`Processing order ${orderData.id}`); // 不应该被提取

  const totalItems = orderData.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const totalAmount = orderData.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  let statusText: string;
  switch (orderData.status) {
    case 'pending':
      statusText = '待处理';
      break;
    case 'processing':
      statusText = '处理中';
      break;
    case 'completed':
      statusText = '已完成';
      break;
    case 'cancelled':
      statusText = '已取消';
      break;
    default:
      statusText = '未知状态';
  }

  const summary = `订单${orderData.id}状态：${statusText}，共${totalItems}件商品，总金额¥${totalAmount.toFixed(2)}`;

  const details = orderData.items.map(
    (item, index) =>
      `${index + 1}. ${item.name} x${item.quantity} = ¥${(item.price * item.quantity).toFixed(2)}`,
  );

  return { summary, details };
};

// 27. 错误处理和日志记录混合
export const safeExecuteOperation = <T>(
  operation: () => T,
  operationName: string,
): { success: boolean; result?: T; error?: string } => {
  try {
    console.time(`${operationName} execution`); // 不应该被提取
    console.log(`开始执行操作: ${operationName}`); // console中的中文也不应该被提取

    const result = operation();

    console.timeEnd(`${operationName} execution`); // 不应该被提取
    console.log(`Operation ${operationName} completed successfully`); // 不应该被提取

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error(`Operation ${operationName} failed:`, error); // 不应该被提取
    console.trace('Error stack trace'); // 不应该被提取

    return {
      success: false,
      error: `执行${operationName}时发生错误，请稍后重试`,
    };
  }
};

// 28. 常量和枚举测试
export const UI_MESSAGES = {
  LOADING: '正在加载...',
  SUCCESS: '操作成功',
  ERROR: '操作失败',
  CONFIRM: '请确认您的操作',
  CANCEL: '取消',
  SAVE: '保存',
  DELETE: '删除',
  EDIT: '编辑',
  VIEW: '查看',

  // 技术常量，不应该被提取
  API_ENDPOINTS: {
    USER: '/api/users', // 不应该被提取
    ORDER: '/api/orders', // 不应该被提取
    PRODUCT: '/api/products', // 不应该被提取
  },

  // HTTP状态码，不应该被提取
  HTTP_STATUS: {
    OK: 200, // 不应该被提取
    NOT_FOUND: 404, // 不应该被提取
    SERVER_ERROR: 500, // 不应该被提取
  },
} as const;

export enum OrderStatus {
  PENDING = 'pending', // 不应该被提取
  PROCESSING = 'processing', // 不应该被提取
  COMPLETED = 'completed', // 不应该被提取
  CANCELLED = 'cancelled', // 不应该被提取
}

export const getOrderStatusText = (status: OrderStatus): string => {
  const statusMap = {
    [OrderStatus.PENDING]: '待处理',
    [OrderStatus.PROCESSING]: '处理中',
    [OrderStatus.COMPLETED]: '已完成',
    [OrderStatus.CANCELLED]: '已取消',
  };

  return statusMap[status] || '未知状态';
};

// 29. 复杂条件判断和字符串拼接
export const generateStatusReport = (data: {
  totalUsers: number;
  activeUsers: number;
  newRegistrations: number;
  errorRate: number;
}): {
  title: string;
  content: string;
  level: 'success' | 'warning' | 'error';
} => {
  const { totalUsers, activeUsers, newRegistrations, errorRate } = data;

  console.log('Generating status report with data:', data); // 不应该被提取

  const activeRate = ((activeUsers / totalUsers) * 100).toFixed(1);

  let title: string;
  let content: string;
  let level: 'success' | 'warning' | 'error';

  if (errorRate > 10) {
    level = 'error';
    title = '系统状态异常';
    content = `当前错误率${errorRate.toFixed(1)}%，需要立即处理。总用户${totalUsers}人，活跃用户${activeUsers}人（${activeRate}%），新注册${newRegistrations}人。`;
  } else if (errorRate > 5 || parseFloat(activeRate) < 50) {
    level = 'warning';
    title = '系统状态需要关注';
    content = `当前错误率${errorRate.toFixed(1)}%，活跃用户比例${activeRate}%。总用户${totalUsers}人，活跃用户${activeUsers}人，新注册${newRegistrations}人。建议优化系统性能。`;
  } else {
    level = 'success';
    title = '系统运行正常';
    content = `系统状态良好，错误率${errorRate.toFixed(1)}%，活跃用户${activeUsers}人（${activeRate}%），今日新注册${newRegistrations}人。`;
  }

  return { title, content, level };
};

console.log('测试函数模块加载完成'); // console调用不应该被提取
