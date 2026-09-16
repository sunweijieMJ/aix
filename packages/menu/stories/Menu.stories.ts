import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, fn, userEvent } from 'storybook/test';
import { reactive, ref } from 'vue';
import { Menu, MenuGroup, MenuItem, SubMenu } from '../src';
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
  component: Menu,
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
      description: '宽度（px，v-model:width）',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '200' },
      },
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
    searchable: {
      control: 'boolean',
      description: '是否显示内置搜索框（位于 header 插槽之下、列表之上）',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    searchValue: {
      control: 'text',
      description: '搜索关键字（v-model:searchValue），非空时按 label 过滤 items 并展开全部分组',
      table: { type: { summary: 'string' } },
    },
    searchPlaceholder: {
      control: 'text',
      description: '搜索框占位文案，默认取语言包',
      table: { type: { summary: 'string' } },
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
      description: '非受控模式下的初始展开分组',
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
      <Menu v-bind="args" :items="items" :width="200">
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
 * 否则只保留有匹配后代的节点），所有分组强制展开，无结果显示「暂无匹配结果」。
 * Esc 清空关键字并阻止冒泡，放在 Modal / Drawer 里不会连带关闭外层。
 * 这里用 `filterMethod` 额外匹配 `meta.keywords`，输入 `course` 也能命中「课程管理」。
 */
export const Search: Story = {
  args: {
    searchable: true,
    searchPlaceholder: '搜索菜单',
  },
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
        :width="200"
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
        <p style="margin: 0; color: #86909c;">搜索中所有分组强制展开；分割线不参与匹配；Esc 清空关键字且不冒泡到外层。</p>
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
 */
export const Themes: Story = {
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
    popupMaxVisible: 9,
    popupPlacement: 'right-start',
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: flyoutItems };
    },
    template: `
      <Menu v-bind="args" :items="items" :width="200" />
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
      <Menu v-bind="args" v-model:selectedKey="selectedKey" :width="200">
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
        :width="200"
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
    accordion: true,
    defaultOpenKeys: ['course'],
  },
  render: (args) => ({
    components: { Menu },
    setup() {
      return { args, items: baseItems };
    },
    template: '<Menu v-bind="args" :items="items" :width="200" />',
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
 * 长文案单行省略，被截断时悬停显示完整 Tooltip；分组标题同样省略。
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
      <Menu v-bind="args" :items="items" :width="220" searchable v-model:selectedKey="selectedKey">
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
          --aix-menu-item-color-active: #fff;
          --aix-menu-item-color-disabled: rgb(203 213 225 / 0.35);
          --aix-menu-group-title-color: #64748b;
          --aix-menu-subgroup-title-color: #94a3b8;
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
          --aix-menu-search-bg-active: rgb(255 255 255 / 0.12);
          --aix-menu-search-color: #f1f5f9;
          --aix-menu-search-icon-color: #94a3b8;
          --aix-menu-search-placeholder-color: #64748b;
          --aix-menu-radius: 6px;
        }
      </component>
      <Menu v-bind="args" :items="items" :width="200" v-model:selectedKey="selectedKey">
        ${headerTemplate}
        ${footerTemplate}
      </Menu>
    `,
  }),
};
