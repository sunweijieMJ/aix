import { createVueConfig } from '@kit/vitest-config';
import Vue from 'unplugin-vue/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createVueConfig({
    // 本包用 unplugin-vue 编译 SFC（替换基座默认的 @vitejs/plugin-vue）
    plugins: [Vue()],
    test: {
      // 自带 setup（替换基座共享 setup）
      setupFiles: ['./__test__/setup.ts'],
      // 放宽单用例超时（vitest 默认 5000ms，仅本包覆盖，不动共享基座）。
      // 本包有一批用例同时踩两件慢事：① 动态 import 可选依赖（markdown-it / katex /
      // highlight.js / echarts / mermaid，走 loadMarkdownEngine 的渐进装配）；② 配合
      // fake timers 推进动画 / 计时断言。冷缓存首跑时 vite 的 transform 成本会成倍放大
      // （实测冷跑 transform ~711s vs 热跑 ~92s），ChartBlock / chartRenderers /
      // MarkdownRenderer.swapTransition / ReasoningBlock 四处会在 5000ms 处超时 —— 本地
      // 二次运行必绿，但 CI 每次都是冷缓存，于是表现为"随机红"。
      // 20s 只影响真正卡住的用例（正常用例全程毫秒级），不掩盖断言失败。
      testTimeout: 20_000,
    },
  }),
);
