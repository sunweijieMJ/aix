/**
 * @fileoverview MermaidRenderer Stories
 * 展示 Mermaid 图表渲染器的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { MermaidRenderer, setup } from '../src';

// 确保初始化（使用 full 预设以包含 mermaid）
setup({ preset: 'full' });

const meta: Meta<typeof MermaidRenderer> = {
  title: 'ChatUI/MermaidRenderer',
  component: MermaidRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
MermaidRenderer 用于渲染 Mermaid 图表，支持流程图、时序图、类图、状态图、ER图、甘特图等多种图表类型。

**注意**: 使用此渲染器需要安装 \`mermaid\` 依赖：
\`\`\`bash
pnpm add mermaid
\`\`\`
        `,
      },
    },
  },
  argTypes: {
    data: {
      control: 'object',
      description: 'Mermaid 图表数据',
      table: {
        type: { summary: 'MermaidData | string' },
      },
    },
    height: {
      control: 'text',
      description: '图表高度',
      table: {
        type: { summary: 'string | number' },
        defaultValue: { summary: 'auto' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 创建 mock block
const createBlock = (id: string) => ({
  id,
  type: 'mermaid' as const,
  raw: '',
  status: 'complete' as const,
});

/**
 * 流程图 (Flowchart)
 */
export const Flowchart: Story = {
  args: {
    block: createBlock('flow-1'),
    data: {
      code: `flowchart TD
    A[开始] --> B{是否登录?}
    B -->|是| C[显示主页]
    B -->|否| D[跳转登录页]
    D --> E[输入账号密码]
    E --> F{验证成功?}
    F -->|是| C
    F -->|否| G[显示错误]
    G --> E
    C --> H[结束]`,
    },
  },
};

/**
 * 时序图 (Sequence Diagram)
 */
export const SequenceDiagram: Story = {
  args: {
    block: createBlock('seq-1'),
    data: {
      code: `sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant B as 后端
    participant D as 数据库

    U->>F: 点击登录
    F->>B: POST /api/login
    B->>D: 查询用户
    D-->>B: 返回用户数据
    B-->>F: 返回 Token
    F-->>U: 登录成功`,
    },
  },
};

/**
 * 类图 (Class Diagram)
 */
export const ClassDiagram: Story = {
  args: {
    block: createBlock('class-1'),
    data: {
      code: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
        +fetch()
    }
    class Cat {
        +String color
        +meow()
        +scratch()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
    },
  },
};

/**
 * 状态图 (State Diagram)
 */
export const StateDiagram: Story = {
  args: {
    block: createBlock('state-1'),
    data: {
      code: `stateDiagram-v2
    [*] --> 待处理
    待处理 --> 处理中: 开始处理
    处理中 --> 已完成: 处理成功
    处理中 --> 失败: 处理出错
    失败 --> 处理中: 重试
    已完成 --> [*]`,
    },
  },
};

/**
 * ER 图 (Entity Relationship)
 */
export const ERDiagram: Story = {
  args: {
    block: createBlock('er-1'),
    data: {
      code: `erDiagram
    USER ||--o{ ORDER : places
    USER {
        int id PK
        string name
        string email
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        int id PK
        int user_id FK
        date created_at
    }
    ORDER_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
    }
    PRODUCT ||--o{ ORDER_ITEM : "included in"
    PRODUCT {
        int id PK
        string name
        float price
    }`,
    },
  },
};

/**
 * 甘特图 (Gantt Chart)
 */
export const GanttChart: Story = {
  args: {
    block: createBlock('gantt-1'),
    data: {
      code: `gantt
    title 项目开发计划
    dateFormat  YYYY-MM-DD
    section 需求阶段
    需求分析        :a1, 2024-01-01, 7d
    需求评审        :after a1, 3d
    section 开发阶段
    UI 设计         :2024-01-11, 10d
    前端开发        :2024-01-15, 20d
    后端开发        :2024-01-15, 25d
    section 测试阶段
    集成测试        :2024-02-10, 10d
    用户测试        :2024-02-20, 7d`,
    },
  },
};

