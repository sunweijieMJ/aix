import { collectPackageApis } from './pipeline';

/**
 * 把所有组件包的 API 以 JSON 打到 stdout，供 MCP Server 的 extract 在仓库内调用。
 * 输出形状：`{ packages: { [npm 包名]: ApiPackage }, failures: [{ dirName, message }] }`。
 * 单个包解析失败不影响其余包，失败清单随 JSON 一起给出，退出码保持 0。
 * 用 process.stdout.write 而不是 process.exit：大 payload 需要等 stdout 刷完再退出。
 */
async function main() {
  const { packages, failures } = await collectPackageApis();

  for (const failure of failures) {
    console.error(`[print-api] ${failure.dirName}: ${failure.message}`);
  }

  const output = {
    packages: Object.fromEntries(packages.map(({ api }) => [api.package, api])),
    failures,
  };
  process.stdout.write(JSON.stringify(output));
}

main().catch((error: unknown) => {
  console.error('[print-api] 执行异常：', error);
  process.exitCode = 1;
});
