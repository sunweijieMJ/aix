import { h, type Component } from 'vue';
import type { MenuItemData } from '../src';
import {
  BellIcon,
  BookIcon,
  ChartIcon,
  EditIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  HomeIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
} from './icons';

/** 业务菜单接口返回的节点，字段按真实响应保留 */
export interface ApiMenuNode {
  menuCode: string;
  menuName: string;
  menuIcon: string | null;
  /** directory 是分类，menu 是可点击的页面 */
  resourceType: 'directory' | 'menu';
  /** 打开方式：站内路由 / qiankun 微应用 / 外链 */
  menuType: 'internal' | 'qiankun' | 'redirect';
  menuUrl: string;
  redirectUrl: string | null;
  redirectType: string | null;
  microAppName: string | null;
  microAppEntry: string | null;
  microAppBaseRoute: string | null;
  /** 同级排序，升序；缺省按 0 处理 */
  sort?: number;
  /** 当前用户有无权限；只有显式为 false 才丢掉 */
  select?: boolean;
  childList?: ApiMenuNode[];
}

/** 真实响应的 data 字段 */
export const apiMenuResponse: ApiMenuNode[] = [
  {
    menuCode: 'JIAO_XUE_GONG_ZUO_TAI',
    menuName: '教学工作台',
    menuIcon: 'aloha-icon-xuexiaozhuye',
    resourceType: 'directory',
    menuType: 'internal',
    menuUrl: '',
    redirectUrl: null,
    redirectType: null,
    microAppName: null,
    microAppEntry: null,
    microAppBaseRoute: null,
    sort: 0,
    select: true,
    childList: [
      {
        menuCode: 'WO_DE_GONG_ZUO_TAI',
        menuName: '我的工作台',
        menuIcon: 'aloha-icon-Huge-icon11',
        resourceType: 'menu',
        menuType: 'internal',
        menuUrl: '/ctp/workspace',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 0,
        select: true,
        childList: [],
      },
      {
        menuCode: 'JIAO_XUE_RI_LI',
        menuName: '教学日历',
        menuIcon: 'aloha-icon-rili3',
        resourceType: 'menu',
        menuType: 'internal',
        menuUrl: '/ctp/teaching-calendar',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 1,
        select: true,
        childList: [],
      },
    ],
  },
  {
    menuCode: 'ZHI_HUI_JIAO_XUE',
    menuName: '智慧教学',
    menuIcon: 'aloha-icon-zhihuijiaoxuepingtai1',
    resourceType: 'directory',
    menuType: 'internal',
    menuUrl: '',
    redirectUrl: null,
    redirectType: null,
    microAppName: null,
    microAppEntry: null,
    microAppBaseRoute: null,
    sort: 2,
    select: true,
    childList: [
      {
        menuCode: 'WO_DE_KE_CHENG',
        menuName: '我的课程',
        menuIcon: 'aloha-icon-zhuanjiakuguanli1',
        resourceType: 'menu',
        menuType: 'internal',
        menuUrl: '/agent-course-hike/ai-course-center',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 0,
        select: true,
        childList: [],
      },
    ],
  },
  {
    menuCode: 'JIAO_XUE_CHUANG_XIN',
    menuName: '教学创新',
    menuIcon: '1',
    resourceType: 'directory',
    menuType: 'internal',
    menuUrl: '',
    redirectUrl: null,
    redirectType: null,
    microAppName: null,
    microAppEntry: null,
    microAppBaseRoute: null,
    sort: 5,
    select: true,
    childList: [
      {
        menuCode: 'A_I_JIAO_YAN',
        menuName: 'AI教研',
        menuIcon: 'aloha-icon-AIjiaoyan1',
        resourceType: 'menu',
        menuType: 'qiankun',
        menuUrl: '/tch-hike-center/prepareCenter',
        redirectUrl: null,
        redirectType: null,
        microAppName: 'tch-hike-center-app',
        microAppEntry: '//hub.polymas.com/tch_hike/tch_hike_center/',
        microAppBaseRoute: '/tch-hike/tch-hike-center',
        sort: 0,
        select: true,
        childList: [],
      },
      {
        menuCode: 'KE_CHENG_ZAI_ZAO',
        menuName: '课程再造',
        menuIcon: 'aloha-icon-xiangmupingshenpingtai1',
        resourceType: 'menu',
        menuType: 'redirect',
        menuUrl: '',
        redirectUrl: 'https://livecourse-ai-web.zhihuishu.com',
        redirectType: 'iframe',
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 1,
        select: true,
        childList: [],
      },
      {
        menuCode: 'A_I_DUI_HUA',
        menuName: 'AI对话',
        menuIcon: 'aloha-icon-Huge-icon-31',
        resourceType: 'menu',
        menuType: 'internal',
        menuUrl: '/chat',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 2,
        select: true,
        childList: [],
      },
      {
        menuCode: 'ZHI_NENG_TI_ZHONG_XIN',
        menuName: '智能体中心',
        menuIcon: 'aloha-icon-Huge-icon-31',
        resourceType: 'menu',
        menuType: 'internal',
        menuUrl: '/agent-center',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 3,
        select: true,
        childList: [],
      },
    ],
  },
  {
    menuCode: 'PING_JIA_FA_ZHAN',
    menuName: '评价发展',
    menuIcon: 'aloha-icon-pingjiajilu1',
    resourceType: 'directory',
    menuType: 'internal',
    menuUrl: '',
    redirectUrl: null,
    redirectType: null,
    microAppName: null,
    microAppEntry: null,
    microAppBaseRoute: null,
    sort: 6,
    select: true,
    childList: [
      {
        menuCode: 'JIAO_XUE_PING_JIA',
        menuName: '教学评价',
        menuIcon: 'aloha-icon-wodepingjia',
        resourceType: 'directory',
        menuType: 'internal',
        menuUrl: '',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 0,
        select: true,
        childList: [
          {
            menuCode: 'PING_JIA_WO_DE',
            menuName: '评价我的',
            menuIcon: 'aloha-icon-pingjiawode1',
            resourceType: 'menu',
            menuType: 'redirect',
            menuUrl: '',
            redirectUrl: 'https://example.edu/admin/teacherEvaluation',
            redirectType: 'iframe',
            microAppName: null,
            microAppEntry: null,
            microAppBaseRoute: null,
            sort: 0,
            select: true,
            childList: [],
          },
          {
            menuCode: 'PING_JIA_HUI_ZONG',
            menuName: '评价汇总',
            menuIcon: 'aloha-icon-pingjiahuizong1',
            resourceType: 'menu',
            menuType: 'redirect',
            menuUrl: '',
            redirectUrl: 'https://example.edu/admin/evaluationSummary',
            redirectType: 'iframe',
            microAppName: null,
            microAppEntry: null,
            microAppBaseRoute: null,
            sort: 1,
            select: true,
            childList: [],
          },
          {
            menuCode: 'WO_PING_JIA_DE',
            menuName: '我评价的',
            menuIcon: 'aloha-icon-wodepingjia',
            resourceType: 'menu',
            menuType: 'redirect',
            menuUrl: '',
            redirectUrl: 'https://example.edu/admin/supervisorEvaluation',
            redirectType: 'iframe',
            microAppName: null,
            microAppEntry: null,
            microAppBaseRoute: null,
            sort: 2,
            select: true,
            childList: [],
          },
        ],
      },
      {
        menuCode: 'SHI_FAN_XUE_XI',
        menuName: '示范学习',
        menuIcon: 'aloha-icon-shouye1',
        resourceType: 'directory',
        menuType: 'internal',
        menuUrl: '',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 1,
        select: true,
        childList: [
          {
            menuCode: 'YOU_XIU_KE_TANG',
            menuName: '优秀课堂',
            menuIcon: 'aloha-icon-youxiuketang1',
            resourceType: 'menu',
            menuType: 'redirect',
            menuUrl: '',
            redirectUrl: 'https://example.edu/admin/excellentClassroom',
            redirectType: 'iframe',
            microAppName: null,
            microAppEntry: null,
            microAppBaseRoute: null,
            sort: 0,
            select: true,
            childList: [],
          },
        ],
      },
    ],
  },
  {
    menuCode: 'ZI_YUAN_ZHI_KU',
    menuName: '资源智库',
    menuIcon: 'aloha-icon-ziyuanku',
    resourceType: 'directory',
    menuType: 'internal',
    menuUrl: '',
    redirectUrl: null,
    redirectType: null,
    microAppName: null,
    microAppEntry: null,
    microAppBaseRoute: null,
    sort: 8,
    select: true,
    childList: [
      {
        menuCode: 'ZHI_SHI_ZHONG_XIN',
        menuName: '知识中心',
        menuIcon:
          'https://yufa-polymas.oss-cn-hangzhou.aliyuncs.com/data/2026-04-29/C8yOqPJBsg.svg',
        resourceType: 'menu',
        menuType: 'qiankun',
        menuUrl: '/school-resource-library/center',
        redirectUrl: null,
        redirectType: null,
        microAppName: 'schoolResourceLibraryApp',
        microAppEntry: '//hub.polymas.com/school_resource_library/',
        microAppBaseRoute: '/tch-hike/school-resource-library',
        sort: 0,
        select: true,
        childList: [],
      },
      {
        menuCode: 'ZI_YUAN_ZHONG_XIN',
        menuName: '资源中心',
        menuIcon: 'aloha-icon-ziyuanku',
        resourceType: 'menu',
        menuType: 'qiankun',
        menuUrl: '/resource-hub/resource-lib',
        redirectUrl: null,
        redirectType: null,
        microAppName: 'resource-platform-app',
        microAppEntry: '//hike-teaching-center.polymas.com/resource_hub/',
        microAppBaseRoute: '/tch-hike/resource-hub',
        sort: 1,
        select: true,
        childList: [],
      },
    ],
  },
  {
    menuCode: 'JIAO_XUE_GUAN_LI',
    menuName: '教学管理',
    menuIcon: 'aloha-icon-dudaopingtai1',
    resourceType: 'directory',
    menuType: 'internal',
    menuUrl: '',
    redirectUrl: null,
    redirectType: null,
    microAppName: null,
    microAppEntry: null,
    microAppBaseRoute: null,
    sort: 9,
    select: true,
    childList: [
      {
        menuCode: 'TING_PING_KE_GUAN_LI',
        menuName: '听评课管理',
        menuIcon: 'aloha-icon-tingpingkeguanli1',
        resourceType: 'directory',
        menuType: 'internal',
        menuUrl: '',
        redirectUrl: null,
        redirectType: null,
        microAppName: null,
        microAppEntry: null,
        microAppBaseRoute: null,
        sort: 1,
        select: true,
        childList: [
          {
            menuCode: 'TING_PING_KE_REN_WU',
            menuName: '听评课任务',
            menuIcon: 'aloha-icon-a-box1',
            resourceType: 'menu',
            menuType: 'redirect',
            menuUrl: '',
            redirectUrl: 'https://example.edu/admin/evaluationTask',
            redirectType: 'iframe',
            microAppName: null,
            microAppEntry: null,
            microAppBaseRoute: null,
            sort: 0,
            select: true,
            childList: [],
          },
          {
            menuCode: 'TING_PING_KE_ZHONG_DIAN_REN_QUN',
            menuName: '听评课重点人群',
            menuIcon: 'aloha-icon-a-box1',
            resourceType: 'menu',
            menuType: 'redirect',
            menuUrl: '',
            redirectUrl: 'https://example.edu/admin/evalutionKeyGroups',
            redirectType: 'iframe',
            microAppName: null,
            microAppEntry: null,
            microAppBaseRoute: null,
            sort: 1,
            select: true,
            childList: [],
          },
        ],
      },
    ],
  },
];

