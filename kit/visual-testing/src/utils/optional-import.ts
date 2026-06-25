/**
 * 可选依赖动态导入工具
 *
 * playwright / @anthropic-ai/sdk / openai / @modelcontextprotocol/sdk 在
 * package.json 中声明为 optional peerDependencies——用户可能只安装其中一部分。
 * 必须用动态 import 延迟到实际使用时才解析，缺包时给出友好提示并降级，
 * 避免在模块加载阶段（早于任何 try/catch）抛出 ERR_MODULE_NOT_FOUND 导致整体崩溃。
 *
 * 通过带参数的函数包裹 import()，防止打包器（tsdown/rolldown）静态分析模块路径。
 */
export async function importOptional<T = Record<string, unknown>>(specifier: string): Promise<T> {
  return import(specifier) as Promise<T>;
}

/**
 * 导入可选依赖，缺失时抛出带安装指引的友好错误。
 *
 * @param specifier 模块标识符
 * @param packageName 用于错误提示的包名（默认与 specifier 相同）
 */
export async function requireOptional<T = Record<string, unknown>>(
  specifier: string,
  packageName: string = specifier,
): Promise<T> {
  try {
    return await importOptional<T>(specifier);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `Optional dependency "${packageName}" is not installed. ` +
          `Run \`pnpm add ${packageName}\` to enable this feature.`,
        { cause: error },
      );
    }
    throw error;
  }
}
