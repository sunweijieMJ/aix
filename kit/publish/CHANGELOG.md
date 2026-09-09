# @kit/publish

## 0.2.0

### Minor Changes

- 99b7e5f: 发布成功后给产物来源的 commit 打 annotated git tag，可选推送。
  
  - 新增配置 `git.tag`（tag 名模板，默认 `v{version}`，`false` 关闭；模板必须含 `{version}`）、`git.push`（默认 `true`）、`git.remote`（默认 `origin`）
  - 新增参数 `--no-git-tag`、`--push-tag` / `--no-push-tag`，优先级命令行 > 配置 > 默认
  - tag 钉在 `.build-meta.json` 记录的 commit 上而不是当前 HEAD；脏工作区、git 状态未知、同名 tag 指向别的 commit 时跳过并说明，绝不 `-f`
  - 推送确认放在「确认发布?」之前，摘要里新增 `git tag:` 一行；打 tag / 推送失败只告警，不影响已成功的发布
  - 交互依赖由 inquirer 迁移到 @inquirer/prompts

## 0.1.0

### Minor Changes

- 首个可用版本：把构建产物目录当作 npm 包发布到私有 registry 的交互式 CLI。按 registry 现状推导版本候选、四道搭配校验、大包上传重试与归属判定、复用 dist 的准入门禁、dry-run 不留副作用；业务仓库只需一份 publish.config.ts。
