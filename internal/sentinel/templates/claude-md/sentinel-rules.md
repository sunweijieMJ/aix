# Sentinel 规范（供 CI 中的 Claude Code 使用）

## 修复原则
- 最小改动原则：只改必要的代码
- 不做额外重构、不添加新功能
- 不修改测试用例来让测试通过
- 不确定时宁可不改，输出分析报告

## 文件权限
- 允许修改: __ALLOWED_PATHS_DISPLAY__
- 禁止修改: `tests/**`, `__tests__/**`, `__test__/**`
- 禁止修改: *.config.*, .env*
- 禁止修改: package.json (依赖变更需人工决策)
- 禁止修改: .github/workflows/**

## 修复质量要求
- 修复后代码必须通过 TypeScript 类型检查
- 不引入 any 类型来绕过类型错误
- 保持现有代码风格一致
- 添加必要的注释说明修复原因
