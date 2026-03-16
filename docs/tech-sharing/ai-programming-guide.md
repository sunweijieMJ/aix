---
title: AI 编程接入指南（2026 版）
description: 全面介绍 AI 编程工具生态、大模型选型、项目配置和最佳实践
outline: deep
---

# AI 编程接入指南（2026 版）

> 一份面向开发者的 AI 编程工具完整指南，涵盖大模型选型、工具生态、项目配置和团队协作最佳实践。

::: tip 文档信息
- **更新日期**: 2026-03-16
- **适用对象**: 所有希望使用 AI 辅助编程的开发者
- **前置知识**: 基本的编程经验和命令行操作
- **持续更新**: 本文档会随着 AI 工具生态的发展持续更新
:::

## 引言

AI 编程工具在 2026 年已经成为开发者的标配。从代码生成、代码审查到架构设计，AI 正在深刻改变软件开发的方式。本指南将帮助你：

- 选择适合你的 AI 大模型和编程工具
- 配置项目级 AI 记忆和工具链
- 掌握提示词工程和团队协作规范
- 了解 MCP 生态和本地模型部署
- 学习实战案例和问题解决方案

---

## 第一部分：AI 大模型选型

### 1. 主流 AI 大模型对比（2026 版）

#### 1.1 Claude 系列（Anthropic）

Claude 是目前代码能力最强的大模型之一，特别适合复杂的编程任务。

| 模型 | 上下文长度 | 代码能力 | 推理能力 | 适用场景 |
|------|-----------|---------|---------|---------|
| **Claude Opus 4.6** | 200K tokens | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 复杂架构设计、大型重构 |
| **Claude Sonnet 4.6** | 200K tokens | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 日常开发、代码审查 |
| **Claude Haiku 4.5** | 200K tokens | ⭐⭐⭐ | ⭐⭐⭐ | 快速代码生成、简单任务 |

**特点：**
- 超长上下文（200K tokens），可以处理整个代码库
- 强大的代码理解和生成能力
- 支持多轮对话和复杂推理
- 官方提供 Claude Code CLI 工具

**定价（2026 年）：**
- Opus 4.6: $15/1M input tokens, $75/1M output tokens
- Sonnet 4.6: $3/1M input tokens, $15/1M output tokens
- Haiku 4.5: $0.25/1M input tokens, $1.25/1M output tokens

#### 1.2 GPT 系列（OpenAI）

GPT 系列是最早的商业化大模型，生态最成熟。

| 模型 | 上下文长度 | 代码能力 | 推理能力 | 适用场景 |
|------|-----------|---------|---------|---------|
| **GPT-4.5** | 128K tokens | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 全栈开发、API 设计 |
| **GPT-4o** | 128K tokens | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 多模态任务、快速响应 |
| **o1/o3** | 128K tokens | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 复杂算法、数学推理 |

**特点：**
- 生态最成熟，工具支持最广泛
- o1/o3 系列专注于推理能力
- 支持函数调用和工具使用
- GitHub Copilot 基于 GPT 系列

**定价（2026 年）：**
- GPT-4.5: $10/1M input tokens, $30/1M output tokens
- GPT-4o: $5/1M input tokens, $15/1M output tokens
- o1: $15/1M input tokens, $60/1M output tokens

#### 1.3 Gemini 系列（Google）

Google 的 Gemini 系列在多模态和长上下文方面表现出色。

| 模型 | 上下文长度 | 代码能力 | 推理能力 | 适用场景 |
|------|-----------|---------|---------|---------|
| **Gemini 2.0 Pro** | 1M tokens | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 超大项目、文档分析 |
| **Gemini 2.0 Flash** | 1M tokens | ⭐⭐⭐ | ⭐⭐⭐ | 快速原型、批量处理 |

**特点：**
- 超长上下文（1M tokens），可以处理整个大型项目
- 多模态能力强，支持图片、视频、音频
- 与 Google Cloud 深度集成
- 免费额度较高

**定价（2026 年）：**
- Gemini 2.0 Pro: $1.25/1M input tokens, $5/1M output tokens
- Gemini 2.0 Flash: $0.075/1M input tokens, $0.30/1M output tokens

#### 1.4 DeepSeek 系列（中国）

DeepSeek 是中国开源大模型的代表，性价比极高。

| 模型 | 上下文长度 | 代码能力 | 推理能力 | 适用场景 |
|------|-----------|---------|---------|---------|
| **DeepSeek V3** | 64K tokens | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 通用编程、成本敏感 |
| **DeepSeek Coder** | 64K tokens | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 代码生成、补全 |

**特点：**
- 开源模型，可本地部署
- 代码能力接近 GPT-4 水平
- 价格极低，适合高频使用
- 支持中文编程场景

**定价（2026 年）：**
- DeepSeek V3: $0.14/1M input tokens, $0.28/1M output tokens
- DeepSeek Coder: $0.14/1M input tokens, $0.28/1M output tokens

#### 1.5 国产大模型

| 模型 | 厂商 | 上下文长度 | 代码能力 | 特点 |
|------|------|-----------|---------|------|
| **通义千问 Max** | 阿里云 | 128K tokens | ⭐⭐⭐⭐ | 企业级支持 |
| **文心一言 4.0** | 百度 | 128K tokens | ⭐⭐⭐ | 中文优化 |
| **Kimi** | 月之暗面 | 200K tokens | ⭐⭐⭐⭐ | 长文本处理 |
| **豆包** | 字节跳动 | 128K tokens | ⭐⭐⭐ | 多模态 |

**特点：**
- 符合国内合规要求
- 中文理解能力强
- 价格相对较低
- 部分提供免费额度

#### 1.6 综合对比表

| 维度 | Claude Opus 4.6 | GPT-4.5 | Gemini 2.0 Pro | DeepSeek V3 |
|------|----------------|---------|----------------|-------------|
| **上下文长度** | 200K | 128K | 1M | 64K |
| **代码生成** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **代码理解** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **推理能力** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **响应速度** | 中 | 快 | 快 | 快 |
| **成本** | 高 | 中 | 低 | 极低 |
| **生态支持** | 好 | 最好 | 好 | 一般 |
| **本地部署** | ❌ | ❌ | ❌ | ✅ |

### 2. 编程场景选型矩阵

#### 2.1 按项目规模选型

**小型项目（< 10K 行代码）**

推荐模型：
- **首选**: Claude Sonnet 4.6 / GPT-4o
- **备选**: Gemini 2.0 Flash / DeepSeek V3
- **理由**: 快速响应,成本可控,足够的代码理解能力

**中型项目（10K - 100K 行代码）**

推荐模型：
- **首选**: Claude Opus 4.6 / GPT-4.5
- **备选**: Gemini 2.0 Pro / Claude Sonnet 4.6
- **理由**: 需要更强的上下文理解和架构设计能力

**大型项目（> 100K 行代码）**

推荐模型：
- **首选**: Gemini 2.0 Pro（1M 上下文）
- **备选**: Claude Opus 4.6 / GPT-4.5
- **理由**: 超长上下文可以一次性处理更多代码

#### 2.2 按编程语言选型

| 语言 | 最佳模型 | 次优模型 | 说明 |
|------|---------|---------|------|
| **Python** | Claude Opus 4.6 | GPT-4.5 | 所有模型都支持良好 |
| **JavaScript/TypeScript** | Claude Opus 4.6 | GPT-4.5 | 前端框架理解能力强 |
| **Rust** | Claude Opus 4.6 | o1 | 需要强推理能力 |
| **Go** | GPT-4.5 | Claude Opus 4.6 | 标准库理解好 |
| **Java** | GPT-4.5 | Claude Opus 4.6 | 企业级框架支持 |
| **C/C++** | o1 | Claude Opus 4.6 | 内存管理和性能优化 |
| **Swift** | GPT-4.5 | Claude Opus 4.6 | Apple 生态支持 |
| **Kotlin** | GPT-4.5 | Claude Opus 4.6 | Android 开发 |

#### 2.3 按任务类型选型

**代码生成**
```
场景: 从零开始编写新功能
推荐: Claude Opus 4.6 > GPT-4.5 > DeepSeek Coder
关键: 需要理解需求并生成完整实现
```

**代码审查**
```
场景: 检查代码质量、发现潜在问题
推荐: Claude Opus 4.6 > o1 > GPT-4.5
关键: 需要深度理解代码逻辑和最佳实践
```

