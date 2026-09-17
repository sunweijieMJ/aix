import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { computed, reactive, ref, watchEffect } from 'vue';
import { Menu, MenuGroup, MenuItem, SubMenu, resolveSelectedKey } from '../src';
import type { MenuItemData, MenuProps, MenuSelectPayload } from '../src';
import {
  BellIcon,
  BookIcon,
  ChartIcon,
  EditIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
} from './icons';
import { apiMenuResponseText, parseApiMenuText } from './mock-api-menu';

// ---------- 演示数据 ----------

const baseItems: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  { key: 'workbench', label: '工作台', icon: GridIcon },
  {
    key: 'course',
    type: 'group',
    label: '课程管理',
    children: [
      { key: 'course-list', label: '课程列表', icon: BookIcon },
      { key: 'course-create', label: '新建课程', icon: PlusIcon },
      {
        key: 'course-resource',
        type: 'group',
        label: '课程资源',
        children: [
          { key: 'res-video', label: '视频资源' },
          { key: 'res-doc', label: '文档资源' },
          { key: 'res-archived', label: '已归档资源', disabled: true },
        ],
      },
    ],
  },
  {
    key: 'teaching',
    type: 'group',
    label: '教学中心',
    children: [
      { key: 'live', label: '直播课堂', icon: VideoIcon },
      {
        key: 'homework',
        label: '作业',
        icon: EditIcon,
        children: [
          { key: 'hw-list', label: '作业列表' },
          { key: 'hw-review', label: '批改作业' },
          { key: 'hw-stat', label: '作业统计' },
        ],
      },
      { key: 'students', label: '学生管理', icon: UsersIcon },
    ],
  },
  { key: 'divider-1', type: 'divider' },
  {
    key: 'settings',
    label: '系统设置',
    icon: SettingsIcon,
    children: [
      { key: 'settings-profile', label: '个人资料', icon: UsersIcon },
      { key: 'settings-notify', label: '通知设置', icon: BellIcon },
      { key: 'settings-security', label: '安全设置', icon: SettingsIcon },
    ],
  },
  { key: 'legacy', label: '已停用模块', icon: FolderIcon, disabled: true },
];

