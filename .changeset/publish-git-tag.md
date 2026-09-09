---
"@kit/publish": minor
---

发布成功后给产物来源的 commit 打 annotated git tag，可选推送。

- 新增配置 `git.tag`（tag 名模板，默认 `v{version}`，`false` 关闭；模板必须含 `{version}`）、`git.push`（默认 `true`）、`git.remote`（默认 `origin`）
- 新增参数 `--no-git-tag`、`--push-tag` / `--no-push-tag`，优先级命令行 > 配置 > 默认
- tag 钉在 `.build-meta.json` 记录的 commit 上而不是当前 HEAD；脏工作区、git 状态未知、同名 tag 指向别的 commit 时跳过并说明，绝不 `-f`
- 推送确认放在「确认发布?」之前，摘要里新增 `git tag:` 一行；打 tag / 推送失败只告警，不影响已成功的发布
- 交互依赖由 inquirer 迁移到 @inquirer/prompts
