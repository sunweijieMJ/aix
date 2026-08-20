/**
 * 按**自有属性**从注册表取值；键不是自有属性（或表本身不存在）时返回 undefined。
 *
 * 存在的理由是包内所有注册表查找的键都来自**不可信数据**——`block.type`、`message.role`、
 * `tool_use.toolName` 全部源自流数据与持久化的对话树（localStorage 可被篡改 / 损坏），
 * 而注册表是对象字面量、继承 `Object.prototype`。直接下标会让 `'constructor'` /
 * `'toString'` / `'valueOf'` / `'hasOwnProperty'` 这些**原型链上的键取到真值**，后果按调用点
 * 不同而异，但都难排查：
 *
 * - 块渲染器注册表：把原型上的函数当组件渲染，气泡里吐出 `[object Object]` 之类的垃圾，
 *   且绕过「未注册渲染器」的开发期告警（静默）；
 * - 角色配置表：取到函数后走进「函数形态角色配置」分支被当配置函数调用，轻则把返回值
 *   （如 `'[object Object]'`）展开成 0/1/2… 下标属性 v-bind 到气泡上，重则抛错打崩整条消息列表。
 *
 * `__proto__` 本就不在自有属性中，`Object.hasOwn` 一并挡住。
 */
export function ownProp<T>(registry: Record<string, T> | undefined, key: string): T | undefined {
  return registry && Object.hasOwn(registry, key) ? registry[key] : undefined;
}
