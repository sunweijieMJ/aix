# @kit/create-app

## 0.2.2

### Patch Changes

- 第六轮审计修复
  
  - 项目名拒绝 `'`，避免原文注入产物 TS 字面量导致语法错误
  - 后处理去掉 shell 模式，Windows 上按 `.cmd` 解析包管理器命令，git commit 不再被拆参
  - `--refresh` 在新克隆完整落地后才删旧缓存，克隆失败时 `--offline` 仍可用
  - 模板源识别 Windows 盘符路径与 `.\` 相对路径
  - 非 TTY 下 `-f` 的检查下沉到特性选择阶段，零特性模板不再强制传 `-f ''`
  - `update-templates` 有任一模板刷新失败时非零退出
  - 缓存根支持 `XDG_CACHE_HOME`
  - 克隆时记录 commit，复用缓存时探测远端是否已前进并提示加 `--refresh`

## 0.2.1

### Patch Changes

- 完善pc和h5模版

## 0.2.0

### Minor Changes

- b58172e: 模板参数声明区（params）：CLI 新增 -p/--param，取值优先级 --param > TTY 问答 > default；override 模板收敛为 TypeScript。破坏性变更：移除 -l/--lang 选项与 detectLanguage 公共导出，ProjectConfig.params 变为必填字段。

## 0.1.1

### Patch Changes

- 统一升级，优化打包产物
