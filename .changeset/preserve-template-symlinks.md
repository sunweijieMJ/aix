---
'@kit/create-app': patch
---

保留模板里的符号链接，不再落成静态副本

模板用 `AGENTS.md -> CLAUDE.md` 这类符号链接表达「一份内容两个名字」（供读 AGENTS.md
约定的 Cursor / Codex 等工具用）。此前 composer 一律解引用后按内容写盘，产物里就成了
两份独立文件，此后各自演进必然漂移。

- `walkDir` 记录链接目标，`FileEntry` 新增 `symlinkTarget`，`writeFiles` 优先建链接
- 只有「相对链接 + 目标在模板内 + 目标也进了产物」三个条件都满足才保留；
  绝对路径链接、指向模板外的链接、目标被未选特性裁掉的链接，一律回落成解引用副本
  （内容照常走 substitutions → 条件块 → 变量替换）
- 建链接失败（如 Windows 无权限创建文件符号链接）时静默回落成副本，不打断生成
- `verify-combos` 的 `walk()` 原本用 `Dirent.isFile()`（lstat 语义）会跳过符号链接，
  导致产物里的链接既不计数也不进 L2 静态体检；改为按解引用后的类型收集，
  并新增悬空链接检查