**架构设计**
```
场景: 系统设计、技术选型、模块划分
推荐: Claude Opus 4.6 > o1 > GPT-4.5
关键: 需要强推理能力和全局视角
```

**Bug 修复**
```
场景: 定位问题、分析根因、提供修复方案
推荐: Claude Opus 4.6 > GPT-4.5 > o1
关键: 需要理解上下文和调试能力
```

**文档编写**
```
场景: API 文档、技术文档、注释生成
推荐: GPT-4.5 > Claude Sonnet 4.6 > Gemini 2.0 Pro
关键: 需要清晰表达和格式化能力
```

**测试生成**
```
场景: 单元测试、集成测试、E2E 测试
推荐: Claude Opus 4.6 > GPT-4.5 > DeepSeek Coder
关键: 需要理解边界条件和测试策略
```

#### 2.4 决策树

```
开始
  │
  ├─ 预算充足？
  │   ├─ 是 → 任务复杂度高？
  │   │        ├─ 是 → Claude Opus 4.6 / o1
  │   │        └─ 否 → Claude Sonnet 4.6 / GPT-4o
  │   └─ 否 → 需要超长上下文？
  │            ├─ 是 → Gemini 2.0 Pro
  │            └─ 否 → DeepSeek V3 / Gemini 2.0 Flash
  │
  ├─ 需要本地部署？
  │   └─ 是 → DeepSeek Coder / Qwen2.5-Coder
  │
  ├─ 中文场景为主？
  │   └─ 是 → Kimi / 通义千问 / DeepSeek V3
  │
  └─ 需要多模态？
      └─ 是 → GPT-4o / Gemini 2.0 Pro
```

#### 2.5 成本优化策略

**策略 1: 分层使用**
```
简单任务 → Haiku / Flash / DeepSeek V3
中等任务 → Sonnet / GPT-4o
复杂任务 → Opus / GPT-4.5 / o1
```

**策略 2: 缓存优化**
- 使用 Claude 的 Prompt Caching 功能
- 缓存项目上下文和常用代码
- 可节省 50-90% 的输入 token 成本

**策略 3: 本地模型混合**
- 简单任务使用本地 DeepSeek Coder
- 复杂任务调用云端 API
- 可节省 70-80% 的成本

---

## 第二部分：AI 编程工具生态

### 3. IDE 集成类工具

#### 3.1 GitHub Copilot（微软官方）

**简介**: 最早的 AI 编程助手,由 OpenAI 和 GitHub 联合开发。

**特点**:
- ✅ 代码补全速度快,准确率高
- ✅ 支持 VS Code、JetBrains、Neovim
- ✅ 企业版支持私有模型
- ❌ 只能使用 GPT 系列模型
- ❌ 自主操作能力有限

**定价**:
- 个人版: $10/月
- 企业版: $39/月/用户

**适用场景**: 日常代码补全、快速原型开发

#### 3.2 Cursor（AI-first IDE）

**简介**: 基于 VS Code 的 AI-first IDE,支持多模型切换。

**特点**:
- ✅ 支持 Claude、GPT、Gemini 等多种模型
- ✅ Composer 模式支持多文件编辑
- ✅ 强大的上下文管理（@符号引用）
- ✅ 支持自定义规则（.cursorrules）
- ❌ 需要付费才能使用高级功能

**定价**:
- 免费版: 50 次 GPT-4 请求/月
- Pro 版: $20/月（无限 GPT-4、500 次 Claude Opus）
- Business 版: $40/月/用户

**适用场景**: 全栈开发、多文件重构、复杂项目

#### 3.3 Windsurf（Codeium，完全免费）

**简介**: Codeium 推出的 AI IDE,完全免费使用。

**特点**:
- ✅ 完全免费,无使用限制
- ✅ 支持多种模型（GPT-4、Claude、Gemini）
- ✅ Flow 模式支持自主操作
- ✅ 支持团队协作
- ✅ 隐私保护（不训练用户代码）

**定价**:
- 个人版: 完全免费
- 企业版: 联系销售

**适用场景**: 预算有限的个人开发者、学生

#### 3.4 VS Code 插件生态

**Continue（开源、免费）**
- 支持 100+ 模型（包括本地模型）
- 完全开源,可自定义
- 支持自建 LLM 服务
- 适合需要灵活配置的开发者

**Cline（前 Claude Dev）**
- 专注于 Claude 模型
- 支持自主操作（文件读写、命令执行）
- 开源免费
- 适合 Claude 用户

**Tabnine**
- 企业级 AI 代码补全
- 支持私有部署
- 符合 SOC2、GDPR 合规
- 适合企业用户

#### 3.5 工具对比表

| 工具 | 免费额度 | 多模型支持 | 自主操作 | 适用场景 |
|------|---------|-----------|---------|---------|
| **GitHub Copilot** | ❌ | ❌ | ⭐ | 代码补全 |
| **Cursor** | 50 次/月 | ✅ | ⭐⭐⭐ | 全栈开发 |
| **Windsurf** | ✅ 无限 | ✅ | ⭐⭐⭐⭐ | 个人开发 |
| **Continue** | ✅ 无限 | ✅ | ⭐⭐ | 自定义配置 |
| **Cline** | ✅ 无限 | ❌ | ⭐⭐⭐⭐ | Claude 用户 |
| **Tabnine** | 有限 | ✅ | ⭐ | 企业用户 |

### 4. CLI 命令行工具

#### 4.1 Claude Code（Anthropic 官方 CLI）

**简介**: Anthropic 官方推出的命令行 AI 编程工具。

**特点**:
- ✅ 官方支持,稳定可靠
- ✅ 支持 Agents、Skills、Commands、Hooks
- ✅ 项目记忆（CLAUDE.md）
- ✅ MCP 协议支持
- ✅ 自动化工作流

**安装**:
```bash
npm install -g @anthropic-ai/claude-code
```

**基本使用**:
```bash
# 启动交互式会话
claude-code chat

# 执行单次任务
claude-code run "重构 auth 模块"

# 使用 Skill
claude-code run "/commit"
```

**适用场景**: 自动化脚本、CI/CD 集成、批量处理

#### 4.2 Aider（Git 集成）

**简介**: 专注于 Git 工作流的 AI 编程工具。

**特点**:
- ✅ 深度集成 Git（自动提交、分支管理）
- ✅ 支持多种模型
- ✅ 代码变更可视化
- ✅ 支持语音输入

**安装**:
```bash
pip install aider-chat
```

**基本使用**:
```bash
# 启动 Aider
aider

# 指定模型
aider --model claude-opus-4-6

# 添加文件到上下文
aider src/main.py tests/test_main.py
```

**适用场景**: Git 工作流、代码审查、重构

#### 4.3 其他 CLI 工具

**Shell GPT**
```bash
# 安装
pip install shell-gpt

# 使用
sgpt "如何压缩目录?"
sgpt --code "Python 读取 CSV"
```

**AI Shell**
```bash
# 安装
npm install -g @builder.io/ai-shell

# 使用
ai "列出所有大于 100MB 的文件"
```

**GitHub Copilot CLI**
```bash
# 安装
gh extension install github/gh-copilot

# 使用
gh copilot suggest "git 撤销最后一次提交"
gh copilot explain "docker-compose up -d"
```

#### 4.4 CLI 工具对比

| 工具 | Git 集成 | 多模型 | 自动化 | 适用场景 |
|------|---------|--------|--------|---------|
| **Claude Code** | ⭐⭐⭐ | ❌ | ⭐⭐⭐⭐⭐ | 工作流自动化 |
| **Aider** | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐ | Git 工作流 |
| **Shell GPT** | ❌ | ✅ | ⭐⭐ | 命令行辅助 |
| **Copilot CLI** | ⭐⭐ | ❌ | ⭐⭐ | GitHub 用户 |

### 5. 在线 AI 编程平台

#### 5.1 Replit Agent（在线 IDE + 部署）

**简介**: 在线 IDE,支持 AI 辅助开发和一键部署。

**特点**:
- ✅ 无需本地环境,浏览器即可开发
- ✅ AI Agent 自动生成项目
- ✅ 一键部署到生产环境
- ✅ 支持多人协作
- ❌ 免费版资源有限

**定价**:
- 免费版: 基础资源
- Hacker 版: $7/月
- Pro 版: $20/月

**适用场景**: 快速原型、教学演示、小型项目

#### 5.2 Bolt.new（StackBlitz）

**简介**: StackBlitz 推出的 AI 全栈应用生成器。

