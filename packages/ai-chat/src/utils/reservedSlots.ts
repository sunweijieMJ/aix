/**
 * 「消息级插槽」保留名单 —— 块插槽穿透链路（AiChat → BubbleList → Bubble → 块渲染器）
 * 上每一层用来把自己消费的插槽从穿透集合里剔除的依据。
 *
 * ## 为什么必须集中定义
 *
 * 穿透的实现是「凡不在本层保留名单里的具名插槽，一律往下传」。于是**漏登记一个名字**，
 * 它就会被降级成块插槽继续下传，最终落到每一个块渲染器的同名内部插槽上——在**所有**消息
 * 的**每个块**里重复渲染一遍，且全程无报错。名字撞车并不罕见：`error` / `header` /
 * `footer` 这类，自定义块渲染器（图表卡、工具卡）声明同名内部插槽是很自然的设计。
 *
 * ## 层间关系（由 __test__/slotPassthrough.test.ts 行为级验证）
 *
 * - `BUBBLE_RESERVED` ⊂ `BUBBLE_LIST_RESERVED`：BubbleList 若把 Bubble 会消费的名字当作
 *   穿透插槽下传，该插槽会在 Bubble 上被重复声明；
 * - AiChat 层的名单**不由此推导**（它另有标题栏 / 欢迎页 / Sender 周边等一大批自有插槽，
 *   且把 Bubble 的 `header` 重命名为 `bubble-header` 以避开自己的标题栏 header），
 *   故单独维护在 AiChat.vue 内，由上述行为测试兜底。
 */

/** Bubble 自身消费的插槽（其余具名插槽视为块插槽，透传给块渲染器） */
export const BUBBLE_RESERVED_SLOTS = ['avatar', 'header', 'content', 'footer', 'error'] as const;

/**
 * BubbleList 自身消费的插槽 = Bubble 的全部（它逐个显式转发，部分补 item 作用域）
 * + `row-before`（渲染在 .aix-bubble 之外、占满整行，故不能进穿透集合）。
 */
export const BUBBLE_LIST_RESERVED_SLOTS = [...BUBBLE_RESERVED_SLOTS, 'row-before'] as const;