const deepItems: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  {
    key: 'l1',
    label: '一级菜单',
    icon: FolderIcon,
    children: [
      { key: 'l2-sibling', label: '二级叶子' },
      {
        key: 'l2',
        label: '二级菜单',
        children: [
          { key: 'l3-sibling', label: '三级叶子' },
          {
            key: 'l3',
            label: '三级菜单',
            children: [
              { key: 'l4-sibling', label: '四级叶子' },
              {
                key: 'l4',
                label: '四级菜单',
                children: [
                  { key: 'l5-a', label: '五级叶子 A' },
                  { key: 'l5-b', label: '五级叶子 B' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const longPopupItems: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  {
    key: 'report',
    label: '周报表',
    icon: ChartIcon,
    children: Array.from({ length: 20 }, (_, index) => ({
      key: `report-${index + 1}`,
      label: `第 ${index + 1} 周`,
    })),
  },
  {
    key: 'archive',
    label: '归档（带图标）',
    icon: FolderIcon,
    children: Array.from({ length: 12 }, (_, index) => ({
      key: `archive-${index + 1}`,
      label: `${2014 + index} 年`,
      icon: FileIcon,
    })),
  },
];

// 对齐设计稿「搜索结果」那张：搜「智慧」时分组标题、组内叶子、选中项、flyout 触发项四种命中同时出现
const highlightItems: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  {
    key: 'smart-teaching',
    type: 'group',
    label: '智慧教学',
    children: [
      { key: 'smart-center', label: '智慧中心', icon: GridIcon },
      { key: 'course-list', label: '课程列表', icon: BookIcon },
    ],
  },
  {
    key: 'smart-supervise',
    type: 'group',
    label: '智慧督导',
    children: [
      { key: 'online-patrol', label: '在线巡课', icon: VideoIcon },
      { key: 'review-task', label: '听评课任务', icon: EditIcon },
    ],
  },
  {
    key: 'classroom',
    type: 'group',
    label: '课堂教学',
    children: [
      { key: 'ai-assistant', label: '智慧助教', icon: BellIcon },
      { key: 'replay', label: '课堂回放', icon: VideoIcon },
    ],
  },
  {
    key: 'report',
    label: '数据报表',
    icon: ChartIcon,
    children: [
      { key: 'report-smart', label: '智慧看板' },
      { key: 'report-daily', label: '日报' },
    ],
  },
];

const flyoutItems: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  {
    key: 'course',
    label: '课程管理',
    icon: BookIcon,
    children: [
      { key: 'course-list', label: '课程列表', icon: FileIcon },
      { key: 'course-create', label: '新建课程', icon: PlusIcon },
      {
        key: 'course-resource',
        label: '课程资源',
        icon: FolderIcon,
        children: [
          {
            key: 'res-video',
            label: '视频',
            children: [
              { key: 'res-video-live', label: '直播回放' },
              { key: 'res-video-record', label: '录播课程' },
              { key: 'res-video-clip', label: '精彩片段' },
            ],
          },
          { key: 'res-doc', label: '文档' },
          { key: 'res-image', label: '图片' },
        ],
      },
    ],
  },
  {
    key: 'report',
    label: '数据报表',
    icon: ChartIcon,
    children: Array.from({ length: 14 }, (_, index) => ({
      key: `report-${index + 1}`,
      label: `第 ${index + 1} 周报表`,
    })),
  },
  {
    key: 'legacy',
    label: '停用模块',
    icon: GridIcon,
    disabled: true,
    children: [{ key: 'legacy-1', label: '不可见' }],
  },
];

const longLabelItems: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  {
    key: 'course',
    type: 'group',
    label: '课程管理与教学资源建设分组',
    children: [
      { key: 'c1', label: '2025-2026 学年春季学期在线课程列表', icon: BookIcon },
      { key: 'c2', label: '新建课程', icon: PlusIcon },
      {
        key: 'c3',
        label: '课程资源库（含视频、文档、图片、音频等多媒体资源）',
        icon: FolderIcon,
        children: [
          { key: 'c3-1', label: '视频资源库（直播回放与录播）' },
          { key: 'c3-2', label: '文档' },
        ],
      },
    ],
  },
  { key: 'notice', label: '教务处关于期末考试安排的紧急通知', icon: BellIcon },
];

const headerTemplate = `
  <template #header>
    <div style="display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; font-weight: 600;">
      <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 6px; background: #00c261;"></span>
      <span>AIX 教务</span>
    </div>
  </template>
`;

const footerTemplate = `
  <template #footer>
    <div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #00c261; color: #fff; font-size: 12px; font-weight: 600;">孙</span>
      <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">孙伟杰</span>
      <LogoutIcon />
    </div>
  </template>
`;

// ---------- Meta ----------

const meta: Meta<typeof Menu> = {
  title: 'Menu',
  // 泛型 SFC 的导出是函数签名，Storybook 的 component 字段只认 ConcreteComponent，按字段类型断言
  component: Menu as unknown as Meta<typeof Menu>['component'],
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '竖向侧边栏菜单。支持 items 数据驱动与 Menu / MenuGroup / SubMenu / MenuItem 复合组件两种写法，' +
          '内联可折叠分组、右侧级联 flyout 子菜单、四套内置主题、右边缘拖拽调宽与完整键盘导航。',
      },
    },
  },
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="height: 560px; display: flex; align-items: stretch;"><story /></div>',
    }),
  ],
  args: {
    onSelect: fn(),
    'onOpen-change': fn(),
    onSearch: fn(),
  },
  argTypes: {
    theme: {
      control: 'select',
      options: ['gray', 'white', 'glass-light', 'glass-dark'],
      description: '配色主题；传入其他字符串时由业务自定义 `--aix-menu-*` 变量',
      table: {
        type: { summary: 'MenuTheme' },
        defaultValue: { summary: 'gray' },
      },
    },
    accordion: {
      control: 'boolean',
      description: '同一层级的分组只允许展开一个',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    resizable: {
      control: 'boolean',
      description: '是否允许拖拽右边缘调整宽度',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    width: {
      control: 'number',
      description:
        '宽度（px，v-model:width）。未传、非 resizable 且无持久化存值时不设内联宽度，由外层布局决定；resizable 但未传时从 200 起算',
      table: { type: { summary: 'number' } },
    },
    minWidth: {
      control: 'number',
      description: '可拖拽的最小宽度（px）',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '150' },
      },
    },
    maxWidth: {
      control: 'number',
      description: '可拖拽的最大宽度（px）',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '300' },
      },
    },
    popupMaxVisible: {
      control: 'number',
      description: 'flyout 单层最多可见项数，超出后弹层内部滚动',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '9' },
      },
    },
    popupPlacement: {
      control: 'select',
      options: ['right-start', 'right', 'right-end', 'left-start', 'left', 'left-end'],
      description: 'flyout 弹层位置',
      table: {
        type: { summary: 'MenuPopupPlacement' },
        defaultValue: { summary: 'right-start' },
      },
    },
    popupClass: {
      control: 'text',
      description: '追加到所有 flyout 弹层根节点的 class',
      table: { type: { summary: 'string' } },
    },
    popupTeleportTo: {
      control: false,
      description: 'flyout 弹层的挂载目标；false 时就地渲染并按 fixed 定位',
      table: {
        type: { summary: 'string | HTMLElement | false' },
        defaultValue: { summary: 'body' },
      },
    },
    widthStorageKey: {
      control: 'text',
      description: '宽度持久化的 localStorage 键；读回的宽度不要求开启 resizable 也生效',
      table: { type: { summary: 'string' } },
    },
    searchable: {
      control: 'boolean',
      description:
        '是否显示内置搜索框（位于 header 插槽之下、列表之上）；只决定搜索框渲染，过滤由 searchValue 驱动',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    searchValue: {
      control: 'text',
      description:
        '搜索关键字（v-model:searchValue），非空时按 label 过滤 items 并按命中位置展开分组，不依赖 searchable',
      table: { type: { summary: 'string' } },
    },
    searchPlaceholder: {
      control: 'text',
      description: '搜索框占位文案，默认取语言包',
      table: { type: { summary: 'string' } },
    },
    searchClearable: {
      control: 'boolean',
      description: '搜索框有关键字时，右侧显示可点击的清除按钮',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    searchHighlight: {
      control: 'boolean',
      description:
        '搜索时给命中文字标色；命中项藏在 flyout 弹层里时子菜单触发项在箭头前显示提示圆点，圆点只对 items 数据驱动写法生效',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    filterMethod: {
      control: false,
      description: '自定义匹配规则；默认对 label 做不区分大小写的包含匹配',
      table: { type: { summary: '(item: MenuItemData, keyword: string) => boolean' } },
    },
    selectedKey: {
      control: 'text',
      description: '当前选中项 key（v-model:selectedKey）',
      table: { type: { summary: 'string' } },
    },
    openKeys: {
      control: 'object',
      description: '展开的分组 key 列表（v-model:openKeys）',
      table: { type: { summary: 'string[]' } },
    },
    defaultOpenKeys: {
      control: 'object',
      description: '非受控模式下的展开分组；用户手动操作分组之前，它的变化会重新应用',
      table: { type: { summary: 'string[]' } },
    },
    items: {
      control: false,
      description: '数据驱动的菜单结构',
      table: { type: { summary: 'MenuItemData[]' } },
    },
    onSelect: {
      description: '用户点击叶子项',
      table: { type: { summary: '(payload: MenuSelectPayload) => void' } },
    },
    'onOpen-change': {
      description: '分组展开状态变化',
      table: { type: { summary: '(keys: string[]) => void' } },
    },
    onSearch: {
      description: '搜索关键字变化（已 trim）',
      table: { type: { summary: '(keyword: string) => void' } },
    },
    'onUpdate:selectedKey': {
      description: '选中项变化（v-model:selectedKey）',
      table: { type: { summary: '(key: string) => void' } },
    },
    'onUpdate:openKeys': {
      description: '展开的分组列表变化（v-model:openKeys）',
      table: { type: { summary: '(keys: string[]) => void' } },
    },
    'onUpdate:width': {
      description: '宽度变化（v-model:width），拖拽过程中持续触发',
      table: { type: { summary: '(width: number) => void' } },
    },
    'onUpdate:searchValue': {
      description: '搜索框文本变化（v-model:searchValue）',
      table: { type: { summary: '(value: string) => void' } },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;
type StoryArgs = MenuProps & {
  onSelect: ReturnType<typeof fn>;
  'onOpen-change': ReturnType<typeof fn>;
  onSearch: ReturnType<typeof fn>;
};

// ---------- Stories ----------

/**
 * 数据驱动：一级分组、二级子分组、分割线、flyout 子菜单、禁用项，
 * header 放 logo、`searchable` 开启内置搜索框、footer 放用户行。点选叶子后 `aria-current="page"`，点击分组标题折叠。
 */
export const Default: Story = {
  args: {
    width: 200,
    theme: 'gray',
    accordion: false,
    resizable: false,
    searchable: true,
  },
  render: (args) => ({
    components: { Menu, LogoutIcon },
    setup() {
      return { args, items: baseItems };
    },
    template: `
      <Menu v-bind="args" :items="items">
        ${headerTemplate}
        ${footerTemplate}
      </Menu>
    `,
  }),
  play: async ({ canvas, args: _args }) => {
    const args = _args as StoryArgs;

    const item = canvas.getByRole('button', { name: '课程列表' });
    await expect(item).not.toHaveAttribute('aria-current');
    await userEvent.click(item);
    await expect(item).toHaveAttribute('aria-current', 'page');
    await expect(args.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'course-list', keyPath: ['course', 'course-list'] }),
    );

    const groupTitle = canvas.getByRole('button', { name: '课程管理' });
    await expect(groupTitle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(groupTitle);
    await expect(groupTitle).toHaveAttribute('aria-expanded', 'false');
    await expect(args['onOpen-change']).toHaveBeenCalled();
  },
};

/**
 * 内置搜索：`searchable` 显示搜索框，关键字非空时按 label 过滤 `items`（自身匹配保留整棵子树，
 * 否则只保留有匹配后代的节点），分组按命中位置展开：后代里有命中的展开，只有标题命中的收起（点标题仍可展开），无结果显示「暂无匹配结果」。
 * Esc 清空关键字并阻止冒泡，放在 Modal / Drawer 里不会连带关闭外层。
 * 这里用 `filterMethod` 额外匹配 `meta.keywords`，输入 `course` 也能命中「课程管理」。
 */

export const Search: Story = {
  args: {
    width: 200,
    searchable: true,
    searchPlaceholder: '搜索菜单',
  },
  // searchValue 由 story 内部受控演示，面板上的同名控件不会生效
  argTypes: { searchValue: { control: false } },
  render: (args) => ({
    components: { Menu },
    setup() {
      const items: MenuItemData[] = [
        { key: 'home', label: '首页', icon: HomeIcon, meta: { keywords: ['home'] } },
        {
          key: 'course',
          type: 'group',
          label: '课程管理',
          meta: { keywords: ['course'] },
          children: [
            { key: 'course-list', label: '课程列表', icon: BookIcon },
            { key: 'course-create', label: '新建课程', icon: PlusIcon },
            {
              key: 'course-resource',
              type: 'group',
              label: '课程资源',
              children: [
                { key: 'res-video', label: '视频资源', meta: { keywords: ['video'] } },
                { key: 'res-doc', label: '文档资源', meta: { keywords: ['doc'] } },
              ],
            },
          ],
        },
        {
          key: 'teaching',
          type: 'group',
          label: '教学中心',
          meta: { keywords: ['teaching'] },
          children: [
            { key: 'live', label: '直播课堂', icon: VideoIcon, meta: { keywords: ['live'] } },
            {
              key: 'homework',
              label: '作业',
              icon: EditIcon,
              meta: { keywords: ['homework'] },
              children: [
                { key: 'hw-list', label: '作业列表' },
                { key: 'hw-review', label: '批改作业' },
              ],
            },
          ],
        },
        { key: 'divider-1', type: 'divider' },
        {
          key: 'settings',
          label: '系统设置',
          icon: SettingsIcon,
          meta: { keywords: ['settings'] },
        },
      ];
      const searchValue = ref('');
      const selectedKey = ref('course-list');

      function filterMethod(item: MenuItemData, keyword: string) {
        const lower = keyword.toLowerCase();
        const keywords = (item.meta?.keywords as string[] | undefined) ?? [];
        return (
          (item.label ?? '').toLowerCase().includes(lower) ||
          keywords.some((word) => word.includes(lower))
        );
      }

      return { args, items, searchValue, selectedKey, filterMethod };
    },
    template: `
      <Menu
        v-bind="args"
        :items="items"
        :filter-method="filterMethod"
        v-model:searchValue="searchValue"
        v-model:selectedKey="selectedKey"
      />
      <div style="display: flex; flex-direction: column; gap: 12px; padding: 16px 24px; color: #4e5969; font-size: 13px; line-height: 1.8;">
        <div>searchValue：<code>{{ JSON.stringify(searchValue) }}</code></div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button type="button" @click="searchValue = '课程'">搜「课程」</button>
          <button type="button" @click="searchValue = 'live'">搜「live」（命中 meta.keywords）</button>
          <button type="button" @click="searchValue = ''">清空</button>
        </div>
        <p style="margin: 0; color: #86909c;">分组按命中位置展开；分割线不参与匹配；Esc 清空关键字且不冒泡到外层。</p>
      </div>
    `,
  }),
  play: async ({ canvas, args: _args }) => {
    const args = _args as StoryArgs;
    const input = canvas.getByRole('textbox', { name: '搜索菜单' });

    await userEvent.type(input, '课程');
    await expect(args.onSearch).toHaveBeenLastCalledWith('课程');
    await expect(canvas.queryByRole('button', { name: '首页' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: '直播课堂' })).toBeNull();
    await expect(canvas.getByRole('button', { name: '课程管理' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(canvas.getByRole('button', { name: '课程列表' })).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, 'course');
    await expect(canvas.getByRole('button', { name: '课程管理' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: '首页' })).toBeNull();

    await userEvent.clear(input);
    await userEvent.type(input, 'zzz');
    await expect(canvas.getByText('暂无匹配结果')).toBeInTheDocument();

    await userEvent.clear(input);
    await expect(canvas.getByRole('button', { name: '首页' })).toBeInTheDocument();
  },
};

/**
 * 四套内置主题并排。glass 两套依赖 `backdrop-filter`，放在有图案的容器里才能看到毛玻璃效果。
 *
 * 四套都开了 `searchable`，可以逐个对比搜索框的五态：默认 → 悬停 → 聚焦（加 1px 描边）→
 * 有关键字 → 有关键字再悬停。各态取值都是每主题一份，见 `--aix-menu-search-*`。
 */

export const Themes: Story = {
  // 四套主题并排对比，render 不接 args，面板上的控件一律不生效
  parameters: { controls: { disable: true } },
  render: () => ({
    components: { Menu },
    setup() {
      const solidThemes = ['gray', 'white'];
      const glassThemes = ['glass-light', 'glass-dark'];
      const selected = reactive<Record<string, string>>({
        gray: 'course-list',
        white: 'course-list',
        'glass-light': 'course-list',
        'glass-dark': 'course-list',
      });
      return { items: baseItems, solidThemes, glassThemes, selected };
    },
    template: `
      <div style="display: flex; gap: 24px; width: 100%; height: 100%;">
        <div
          v-for="theme in solidThemes"
          :key="theme"
          style="display: flex; flex-direction: column; gap: 8px;"
        >
          <code style="font-size: 12px;">theme="{{ theme }}"</code>
          <div style="display: flex; flex: 1; min-height: 0; border: 1px solid #e5e6eb; border-radius: 8px; overflow: hidden;">
            <Menu :theme="theme" :items="items" :width="200" searchable v-model:selectedKey="selected[theme]" />
          </div>
        </div>
        <div
          style="
            display: flex; flex: 1; gap: 24px; padding: 24px; border-radius: 12px;
            background:
              radial-gradient(circle at 18% 28%, rgb(255 255 255 / 0.95) 0 70px, transparent 71px),
              radial-gradient(circle at 72% 72%, rgb(255 214 102 / 0.95) 0 110px, transparent 111px),
              radial-gradient(circle at 88% 18%, rgb(255 120 160 / 0.95) 0 60px, transparent 61px),
              repeating-linear-gradient(135deg, rgb(255 255 255 / 0.18) 0 10px, transparent 10px 26px),
              linear-gradient(135deg, #1e3a8a, #7c3aed 45%, #0ea5e9);
          "
        >
          <div
            v-for="theme in glassThemes"
            :key="theme"
            style="display: flex; flex-direction: column; gap: 8px;"
          >
            <code style="font-size: 12px; color: #fff;">theme="{{ theme }}"</code>
            <div style="display: flex; flex: 1; min-height: 0; border-radius: 8px; overflow: hidden;">
              <Menu :theme="theme" :items="items" :width="200" searchable v-model:selectedKey="selected[theme]" />
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 有 `children` 的普通节点自动成为 flyout 子菜单：悬停从右侧级联弹出，可多级；点击触发项只打开。
 * 关闭通道：指针离开弹层、点击弹层链之外的任意位置、← / Esc、选中叶子；触屏点击打开后点击外部即可关闭。
 * 「数据报表」有 14 项，超过 `popupMaxVisible`（默认 9）后弹层内部滚动；
 * 子项带图标时弹层宽 182px，否则 158px。禁用的子菜单不会弹出。
 */

export const Flyout: Story = {
  args: {
    width: 200,
    popupMaxVisible: 9,
    popupPlacement: 'right-start',
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: flyoutItems };
    },
    template: `
      <Menu v-bind="args" :items="items" />
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px; line-height: 1.8;">
        <p style="margin: 0;">悬停「课程管理 → 课程资源 → 视频」查看三级级联。</p>
        <p style="margin: 0;">悬停「数据报表」查看超出 {{ args.popupMaxVisible }} 项后的内部滚动。</p>
        <p style="margin: 0;">键盘：↑↓ 移动焦点，→ 打开子菜单，← / Esc 关闭。</p>
        <p style="margin: 0;">点击弹层链之外的任意位置也会关闭，触屏上点击触发项打开后点击外部即可收起。</p>
      </div>
    `,
  }),
};

/**
 * 拖拽右边缘调整宽度，`v-model:width` 同步；把手获得焦点后 ← / → 每次调整 10px。
 * 拖拽时把手捕获指针，拖到浏览器窗口外释放也会正常结束；拖拽中组件卸载会还原 body 样式。
 */

export const Resizable: Story = {
  args: {
    resizable: true,
    searchable: true,
    minWidth: 150,
    maxWidth: 300,
  },
  render: (args) => ({
    components: { Menu, LogoutIcon },
    setup() {
      const width = ref(200);
      return { args, width, items: baseItems };
    },
    template: `
      <Menu v-bind="args" :items="items" v-model:width="width">
        ${headerTemplate}
        ${footerTemplate}
      </Menu>
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px; line-height: 1.8;">
        <p style="margin: 0;">当前宽度：<strong style="color: #1d2129;">{{ width }}px</strong></p>
        <p style="margin: 0;">悬停右边缘出现指示线，拖拽范围 {{ args.minWidth }} ~ {{ args.maxWidth }}px。</p>
      </div>
    `,
  }),
};

/**
 * 复合组件写法：用 MenuGroup / SubMenu / MenuItem 手写结构，可与 `items` 混用（渲染在 items 之后）。
 * `selectedKey` 指向 flyout 内的叶子时祖先 SubMenu 同样高亮，flyout 未展开也成立。
 */

export const Compound: Story = {
  args: {
    width: 200,
  },
  render: (args) => ({
    components: { Menu, MenuGroup, MenuItem, SubMenu },
    setup() {
      const selectedKey = ref('course-list');
      return {
        args,
        selectedKey,
        HomeIcon,
        BookIcon,
        PlusIcon,
        VideoIcon,
        EditIcon,
        SettingsIcon,
        UsersIcon,
        BellIcon,
      };
    },
    template: `
      <Menu v-bind="args" v-model:selectedKey="selectedKey">
        <MenuItem item-key="home" label="首页" :icon="HomeIcon" />
        <MenuGroup group-key="course" title="课程管理">
          <MenuItem item-key="course-list" label="课程列表" :icon="BookIcon" />
          <MenuItem item-key="course-create" label="新建课程" :icon="PlusIcon" />
          <MenuGroup group-key="course-resource" title="课程资源">
            <MenuItem item-key="res-video" label="视频资源" />
            <MenuItem item-key="res-doc" label="文档资源" />
          </MenuGroup>
        </MenuGroup>
        <MenuGroup group-key="teaching" title="教学中心">
          <MenuItem item-key="live" label="直播课堂" :icon="VideoIcon" />
          <SubMenu item-key="homework" label="作业" :icon="EditIcon">
            <MenuItem item-key="hw-list" label="作业列表" />
            <MenuItem item-key="hw-review" label="批改作业" />
          </SubMenu>
        </MenuGroup>
        <SubMenu item-key="settings" label="系统设置" :icon="SettingsIcon" popup-with-icon>
          <MenuItem item-key="settings-profile" label="个人资料" :icon="UsersIcon" />
          <MenuItem item-key="settings-notify" label="通知设置" :icon="BellIcon" />
        </SubMenu>
        <MenuItem item-key="legacy" label="已停用模块" disabled />
      </Menu>
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px;">
        selectedKey：<code>{{ selectedKey }}</code>
      </div>
    `,
  }),
};

/**
 * 受控模式：`v-model:selectedKey` + `v-model:openKeys`，外部按钮改值时菜单同步展开选中项所在分组；
 * 右侧记录 `select` 与 `open-change` 事件。
 */

export const Controlled: Story = {
  args: {
    width: 200,
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      const selectedKey = ref('course-list');
      const openKeys = ref<string[]>(['course']);
      const logs = ref<string[]>([]);
      const allGroups = ['course', 'course-resource', 'teaching'];

      function onSelect(payload: MenuSelectPayload) {
        logs.value.unshift(`select → ${payload.key}（keyPath: ${payload.keyPath.join(' / ')}）`);
      }
      function onOpenChange(keys: string[]) {
        logs.value.unshift(`open-change → [${keys.join(', ')}]`);
      }

      return {
        args,
        items: baseItems,
        selectedKey,
        openKeys,
        logs,
        allGroups,
        onSelect,
        onOpenChange,
      };
    },
    template: `
      <Menu
        v-bind="args"
        :items="items"
        v-model:selectedKey="selectedKey"
        v-model:openKeys="openKeys"
        @select="onSelect"
        @open-change="onOpenChange"
      />
      <div style="display: flex; flex: 1; flex-direction: column; gap: 12px; min-width: 0; padding: 16px 24px; font-size: 13px; color: #4e5969;">
        <div>selectedKey：<code>{{ selectedKey }}</code></div>
        <div>openKeys：<code>{{ JSON.stringify(openKeys) }}</code></div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button type="button" @click="selectedKey = 'live'">选中「直播课堂」</button>
          <button type="button" @click="selectedKey = 'hw-list'">选中「作业列表」（flyout 内）</button>
          <button type="button" @click="selectedKey = 'res-doc'">选中「文档资源」（二级分组内）</button>
          <button type="button" @click="openKeys = []">全部收起</button>
          <button type="button" @click="openKeys = allGroups">全部展开</button>
        </div>
        <ol style="flex: 1; margin: 0; padding: 12px 12px 12px 32px; overflow: auto; border: 1px solid #e5e6eb; border-radius: 8px; font-family: monospace; font-size: 12px; line-height: 1.8;">
          <li v-for="(log, index) in logs" :key="logs.length - index">{{ log }}</li>
          <li v-if="!logs.length" style="list-style: none; margin-left: -20px; color: #86909c;">点击菜单项或分组标题查看事件</li>
        </ol>
      </div>
    `,
  }),
};

/**
 * 手风琴：同一层级的分组只保留一个展开，`defaultOpenKeys` 指定初始展开的分组。
 */

export const Accordion: Story = {
  args: {
    width: 200,
    accordion: true,
    defaultOpenKeys: ['course'],
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: baseItems };
    },
    template: '<Menu v-bind="args" :items="items" />',
  }),
  play: async ({ canvas }) => {
    const course = canvas.getByRole('button', { name: '课程管理' });
    const teaching = canvas.getByRole('button', { name: '教学中心' });
    await expect(course).toHaveAttribute('aria-expanded', 'true');
    await expect(teaching).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(teaching);
    await expect(teaching).toHaveAttribute('aria-expanded', 'true');
    await expect(course).toHaveAttribute('aria-expanded', 'false');
  },
};

/**
 * 长文案单行省略，被截断时悬停显示完整 Tooltip；分组标题同样省略并提示。
 */

export const LongLabel: Story = {
  args: {
    width: 180,
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: longLabelItems };
    },
    template: `
      <Menu v-bind="args" :items="items" />
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px;">
        悬停被截断的菜单项查看 Tooltip。
      </div>
    `,
  }),
};

/**
 * 自定义插槽：`item`（作用域 `{ item, groupLevel, inPopup, active }`）、`icon`、`group-title`，
 * 以及 `header` / `footer`（内置搜索框渲染在 header 之下）。`item.meta` 是业务透传字段，这里用来放角标数。
 */

export const CustomSlots: Story = {
  args: {
    width: 220,
  },
  render: (args) => ({
    components: { Menu, LogoutIcon },
    setup() {
      const items: MenuItemData[] = [
        { key: 'home', label: '首页', icon: HomeIcon },
        {
          key: 'course',
          type: 'group',
          label: '课程管理',
          children: [
            { key: 'course-list', label: '课程列表', icon: BookIcon, meta: { badge: 12 } },
            { key: 'course-create', label: '新建课程', icon: PlusIcon },
          ],
        },
        {
          key: 'teaching',
          type: 'group',
          label: '教学中心',
          children: [
            { key: 'live', label: '直播课堂', icon: VideoIcon, meta: { badge: 3 } },
            { key: 'students', label: '学生管理', icon: UsersIcon },
          ],
        },
        { key: 'notice', label: '通知', icon: BellIcon, meta: { badge: 99 } },
      ];
      const selectedKey = ref('course-list');
      return { args, items, selectedKey };
    },
    template: `
      <Menu v-bind="args" :items="items" searchable v-model:selectedKey="selectedKey">
        ${headerTemplate}
        <template #group-title="{ item }">
          <span>{{ item.label }}</span>
          <span style="margin-left: 6px; color: #c9cdd4; font-size: 12px;">{{ item.children?.length ?? 0 }}</span>
        </template>
        <template #icon="{ item }">
          <span
            :style="{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              background: item.key === selectedKey ? '#00c261' : '#c9cdd4',
            }"
          />
        </template>
        <template #item="{ item, active }">
          <span style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
            <span style="overflow: hidden; text-overflow: ellipsis;">{{ item.label }}</span>
            <span
              v-if="item.meta?.badge"
              :style="{
                flex: 'none',
                minWidth: '18px',
                padding: '0 5px',
                borderRadius: '9px',
                background: active ? '#00c261' : '#f53f3f',
                color: '#fff',
                fontSize: '11px',
                lineHeight: '18px',
                textAlign: 'center',
              }"
            >{{ item.meta.badge }}</span>
          </span>
        </template>
        ${footerTemplate}
      </Menu>
    `,
  }),
};

/**
 * 自定义主题：`theme` 传任意字符串，组件追加 `aix-menu--<name>` / `aix-menu-popup--<name>` 修饰类，
 * 业务在这两个选择器下声明 `--aix-menu-*` 变量即可。
 */

export const CustomTheme: Story = {
  args: {
    width: 200,
    theme: 'brand',
    searchable: true,
  },
  render: (args) => ({
    components: { Menu, LogoutIcon },
    setup() {
      const selectedKey = ref('course-list');
      return { args, items: baseItems, selectedKey };
    },
    template: `
      <component :is="'style'">
        .aix-menu--brand,
        .aix-menu-popup--brand {
          --aix-menu-bg: #0f172a;
          --aix-menu-item-color: #cbd5e1;
          --aix-menu-item-bg-hover: rgb(255 255 255 / 0.08);
          --aix-menu-item-bg-active: #2563eb;
          --aix-menu-item-color-highlight: #93c5fd;
          --aix-menu-item-color-active: #fff;
          --aix-menu-item-color-disabled: rgb(203 213 225 / 0.35);
          --aix-menu-group-title-color: #64748b;
          --aix-menu-divider-color: rgb(255 255 255 / 0.12);
          --aix-menu-focus-ring-color: #60a5fa;
          --aix-menu-resize-indicator-color: #60a5fa;
          --aix-menu-popup-bg: #1e293b;
          --aix-menu-popup-item-color: #cbd5e1;
          --aix-menu-popup-item-bg-hover: rgb(255 255 255 / 0.08);
          --aix-menu-popup-item-bg-active: #2563eb;
          --aix-menu-popup-item-color-active: #fff;
          --aix-menu-popup-scrollbar-color: rgb(255 255 255 / 0.2);
          --aix-menu-scrollbar-color: rgb(255 255 255 / 0.2);
          --aix-menu-search-bg: rgb(255 255 255 / 0.06);
          --aix-menu-search-bg-hover: rgb(255 255 255 / 0.12);
          --aix-menu-search-bg-focus: rgb(255 255 255 / 0.06);
          --aix-menu-search-border-color-focus: #60a5fa;
          --aix-menu-search-color: #f1f5f9;
          --aix-menu-search-icon-color: #94a3b8;
          --aix-menu-search-placeholder-color: #64748b;
          --aix-menu-radius: 6px;
        }
      </component>
      <Menu v-bind="args" :items="items" v-model:selectedKey="selectedKey">
        ${headerTemplate}
        ${footerTemplate}
      </Menu>
    `,
  }),
};

/**
 * 弹层内可见项数由 `popupMaxVisible` 决定（默认 9），超出后弹层内部滚动，滚动条为 4px 细滑块。
 * 弹层宽度随子项是否带图标切换：不带图标 158px，带图标 182px。
 */

export const PopupScroll: Story = {
  args: {
    width: 200,
    popupMaxVisible: 9,
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: longPopupItems };
    },
    template: `
      <Menu v-bind="args" :items="items" />
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px; line-height: 1.8;">
        <p style="margin: 0;">「周报表」20 项、「归档」12 项，均超过 {{ args.popupMaxVisible }}。</p>
        <p style="margin: 0;">调 Controls 里的 popupMaxVisible 可直接看到弹层高度变化。</p>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByRole('button', { name: '周报表' }));

    const list = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.aix-menu-popup__list');
      if (!el) throw new Error('弹层未打开');
      return el;
    });
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  },
};

/**
 * flyout 可无限级联，每一级都是独立弹层：悬停逐级展开，指针在整条弹层链内移动都不会关闭；
 * ← / Esc 回退一级并把焦点还给触发项，选中叶子后整条链一起收起。
 */

export const DeepNesting: Story = {
  args: {
    width: 200,
    popupPlacement: 'right-start',
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: deepItems };
    },
    template: `
      <Menu v-bind="args" :items="items" />
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px; line-height: 1.8;">
        <p style="margin: 0;">悬停「一级菜单」后沿着弹层一路往里，共五级。</p>
        <p style="margin: 0;">空间不足时 floating-ui 会自动翻转到左侧。</p>
      </div>
    `,
  }),
  play: async ({ canvas, canvasElement }) => {
    const body = within(document.body);
    const popups = () => Array.from(document.querySelectorAll<HTMLElement>('.aix-menu-popup'));

    await userEvent.hover(canvas.getByRole('button', { name: '一级菜单' }));
    await waitFor(() => expect(popups()).toHaveLength(1));

    await userEvent.hover(await body.findByRole('button', { name: '二级菜单' }));
    await waitFor(() => expect(popups()).toHaveLength(2));

    await userEvent.hover(await body.findByRole('button', { name: '三级菜单' }));
    await waitFor(() => expect(popups()).toHaveLength(3));

    // 留白由 --aix-menu-popup-offset 给出，量的是容器边缘到弹层，不是触发项到弹层；
    // 空间不足时弹层会翻到左侧，两侧间隙取大的那个。三级之后窄视口会被 shift 压回边缘，不参与断言
    const menu = canvasElement.querySelector<HTMLElement>('.aix-menu')!;
    const gap = (a: DOMRect, b: DOMRect) => Math.max(b.left - a.right, a.left - b.right);
    const [level1, level2] = popups().map((el) => el.getBoundingClientRect());

    await expect(gap(menu.getBoundingClientRect(), level1!)).toBeCloseTo(4, 0);
    await expect(gap(level1!, level2!)).toBeCloseTo(4, 0);
  },
};

