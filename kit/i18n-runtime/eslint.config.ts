import { config as baseConfig } from '@kit/eslint-config/base';
import { config as reactAppConfig } from '@kit/eslint-config/react-app';
import type { Linter } from 'eslint';

/** react-app 预设自带的规则只应用到 src/plugin-react 这一小块 JSX 代码上，
 *  包内其余代码（vanilla DOM / Vue 插件）继续用 base 预设 */
const REACT_FILES = ['src/plugin-react/**/*.{ts,tsx}', '__test__/plugin-react/**/*.{ts,tsx}'];
const scopedReactConfig = reactAppConfig
  .filter((block) => {
    // 过滤掉忽略规则的 block（通常包含 ignores 字段）
    return !block.ignores;
  })
  .map((block) => {
    // 对所有非忽略的 block 添加 files 字段
    const result = { ...block, files: REACT_FILES };
    // 移除可能导致 flat config 兼容性问题的字段
    if (result.settings?.react?.version === 'detect') {
      // eslint-plugin-react 的 'detect' 版本检测在 flat config 中有兼容性问题
      // 改为明确指定版本
      if (result.settings) {
        result.settings = { ...result.settings, react: { version: '19.0.0' } };
      }
    }
    return result;
  });

export default [...baseConfig, ...scopedReactConfig] as Linter.Config[];