**特点**:
- ✅ 完全在浏览器内运行（WebContainers）
- ✅ 从提示词生成完整应用
- ✅ 实时预览和调试
- ✅ 支持导出代码
- ❌ 仅支持 Node.js 生态

**使用**:
```
访问 bolt.new
输入: "创建一个 Todo 应用,使用 React + TypeScript"
等待生成并预览
```

**适用场景**: 前端原型、全栈 Demo、学习项目

#### 5.3 v0.dev（Vercel）

**简介**: Vercel 推出的 UI 组件生成器。

**特点**:
- ✅ 从设计稿或描述生成 React 组件
- ✅ 使用 shadcn/ui 组件库
- ✅ 生成高质量 TypeScript 代码
- ✅ 支持迭代优化
- ❌ 仅支持 React

**使用**:
```
访问 v0.dev
上传设计稿或输入描述
选择生成的组件变体
复制代码到项目
```

**适用场景**: UI 组件开发、设计稿转代码

#### 5.4 Lovable（全栈应用生成）

**简介**: AI 驱动的全栈应用生成平台。

**特点**:
- ✅ 从需求生成完整应用
- ✅ 支持前后端和数据库
- ✅ 自动生成测试
- ✅ 一键部署
- ❌ 定制化能力有限

**适用场景**: MVP 开发、内部工具、快速验证

#### 5.5 在线平台对比

| 平台 | 运行环境 | 部署 | 技术栈 | 适用场景 |
|------|---------|------|--------|---------|
| **Replit** | 云端 | ✅ | 全栈 | 教学、原型 |
| **Bolt.new** | 浏览器 | ❌ | Node.js | 前端 Demo |
| **v0.dev** | 云端 | ❌ | React | UI 组件 |
| **Lovable** | 云端 | ✅ | 全栈 | MVP 开发 |

### 6. 辅助工具

#### 6.1 代码审查工具

**CodeRabbit**
- AI 驱动的 PR 审查
- 自动发现 Bug 和性能问题
- 支持 GitHub、GitLab
- 定价: $12/月起

**Bito**
- CLI 和 IDE 插件
- 代码解释、测试生成
- 支持私有部署
- 定价: 免费版 + $15/月

**Sourcegraph Cody**
- 代码搜索 + AI 助手
- 支持大型代码库
- 企业级权限管理
- 定价: 免费版 + $9/月

#### 6.2 文档生成工具

**Mintlify**
- API 文档自动生成
- 支持 OpenAPI、GraphQL
- 美观的文档站点
- 定价: 免费版 + $120/月

**Swimm**
- 代码文档持续更新
- 与代码同步
- 团队知识管理
- 定价: 免费版 + $19/月

#### 6.3 测试工具

**Codium AI**
- 自动生成单元测试
- 测试覆盖率分析
- IDE 插件
- 定价: 免费版 + $19/月

**Testim**
- E2E 测试自动化
- AI 自愈测试
- 无代码测试
- 定价: $450/月起

#### 6.4 DevOps 工具

**Kubiya**
- AI DevOps 助手
- Kubernetes 管理
- 自动化运维
- 定价: 联系销售

**Warp**
- AI 增强终端
- 命令建议和解释
- 团队协作
- 定价: 免费版 + $10/月

### 7. 工具配置与使用指南

#### 7.1 快速上手路径（1-2 周学习计划）

**第 1-3 天: 选择工具**
```
1. 确定预算和需求
2. 选择 1 个 IDE 工具（Cursor/Windsurf/Continue）
3. 选择 1 个 CLI 工具（Claude Code/Aider）
4. 注册账号并配置 API Key
```

**第 4-7 天: 基础使用**
```
1. 学习基本命令和快捷键
2. 尝试代码生成、补全、解释
3. 练习提示词编写
4. 熟悉上下文管理（@符号、文件引用）
```

**第 8-10 天: 进阶功能**
```
1. 配置项目记忆文件（CLAUDE.md/.cursorrules）
2. 学习 Agents/Skills/Commands
3. 配置 MCP 工具
4. 尝试多文件编辑和重构
```

**第 11-14 天: 实战项目**
```
1. 用 AI 开发一个小项目
2. 尝试代码审查和测试生成
3. 优化工作流和配置
4. 总结最佳实践
```

#### 7.2 工具组合推荐

**个人开发者（预算有限）**
```
IDE: Windsurf（免费）
CLI: Claude Code（按需付费）
模型: DeepSeek V3 + Claude Sonnet 4.6
成本: ~$10/月
```

**专业开发者（追求效率）**
```
IDE: Cursor Pro（$20/月）
CLI: Aider + Claude Code
模型: Claude Opus 4.6 + GPT-4.5
辅助: CodeRabbit（$12/月）
成本: ~$50/月
```

**团队协作（企业级）**
```
IDE: Cursor Business（$40/月/人）
CLI: Claude Code + 自建 MCP
模型: Claude Opus 4.6 + 本地 DeepSeek
辅助: Sourcegraph Cody + Mintlify
成本: ~$100/月/人
```

#### 7.3 常见问题解决

**问题 1: API Key 配置**
```bash
# Claude API Key
export ANTHROPIC_API_KEY="sk-ant-xxx"

# OpenAI API Key
export OPENAI_API_KEY="sk-xxx"

# 配置文件位置
~/.config/claude-code/config.json
~/.cursor/config.json
```

**问题 2: 代理配置**
```bash
# HTTP 代理
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"

# Cursor 代理设置
Settings → Proxy → Manual Proxy Configuration
```

**问题 3: 上下文限制**
```
策略 1: 使用 @符号精确引用文件
策略 2: 使用 Prompt Caching 缓存常用上下文
策略 3: 拆分大任务为多个小任务
策略 4: 使用长上下文模型（Gemini 2.0 Pro）
```

**问题 4: 成本控制**
```
策略 1: 简单任务用便宜模型（Haiku/Flash）
策略 2: 启用 Prompt Caching
策略 3: 使用本地模型处理敏感代码
策略 4: 设置月度预算告警
```

---

## 第三部分：项目级 AI 配置

### 8. 项目记忆文件

#### 8.1 CLAUDE.md 完整指南

**什么是 CLAUDE.md？**

CLAUDE.md 是项目级的 AI 记忆文件，用于告诉 AI 助手项目的规范、约定和上下文。

**记忆层级**

```
全局记忆（~/.claude/CLAUDE.md）
  ↓ 优先级低
项目记忆（/project/CLAUDE.md）
  ↓ 优先级高
子目录记忆（/project/packages/CLAUDE.md）
  ↓ 优先级最高
```

**基本结构**

```markdown
# 项目名称

> 一句话描述项目

## 技术栈
- 框架: Vue 3
- 语言: TypeScript
- 构建: Vite

## 开发规范
- 使用 Composition API
- Props 必须有类型定义
- 样式使用 CSS Variables

## 禁止事项
- 不要修改 dist/ 目录
- 不要硬编码颜色值
- 不要跳过类型检查

## 常用命令
- 开发: pnpm dev
- 构建: pnpm build
- 测试: pnpm test
```

**编写最佳实践**

1. **保持简洁**: 只写必要信息,避免冗长描述
2. **使用表格**: 对比信息用表格展示
3. **分模块**: 用二级标题分隔不同主题
4. **举例说明**: 提供代码示例而非抽象描述
5. **持续更新**: 随项目演进更新规范

**模块化规则示例**

```markdown
## Git 提交规则
- 格式: `type: subject` 或 `type(scope): subject`
- 类型: feat/fix/docs/style/refactor/test/chore
- 示例: `feat: 添加用户登录功能`

## 代码规范
- 使用 ESLint + Prettier
- 最大行长: 100 字符
- 缩进: 2 空格

## 测试规范
- 新功能必须有单元测试
- 测试覆盖率 > 80%
- 使用 Vitest + Testing Library
```

#### 8.2 .cursorrules 配置

**Cursor 专用配置文件**

```markdown
# .cursorrules

You are an expert TypeScript developer.

## Code Style
- Use functional components with hooks
- Prefer const over let
- Use async/await over promises

## Naming Conventions
- Components: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE

## File Structure
- One component per file
- Co-locate tests with source files
- Use index.ts for exports
```

#### 8.3 .aiderignore 配置

**Aider 专用忽略文件**

```
# .aiderignore

# 构建产物
dist/
build/
*.min.js

# 依赖
node_modules/
vendor/

# 配置文件
*.config.js
.env*

# 测试快照
**/__snapshots__/
```