/**
 * `searchClearable`（默认开启）在关键字非空时于搜索框右侧显示清除按钮，
 * 点击清空关键字、还原列表，焦点留在输入框里，便于继续输入。
 */

export const SearchClear: Story = {
  args: {
    width: 220,
    searchable: true,
    searchClearable: true,
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: baseItems };
    },
    template: `
      <Menu v-bind="args" :items="items" />
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px; line-height: 1.8;">
        <p style="margin: 0;">输入关键字后，搜索框右侧出现清除按钮。</p>
        <p style="margin: 0;">Esc 与清除按钮等效，都会清空关键字且保持焦点。</p>
      </div>
    `,
  }),
  play: async ({ canvas, args: _args }) => {
    const args = _args as StoryArgs;
    const input = canvas.getByRole('textbox');

    await expect(canvas.queryByRole('button', { name: '清除搜索关键字' })).toBeNull();

    await userEvent.type(input, '课程');
    await waitFor(() => expect(args.onSearch).toHaveBeenCalledWith('课程'));

    const clear = canvas.getByRole('button', { name: '清除搜索关键字' });
    await userEvent.click(clear);

    await expect(input).toHaveValue('');
    await expect(input).toHaveFocus();
    await expect(canvas.queryByRole('button', { name: '清除搜索关键字' })).toBeNull();
  },
};

