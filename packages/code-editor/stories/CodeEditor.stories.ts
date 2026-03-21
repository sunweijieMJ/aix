import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { CodeEditor } from '../src';

const sampleJS = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 计算前 10 个斐波那契数
const results = Array.from({ length: 10 }, (_, i) => fibonacci(i));
console.log(results);`;

const sampleTS = `interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

function greetUser(user: User): string {
  const roleText = user.roles.join(', ');
  return \`Hello \${user.name}! Your roles: \${roleText}\`;
}

const admin: User = {
  id: 1,
  name: 'Admin',
  email: 'admin@example.com',
  roles: ['admin', 'user'],
};

console.log(greetUser(admin));`;

const sampleJSON = `{
  "name": "@aix/code-editor",
  "version": "1.0.0",
  "dependencies": {
    "codemirror": "^6.0.0",
    "vue": "^3.5.0"
  },
  "keywords": ["vue", "code-editor", "codemirror"]
}`;

const sampleHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>示例页面</title>
  <style>
    body { font-family: sans-serif; }
    .container { max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>这是一个示例页面</p>
  </div>
</body>
</html>`;

const sampleCSS = `:root {
  --primary-color: #1677ff;
  --border-radius: 6px;
}

.button {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid var(--primary-color);
  border-radius: var(--border-radius);
  background-color: var(--primary-color);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.button:hover {
  opacity: 0.85;
}`;

const samplePython = `from dataclasses import dataclass
from typing import List

@dataclass
class Student:
    name: str
    grade: int
    scores: List[float]

    @property
    def average(self) -> float:
        return sum(self.scores) / len(self.scores) if self.scores else 0.0

students = [
    Student("Alice", 3, [92, 88, 95]),
    Student("Bob", 2, [78, 85, 90]),
    Student("Charlie", 3, [95, 97, 93]),
]

for s in students:
    print(f"{s.name}: avg={s.average:.1f}")`;

const sampleJava = `public class HelloWorld {
    public static void main(String[] args) {
        List<String> names = List.of("Alice", "Bob", "Charlie");
        names.stream()
             .filter(n -> n.length() > 3)
             .forEach(System.out::println);
    }
}`;

const sampleGo = `package main

import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    for i := 0; i < 10; i++ {
        fmt.Printf("fib(%d) = %d\\n", i, fibonacci(i))
    }
}`;

const sampleRust = `use std::collections::HashMap;

fn word_count(text: &str) -> HashMap<&str, usize> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}

fn main() {
    let text = "hello world hello rust";
    let counts = word_count(text);
    println!("{:?}", counts);
}`;

const sampleSQL = `SELECT
    u.name,
    COUNT(o.id) AS order_count,
    SUM(o.total) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
GROUP BY u.name
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC
LIMIT 10;`;

const sampleYAML = `# Docker Compose 配置
version: "3.8"
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html
    depends_on:
      - api
  api:
    build: .
    environment:
      - DATABASE_URL=postgres://db:5432/app
    restart: always`;

const sampleMarkdown = `# CodeEditor 组件文档

## 安装

\\\`\\\`\\\`bash
pnpm add @aix/code-editor
\\\`\\\`\\\`

## 特性

- **20 种语言**支持
- 亮色/暗色主题切换
- v-model 双向绑定
- 编程式 API

> 基于 CodeMirror 6 构建`;

const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`;

const meta: Meta<typeof CodeEditor> = {
  title: 'Components/CodeEditor',
  component: CodeEditor,
  tags: ['autodocs'],
  argTypes: {
    language: {
      control: 'select',
      options: [
        'javascript',
        'typescript',
        'json',
        'html',
        'css',
        'python',
        'java',
        'go',
        'rust',
        'cpp',
        'php',
        'sql',
        'yaml',
        'xml',
        'markdown',
        'sass',
        'vue',
        'angular',
        'liquid',
        'wast',
      ],
      description: '编程语言',
    },
    theme: {
      control: 'select',
      options: ['light', 'dark'],
      description: '主题',
    },
    readonly: {
      control: 'boolean',
      description: '只读模式',
    },
    disabled: {
      control: 'boolean',
      description: '禁用状态',
    },
    lineNumbers: {
      control: 'boolean',
      description: '显示行号',
    },
    foldGutter: {
      control: 'boolean',
      description: '代码折叠',
    },
    highlightActiveLine: {
      control: 'boolean',
      description: '高亮当前行',
    },
    tabSize: {
      control: 'number',
      description: 'Tab 缩进大小',
    },
    placeholder: {
      control: 'text',
      description: '占位文本',
    },
    height: {
      control: 'text',
      description: '固定高度',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** 默认编辑器 */
export const Default: Story = {
  args: {
    modelValue: sampleJS,
    language: 'javascript',
    theme: 'light',
    height: '300px',
  },
  render: (args) => ({
    components: { CodeEditor },
    setup() {
      const code = ref(args.modelValue);
      return { args, code };
    },
    template: '<CodeEditor v-bind="args" v-model="code" />',
  }),
};

/** 深色主题 */
export const DarkTheme: Story = {
  args: {
    modelValue: sampleTS,
    language: 'typescript',
    theme: 'dark',
    height: '350px',
  },
  render: (args) => ({
    components: { CodeEditor },
    setup() {
      const code = ref(args.modelValue);
      return { args, code };
    },
    template: '<CodeEditor v-bind="args" v-model="code" />',
  }),
};

/** 多语言切换 */
export const Languages: Story = {
  render: () => ({
    components: { CodeEditor },
    setup() {
      const languages = [
        { label: 'JavaScript', value: 'javascript', code: sampleJS },
        { label: 'TypeScript', value: 'typescript', code: sampleTS },
        { label: 'JSON', value: 'json', code: sampleJSON },
        { label: 'HTML', value: 'html', code: sampleHTML },
        { label: 'CSS', value: 'css', code: sampleCSS },
        { label: 'Python', value: 'python', code: samplePython },
        { label: 'Java', value: 'java', code: sampleJava },
        { label: 'Go', value: 'go', code: sampleGo },
        { label: 'Rust', value: 'rust', code: sampleRust },
        { label: 'SQL', value: 'sql', code: sampleSQL },
        { label: 'YAML', value: 'yaml', code: sampleYAML },
        { label: 'XML', value: 'xml', code: sampleXML },
        { label: 'Markdown', value: 'markdown', code: sampleMarkdown },
      ] as const;
      const currentLang = ref<string>('javascript');
      const code = ref(sampleJS);

      function switchLang(lang: (typeof languages)[number]) {
        currentLang.value = lang.value;
        code.value = lang.code;
      }

      return { languages, currentLang, code, switchLang };
    },
    template: `
      <div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
          <button
            v-for="lang in languages"
            :key="lang.value"
            @click="switchLang(lang)"
            :style="{
              padding: '4px 12px',
              borderRadius: '4px',
              border: currentLang === lang.value ? '2px solid #1677ff' : '1px solid #d9d9d9',
              background: currentLang === lang.value ? '#1677ff' : '#fff',
              color: currentLang === lang.value ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: currentLang === lang.value ? '600' : '400',
            }"
          >
            {{ lang.label }}
          </button>
        </div>
        <CodeEditor v-model="code" :language="currentLang" height="300px" />
      </div>
    `,
  }),
};

/** 只读模式 */
export const Readonly: Story = {
  args: {
    modelValue: sampleJSON,
    language: 'json',
    readonly: true,
    height: '200px',
  },
  render: (args) => ({
    components: { CodeEditor },
    setup() {
      return { args };
    },
    template: '<CodeEditor v-bind="args" />',
  }),
};

/** 禁用状态 */
export const Disabled: Story = {
  args: {
    modelValue: sampleJS,
    language: 'javascript',
    disabled: true,
    height: '200px',
  },
  render: (args) => ({
    components: { CodeEditor },
    setup() {
      return { args };
    },
    template: '<CodeEditor v-bind="args" />',
  }),
};

/** 占位文本 */
export const WithPlaceholder: Story = {
  args: {
    modelValue: '',
    language: 'javascript',
    placeholder: '在此输入代码...',
    height: '150px',
  },
  render: (args) => ({
    components: { CodeEditor },
    setup() {
      const code = ref('');
      return { args, code };
    },
    template: '<CodeEditor v-bind="args" v-model="code" />',
  }),
};

/** v-model 双向绑定 */
export const VModel: Story = {
  render: () => ({
    components: { CodeEditor },
    setup() {
      const code = ref('const x = 1;\nconsole.log(x);');
      return { code };
    },
    template: `
      <div>
        <CodeEditor v-model="code" language="javascript" height="200px" />
        <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
          <strong>v-model 值：</strong>
          <pre style="margin-top: 8px; font-size: 12px; white-space: pre-wrap;">{{ code }}</pre>
        </div>
      </div>
    `,
  }),
};