#### 8.4 通用项目记忆模板

**前端项目模板**

```markdown
# 项目名称

> 项目简介

## 技术栈
- 框架: React 18 / Vue 3
- 语言: TypeScript 5
- 构建: Vite 5
- 样式: Tailwind CSS / Sass
- 状态管理: Zustand / Pinia
- 路由: React Router / Vue Router

## 目录结构
\`\`\`
src/
├── components/    # 组件
├── pages/         # 页面
├── hooks/         # 自定义 Hooks
├── utils/         # 工具函数
├── types/         # 类型定义
└── styles/        # 样式文件
\`\`\`

## 开发规范
- 组件使用函数式 + Hooks
- Props 必须有 TypeScript 类型
- 样式使用 CSS Modules 或 Tailwind
- 状态管理遵循单向数据流

## 命令
- 开发: `npm run dev`
- 构建: `npm run build`
- 测试: `npm run test`
- 类型检查: `npm run type-check`
```

**后端项目模板**

```markdown
# API 服务

> RESTful API 服务

## 技术栈
- 语言: Node.js 20 / Python 3.12
- 框架: Express / FastAPI
- 数据库: PostgreSQL / MongoDB
- ORM: Prisma / SQLAlchemy
- 认证: JWT

## API 规范
- RESTful 风格
- 统一响应格式: `{ code, data, message }`
- 错误码: 4xx 客户端错误, 5xx 服务端错误
- 认证: Bearer Token

## 数据库规范
- 表名: 小写 + 下划线
- 主键: id (UUID)
- 时间戳: created_at, updated_at
- 软删除: deleted_at

## 命令
- 开发: `npm run dev`
- 迁移: `npm run migrate`
- 测试: `npm run test`
```

### 9. 高级特性配置

#### 9.1 Agents（子代理）

**什么是 Agents？**

Agents 是可以独立执行任务的子代理,用于并行处理或专业化任务。

**创建 Agent**

```markdown
<!-- .claude/agents/code-reviewer.md -->

# Code Reviewer Agent

你是一个专业的代码审查专家。

## 职责
- 检查代码质量
- 发现潜在 Bug
- 提出优化建议

## 审查清单
- [ ] 类型安全
- [ ] 错误处理
- [ ] 性能优化
- [ ] 安全漏洞
- [ ] 代码风格

## 输出格式
使用 Markdown 表格输出问题列表。
```

**调用 Agent**

```bash
# 在 Claude Code 中
@code-reviewer 审查 src/auth.ts
```

**典型 Agent 示例**

- `test-writer.md`: 专门编写测试用例
- `doc-generator.md`: 生成 API 文档
- `refactor-expert.md`: 代码重构专家
- `security-auditor.md`: 安全审计

#### 9.2 Skills（代码生成器）

**什么是 Skills？**

Skills 是可复用的代码生成模板,支持参数替换和动态上下文。

**创建 Skill**

```markdown
<!-- .claude/skills/component-generator.md -->

# Component Generator

生成 React 组件模板。

## 参数
- `name`: 组件名称
- `props`: Props 定义

## 模板

\`\`\`typescript
import React from 'react';

interface {{name}}Props {
  {{props}}
}

export const {{name}}: React.FC<{{name}}Props> = (props) => {
  return (
    <div className="{{name | kebab-case}}">
      {/* TODO: 实现组件 */}
    </div>
  );
};
\`\`\`

## 测试模板

\`\`\`typescript
import { render } from '@testing-library/react';
import { {{name}} } from './{{name}}';

describe('{{name}}', () => {
  it('should render', () => {
    const { container } = render(<{{name}} />);
    expect(container).toBeInTheDocument();
  });
});
\`\`\`
```

**使用 Skill**

```bash
/component-generator name=Button props="label: string; onClick: () => void"
```

#### 9.3 Commands（快速清单）

**什么是 Commands？**

Commands 是快速提示清单,用于提醒 AI 注意事项。

**创建 Command**

```markdown
<!-- .claude/commands/review.md -->

# Code Review 清单

在审查代码时,请检查:

## 功能性
- [ ] 功能是否符合需求
- [ ] 边界条件是否处理
- [ ] 错误处理是否完善

## 代码质量
- [ ] 命名是否清晰
- [ ] 逻辑是否简洁
- [ ] 是否有重复代码

## 性能
- [ ] 是否有性能瓶颈
- [ ] 是否有内存泄漏
- [ ] 是否可以优化

## 安全
- [ ] 是否有 SQL 注入风险
- [ ] 是否有 XSS 风险
- [ ] 敏感信息是否加密
```

**使用 Command**

```bash
/review
```

**Commands vs Skills 对比**

| 维度 | Commands | Skills |
|------|----------|--------|
| **用途** | 提示清单 | 代码生成 |
| **输入** | 无参数 | 支持参数 |
| **输出** | 文本提示 | 生成代码 |
| **复杂度** | 简单 | 中等 |

#### 9.4 Hooks（事件驱动）

**什么是 Hooks？**

Hooks 是事件驱动的自动化规则,在特定事件发生时自动执行。

**可用事件**

- `UserPromptSubmit`: 用户提交消息前
- `SessionStart`: 会话开始时
- `SessionEnd`: 会话结束时
- `PostToolUse`: 工具使用后
- `FileSave`: 文件保存时

**配置 Hook**

```json
// .claude/hooks/config.json
{
  "hooks": [
    {
      "event": "UserPromptSubmit",
      "action": "command",
      "command": "git status --short"
    },
    {
      "event": "PostToolUse",
      "tool": "Write",
      "action": "message",
      "message": "文件已创建: {{file_path}}"
    },
    {
      "event": "FileSave",
      "pattern": "*.test.ts",
      "action": "command",
      "command": "npm run test {{file_path}}"
    }
  ]
}
```

**典型应用场景**

```json
// 保存文件后自动运行测试
{
  "event": "FileSave",
  "pattern": "src/**/*.ts",
  "action": "command",
  "command": "npm run test:related {{file_path}}"
}

// 会话开始时显示项目状态
{
  "event": "SessionStart",
  "action": "message",
  "message": "项目: {{project_name}}\n分支: {{git_branch}}\n未提交: {{git_status}}"
}

// 提交前检查代码规范
{
  "event": "UserPromptSubmit",
  "pattern": ".*commit.*",
  "action": "command",
  "command": "npm run lint"
}
```

### 10. MCP (Model Context Protocol) 工具生态

#### 10.1 MCP 协议介绍

**什么是 MCP？**

Model Context Protocol（模型上下文协议）是 Anthropic 推出的开放协议，用于标准化 AI 模型与外部工具的通信。

**MCP 的价值**

- ✅ 统一的工具接口标准
- ✅ 可插拔的工具生态
- ✅ 跨工具复用（Claude Code、Cursor、Continue 等）
- ✅ 社区驱动的工具开发

**MCP 架构**

```
AI 模型（Claude/GPT）
    ↓
MCP 客户端（Claude Code/Cursor）
    ↓
MCP 服务器（工具提供者）
    ↓
外部服务（GitHub/Figma/数据库等）
```

#### 10.2 常用 MCP 服务器分类

**开发工具类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **eslint** | ESLint 代码检查 | `uvx eslint-mcp-server` |
| **prettier** | 代码格式化 | `uvx prettier-mcp-server` |
| **typescript** | TypeScript 类型检查 | `uvx typescript-mcp-server` |

**设计工具类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **figma** | Figma 设计稿提取 | `uvx figma-mcp-server` |
| **penpot** | Penpot 开源设计工具 | `uvx penpot-mcp-server` |

**文档查询类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **context7** | 查询最新技术文档 | `uvx context7-mcp-server` |
| **mdn** | MDN Web 文档 | `uvx mdn-mcp-server` |

**数据库类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **postgres** | PostgreSQL 数据库 | `uvx postgres-mcp-server` |
| **sqlite** | SQLite 数据库 | `uvx sqlite-mcp-server` |
| **mongodb** | MongoDB 数据库 | `uvx mongodb-mcp-server` |

**版本控制类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **github** | GitHub API 操作 | `uvx github-mcp-server` |
| **gitlab** | GitLab API 操作 | `uvx gitlab-mcp-server` |
| **git** | Git 本地操作 | `uvx git-mcp-server` |

**浏览器自动化类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **playwright** | 浏览器自动化 | `uvx playwright-mcp-server` |
| **puppeteer** | Chrome 自动化 | `uvx puppeteer-mcp-server` |