/**
 * `searchHighlight`（默认开启）管两件事：
 *
 * 1. **命中文字标色**——label 里匹配到的片段包进 `<mark>`，取 `--aix-menu-item-color-highlight`（设计稿 `#1546F2`）。
 *    分组标题、内联分组里的叶子项、选中项、flyout 触发项一视同仁；文案被插槽接管时不插手。
 * 2. **提示圆点**——命中项落在 flyout 弹层里时列表上看不见，只剩触发项孤零零留着，
 *    此时在触发项箭头前显示一颗圆点（同样取 `--aix-menu-item-color-highlight`），提示「命中在这条里面」。
 *    自身命中则不显示，它本来就看得见。
 *
 * 命中色每套主题各一份。搜「智慧」可一次看全四种情形：
 *
 * | 节点 | 结果 |
 * |------|------|
 * | 分组「智慧教学」 | 标题命中且子项也命中 → 标题标色，分组展开 |
 * | 分组「智慧督导」 | 只有标题命中 → 标题标色，分组收起（子项与关键字无关），点标题可展开 |
 * | 叶子「智慧中心」 | 自身命中 → 文字标色；同时是选中项，标色叠在选中底色上 |
 * | 分组「课堂教学」 | 标题没命中、子项「智慧助教」命中 → 标题不标色，只保留命中的子项 |
 * | 子菜单「数据报表」 | 命中的「智慧看板」在弹层里 → 触发项箭头前显示圆点，文字上没有 mark |
 */

