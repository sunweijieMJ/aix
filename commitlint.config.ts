import { RuleConfigSeverity } from '@commitlint/types';
import { defineConfig } from 'cz-git';

const config = defineConfig({
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: /^\[(AI|Human)\]\[(\w+)\]: (.+)$/,
      headerCorrespondence: ['scope', 'type', 'subject'],
    },
  },
  formatter: '@commitlint/format',
  rules: {
    'type-enum': [
      RuleConfigSeverity.Error,
      'always',
      [
        'feat', // 新功能
        'fix', // 修复bug
        'docs', // 文档修改
        'style', // 代码格式修改
        'refactor', // 代码重构
        'perf', // 性能优化
        'test', // 测试相关
        'build', // 构建相关
        'ci', // CI/CD相关
        'chore', // 其他修改
        'revert', // 回退提交
      ],
    ],
    'type-case': [RuleConfigSeverity.Error, 'always', 'lower-case'],
    'type-empty': [RuleConfigSeverity.Error, 'never'],
    'scope-case': [RuleConfigSeverity.Disabled],
    'scope-enum': [RuleConfigSeverity.Error, 'always', ['AI', 'Human']],
    'scope-empty': [RuleConfigSeverity.Error, 'never'],
    'subject-empty': [RuleConfigSeverity.Error, 'never'],
    'subject-full-stop': [RuleConfigSeverity.Error, 'never', '.'],
    'subject-case': [RuleConfigSeverity.Disabled],
    'header-max-length': [RuleConfigSeverity.Error, 'always', 72],
  },
  prompt: {
    alias: { fd: 'docs: fix typos' },
    messages: {
      type: '请选择提交的类型（必填）',
      scope: '请选择提交者类型（必填）',
      subject: '请简要描述提交（必填）',
      body: '请输入详细描述（可选）',
      footer: '请选择要关闭的issue（可选）',
      confirmCommit: '确认要使用以上信息提交？（y/n）',
    },
    types: [
      { value: 'feat', name: 'feat:      新功能' },
      { value: 'fix', name: 'fix:       修复' },
      { value: 'docs', name: 'docs:      文档变更' },
      { value: 'style', name: 'style:     代码格式（不影响代码运行的变动）' },
      { value: 'refactor', name: 'refactor:  代码重构' },
      { value: 'perf', name: 'perf:      性能优化' },
      { value: 'test', name: 'test:      增加测试' },
      { value: 'chore', name: 'chore:     构建过程或辅助工具的变动' },
      { value: 'revert', name: 'revert:    回退' },
      { value: 'build', name: 'build:     打包' },
    ],
    scopes: [
      { value: 'AI', name: 'AI: 由人工智能生成的代码' },
      { value: 'Human', name: 'Human: 由人类编写的代码' },
    ],
    allowCustomScopes: false,
    allowEmptyScopes: false,
    skipQuestions: ['body'],
    formatMessageCB: ({ type, scope, subject, body, footer }) => {
      const head = `[${scope}][${type}]: ${subject}`;
      let full = head;
      if (body) full += '\n\n' + body;
      if (footer) full += '\n\n' + footer;
      return full;
    },
  },
});

export default config;