/**
 * 饼图 (Pie Chart)
 */
export const PieChart: Story = {
  args: {
    block: createBlock('pie-1'),
    data: {
      code: `pie showData
    title 技术栈使用占比
    "Vue.js" : 45
    "React" : 30
    "Angular" : 15
    "其他" : 10`,
    },
  },
};

/**
 * Git 图 (Git Graph)
 */
export const GitGraph: Story = {
  args: {
    block: createBlock('git-1'),
    data: {
      code: `gitGraph
    commit id: "初始化"
    branch develop
    checkout develop
    commit id: "添加功能A"
    commit id: "添加功能B"
    checkout main
    merge develop id: "合并开发分支"
    commit id: "发布 v1.0"
    branch hotfix
    checkout hotfix
    commit id: "修复bug"
    checkout main
    merge hotfix id: "紧急修复"`,
    },
  },
};

/**
 * 用户旅程图 (User Journey)
 */
export const UserJourney: Story = {
  args: {
    block: createBlock('journey-1'),
    data: {
      code: `journey
    title 用户购物体验
    section 浏览商品
      打开网站: 5: 用户
      搜索商品: 4: 用户
      查看详情: 4: 用户
    section 下单
      加入购物车: 5: 用户
      填写地址: 3: 用户
      选择支付: 4: 用户
    section 收货
      等待发货: 2: 用户
      确认收货: 5: 用户
      评价商品: 4: 用户`,
    },
  },
};

/**
 * 思维导图 (Mindmap)
 */
export const Mindmap: Story = {
  args: {
    block: createBlock('mind-1'),
    data: {
      code: `mindmap
  root((前端技术))
    框架
      Vue.js
        Vue 3
        Pinia
      React
        Next.js
        Redux
    构建工具
      Vite
      Webpack
      Rollup
    语言
      TypeScript
      JavaScript
      CSS
        Sass
        Tailwind`,
    },
  },
};

/**
 * 所有图表类型展示
 */
export const AllTypes: Story = {
  render: () => ({
    components: { MermaidRenderer },
    setup() {
      const examples = [
        {
          title: '流程图',
          code: `flowchart LR
    A[输入] --> B[处理] --> C[输出]`,
        },
        {
          title: '时序图',
          code: `sequenceDiagram
    A->>B: 请求
    B-->>A: 响应`,
        },
        {
          title: '饼图',
          code: `pie title 分布
    "A" : 40
    "B" : 35
    "C" : 25`,
        },
      ];

      return { examples, createBlock };
    },
    template: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
        <div v-for="(example, index) in examples" :key="index">
          <h4 style="margin: 0 0 8px 0; font-size: 14px;">{{ example.title }}</h4>
          <MermaidRenderer
            :block="createBlock('all-' + index)"
            :data="{ code: example.code }"
            height="200px"
          />
        </div>
      </div>
    `,
  }),
};

/**
 * 动态更新
 */
export const DynamicUpdate: Story = {
  render: () => ({
    components: { MermaidRenderer },
    setup() {
      const diagrams = [
        `flowchart TD
    A[步骤1] --> B[步骤2]`,
        `flowchart TD
    A[步骤1] --> B[步骤2] --> C[步骤3]`,
        `flowchart TD
    A[步骤1] --> B[步骤2] --> C[步骤3] --> D[步骤4]`,
      ];

      const currentIndex = ref(0);
      const code = ref(diagrams[0]);

      const next = () => {
        currentIndex.value = (currentIndex.value + 1) % diagrams.length;
        code.value = diagrams[currentIndex.value] || diagrams[0];
      };

      return { code, next, createBlock };
    },
    template: `
      <div>
        <button
          @click="next"
          style="margin-bottom: 16px; padding: 8px 16px; cursor: pointer;"
        >
          添加步骤
        </button>
        <MermaidRenderer
          :block="createBlock('dynamic-1')"
          :data="{ code }"
        />
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    block: createBlock('playground-1'),
    data: {
      code: `flowchart TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[结束]
    C --> D`,
    },
    height: 'auto',
  },
};