export const SearchHighlight: Story = {
  args: {
    width: 220,
    searchable: true,
    searchHighlight: true,
    searchPlaceholder: '试试输入「智慧」',
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      const selected = ref('smart-center');
      return { args, items: highlightItems, selected };
    },
    template: `
      <Menu v-bind="args" :items="items" v-model:selectedKey="selected" />
      <div style="padding: 16px 24px; color: #86909c; font-size: 13px; line-height: 1.8;">
        <p style="margin: 0;">输入「智慧」：分组标题、组内叶子、选中项里的「智慧」两字都标色。</p>
        <p style="margin: 0;">「智慧督导」只有标题命中，分组收起；点标题仍能展开看全部。</p>
        <p style="margin: 0;">「课堂教学」标题没命中，只留下命中的「智慧助教」，标题不标色。</p>
        <p style="margin: 0;">「数据报表」命中的是弹层里的「智慧看板」，箭头前的圆点代替文字标色。</p>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox');
    const markIn = (name: string) =>
      canvas.getByRole('button', { name }).querySelector('mark.aix-menu-highlight');

    await userEvent.type(input, '智慧');
    await waitFor(() => expect(markIn('智慧教学')).toHaveTextContent('智慧'));

    // 内联分组：标题与组内叶子都标色，选中项也不例外
    await expect(markIn('智慧中心')).toHaveTextContent('智慧');
    await expect(canvas.getByRole('button', { name: '智慧中心' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // 只有标题命中的分组收起，点一下仍能展开
    const supervise = canvas.getByRole('button', { name: '智慧督导' });
    await expect(markIn('智慧督导')).toHaveTextContent('智慧');
    await expect(supervise).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(supervise);
    await waitFor(() => expect(supervise).toHaveAttribute('aria-expanded', 'true'));

    // 靠后代才留下的分组，标题本身不标色
    await expect(canvas.getByRole('button', { name: '智慧教学' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(markIn('课堂教学')).toBeNull();
    await expect(markIn('智慧助教')).toHaveTextContent('智慧');

    // 命中藏在弹层里：箭头前显示圆点，文字上没有 mark
    const report = canvas.getByRole('button', { name: '数据报表' });
    await expect(report.querySelector('.aix-menu-submenu__dot')).not.toBeNull();
    await expect(report.querySelector('mark.aix-menu-highlight')).toBeNull();

    await userEvent.clear(input);
    await waitFor(() => expect(markIn('智慧教学')).toBeNull());
  },
};

/**
 * 真实业务接口的数据接进来长什么样，**右侧文本框可以直接换成你自己的接口响应**，边贴边看渲染结果。
 * 接口响应整体（含 `data` 字段）和 `data` 数组本身都认，解析失败会提示原因并保留上一份能渲染的数据。
 *
 * 响应里每个节点靠 `resourceType` 区分：`directory` 是分类，`menu` 是可点击的页面；另外带
 * `sort`（同级排序）、`select`（有无权限）和一组路由字段（`menuType` / `menuUrl` / `redirectUrl` / `microApp*`）。
 *
 * 适配器在 `stories/mock-api-menu.ts`，规则四条：
 *
 * 1. 丢掉 `select === false` 的节点（字段缺省按有权限处理）
 * 2. 同级按 `sort` 升序（缺省按 0）
 * 3. **顶层 `directory` 铺成内联分组，更深层的 `directory` 收进 flyout 子菜单**——
 *    内联分组只有一层样式，套起来两层标题一模一样、读不出层级，弹层才表达得出来
 * 4. 路由字段原样塞进 `meta`，随 `select` 事件回传，业务拿它去跳转
 *
 * 图标用的是占位图标（按 `menuIcon` 的值散列），业务侧换成自己的图标字体组件即可。
 */

export const RealData: Story = {
  args: {
    width: 240,
    searchable: true,
    searchPlaceholder: '搜索菜单',
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      const raw = ref(apiMenuResponseText);
      const items = ref<MenuItemData[]>([]);
      const error = ref('');

      watchEffect(() => {
        const result = parseApiMenuText(raw.value);
        if ('error' in result) {
          error.value = result.error;
          return;
        }
        error.value = '';
        items.value = result.items;
      });

      const selected = ref('WO_DE_GONG_ZUO_TAI');
      const picked = ref<MenuSelectPayload | null>(null);
      return {
        args,
        raw,
        items,
        error,
        selected,
        picked,
        reset: () => (raw.value = apiMenuResponseText),
      };
    },
    template: `
      <Menu
        v-bind="args"
        :items="items"
        v-model:selectedKey="selected"
        @select="picked = $event"
      />
      <div style="display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 12px; padding: 16px 24px; color: #4e5969; font-size: 13px; line-height: 1.8;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <strong>接口响应（可直接替换成你自己的）</strong>
          <button type="button" @click="reset" style="padding: 2px 10px; border: 1px solid #e5e6eb; border-radius: 4px; background: #fff; color: #4e5969; font-size: 12px; cursor: pointer;">还原示例</button>
          <span v-if="error" style="color: #f53f3f; font-size: 12px;">{{ error }}</span>
          <span v-else style="color: #00b42a; font-size: 12px;">已渲染 {{ items.length }} 个顶层节点</span>
        </div>
        <textarea
          v-model="raw"
          aria-label="接口响应 JSON"
          spellcheck="false"
          style="flex: 1; min-height: 220px; padding: 8px 12px; border: 1px solid #e5e6eb; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; resize: vertical;"
        ></textarea>
        <div>
          <strong>点击后拿到的 payload</strong>
          <pre v-if="picked" style="margin: 4px 0 0; padding: 8px 12px; border-radius: 6px; background: #f7f8fa; color: #1d2129; font-size: 12px; line-height: 1.6; white-space: pre-wrap;">{{ JSON.stringify({ key: picked.key, keyPath: picked.keyPath, meta: picked.data?.meta }, null, 2) }}</pre>
          <p v-else style="margin: 4px 0 0; color: #86909c;">点一个菜单项，路由字段从 <code>meta</code> 里原样取回。</p>
        </div>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    // 顶层 directory 是内联分组，子项直接铺在侧栏里
    const top = canvas.getByRole('button', { name: '教学工作台' });
    await expect(top).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('button', { name: '我的工作台' })).toBeInTheDocument();

    // 二级 directory 收进 flyout
    await expect(canvas.getByRole('button', { name: '教学评价' })).toHaveAttribute(
      'aria-haspopup',
      'true',
    );

    // select 为 false 的丢掉，同级按 sort 升序
    const groups = canvas
      .getAllByRole('button', { expanded: true })
      .map((el) => el.textContent?.trim());
    await expect(groups).toEqual([
      '教学工作台',
      '智慧教学',
      '教学创新',
      '评价发展',
      '资源智库',
      '教学管理',
    ]);

    // 贴进非法 JSON 时给出提示，菜单保留上一份数据
    const textarea = canvas.getByRole('textbox', { name: '接口响应 JSON' });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '{{');
    await waitFor(() => expect(canvas.getByText(/JSON 解析失败/)).toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: '我的工作台' })).toBeInTheDocument();

    // play 跑完 story 停在最后一步的状态，这里收回示例数据，别把文本框留成一个 `{`
    await userEvent.click(canvas.getByRole('button', { name: '还原示例' }));
    await waitFor(() => expect(canvas.getByText(/已渲染/)).toBeInTheDocument());
    await expect(canvas.queryByText(/JSON 解析失败/)).not.toBeInTheDocument();
  },
};

