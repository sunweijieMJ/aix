---
'@kit/visual-testing': patch
---

修复在真实 Vue 项目上实测暴露的 fidelity 提取问题：

- `display: contents` 的包装层（Vue ErrorBoundary、Fragment 等常见写法）矩形恒为 0×0，
  原先按「零尺寸即不可见」丢弃，会连整棵子树一起丢掉且不报错，表现为只提取到一个根节点。
  现在这类元素不生成节点、子元素提升到父级，与其在 Figma 中没有对应节点一致。
- 根元素自动探测不再用 `body > *`：该选择器的第一个匹配常是 `vite-plugin-svg-icons`
  注入的零尺寸隐藏 SVG sprite，导致提取直接失败。改为在页面内挑选确实渲染出盒子的元素
  （依次尝试 `#app` / `#root` / `#main-app` / `main`，再退到第一个可见的 body 子元素）。
  根元素自身不成盒子时给出包含 display / visibility / 尺寸的明确错误。
- Figma token 额外接受 `FIGMA_API_KEY`：这是 Figma MCP server 的变量名，项目配过 MCP
  就已经有它，不必再单独设一份 `FIGMA_TOKEN`。
