import { createNodeConfig } from '@kit/vitest-config';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createNodeConfig({
    test: {
      // 放宽单用例超时（vitest 默认 5000ms，仅本包覆盖，不动共享基座）。
      // __test__/cli.test.ts 每条用例都 execFile 拉起 `tsx src/cli.ts` 真进程，tsx 要冷编译
      // 整条 CLI 依赖链；单包跑 ~400ms，turbo 并行与 CI 冷缓存下会冲破 5000ms，表现为随机
      // 挂在不同用例上。30s 只影响这批进程用例（其余全程毫秒级），且低于 runCli 自带的
      // 60s execFile 超时，保证真卡住时报的是 vitest 这条更明确的信息。
      testTimeout: 30_000,
    },
  }),
);