**知识管理类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **memory** | 持久化记忆 | `uvx memory-mcp-server` |
| **obsidian** | Obsidian 笔记 | `uvx obsidian-mcp-server` |
| **notion** | Notion 数据库 | `uvx notion-mcp-server` |

**云服务类**

| 服务器 | 功能 | 安装命令 |
|--------|------|---------|
| **aws** | AWS 服务管理 | `uvx aws-mcp-server` |
| **gcp** | Google Cloud | `uvx gcp-mcp-server` |
| **azure** | Azure 服务 | `uvx azure-mcp-server` |

#### 10.3 MCP 配置示例

**Claude Code 配置（.claude/settings/mcp.json）**

```json
{
  "mcpServers": {
    "github": {
      "command": "uvx",
      "args": ["github-mcp-server"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxx"
      },
      "disabled": false,
      "autoApprove": ["search_repositories", "get_file_contents"]
    },
    "figma": {
      "command": "uvx",
      "args": ["figma-mcp-server"],
      "env": {
        "FIGMA_TOKEN": "figd_xxx"
      },
      "disabled": false
    },
    "postgres": {
      "command": "uvx",
      "args": ["postgres-mcp-server"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/db"
      },
      "disabled": false
    }
  }
}
```

**Cursor 配置（settings.json）**

```json
{
  "mcp": {
    "servers": {
      "context7": {
        "command": "uvx",
        "args": ["context7-mcp-server"]
      },
      "playwright": {
        "command": "uvx",
        "args": ["playwright-mcp-server"]
      }
    }
  }
}
```

#### 10.4 自建 MCP 服务器指南

**最小 MCP 服务器示例（Python）**

```python
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("my-tool")

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="hello",
            description="Say hello",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"}
                }
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "hello":
        return [TextContent(
            type="text",
            text=f"Hello, {arguments['name']}!"
        )]
```

**MCP 服务器开发资源**

- 官方文档: https://modelcontextprotocol.io
- Python SDK: https://github.com/anthropics/mcp-python
- TypeScript SDK: https://github.com/anthropics/mcp-typescript

### 11. 本地模型部署

#### 11.1 为什么需要本地模型

**核心优势**

- 🔒 **隐私保护**: 代码不离开本地环境
- 💰 **成本节约**: 无 API 调用费用
- 🚀 **离线可用**: 不依赖网络连接
- 🎯 **定制化**: 可针对特定领域微调

**适用场景**

- 处理敏感代码（金融、医疗、军工）
- 高频使用（每天 > 1000 次请求）
- 网络受限环境
- 需要定制化模型

#### 11.2 本地模型方案对比

**Ollama（推荐）**

```bash
# 安装（macOS）
brew install ollama

# 安装（Linux）
curl -fsSL https://ollama.com/install.sh | sh

# 启动服务
ollama serve

# 下载模型
ollama pull deepseek-coder:33b
ollama pull qwen2.5-coder:32b
ollama pull codellama:34b
```

**特点**:
- ✅ 安装简单,一键启动
- ✅ 模型管理方便
- ✅ 支持 OpenAI 兼容 API
- ✅ 社区活跃,模型丰富

**LM Studio（GUI 界面）**

- 图形化界面,适合非技术用户
- 支持模型搜索和下载
- 内置聊天界面
- 支持 OpenAI API 兼容

**vLLM（高性能推理）**

```bash
# 安装
pip install vllm

# 启动服务
python -m vllm.entrypoints.openai.api_server \
  --model deepseek-ai/deepseek-coder-33b-instruct \
  --port 8000
```

**特点**:
- ✅ 推理速度快（PagedAttention）
- ✅ 支持批处理
- ✅ 适合生产环境
- ❌ 配置复杂

#### 11.3 推荐本地模型

| 模型 | 参数量 | 代码能力 | 内存需求 | 适用场景 |
|------|--------|---------|---------|---------|
| **DeepSeek Coder 33B** | 33B | ⭐⭐⭐⭐⭐ | 20GB | 最强代码能力 |
| **Qwen2.5 Coder 32B** | 32B | ⭐⭐⭐⭐⭐ | 20GB | 中文优化 |
| **CodeLlama 34B** | 34B | ⭐⭐⭐⭐ | 20GB | Meta 官方 |
| **StarCoder2 15B** | 15B | ⭐⭐⭐⭐ | 10GB | 轻量级 |
| **DeepSeek Coder 6.7B** | 6.7B | ⭐⭐⭐ | 5GB | 低配置 |

#### 11.4 本地模型集成

**Continue 配置**

```json
{
  "models": [
    {
      "title": "DeepSeek Coder",
      "provider": "ollama",
      "model": "deepseek-coder:33b",
      "apiBase": "http://localhost:11434"
    },
    {
      "title": "Qwen Coder",
      "provider": "ollama",
      "model": "qwen2.5-coder:32b"
    }
  ]
}
```

**Cursor 配置**

```json
{
  "models": [
    {
      "name": "deepseek-coder",
      "provider": "openai-compatible",
      "apiBase": "http://localhost:11434/v1",
      "apiKey": "ollama"
    }
  ]
}
```

#### 11.5 性能对比

| 维度 | 云端 API | 本地模型 |
|------|---------|---------|
| **响应速度** | 1-3 秒 | 5-15 秒 |
| **代码质量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **成本** | $10-50/月 | 硬件成本 |
| **隐私** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **离线可用** | ❌ | ✅ |

**推荐策略**: 混合使用
- 简单任务 → 本地模型
- 复杂任务 → 云端 API

### 12. 工程化集成

#### 12.1 CI/CD 集成

**GitHub Actions 示例**

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: AI Code Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx @anthropic-ai/claude-code run \
            "审查 PR 中的代码变更，输出问题列表"
```

**GitLab CI 示例**

```yaml
ai-review:
  stage: review
  script:
    - pip install aider-chat
    - aider --yes --message "审查代码质量"
  only:
    - merge_requests
```

#### 12.2 团队协作规范

**工具选型规范**

```markdown
## 团队工具标准

### IDE 工具
- 主力: Cursor Pro（统一版本）
- 备选: Windsurf（预算有限）

### CLI 工具
- 主力: Claude Code
- 备选: Aider

### 模型选择
- 复杂任务: Claude Opus 4.6
- 日常任务: Claude Sonnet 4.6
- 简单任务: 本地 DeepSeek Coder
```

**项目记忆管理**

```markdown
## CLAUDE.md 维护流程

1. 初始化: 项目负责人创建基础 CLAUDE.md
2. 更新: 每次重大变更后更新规范
3. 审查: 每月审查一次，删除过时内容
4. 同步: 通过 Git 同步到所有成员
```

**Code Review 流程**

```markdown
## AI 辅助 Code Review

1. 提交 PR 后，自动触发 AI 审查
2. AI 输出问题列表（Bug/优化建议）
3. 开发者修复问题
4. 人工审查员最终审核
5. 合并代码
```

#### 12.3 成本控制策略

**Token 监控**

```typescript
// token-monitor.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 记录每次调用的 token 使用
async function trackUsage(prompt: string) {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  console.log('Input tokens:', response.usage.input_tokens);
  console.log('Output tokens:', response.usage.output_tokens);

  // 保存到数据库
  await saveUsage({
    date: new Date(),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: calculateCost(response.usage),
  });
}
```

**模型降级策略**

```typescript
// model-selector.ts
function selectModel(taskComplexity: 'simple' | 'medium' | 'complex') {
  const models = {
    simple: 'claude-haiku-4-5',
    medium: 'claude-sonnet-4-6',
    complex: 'claude-opus-4-6',
  };

  return models[taskComplexity];
}
```

**缓存优化**

```typescript
// 使用 Prompt Caching
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  system: [
    {
      type: 'text',
      text: projectContext, // 项目上下文
      cache_control: { type: 'ephemeral' }, // 缓存 5 分钟
    },
  ],
  messages: [{ role: 'user', content: prompt }],
});
```

#### 12.4 安全与合规

**敏感信息过滤**

```typescript
// sanitize.ts
function sanitizeCode(code: string): string {
  return code
    .replace(/sk-[a-zA-Z0-9]{48}/g, '<API_KEY>')
    .replace(/ghp_[a-zA-Z0-9]{36}/g, '<GITHUB_TOKEN>')
    .replace(/\b\d{16}\b/g, '<CARD_NUMBER>')
    .replace(/\b[\w\.-]+@[\w\.-]+\.\w+\b/g, '<EMAIL>');
}
```

**代码审计**

```bash
# 检查 AI 生成的代码
npm install -g @anthropic-ai/security-scanner