const PLACEHOLDERS: Component[] = [
  HomeIcon,
  GridIcon,
  BookIcon,
  VideoIcon,
  EditIcon,
  UsersIcon,
  FolderIcon,
  FileIcon,
  ChartIcon,
  BellIcon,
  SettingsIcon,
];

/**
 * menuIcon 有两种形态：aloha 图标字体的 class，或一个图片 URL。
 * Storybook 里没有加载那套字体，class 形态按名字散列到一个占位图标，业务侧换成自己的字体组件即可。
 */
function toIcon(menuIcon: string | null): Component | undefined {
  if (!menuIcon) return undefined;
  if (menuIcon.startsWith('http')) {
    return () => h('img', { src: menuIcon, width: 16, height: 16, alt: '' });
  }
  let hash = 0;
  for (const char of menuIcon) hash = (hash + char.charCodeAt(0)) % PLACEHOLDERS.length;
  return PLACEHOLDERS[hash];
}

/**
 * 把接口响应转成 items。规则：
 * - `select === false` 的节点直接丢掉（没权限）
 * - 同级按 `sort` 升序
 * - 顶层 `directory` 是内联分组，更深层的 `directory` 收进 flyout 子菜单——
 *   内联分组只有一层样式，套起来读不出层级，弹层才表达得出来
 * - `menu` 是叶子项，路由信息原样塞进 `meta`，随 select 事件回传
 */
