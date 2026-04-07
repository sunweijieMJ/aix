/** @type {import("prettier").Config} */
export default {
  semi: true, // 在语句末尾添加分号
  singleQuote: true, // 使用单引号而不是双引号
  endOfLine: 'auto', // 根据操作系统自动选择行尾符（Windows: CRLF, Unix: LF）
  trailingComma: 'all', // 在多行对象、数组等的最后一项后添加逗号
  bracketSpacing: true, // 在对象字面量的括号内添加空格
  tabWidth: 2, // 缩进使用2个空格
  useTabs: false, // 使用空格而不是制表符进行缩进
  printWidth: 100, // 每行最大宽度，适配现代宽屏和组件库长类型声明
  htmlWhitespaceSensitivity: 'ignore', // Vue 模板格式化更美观，忽略 inline 元素空格
  vueIndentScriptAndStyle: false, // Vue SFC 中 script/style 不额外缩进
};
