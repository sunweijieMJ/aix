import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { EmitDefinition, PropDefinition, SlotDefinition } from '../types/index';
import { log } from './logger';

const execFileAsync = promisify(execFile);

/** 仓库里输出组件 API 的脚本，相对仓库根 */
const PRINT_API_SCRIPT = 'scripts/docs/print-api.ts';

/**
 * 文档管线输出的结构化 API，形状与 scripts/docs/api-model.ts 一致。
 * 这里只声明本服务用到的字段，多出的字段忽略。
 */
export interface ApiSourceProp {
  name: string;
  type: string;
  resolvedType?: string;
  values?: string[];
  defaultValue?: string;
  required: boolean;
  description: string;
}

export interface ApiSourceEvent {
  name: string;
  params?: string;
  description: string;
}

export interface ApiSourceSlot {
  name: string;
  params?: string;
  description: string;
}

export interface ApiSourceComponent {
  name: string;
  file: string;
  props: ApiSourceProp[];
  events: ApiSourceEvent[];
  slots: ApiSourceSlot[];
}

export interface ApiSourcePackage {
  package: string;
  components: ApiSourceComponent[];
}

/** npm 包名 -> 该包的结构化 API */
export type ApiIndex = Map<string, ApiSourcePackage>;

/** print-api 的输出形状 */
interface PrintApiOutput {
  packages: Record<string, ApiSourcePackage>;
  failures?: Array<{ dirName: string; message: string }>;
}

/** 文档管线子进程的最长运行时间 */
const PRINT_API_TIMEOUT_MS = 120_000;

/**
 * 在仓库内运行文档管线，一次拿到所有组件包的结构化 API。
 *
 * 数据直接来自组件源码（与 README / 文档站的 API 表同源），不经 Markdown 转手，
 * 也不落中间文件。仓库根找不到、脚本或 tsx 不存在、子进程失败或超时都返回 null，
 * 调用方退回 README 表格解析。
 */
export async function loadApiIndex(repoRoot: string | null | undefined): Promise<ApiIndex | null> {
  if (!repoRoot) return null;

  const script = join(repoRoot, PRINT_API_SCRIPT);
  const isWindows = process.platform === 'win32';
  const tsxBin = join(repoRoot, 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx');

  if (!(await exists(script)) || !(await exists(tsxBin))) return null;

  try {
    // Windows 下 .cmd 只能经 shell 启动
    const { stdout } = await execFileAsync(tsxBin, [script], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
      timeout: PRINT_API_TIMEOUT_MS,
      shell: isWindows,
    });
    return parseApiIndex(stdout);
  } catch (error) {
    log.warn('运行文档管线获取组件 API 失败，退回 README 表格解析:', error);
    return null;
  }
}

/**
 * 解析 print-api 的输出。解析失败的包只记一条警告，其余包照常入索引。
 */
export function parseApiIndex(json: string): ApiIndex {
  const parsed = JSON.parse(json) as PrintApiOutput;
  const index: ApiIndex = new Map();

  for (const failure of parsed.failures ?? []) {
    log.warn(`文档管线未能解析 ${failure.dirName}：${failure.message}，该包退回 README 表格解析`);
  }
  for (const [name, pkg] of Object.entries(parsed.packages ?? {})) {
    if (Array.isArray(pkg?.components)) index.set(name, pkg);
  }
  return index;
}

/**
 * 合并两个来源的 API 定义：同名条目以源码为准，`fromReadme` 里源码没有的条目追加在后。
 *
 * README 表格里有一部分内容不属于任何导出组件（音频来源契约这类接口约定、
 * 挂在未导出块组件上的插槽），它们只存在于手写表格，不能随组件条目一起被替换掉。
 */
export function mergeApiDefinitions<T extends { name: string }>(source: T[], fromReadme: T[]): T[] {
  const known = new Set(source.map((item) => item.name));
  return [...source, ...fromReadme.filter((item) => !known.has(item.name))];
}

/**
 * 把结构化 API 转成索引里的 Props / Emits / Slots 定义。
 *
 * `group` 直接取组件名，多组件包（menu 的 MenuItem / SubMenu，popper 的 Tooltip / Popover）
 * 由此区分归属；类型优先取别名展开后的文本，字符串字面量联合另放进 enum。
 */
export function toApiDefinitions(api: ApiSourcePackage): {
  props: PropDefinition[];
  emits: EmitDefinition[];
  slots: SlotDefinition[];
} {
  const props: PropDefinition[] = [];
  const emits: EmitDefinition[] = [];
  const slots: SlotDefinition[] = [];

  for (const component of api.components) {
    const group = component.name;

    for (const prop of component.props ?? []) {
      props.push({
        name: prop.name,
        type: prop.resolvedType ?? prop.type,
        required: Boolean(prop.required),
        description: prop.description || '',
        defaultValue: prop.defaultValue || undefined,
        enum: prop.values && prop.values.length > 0 ? prop.values : undefined,
        group,
      });
    }

    for (const event of component.events ?? []) {
      emits.push({
        name: event.name,
        params: event.params || undefined,
        description: event.description || undefined,
        group,
      });
    }

    for (const slot of component.slots ?? []) {
      slots.push({
        name: slot.name,
        description: slot.description || undefined,
        scope: slot.params || undefined,
        group,
      });
    }
  }

  return { props, emits, slots };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