# 扫描安全漏洞
security-scanner scan src/
```

**许可证检查**

```bash
# 检查依赖的许可证
npx license-checker --summary
```

---

## 第四部分：最佳实践

### 13. 提示词工程

#### 13.1 提示词基本原则

**1. 清晰具体**

❌ 不好的提示词:
```
优化这个函数
```

✅ 好的提示词:
```
优化 calculateTotal 函数的性能:
1. 减少循环次数
2. 使用 Map 替代数组查找
3. 添加结果缓存
```

**2. 提供上下文**

❌ 不好的提示词:
```
修复这个 Bug
```

✅ 好的提示词:
```
修复登录功能的 Bug:
- 问题: 用户点击登录后无响应
- 复现步骤: 输入邮箱和密码 → 点击登录按钮
- 预期: 跳转到首页
- 实际: 按钮无反应,控制台报错 "Cannot read property 'token'"
- 相关文件: src/auth/login.ts
```

**3. 分步骤**

❌ 不好的提示词:
```
创建一个用户管理系统
```

✅ 好的提示词:
```
创建用户管理系统,分步骤实现:

步骤 1: 创建用户数据模型
- 字段: id, name, email, role, createdAt
- 使用 TypeScript 接口定义

步骤 2: 实现 CRUD API
- GET /users - 列表
- POST /users - 创建
- PUT /users/:id - 更新
- DELETE /users/:id - 删除

步骤 3: 添加权限验证
- 只有 admin 可以删除用户
- 用户只能修改自己的信息
```

**4. 示例驱动**

❌ 不好的提示词:
```
写一个表单验证函数
```

✅ 好的提示词:
```
写一个表单验证函数,参考以下示例:

输入:
{
  email: "user@example.com",
  password: "123456",
  age: 25
}

验证规则:
- email: 必填,格式正确
- password: 必填,长度 >= 8
- age: 可选,范围 18-100

输出:
{
  valid: false,
  errors: {
    password: "密码长度至少 8 位"
  }
}
```

#### 13.2 代码生成提示词模板

**模板 1: 创建新组件**

```
创建 {{ComponentName}} 组件:

功能需求:
- {{功能描述}}

Props:
- {{prop1}}: {{type}} - {{说明}}
- {{prop2}}: {{type}} - {{说明}}

样式要求:
- {{样式描述}}

示例用法:
<{{ComponentName}} {{prop1}}="{{value}}" />
```

**模板 2: 实现 API 接口**

```
实现 {{API名称}} 接口:

路由: {{method}} {{path}}

请求参数:
- {{param1}}: {{type}} - {{说明}}

响应格式:
{
  code: 200,
  data: {{数据结构}},
  message: "success"
}

错误处理:
- 400: 参数错误
- 401: 未授权
- 500: 服务器错误
```

**模板 3: 编写工具函数**

```
编写 {{函数名}} 工具函数:

功能: {{功能描述}}

输入: {{输入类型和说明}}
输出: {{输出类型和说明}}

示例:
{{函数名}}({{示例输入}}) // => {{示例输出}}

边界条件:
- {{边界条件1}}
- {{边界条件2}}
```

#### 13.3 代码审查提示词模板

**模板 1: 全面审查**

```
审查以下代码,检查:

1. 功能性
   - 是否实现了需求
   - 边界条件是否处理
   - 错误处理是否完善

2. 代码质量
   - 命名是否清晰
   - 逻辑是否简洁
   - 是否有重复代码

3. 性能
   - 是否有性能瓶颈
   - 是否可以优化

4. 安全
   - 是否有安全漏洞
   - 敏感信息是否保护

输出格式:
| 类别 | 问题 | 严重程度 | 建议 |
```

**模板 2: 性能审查**

```
审查代码性能,重点检查:

1. 时间复杂度
   - 是否有 O(n²) 或更高的算法
   - 是否可以优化为 O(n) 或 O(log n)

2. 空间复杂度
   - 是否有内存泄漏
   - 是否可以减少内存占用

3. 渲染性能（前端）
   - 是否有不必要的重渲染
   - 是否可以使用 memo/useMemo

输出优化建议和预期性能提升。
```

#### 13.4 Bug 修复提示词模板

**模板 1: 定位问题**

```
分析以下 Bug:

错误信息:
{{错误堆栈}}

复现步骤:
1. {{步骤1}}
2. {{步骤2}}

相关代码:
{{代码片段}}

请分析:
1. 问题根因
2. 影响范围
3. 修复方案（至少 2 个）
4. 推荐方案及理由
```

**模板 2: 修复验证**

```
修复 Bug 后,请验证:

1. 原问题是否解决
2. 是否引入新问题
3. 边界条件是否正常
4. 相关功能是否受影响

提供测试用例验证修复效果。
```

#### 13.5 高级技巧

**技巧 1: 链式提示**

```
第 1 步: 分析需求
"分析用户登录功能的需求,列出核心功能点"

第 2 步: 设计方案
"基于上述需求,设计技术方案,包括数据模型、API 接口、前端组件"

第 3 步: 实现代码
"根据设计方案,实现登录功能的代码"

第 4 步: 编写测试
"为登录功能编写单元测试和集成测试"
```

**技巧 2: 角色扮演**

```
你是一位资深的 React 架构师,有 10 年经验。

请审查这个组件的设计:
- 组件职责是否单一
- Props 设计是否合理
- 状态管理是否恰当
- 性能是否优化

以架构师的视角给出专业建议。
```

**技巧 3: 约束条件**

```
重构这个函数,要求:

必须满足:
- 保持原有功能不变
- 不修改函数签名
- 不引入新的依赖

优化目标:
- 减少代码行数 30%
- 提升可读性
- 降低圈复杂度
```

### 14. 团队协作规范

#### 14.1 工具选型规范

**选型决策矩阵**

| 因素 | 权重 | Cursor | Windsurf | Continue |
|------|------|--------|----------|----------|
| 成本 | 30% | 6 | 10 | 10 |
| 功能 | 40% | 9 | 8 | 7 |
| 易用性 | 20% | 9 | 8 | 6 |
| 生态 | 10% | 8 | 7 | 9 |
| **总分** | - | **8.1** | **8.5** | **7.9** |

**团队工具标准化**

```markdown
## 团队 AI 工具规范

### 必选工具
- IDE: Cursor Pro（统一购买企业版）
- CLI: Claude Code（CI/CD 集成）
- 模型: Claude Opus 4.6（复杂任务）+ Sonnet 4.6（日常）

### 可选工具
- 代码审查: CodeRabbit
- 文档生成: Mintlify
- 测试生成: Codium AI

### 禁用工具
- 未经审批的第三方插件
- 未加密的在线 AI 服务
```

#### 14.2 项目记忆管理

**CLAUDE.md 维护流程**

```markdown
## 维护流程

### 1. 初始化（项目启动时）
- 项目负责人创建基础 CLAUDE.md
- 包含: 技术栈、目录结构、开发规范
- 提交到 Git 仓库

### 2. 日常更新（有变更时）
- 新增功能 → 更新功能说明
- 修改规范 → 更新开发规范
- 重构代码 → 更新目录结构

### 3. 定期审查（每月）
- 删除过时内容
- 补充遗漏规范
- 优化表达方式

### 4. 版本管理
- 重大变更打 tag
- 保留历史版本
- 文档变更记录
```

**模板库管理**

```
team-templates/
├── CLAUDE.md.template          # 项目记忆模板
├── .cursorrules.template       # Cursor 规则模板
├── agents/                     # Agent 模板
│   ├── code-reviewer.md
│   ├── test-writer.md
│   └── doc-generator.md
└── skills/                     # Skill 模板
    ├── component-generator.md
    └── api-generator.md
```

#### 14.3 提示词库管理

**提示词库结构**

```
prompts/
├── code-generation/
│   ├── component.md
│   ├── api.md
│   └── utility.md
├── code-review/
│   ├── full-review.md
│   ├── performance.md
│   └── security.md
├── bug-fix/
│   ├── analyze.md
│   └── fix.md
└── documentation/
    ├── api-doc.md
    └── readme.md
```

**提示词版本管理**

```markdown
<!-- prompts/code-generation/component.md -->

# 组件生成提示词