/**
 * 业务接入：`icon` 直接写字体图标类名或图片地址，分组标题也带图标；`widthStorageKey` 让拖出来的宽度在刷新后保留。
 */
export const BusinessIcons: Story = {
  // width 进 args 会被 v-bind 传成受控值，宽度锁死后拖不动、也就存不下来
  args: {
    resizable: true,
    searchable: true,
    widthStorageKey: 'aix-menu-story-width',
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      const items: MenuItemData[] = [
        { key: 'home', label: '首页', icon: 'iconfont icon-home' },
        {
          key: 'teaching',
          type: 'group',
          label: '智慧教学',
          icon: 'iconfont icon-teaching',
          children: [
            { key: 'course', label: '我的课程', icon: 'iconfont icon-course' },
            {
              key: 'lab',
              label: '实验室',
              icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%2300c261"/></svg>',
            },
            { key: 'plain', label: '无图标项' },
          ],
        },
      ];
      const selected = ref('course');
      const width = ref(220);
      return { args, items, selected, width };
    },
    template: `
      <style>
        .iconfont::before { content: ''; display: block; width: 100%; height: 100%; border-radius: 3px; background: currentColor; opacity: .6; }
      </style>
      <Menu v-bind="args" :items="items" v-model:selectedKey="selected" v-model:width="width" />
    `,
  }),
  play: async ({ canvas }) => {
    const course = canvas.getByRole('button', { name: '我的课程' });
    await expect(course.querySelector('i.icon-course')).not.toBeNull();
    await expect(
      canvas.getByRole('button', { name: '实验室' }).querySelector('img'),
    ).not.toBeNull();
    await expect(
      canvas
        .getByRole('button', { name: '无图标项' })
        .querySelector('.aix-menu-item-content__icon'),
    ).toBeNull();
    await expect(
      canvas
        .getByRole('button', { name: '智慧教学' })
        .querySelector('.aix-menu-group__icon i.icon-teaching'),
    ).not.toBeNull();
  },
};

