/**
 * @fileoverview 快捷键类型定义
 * 参考 ant-design/x 的类型安全快捷键实现
 */

/**
 * 修饰键信息：[KeyboardEvent 属性名, Mac 显示名, Windows 显示名]
 */
type ModifierKeyInfo = [keyof KeyboardEvent, string, string];

/**
 * 支持的修饰键类型
 */
export interface ModifierKeys {
  /** Ctrl 键 */
  Ctrl: ModifierKeyInfo;
  /** Alt/Option 键 */
  Alt: ModifierKeyInfo;
  /** Meta/Command/Windows 键 */
  Meta: ModifierKeyInfo;
  /** Shift 键 */
  Shift: ModifierKeyInfo;
}

/**
 * 修饰键映射
 */
export const MODIFIER_KEYS: ModifierKeys = {
  Ctrl: ['ctrlKey', '⌃', 'Ctrl'],
  Alt: ['altKey', '⌥', 'Alt'],
  Meta: ['metaKey', '⌘', 'Win'],
  Shift: ['shiftKey', '⇧', 'Shift'],
};

/**
 * 常用键码
 */
export type CommonKeyCode =
  // 字母键
  | 'KeyA'
  | 'KeyB'
  | 'KeyC'
  | 'KeyD'
  | 'KeyE'
  | 'KeyF'
  | 'KeyG'
  | 'KeyH'
  | 'KeyI'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyL'
  | 'KeyM'
  | 'KeyN'
  | 'KeyO'
  | 'KeyP'
  | 'KeyQ'
  | 'KeyR'
  | 'KeyS'
  | 'KeyT'
  | 'KeyU'
  | 'KeyV'
  | 'KeyW'
  | 'KeyX'
  | 'KeyY'
  | 'KeyZ'
  // 数字键
  | 'Digit0'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9'
  // 功能键
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  // 特殊键
  | 'Enter'
  | 'Escape'
  | 'Backspace'
  | 'Tab'
  | 'Space'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | 'Insert'
  | 'Delete'
  // 符号键
  | 'Minus'
  | 'Equal'
  | 'BracketLeft'
  | 'BracketRight'
  | 'Backslash'
  | 'Semicolon'
  | 'Quote'
  | 'Comma'
  | 'Period'
  | 'Slash'
  | 'Backquote';

/**
 * 快捷键组合类型
 *
 * @example
 * ```ts
 * // 单修饰键 + 键码
 * const copy: ShortcutKeys = ['Meta', 'KeyC'];  // Cmd+C
 *
 * // 双修饰键 + 键码
 * const search: ShortcutKeys = ['Ctrl', 'Shift', 'KeyF'];  // Ctrl+Shift+F
 *
 * // 支持数字键（用于快速切换）
 * const switchTab: ShortcutKeys<number> = ['Meta', 1];  // Cmd+1
 * ```
 */
export type ShortcutKeys<CustomKey extends string | number = CommonKeyCode> =
  | [keyof ModifierKeys, CustomKey]
  | [keyof ModifierKeys, keyof ModifierKeys, CustomKey];

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
  /** 是否启用快捷键 */
  enabled?: boolean;
  /** 快捷键组合 */
  keys: ShortcutKeys;
  /** 快捷键描述 */
  description?: string;
  /** 是否阻止默认行为 */
  preventDefault?: boolean;
  /** 是否阻止冒泡 */
  stopPropagation?: boolean;
}

/**
 * 组件快捷键配置映射
 */
export interface ComponentShortcuts {
  [action: string]: ShortcutKeys | ShortcutConfig | undefined;
}

/**
 * Sender 组件快捷键
 */
export interface SenderShortcuts {
  /** 发送消息 */
  submit?: ShortcutKeys | ShortcutConfig;
  /** 换行 */
  newline?: ShortcutKeys | ShortcutConfig;
  /** 清空输入 */
  clear?: ShortcutKeys | ShortcutConfig;
  /** 其他自定义快捷键 */
  [action: string]: ShortcutKeys | ShortcutConfig | undefined;
}

/**
 * Conversations 组件快捷键
 */
export interface ConversationsShortcuts {
  /** 搜索会话 */
  search?: ShortcutKeys | ShortcutConfig;
  /** 新建会话 */
  new?: ShortcutKeys | ShortcutConfig;
  /** 删除会话 */
  delete?: ShortcutKeys | ShortcutConfig;
  /** 上一个会话 */
  prev?: ShortcutKeys | ShortcutConfig;
  /** 下一个会话 */
  next?: ShortcutKeys | ShortcutConfig;
  /** 其他自定义快捷键 */
  [action: string]: ShortcutKeys | ShortcutConfig | undefined;
}

