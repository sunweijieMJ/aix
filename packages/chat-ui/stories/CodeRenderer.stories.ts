/**
 * @fileoverview CodeRenderer Stories
 * 展示代码渲染器的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { CodeRenderer, setup } from '../src';

// 确保初始化
setup({ preset: 'standard' });

const meta: Meta<typeof CodeRenderer> = {
  title: 'ChatUI/CodeRenderer',
  component: CodeRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'CodeRenderer 用于渲染代码块，支持语法高亮、复制功能和流式输出。使用 highlight.js 进行语法高亮（可选依赖）。',
      },
    },
  },
  argTypes: {
    data: {
      control: 'object',
      description: '代码数据',
      table: {
        type: { summary: 'CodeData | string' },
      },
    },
    showCopy: {
      control: 'boolean',
      description: '是否显示复制按钮',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    showLineNumbers: {
      control: 'boolean',
      description: '是否显示行号',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    enableHighlight: {
      control: 'boolean',
      description: '是否启用语法高亮',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    streaming: {
      control: 'boolean',
      description: '是否正在流式输出',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 创建 mock block
const createBlock = (id: string) => ({
  id,
  type: 'code' as const,
  raw: '',
  status: 'complete' as const,
});

/**
 * JavaScript 代码
 */
export const JavaScript: Story = {
  args: {
    block: createBlock('js-1'),
    data: {
      code: `// JavaScript 示例
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 使用 memoization 优化
const memo = new Map();
function fibMemo(n) {
  if (memo.has(n)) return memo.get(n);
  if (n <= 1) return n;

  const result = fibMemo(n - 1) + fibMemo(n - 2);
  memo.set(n, result);
  return result;
}

console.log(fibonacci(10));  // 55
console.log(fibMemo(50));    // 12586269025`,
      language: 'javascript',
    },
    showCopy: true,
    streaming: false,
  },
};

/**
 * TypeScript 代码
 */
export const TypeScript: Story = {
  args: {
    block: createBlock('ts-1'),
    data: {
      code: `interface User {
  id: number;
  name: string;
  email: string;
  roles: Role[];
}

type Role = 'admin' | 'user' | 'guest';

class UserService {
  private users: Map<number, User> = new Map();

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(data: Omit<User, 'id'>): Promise<User> {
    const id = Date.now();
    const user: User = { id, ...data };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');

    const updated = { ...user, ...data };
    this.users.set(id, updated);
    return updated;
  }
}`,
      language: 'typescript',
    },
    showCopy: true,
    streaming: false,
  },
};

/**
 * Python 代码
 */
export const Python: Story = {
  args: {
    block: createBlock('py-1'),
    data: {
      code: `import asyncio
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class Task:
    id: int
    title: str
    completed: bool = False

class TaskManager:
    def __init__(self):
        self.tasks: List[Task] = []
        self._id_counter = 0

    def add_task(self, title: str) -> Task:
        self._id_counter += 1
        task = Task(id=self._id_counter, title=title)
        self.tasks.append(task)
        return task

    def complete_task(self, task_id: int) -> Optional[Task]:
        for task in self.tasks:
            if task.id == task_id:
                task.completed = True
                return task
        return None

    async def process_tasks(self):
        for task in self.tasks:
            if not task.completed:
                await asyncio.sleep(0.1)
                print(f"Processing: {task.title}")

# 使用示例
manager = TaskManager()
manager.add_task("Learn Python")
manager.add_task("Build AI app")`,
      language: 'python',
    },
    showCopy: true,
    streaming: false,
  },
};

/**
 * CSS/SCSS 代码
 */
export const CSS: Story = {
  args: {
    block: createBlock('css-1'),
    data: {
      code: `/* 现代 CSS 示例 */
.card {
  --card-padding: 1rem;
  --card-radius: 0.5rem;
  --card-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);

  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: var(--card-padding);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  background: white;

  /* 容器查询 */
  container-type: inline-size;

  @container (min-width: 400px) {
    flex-direction: row;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 12px -2px rgb(0 0 0 / 0.15);
  }

  /* 暗色主题 */
  @media (prefers-color-scheme: dark) {
    background: #1e1e1e;
    color: #fff;
  }
}`,
      language: 'css',
    },
    showCopy: true,
    streaming: false,
  },
};

