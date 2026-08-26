# @kit/create-app

## 0.2.0

### Minor Changes

- b58172e: 模板参数声明区（params）：CLI 新增 -p/--param，取值优先级 --param > TTY 问答 > default；override 模板收敛为 TypeScript。破坏性变更：移除 -l/--lang 选项与 detectLanguage 公共导出，ProjectConfig.params 变为必填字段。

## 0.1.1

### Patch Changes

- 统一升级，优化打包产物
