/**
 * LLM 差异分析 Prompt
 */

export const ANALYZE_DIFF_PROMPT = `
你是一位专业的 UI/UX 视觉审查专家。请分析以下两张图片的视觉差异。

## 输入信息

1. **基准图** (设计稿): 这是 Figma 设计稿的截图，代表预期的视觉效果
2. **实际图** (实现): 这是实际渲染的页面/组件截图
3. **差异图**: 红色/绿色标记的差异区域
   - 红色: 实际图特有的像素
   - 绿色: 基准图特有的像素

## 组件/页面信息

- 名称: {{name}}
- 类型: {{type}}
- 框架: {{framework}}

## 比对数据

- 差异像素: {{mismatchPixels}}
- 差异比例: {{mismatchPercentage}}%
- 尺寸差异: {{sizeDiff}}

## 分析任务

请按以下 JSON 格式输出分析结果（直接输出 JSON，不要用 markdown 代码块包裹）：

{
  "differences": [
    {
      "id": "diff-1",
      "type": "color|spacing|font|size|border|shadow|position|missing|extra|layout|other",
      "location": "差异的具体位置描述，如：按钮背景",
      "description": "详细描述差异内容",
      "severity": "critical|major|minor|trivial",
      "expected": "设计稿中的值，如：#1890FF",
      "actual": "实际的值，如：#1677FF"
    }
  ],
  "assessment": {
    "matchScore": 0-100,
    "grade": "A|B|C|D|F",
    "acceptable": true|false,
    "summary": "整体评估总结"
  }
}

### 评估标准

- **A (90-100)**: 几乎完美匹配，仅有微小差异
- **B (80-89)**: 整体良好，有少量可接受的差异
- **C (70-79)**: 存在明显差异，需要修复
- **D (60-69)**: 差异较大，与设计稿有明显偏差
- **F (0-59)**: 严重不匹配，需要重新实现

### 严重程度标准

- **critical**: 影响核心功能或品牌识别，必须立即修复
- **major**: 明显的视觉问题，应该尽快修复
- **minor**: 细节问题，可在下一迭代修复
- **trivial**: 极小差异，可忽略

请确保输出有效的 JSON 格式。
`;

export const SUGGEST_FIX_PROMPT = `
你是一位专业的前端开发工程师。基于以下视觉差异分析结果，请提供具体的修复建议。

## 差异信息

{{differences}}

## 技术栈

- 框架: Vue 3 + TypeScript
- 样式: SCSS + CSS Variables
- 组件库: @aix/*

## 输出格式

对于每个差异，请按以下 JSON 格式提供具体的修复代码（直接输出 JSON，不要用 markdown 代码块包裹）：

{
  "fixes": [
    {
      "differenceId": "diff-1",
      "type": "css|html|component|config",
      "code": "具体的修复代码",
      "file": "可能的文件路径，如：src/components/Button.vue",
      "confidence": 0.0-1.0,
      "explanation": "修复说明"
    }
  ]
}

请确保修复建议：
1. 使用 CSS Variables 而非硬编码值
2. 遵循 BEM 命名规范
3. 考虑响应式设计

请确保输出有效的 JSON 格式。
`;