/**
 * 路由联动：`resolveSelectedKey` 按 `meta.path` 与当前路径匹配，精确匹配优先，其次子路径前缀匹配，多个前缀命中时路径最长者胜出。
 * 点右侧的"当前路径"按钮模拟路由跳转，选中项跟着变。
 */
export const RouteSync: Story = {
  args: {
    width: 200,
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      const items: MenuItemData[] = [
        { key: 'home', label: '首页', icon: HomeIcon, meta: { path: '/' } },
        {
          key: 'course',
          type: 'group',
          label: '课程',
          children: [
            { key: 'course-list', label: '课程列表', icon: BookIcon, meta: { path: '/course' } },
            {
              key: 'course-detail',
              label: '课程详情',
              icon: FileIcon,
              meta: { path: '/course/detail' },
            },
          ],
        },
        {
          key: 'settings',
          label: '设置',
          icon: SettingsIcon,
          children: [{ key: 'profile', label: '个人资料', meta: { path: '/settings/profile' } }],
        },
      ];
      const routePath = ref('/course/detail/42');
      const selectedKey = computed(() =>
        resolveSelectedKey(items, (item) => {
          const path = item.meta?.path as string | undefined;
          if (!path) return false;
          if (routePath.value === path) return path.length + 1;
          return routePath.value.startsWith(`${path}/`) ? path.length : false;
        }),
      );
      const routes = [
        '/',
        '/course',
        '/course/other',
        '/course/detail/42',
        '/settings/profile',
        '/nowhere',
      ];
      return { args, items, routePath, selectedKey, routes };
    },
    template: `
      <Menu v-bind="args" :items="items" :selected-key="selectedKey" @select="(p) => (routePath = p.data?.meta?.path ?? routePath)" />
      <div style="display: flex; flex-direction: column; gap: 8px; padding: 16px 24px; color: #4e5969; font-size: 13px;">
        <strong>当前路径：<code>{{ routePath }}</code></strong>
        <span>解析出的 selectedKey：<code>{{ selectedKey ?? 'undefined' }}</code></span>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button v-for="r in routes" :key="r" type="button" :aria-label="'跳到 ' + r" @click="routePath = r" style="padding: 2px 10px; border: 1px solid #e5e6eb; border-radius: 4px; background: #fff; color: #4e5969; font-size: 12px; cursor: pointer;">{{ r }}</button>
        </div>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: '课程详情' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(canvas.getByRole('button', { name: '跳到 /course/other' }));
    await expect(canvas.getByRole('button', { name: '课程列表' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(canvas.getByRole('button', { name: '跳到 /nowhere' }));
    await expect(canvas.queryByRole('button', { current: 'page' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '跳到 /course/detail/42' }));
    await expect(canvas.getByRole('button', { name: '课程详情' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  },
};
