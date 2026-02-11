import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'Aix',
    description: 'Vue 3 企业级组件库',
    lang: 'zh-CN',

    // 部署基础路径（GitLab Pages 部署路径：/docs）
    base: '/docs/',

    // 构建输出目录
    outDir: '../dist/docs',

    // 忽略死链接(临时配置,后续补充完整文档)
    ignoreDeadLinks: true,

    // Head 配置
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
      [
        'meta',
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
    ],

    // 主题配置
    themeConfig: {
      // 网站 Logo
      logo: '/logo.svg',

      // 顶部导航栏
      nav: [
        { text: '指南', link: '/guide/', activeMatch: '/guide/' },
        {
          text: '组件',
          link: '/components/',
          activeMatch: '/components/',
        },
        {
          text: 'API',
          link: '/api/button',
          activeMatch: '/api/',
        },
        {
          text: '示例',
          link: '/examples/basic-usage',
          activeMatch: '/examples/',
        },
      ],

      // 侧边栏
      sidebar: {
        '/guide/': [
          {
            text: '开始',
            items: [
              { text: '简介', link: '/guide/' },
              { text: '快速开始', link: '/guide/getting-started' },
              { text: '安装', link: '/guide/installation' },
            ],
          },
          {
            text: '进阶',
            items: [
              { text: '主题定制', link: '/guide/theme' },
              { text: '主题集成', link: '/guide/theme-integration' },
              { text: '国际化', link: '/guide/i18n' },
              { text: '最佳实践', link: '/guide/best-practices' },
            ],
          },
          {
            text: '开发',
            items: [
              { text: '架构设计', link: '/guide/architecture' },
              { text: '贡献指南', link: '/guide/contributing' },
            ],
          },
        ],

        '/components/': [
          {
            text: '组件总览',
            items: [{ text: '组件列表', link: '/components/' }],
          },
          {
            text: '基础组件',
            items: [
              { text: 'Button 按钮', link: '/components/button' },
              { text: 'Icons 图标', link: '/components/icons' },
            ],
          },
          {
            text: '媒体组件',
            items: [
              { text: 'VideoPlayer 视频播放器', link: '/components/video' },
              { text: 'Subtitle 字幕', link: '/components/subtitle' },
              { text: 'PdfViewer PDF 预览器', link: '/components/pdf-viewer' },
            ],
          },
        ],

        '/api/': [
          {
            text: 'API 参考',
            items: [
              { text: 'Button', link: '/api/button' },
              { text: 'VideoPlayer', link: '/api/video' },
              { text: 'Subtitle', link: '/api/subtitle' },
              { text: 'PdfViewer', link: '/api/pdf-viewer' },
            ],
          },
          {
            text: '工具包',
            items: [
              { text: 'Theme 主题', link: '/api/theme' },
              { text: 'Hooks', link: '/api/hooks' },
            ],
          },
        ],

        '/examples/': [
          {
            text: '使用示例',
            items: [{ text: '基础用法', link: '/examples/basic-usage' }],
          },
        ],
      },

      // 社交链接
      socialLinks: [
        { icon: 'github', link: 'https://github.com/your-org/aix' },
      ],

      // 页脚
      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2025-present AIX Team',
      },

      // 搜索
      search: {
        provider: 'local',
      },

      // 编辑链接
      editLink: {
        pattern: 'https://github.com/your-org/aix/edit/master/docs/:path',
        text: '在 GitHub 上编辑此页',
      },

      // 最后更新时间
      lastUpdated: {
        text: '最后更新',
        formatOptions: {
          dateStyle: 'short',
          timeStyle: 'short',
        },
      },

      // 大纲
      outline: {
        level: [2, 3],
        label: '目录',
      },

      // 文档页脚
      docFooter: {
        prev: '上一页',
        next: '下一页',
      },

      // 移动端菜单
      sidebarMenuLabel: '菜单',
      returnToTopLabel: '返回顶部',
      darkModeSwitchLabel: '主题',
    },

    // Vite 配置
    vite: {
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('../', import.meta.url)),
          // 组件包别名
          '@aix/button': fileURLToPath(
            new URL('../../packages/button/src', import.meta.url),
          ),
          '@aix/icons': fileURLToPath(
            new URL('../../packages/icons/src', import.meta.url),
          ),
          '@aix/video': fileURLToPath(
            new URL('../../packages/video/src', import.meta.url),
          ),
          '@aix/pdf-viewer': fileURLToPath(
            new URL('../../packages/pdf-viewer/src', import.meta.url),
          ),
          '@aix/subtitle': fileURLToPath(
            new URL('../../packages/subtitle/src', import.meta.url),
          ),
          // 工具包别名
          '@aix/theme': fileURLToPath(
            new URL('../../packages/theme/src', import.meta.url),
          ),
          '@aix/hooks': fileURLToPath(
            new URL('../../packages/hooks/src', import.meta.url),
          ),
        },
      },
      optimizeDeps: {
        include: ['mermaid'],
      },
      css: {
        preprocessorOptions: {
          scss: {
            api: 'modern-compiler',
          },
        },
      },
    },

    // Markdown 配置
    markdown: {
      theme: {
        light: 'github-light',
        dark: 'github-dark',
      },
      lineNumbers: true,
    },
  }),
);
