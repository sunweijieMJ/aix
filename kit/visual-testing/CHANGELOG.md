# @kit/visual-testing

## 0.1.0

### Minor Changes

- faa24d8: 新增 `visual-test fidelity` 设计还原度校验：Figma 节点树归一化为 DesignSpec，Playwright 渲染后提取 DOM 的 RenderSpec，按 `data-figma` → 文本 → 几何 IoU 三级匹配后做确定性的属性级 diff，输出面向 agent 的 `fidelity.md` / `fidelity.json`。
  
  - 新增 `figma-api` 基准图 provider（Figma REST，按文件版本缓存，位图导出倍率跟随 `deviceScaleFactor`），`figma-mcp` 标记废弃
  - 新增 `@kit/visual-testing/vite` 的 `stripFigmaAttrs()`，生产构建剥离 `data-figma`
  - 新增 `screenshot.context`（storageState / cookies / locale / timezone / reducedMotion）与 `screenshot.deviceScaleFactor`
  - 新增 `ci.gate`，默认 `'pixel'` 按像素比对确定性判定；旧的 severity 判定需显式设为 `'severity'`
  - 默认值变更：`llm.enabled` 改为 `false`；移除结论报告中的 `estimatedHours` 工时估算
  - 修复 Figma 基线以 2x 导出而截图为 1x 导致比对必然失败的问题
  - `visual-test init` 改为引导 `figma-api`，生成的配置补齐 `deviceScaleFactor` / `ci.gate` / `fidelity`；`--version` 改为读取 package.json

## 0.0.3

### Patch Changes

- 统一升级，优化打包产物

## 0.0.2

### Patch Changes

- 发包测试

## 0.0.1

### Patch Changes

- 首次发包