/**
 * JSON 数据
 */
export const JSON: Story = {
  args: {
    block: createBlock('json-1'),
    data: {
      code: `{
  "name": "@aix/chat-ui",
  "version": "1.0.0",
  "description": "AI Chat UI rendering components",
  "main": "./lib/index.js",
  "module": "./es/index.js",
  "types": "./es/index.d.ts",
  "exports": {
    ".": {
      "types": "./es/index.d.ts",
      "import": "./es/index.js",
      "require": "./lib/index.js"
    }
  },
  "dependencies": {
    "marked": "^15.0.0",
    "dompurify": "^3.0.0"
  },
  "peerDependencies": {
    "vue": "^3.5.0"
  }
}`,
      language: 'json',
    },
    showCopy: true,
    streaming: false,
  },
};

/**
 * Shell/Bash 命令
 */
export const Shell: Story = {
  args: {
    block: createBlock('sh-1'),
    data: {
      code: `#!/bin/bash

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建项目
pnpm build

# 运行测试
pnpm test

# 部署到生产环境
echo "Deploying to production..."
npm run build
npm run deploy -- --prod

# 查看日志
tail -f /var/log/app.log | grep "ERROR"`,
      language: 'bash',
    },
    showCopy: true,
    streaming: false,
  },
};

/**
 * 流式输出效果
 */
export const StreamingCode: Story = {
  render: () => ({
    components: { CodeRenderer },
    setup() {
      const code = ref('');
      const streaming = ref(true);

      const fullCode = `async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}`;

      let charIndex = 0;
      const interval = setInterval(() => {
        if (charIndex < fullCode.length) {
          code.value = fullCode.slice(0, charIndex + 2);
          charIndex += 2;
        } else {
          streaming.value = false;
          clearInterval(interval);
        }
      }, 50);

      return {
        block: createBlock('stream-1'),
        data: { code, language: 'typescript' },
        streaming,
      };
    },
    template: `
      <div>
        <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
          {{ streaming ? '🔄 代码生成中...' : '✅ 生成完成' }}
        </div>
        <CodeRenderer
          :block="block"
          :data="{ code: data.code.value, language: 'typescript' }"
          :streaming="streaming"
          showCopy
        />
      </div>
    `,
  }),
};

/**
 * 多语言对比
 */
export const MultiLanguage: Story = {
  render: () => ({
    components: { CodeRenderer },
    setup() {
      const examples = [
        {
          language: 'javascript',
          code: `// JavaScript
const greet = (name) => \`Hello, \${name}!\`;`,
        },
        {
          language: 'python',
          code: `# Python
def greet(name):
    return f"Hello, {name}!"`,
        },
        {
          language: 'go',
          code: `// Go
func greet(name string) string {
    return fmt.Sprintf("Hello, %s!", name)
}`,
        },
        {
          language: 'rust',
          code: `// Rust
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}`,
        },
      ];

      return { examples, createBlock };
    },
    template: `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div v-for="(example, index) in examples" :key="example.language">
          <CodeRenderer
            :block="createBlock('multi-' + index)"
            :data="example"
            showCopy
          />
        </div>
      </div>
    `,
  }),
};

/**
 * 无语法高亮
 */
export const NoHighlight: Story = {
  args: {
    block: createBlock('no-hl-1'),
    data: {
      code: `这是一段纯文本代码
没有启用语法高亮
所有内容都是相同的颜色

function test() {
  return 'no highlight';
}`,
      language: 'text',
    },
    showCopy: true,
    enableHighlight: false,
    streaming: false,
  },
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    block: createBlock('playground-1'),
    data: {
      code: `// 在这里编辑代码
function hello(name) {
  console.log('Hello, ' + name);
}

hello('World');`,
      language: 'javascript',
    },
    showCopy: true,
    showLineNumbers: false,
    enableHighlight: true,
    streaming: false,
  },
};