/**
 * Bubble 组件快捷键
 */
export interface BubbleShortcuts {
  /** 复制内容 */
  copy?: ShortcutKeys | ShortcutConfig;
  /** 编辑内容 */
  edit?: ShortcutKeys | ShortcutConfig;
  /** 重新生成 */
  regenerate?: ShortcutKeys | ShortcutConfig;
  /** 其他自定义快捷键 */
  [action: string]: ShortcutKeys | ShortcutConfig | undefined;
}

/**
 * 检查键盘事件是否匹配快捷键
 *
 * @param event 键盘事件
 * @param shortcut 快捷键配置
 * @returns 是否匹配
 */
export function matchShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutKeys | ShortcutConfig,
): boolean {
  const keys = Array.isArray(shortcut) ? shortcut : shortcut.keys;

  // 获取修饰键和主键
  let modifiers: (keyof ModifierKeys)[];
  let mainKey: string | number;

  if (keys.length === 2) {
    modifiers = [keys[0] as keyof ModifierKeys];
    mainKey = keys[1];
  } else {
    modifiers = [keys[0] as keyof ModifierKeys, keys[1] as keyof ModifierKeys];
    mainKey = keys[2];
  }

  // 检查修饰键
  const allModifiers: (keyof ModifierKeys)[] = ['Ctrl', 'Alt', 'Meta', 'Shift'];
  for (const mod of allModifiers) {
    const [eventKey] = MODIFIER_KEYS[mod];
    const shouldBePressed = modifiers.includes(mod);
    const isPressed = event[eventKey] as boolean;

    if (shouldBePressed !== isPressed) {
      return false;
    }
  }

  // 检查主键
  if (typeof mainKey === 'number') {
    // 数字键
    return event.code === `Digit${mainKey}` || event.key === String(mainKey);
  }

  return event.code === mainKey;
}

/**
 * 格式化快捷键为显示字符串
 *
 * @param shortcut 快捷键配置
 * @param platform 平台（mac 或 windows）
 * @returns 格式化后的字符串
 */
export function formatShortcut(
  shortcut: ShortcutKeys | ShortcutConfig,
  platform: 'mac' | 'windows' = 'mac',
): string {
  const keys = Array.isArray(shortcut) ? shortcut : shortcut.keys;
  const isMac = platform === 'mac';

  let modifiers: (keyof ModifierKeys)[];
  let mainKey: string | number;

  if (keys.length === 2) {
    modifiers = [keys[0] as keyof ModifierKeys];
    mainKey = keys[1];
  } else {
    modifiers = [keys[0] as keyof ModifierKeys, keys[1] as keyof ModifierKeys];
    mainKey = keys[2];
  }

  // 格式化修饰键
  const modifierSymbols = modifiers.map((mod) => {
    const [, macSymbol, winSymbol] = MODIFIER_KEYS[mod];
    return isMac ? macSymbol : winSymbol;
  });

  // 格式化主键
  let mainKeySymbol: string;
  if (typeof mainKey === 'number') {
    mainKeySymbol = String(mainKey);
  } else if (mainKey.startsWith('Key')) {
    mainKeySymbol = mainKey.slice(3);
  } else if (mainKey.startsWith('Digit')) {
    mainKeySymbol = mainKey.slice(5);
  } else {
    // 特殊键映射
    const specialKeys: Record<string, string> = {
      Enter: '↵',
      Escape: 'Esc',
      Backspace: '⌫',
      Tab: '⇥',
      Space: '␣',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
    };
    mainKeySymbol = specialKeys[mainKey] || mainKey;
  }

  return [...modifierSymbols, mainKeySymbol].join(isMac ? '' : '+');
}

/**
 * 创建快捷键处理器
 *
 * @param shortcuts 快捷键配置映射
 * @param handlers 处理函数映射
 * @returns 键盘事件处理函数
 */
export function createShortcutHandler<T extends ComponentShortcuts>(
  shortcuts: T,
  handlers: Partial<Record<keyof T, () => void>>,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    for (const [action, shortcut] of Object.entries(shortcuts)) {
      if (!shortcut) continue;

      const config = Array.isArray(shortcut) ? { keys: shortcut } : shortcut;

      if (matchShortcut(event, config as ShortcutConfig)) {
        const handler = handlers[action as keyof T];
        if (handler) {
          if ((config as ShortcutConfig).preventDefault !== false) {
            event.preventDefault();
          }
          if ((config as ShortcutConfig).stopPropagation) {
            event.stopPropagation();
          }
          handler();
          return;
        }
      }
    }
  };
}