export function toMenuItems(list: ApiMenuNode[], depth = 0): MenuItemData[] {
  return [...list]
    .filter((node) => node.select !== false)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((node) => {
      const children = toMenuItems(node.childList ?? [], depth + 1);
      const asGroup = node.resourceType === 'directory' && depth === 0;
      return {
        key: node.menuCode,
        label: node.menuName,
        icon: toIcon(node.menuIcon),
        ...(asGroup ? { type: 'group' as const } : {}),
        ...(children.length ? { children } : {}),
        meta: {
          menuType: node.menuType,
          url: node.menuUrl || node.redirectUrl || '',
          microAppName: node.microAppName,
        },
      };
    });
}

/** 贴进文本框的示例，形状即接口响应整体 */
export const apiMenuResponseText = JSON.stringify(
  { code: 200, msg: null, data: apiMenuResponse, success: true },
  null,
  2,
);

/**
 * 解析粘贴进来的 JSON 并转成 items。接口响应整体（取 `data`）和 `data` 数组本身都认。
 * 解析失败时回传原因，调用方保留上一份可用数据即可。
 */
export function parseApiMenuText(text: string): { items: MenuItemData[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `JSON 解析失败：${(error as Error).message}` };
  }

  const list = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) {
    return { error: '没找到菜单数组：请粘贴接口响应整体（含 data 字段），或直接粘贴 data 数组' };
  }

  try {
    return { items: toMenuItems(list as ApiMenuNode[]) };
  } catch (error) {
    return { error: `数据转换失败：${(error as Error).message}` };
  }
}
