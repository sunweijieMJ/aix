---
"@kit/publish": patch
---

上传失败的定性区分「查询失败」，并补上体积与快速失败两处诊断。

- 归属判定新增 `unreachable` 态：查询 registry 自己失败时不再当成「版本不存在」——上传失败最常见的一类是网络不稳，而查询走同一条链路，跟着失败的概率并不低。失败当下与退避之后两次都没连上时不再重传，改抛错并给出 `npm view <pkg>@<ver> gitHead` 让人手动核对；只要有一次查清「确实不存在」，重传照旧
- 上传之前打印 tarball 体积（`npm pack --dry-run --json`，与 publish 同一套打包逻辑），上行体积越过 Verdaccio `max_body_size` 默认值（10mb）时告警：服务端 413 后断流，客户端只看到 `read ECONNRESET`，与网络抖动无从分辨
- 单次尝试不到 60s 就断且属网络类报错时，额外给出三个排查方向（服务端 body 上限 / 代理与安全软件 / 版本号已被上一轮占用）。真正的链路超时会撞在 30 分钟的 `fetch-timeout` 上，不会在一分钟内收口。只提示，不改重试决策
- `utils/exec` 的 `maxBuffer` 从默认 1MB 放宽到 64MB：`npm pack --json` 会把整份文件清单打进 stdout，越界时 `execFileSync` 抛 ENOBUFS，对调用方就是「命令失败」，而它其实成功了