版本: v2.1.0
更新日期: 2026-03-15
作者: @username

## 变更记录
- v2.1.0: 添加无障碍检查
- v2.0.0: 支持 TypeScript 泛型
- v1.0.0: 初始版本

## 提示词内容
...
```

#### 14.4 Code Review 流程

**AI 辅助 Code Review 流程**

```
1. 开发者提交 PR
   ↓
2. CI 触发 AI 审查
   - 运行 Claude Code
   - 生成审查报告
   ↓
3. AI 输出问题列表
   - Bug（必须修复）
   - 优化建议（可选）
   - 风格问题（可选）
   ↓
4. 开发者修复问题
   - 修复所有 Bug
   - 选择性优化
   ↓
5. 人工审查员审核
   - 验证 AI 发现的问题
   - 检查业务逻辑
   - 确认代码质量
   ↓
6. 合并代码
```

**审查标准**

```markdown
## Code Review 标准

### 必须修复（阻塞合并）
- [ ] 功能 Bug
- [ ] 安全漏洞
- [ ] 性能问题（严重）
- [ ] 类型错误

### 建议修复（不阻塞）
- [ ] 代码风格
- [ ] 命名优化
- [ ] 注释补充
- [ ] 性能优化（轻微）

### 可选优化
- [ ] 重构建议
- [ ] 架构优化
- [ ] 文档完善
```

#### 14.5 知识沉淀机制

**问题库建设**

```markdown
## 常见问题库

### 问题 1: Token 超限
**现象**: API 返回 "context_length_exceeded"
**原因**: 上下文超过模型限制
**解决方案**:
1. 使用 @符号精确引用文件
2. 拆分大任务
3. 使用长上下文模型

### 问题 2: 代码质量不佳
**现象**: AI 生成的代码不符合规范
**原因**: 项目记忆不完善
**解决方案**:
1. 完善 CLAUDE.md
2. 提供代码示例
3. 使用 Agent 专业化
```

**最佳实践文档**

```markdown
## AI 编程最佳实践

### 1. 提示词编写
- 清晰具体,避免模糊
- 提供上下文和示例
- 分步骤描述任务

### 2. 上下文管理
- 使用 @符号引用文件
- 定期清理无关上下文
- 使用 Prompt Caching

### 3. 代码审查
- AI 初审 + 人工复审
- 关注业务逻辑
- 验证边界条件

### 4. 成本控制
- 简单任务用便宜模型
- 启用缓存优化
- 监控 Token 使用
```

### 15. 实战案例

#### 15.1 案例 1: 从零搭建 Vue 组件库

**项目背景**
- 目标: 创建企业级 Vue 3 组件库
- 技术栈: Vue 3 + TypeScript + Vite
- 团队: 2 人,预计 2 周

**AI 辅助开发流程**

**第 1 天: 项目初始化**

```bash
# 使用 AI 生成项目脚手架
claude-code run "创建 Vue 3 组件库 Monorepo 项目"

# AI 生成的结构
packages/
├── button/
├── input/
├── theme/
└── utils/
```

**第 2-3 天: 配置工程化**

提示词:
```
配置组件库工程化工具:
1. ESLint + Prettier（Vue 3 规则）
2. TypeScript 严格模式
3. Vitest 单元测试
4. Storybook 文档
5. Rollup 构建（ESM + CJS）

生成完整配置文件。
```

**第 4-7 天: 开发核心组件**

使用 Skill 快速生成:
```bash
/component-generator name=Button props="type,size,disabled"
/component-generator name=Input props="value,placeholder,disabled"
/test-generator component=Button
/story-generator component=Button
```

**第 8-10 天: 主题系统**

提示词:
```
创建主题系统:
1. CSS Variables 定义（颜色、间距、圆角）
2. 亮色/暗色主题切换
3. 主题定制 API

参考 Ant Design 的主题系统。
```

**第 11-12 天: 文档和发布**

```bash
# AI 生成文档
/docs-generator

# AI 辅助发布
claude-code run "准备 npm 发布,检查版本号、changelog、构建产物"
```

**成果**
- 10+ 基础组件
- 测试覆盖率 85%
- 完整的 Storybook 文档
- 发布到 npm

**AI 贡献度**: 70%（代码生成、测试、文档）

#### 15.2 案例 2: React 全栈应用开发

**项目背景**
- 目标: Todo 管理应用（前后端）
- 技术栈: React + Express + PostgreSQL
- 时间: 3 天

**第 1 天: 后端 API**

提示词:
```
创建 Todo API 服务:

技术栈: Express + TypeScript + Prisma + PostgreSQL

功能:
1. CRUD 接口（/api/todos）
2. 用户认证（JWT）
3. 数据验证（Zod）

数据模型:
- Todo: id, title, completed, userId, createdAt
- User: id, email, password, createdAt

生成完整代码和测试。
```

**第 2 天: 前端界面**

使用 v0.dev 生成 UI:
```
访问 v0.dev
输入: "Todo 应用界面,包含列表、添加、编辑、删除功能"
选择喜欢的设计
复制代码到项目
```

**第 3 天: 集成和部署**

```bash
# AI 辅助集成
claude-code run "集成前后端,处理 CORS、环境变量、错误处理"

# AI 生成部署配置
claude-code run "生成 Docker Compose 配置,包含 Nginx、Node.js、PostgreSQL"
```

**成果**
- 完整的全栈应用
- 前后端分离
- Docker 一键部署

**AI 贡献度**: 80%

#### 15.3 案例 3: 遗留代码重构

**项目背景**
- 目标: 重构 5 年前的 jQuery 项目
- 技术栈: jQuery → React + TypeScript
- 代码量: 20K 行

**重构策略**

**阶段 1: 代码分析**

提示词:
```
分析这个 jQuery 项目:
1. 识别核心功能模块
2. 梳理数据流
3. 找出可复用的逻辑
4. 评估重构难度

输出重构计划。
```

**阶段 2: 逐模块迁移**

```bash
# 使用 AI 逐个模块迁移
claude-code run "将用户管理模块从 jQuery 迁移到 React"
claude-code run "将表单验证逻辑提取为 React Hooks"
```

**阶段 3: 测试覆盖**

```bash
# AI 生成测试
/test-generator module=UserManagement
/test-generator module=FormValidation
```

**成果**
- 代码量减少 40%
- 类型安全（TypeScript）
- 测试覆盖率 75%
- 性能提升 50%

**AI 贡献度**: 60%（代码迁移、测试生成）

#### 15.4 案例 4: 多人协作大型项目

**项目背景**
- 目标: 企业 ERP 系统
- 团队: 5 人
- 周期: 3 个月

**协作模式**

**1. 统一工具和规范**

```markdown
## 团队规范

### 工具
- IDE: Cursor Pro（统一版本）
- CLI: Claude Code
- 模型: Claude Opus 4.6

### 项目记忆
- 根目录: CLAUDE.md（通用规范）
- 模块目录: 各模块的 CLAUDE.md（专项规范）

### 提示词库
- 共享提示词库（Git 管理）
- 每周更新最佳实践
```

**2. 分工协作**

```
前端组（2 人）:
- 使用 AI 生成组件和页面
- 共享组件库和提示词

后端组（2 人）:
- 使用 AI 生成 API 和数据模型
- 共享 API 模板

测试组（1 人）:
- 使用 AI 生成测试用例
- 自动化测试流程
```

**3. Code Review**

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: AI Review
        run: claude-code run "审查 PR,输出问题列表"
```

**成果**
- 开发效率提升 50%
- 代码质量稳定
- 文档自动生成
- 测试覆盖率 80%

**AI 贡献度**: 50%（代码生成、审查、文档）

### 16. 常见问题与解决方案

#### 16.1 工具使用问题

**Q1: API Key 配置失败**

```bash
# 问题: ANTHROPIC_API_KEY not found

# 解决方案 1: 环境变量
export ANTHROPIC_API_KEY="sk-ant-xxx"

# 解决方案 2: 配置文件
# ~/.config/claude-code/config.json
{
  "apiKey": "sk-ant-xxx"
}

# 验证
echo $ANTHROPIC_API_KEY
```

**Q2: 代理配置**

```bash
# 问题: 网络连接失败

# 解决方案: 配置代理
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"

# Cursor 代理
Settings → Network → Proxy → Manual
```

**Q3: 上下文超限**

