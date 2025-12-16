/**
 * @fileoverview LaTeX 渲染器 Stories
 * 展示 LaTeX 数学公式渲染的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ContentRenderer, setup } from '../src';

// 确保初始化
setup({ preset: 'standard' });

const meta: Meta<typeof ContentRenderer> = {
  title: 'ChatUI/Renderers/LaTeX',
  component: ContentRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'LaTeX 渲染器用于显示数学公式，支持块级公式（$$...$$）和行内公式（$...$）。基于 KaTeX 实现。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础块级公式
 */
export const BlockFormula: Story = {
  args: {
    content: `$$
E = mc^2
$$`,
    theme: 'light',
  },
};

/**
 * 复杂数学公式
 */
export const ComplexFormula: Story = {
  args: {
    content: `$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$`,
    theme: 'light',
  },
};

/**
 * 矩阵
 */
export const Matrix: Story = {
  args: {
    content: `$$
\\begin{pmatrix}
a_{11} & a_{12} & a_{13} \\\\
a_{21} & a_{22} & a_{23} \\\\
a_{31} & a_{32} & a_{33}
\\end{pmatrix}
$$`,
    theme: 'light',
  },
};

/**
 * 方程组
 */
export const EquationSystem: Story = {
  args: {
    content: `$$
\\begin{cases}
x + y = 10 \\\\
2x - y = 5
\\end{cases}
$$`,
    theme: 'light',
  },
};

/**
 * 求和与极限
 */
export const SumAndLimit: Story = {
  args: {
    content: `$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$`,
    theme: 'light',
  },
};

/**
 * 分数与根号
 */
export const FractionAndRoot: Story = {
  args: {
    content: `$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$`,
    theme: 'light',
  },
};

/**
 * 希腊字母
 */
export const GreekLetters: Story = {
  args: {
    content: `$$
\\alpha, \\beta, \\gamma, \\delta, \\epsilon, \\zeta, \\eta, \\theta, \\iota, \\kappa, \\lambda, \\mu, \\nu, \\xi, \\pi, \\rho, \\sigma, \\tau, \\upsilon, \\phi, \\chi, \\psi, \\omega
$$`,
    theme: 'light',
  },
};

/**
 * 微积分公式
 */
export const Calculus: Story = {
  args: {
    content: `$$
\\frac{d}{dx}\\left( \\int_{0}^{x} f(t)\\,dt \\right) = f(x)
$$`,
    theme: 'light',
  },
};

/**
 * 麦克斯韦方程组
 */
export const MaxwellEquations: Story = {
  args: {
    content: `$$
\\begin{aligned}
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\nabla \\cdot \\mathbf{B} &= 0 \\\\
\\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{aligned}
$$`,
    theme: 'light',
  },
};

/**
 * 傅里叶变换
 */
export const FourierTransform: Story = {
  args: {
    content: `$$
\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx
$$`,
    theme: 'light',
  },
};

/**
 * 行内公式展示
 */
export const InlineFormulas: Story = {
  render: () => ({
    components: { ContentRenderer },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px;">块级公式 ($$...$$)</h3>
          <ContentRenderer content="$$E = mc^2$$" />
        </section>

        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px;">使用 \\[...\\] 的块级公式</h3>
          <ContentRenderer content="\\[\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\\]" />
        </section>
      </div>
    `,
  }),
};

/**
 * 暗色主题
 */
export const DarkTheme: Story = {
  render: () => ({
    components: { ContentRenderer },
    template: `
      <div style="padding: 24px; background: #1a1a1a; border-radius: 8px;" data-theme="dark">
        <ContentRenderer
          content="$$\\oint_C \\mathbf{B} \\cdot d\\mathbf{l} = \\mu_0 I_{enc}$$"
          theme="dark"
        />
      </div>
    `,
  }),
};

/**
 * 物理公式集合
 */
export const PhysicsFormulas: Story = {
  render: () => ({
    components: { ContentRenderer },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <section>
          <h4 style="margin: 0 0 8px 0;">牛顿第二定律</h4>
          <ContentRenderer content="$$F = ma$$" />
        </section>

        <section>
          <h4 style="margin: 0 0 8px 0;">万有引力定律</h4>
          <ContentRenderer content="$$F = G\\frac{m_1 m_2}{r^2}$$" />
        </section>

        <section>
          <h4 style="margin: 0 0 8px 0;">薛定谔方程</h4>
          <ContentRenderer content="$$i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi$$" />
        </section>

        <section>
          <h4 style="margin: 0 0 8px 0;">狭义相对论质能关系</h4>
          <ContentRenderer content="$$E^2 = (pc)^2 + (m_0 c^2)^2$$" />
        </section>
      </div>
    `,
  }),
};
