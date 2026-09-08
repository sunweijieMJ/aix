/**
 * 终端交互。
 *
 * 交互用 @inquirer/prompts（方向键选择、翻页、行内校验）。
 *
 * 非交互（CI / 管道调用）与 -y 一律绕开 prompt 直接取默认值，
 * 这层短路必须留在 wrapper 里，交互库不该决定无人值守时的行为。
 */

import {
  confirm as promptConfirm,
  input as promptInput,
  select as promptSelect,
} from '@inquirer/prompts';
import { c } from './logger';

// 非 TTY（CI、管道调用）时所有交互自动取默认值，脚本可无人值守运行
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

export const isInteractive = (): boolean => interactive;

/** Ctrl+C / Ctrl+D：@inquirer/prompts 抛 ExitPromptError，统一成「已取消」由入口处理 */
export const isAbort = (error: unknown): boolean => {
  const e = error as { name?: string; message?: string } | undefined;
  return e?.name === 'ExitPromptError' || /^aborted/i.test(e?.message ?? '');
};

export interface AskOptions {
  defaultValue?: string;
  skip?: boolean;
  /** 返回字符串表示校验不通过并作为提示重新输入 */
  validate?: (value: string) => string | undefined;
}

/** 文本输入；validate 返回字符串表示校验不通过并作为提示重新输入 */
export const ask = async (
  message: string,
  { defaultValue = '', skip = false, validate }: AskOptions = {},
): Promise<string> => {
  if (skip || !interactive) {
    console.log(`${message} ${c.dim(`[自动: ${defaultValue}]`)}`);
    const error = validate?.(defaultValue);
    if (error) throw new Error(error);
    return defaultValue;
  }

  return promptInput({
    message,
    default: defaultValue || undefined,
    // @inquirer/prompts 的约定是「通过返回 true，失败返回提示字符串」，与我们的 validate 正好互补
    validate: validate ? (value: string) => validate(value.trim()) ?? true : undefined,
  }).then((value) => value.trim());
};

export const confirm = async (
  message: string,
  { defaultValue = true, skip = false }: { defaultValue?: boolean; skip?: boolean } = {},
): Promise<boolean> => {
  if (skip || !interactive) {
    console.log(`${message} ${c.dim(`[自动: ${defaultValue ? 'Y' : 'N'}]`)}`);
    return defaultValue;
  }
  return promptConfirm({ message, default: defaultValue });
};

export interface Choice<T> {
  name: string;
  value: T;
}

/**
 * 单选；choices: [{ name, value }]。
 * 非交互或只有一项时直接取第一项——一个选项没什么可选的，不该拦住无人值守的流程。
 */
export const select = async <T>(
  message: string,
  choices: Choice<T>[],
  { skip = false }: { skip?: boolean } = {},
): Promise<T> => {
  if (skip || !interactive || choices.length === 1) {
    console.log(`${message} ${c.dim(`[自动: ${choices[0]!.name}]`)}`);
    return choices[0]!.value;
  }

  return promptSelect({
    message,
    choices: choices.map((choice) => ({ name: choice.name, value: choice.value })),
    // 业务仓库可能有几十个 dist-tag，给足可见行数，其余翻页
    pageSize: 15,
  });
};