```
问题: context_length_exceeded

解决方案:
1. 使用 @符号精确引用文件
2. 拆分大任务为多个小任务
3. 使用长上下文模型（Gemini 2.0 Pro）
4. 启用 Prompt Caching
```

**Q4: 成本过高**

```
问题: 月度费用超预算

解决方案:
1. 简单任务用便宜模型（Haiku/Flash）
2. 启用 Prompt Caching（节省 50-90%）
3. 使用本地模型处理敏感代码
4. 设置月度预算告警
5. 监控 Token 使用情况
```

#### 16.2 代码质量问题

**Q5: AI 生成的代码质量不佳**

```
问题: 代码不符合项目规范

解决方案:
1. 完善 CLAUDE.md 项目记忆
2. 提供代码示例
3. 使用 Agent 专业化
4. 明确约束条件

示例提示词:
"生成代码时必须遵守:
- 使用 TypeScript 严格模式
- Props 必须有类型定义
- 样式使用 CSS Variables
- 不要硬编码颜色值"
```

**Q6: 如何避免 Bug**

```
策略:
1. 提供完整的需求和边界条件
2. 要求 AI 生成测试用例
3. 使用 AI 进行 Code Review
4. 人工验证关键逻辑

提示词模板:
"实现 X 功能,并考虑以下边界条件:
- 输入为空
- 输入超长
- 并发请求
- 网络异常

生成代码和测试用例。"
```

**Q7: 处理 AI 幻觉**

```
问题: AI 生成不存在的 API 或库

解决方案:
1. 验证 AI 提到的库是否存在
2. 检查 API 文档
3. 使用 MCP 工具查询最新文档
4. 明确指定版本号

提示词:
"使用 React 18 和 React Router 6.x 实现路由,
不要使用已废弃的 API。"
```

#### 16.3 团队协作问题

**Q8: 团队成员使用不同工具**

```
问题: 工具不统一,配置不一致

解决方案:
1. 制定团队工具标准
2. 统一购买企业版
3. 共享配置文件（Git 管理）
4. 定期培训和分享

标准化清单:
- [ ] IDE 工具统一
- [ ] 模型选择统一
- [ ] 配置文件共享
- [ ] 提示词库共享
```

**Q9: 项目记忆不同步**

```
问题: CLAUDE.md 更新不及时

解决方案:
1. 将 CLAUDE.md 纳入 Git 管理
2. 重大变更时更新文档
3. 每月审查一次
4. 使用 Git Hooks 提醒更新

Git Hook 示例:
# .git/hooks/pre-commit
if [[ $(git diff --name-only | grep -E "src/|package.json") ]]; then
  echo "提醒: 是否需要更新 CLAUDE.md?"
fi
```

**Q10: Code Review 标准不一致**

```
问题: 不同审查员标准不同

解决方案:
1. 制定 Code Review 清单
2. 使用 AI 初审统一标准
3. 人工复审关注业务逻辑
4. 定期校准审查标准

审查清单:
- [ ] 功能是否正确
- [ ] 类型是否安全
- [ ] 错误处理是否完善
- [ ] 性能是否优化
- [ ] 安全是否考虑
```

#### 16.4 安全与合规问题

**Q11: 代码泄露风险**

```
问题: 担心代码上传到 AI 服务

解决方案:
1. 使用本地模型处理敏感代码
2. 配置 .aiderignore 忽略敏感文件
3. 使用企业版（数据不训练）
4. 审查 AI 生成的代码

敏感文件列表:
- .env*
- *secret*
- *key*
- *token*
- *password*
```

**Q12: 许可证合规**

```
问题: AI 生成的代码可能侵权

解决方案:
1. 检查依赖的许可证
2. 避免复制大段开源代码
3. 使用许可证检查工具
4. 咨询法务意见

检查命令:
npx license-checker --summary
npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause"
```

**Q13: 私有化部署**

```
问题: 需要完全私有化

解决方案:
1. 使用本地模型（Ollama + DeepSeek Coder）
2. 自建 MCP 服务器
3. 使用支持私有部署的工具（Tabnine Enterprise）
4. 配置内网代理

架构:
内网环境
  ↓
本地 Ollama 服务
  ↓
Continue/Cursor（配置本地 API）
```

---

## 总结

### 核心要点

**1. 选择合适的工具**
- 预算有限 → Windsurf + DeepSeek V3
- 追求效率 → Cursor + Claude Opus 4.6
- 企业级 → Cursor Business + 本地模型

**2. 掌握提示词工程**
- 清晰具体,提供上下文
- 分步骤,示例驱动
- 使用模板库提高效率

**3. 配置项目记忆**
- CLAUDE.md 记录项目规范
- Agents/Skills 提高复用性
- Hooks 实现自动化

**4. 团队协作规范**
- 统一工具和配置
- 共享提示词库
- AI 初审 + 人工复审

**5. 成本控制**
- 分层使用模型
- 启用 Prompt Caching
- 混合本地和云端

### 学习路径

```
第 1 周: 工具入门
- 选择并安装工具
- 学习基本操作
- 尝试代码生成

第 2 周: 提示词优化
- 学习提示词原则
- 使用模板库
- 练习复杂任务

第 3 周: 项目配置
- 配置 CLAUDE.md
- 创建 Agents/Skills
- 集成 MCP 工具

第 4 周: 团队协作
- 制定团队规范
- 建立知识库
- 优化工作流
```

### 持续学习资源

**官方文档**
- Claude API: https://docs.anthropic.com
- OpenAI API: https://platform.openai.com/docs
- MCP 协议: https://modelcontextprotocol.io

**社区资源**
- GitHub: 搜索 "claude-code", "cursor", "mcp-server"
- Discord: Anthropic、Cursor、Continue 官方社区
- Reddit: r/ClaudeAI, r/LocalLLaMA

**学习项目**
- awesome-ai-coding: AI 编程工具合集
- mcp-servers: MCP 服务器列表
- prompt-engineering-guide: 提示词工程指南

---

## 快速参考

### 常用命令速查

**Claude Code**
```bash
claude-code chat              # 启动交互式会话
claude-code run "任务描述"    # 执行单次任务
/skill-name                   # 使用 Skill
@agent-name                   # 调用 Agent
```

**Cursor 快捷键**
```
Cmd/Ctrl + K        # 打开 AI 对话
Cmd/Ctrl + L        # 打开 Composer
Cmd/Ctrl + I        # 内联编辑
Cmd/Ctrl + Shift + L # 打开聊天历史
```

**Aider**
```bash
aider                         # 启动
/add file.ts                  # 添加文件到上下文
/drop file.ts                 # 移除文件
/commit                       # 提交更改
/model claude-opus-4-6        # 切换模型
```

### 模型选择速查

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 复杂架构设计 | Claude Opus 4.6 | 推理能力强 |
| 日常开发 | Claude Sonnet 4.6 | 性价比高 |
| 快速原型 | Gemini 2.0 Flash | 速度快 |
| 成本敏感 | DeepSeek V3 | 价格低 |
| 超长上下文 | Gemini 2.0 Pro | 1M tokens |
| 本地部署 | DeepSeek Coder | 开源免费 |

### 提示词模板速查

**代码生成**
```
创建 {{功能}} 功能:
- 需求: {{描述}}
- 输入: {{输入}}
- 输出: {{输出}}
- 示例: {{示例}}
```

**代码审查**
```
审查代码,检查:
1. 功能性
2. 代码质量
3. 性能
4. 安全
输出问题列表。
```

**Bug 修复**
```
修复 Bug:
- 错误: {{错误信息}}
- 复现: {{步骤}}
- 预期: {{预期行为}}
提供修复方案。
```

### 配置文件模板

**CLAUDE.md 最小模板**
```markdown
# 项目名称

## 技术栈
- 框架:
- 语言:
- 构建:

## 开发规范
-

## 命令
- 开发:
- 构建:
- 测试:
```

**MCP 配置模板**
```json
{
  "mcpServers": {
    "server-name": {
      "command": "uvx",
      "args": ["package-name"],
      "env": {
        "API_KEY": "xxx"
      },
      "disabled": false
    }
  }
}
```

---

## 反馈与贡献

本文档持续更新中,欢迎反馈和贡献:

- 📧 邮件: feedback@example.com
- 💬 GitHub Issues: [项目地址]
- 🔄 更新频率: 每月
- 📅 最后更新: 2026-03-16

---

::: tip 下一步
- 选择适合你的工具并开始使用
- 加入社区获取最新资讯
- 分享你的经验和最佳实践
:::
