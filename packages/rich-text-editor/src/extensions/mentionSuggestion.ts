import type { MentionNodeAttrs, MentionOptions } from '@tiptap/extension-mention';
import type { MentionConfig, MentionItem } from '../types';
import { fetchMentionItems } from '../utils/upload';

/** suggestion 配置类型（从 MentionOptions 中提取） */
type MentionSuggestion = MentionOptions<MentionItem, MentionNodeAttrs>['suggestion'];

/** suggestion render 回调的 props 类型 */
interface SuggestionCallbackProps {
  items: MentionItem[];
  command: (attrs: MentionNodeAttrs) => void;
  clientRect?: (() => DOMRect | null) | null;
}

/**
 * 创建 @提及功能的 suggestion 配置
 * 包含候选列表的查询、渲染、键盘导航和定位逻辑
 */
export function createMentionSuggestion(config?: MentionConfig): MentionSuggestion {
  // server 模式：防抖 + 请求取消 + 序列号，避免高频请求和 race condition
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let requestSeq = 0;
  // 保存前一个 Promise 的 resolve，cleanup 时用空数组结束它
  let pendingResolve: ((items: MentionItem[]) => void) | null = null;

  /** 清理防抖 timer 和进行中的请求 */
  function cleanup() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    // 结束前一个 pending Promise，防止永远不 resolve
    if (pendingResolve) {
      pendingResolve([]);
      pendingResolve = null;
    }
    abortController?.abort();
    abortController = null;
  }

  if (config && !config.queryItems && !config.server) {
    console.warn(
      '[RichTextEditor] mention 已配置但未提供有效的查询方式（queryItems / server），@提及将无法查询到候选项。',
    );
  }

  return {
    char: config?.trigger ?? '@',
    // 禁用前缀限制，默认只允许空格后触发，不适用于中文等无空格分隔的语言
    allowedPrefixes: null,

    items: ({ query }): Promise<MentionItem[]> => {
      // 优先级 1：自定义 queryItems 回调（用户自行控制防抖）
      if (config?.queryItems) {
        return Promise.resolve(config.queryItems(query) as MentionItem[]);
      }
      // 优先级 2：server 配置驱动（内置防抖 + 取消）
      if (config?.server) {
        // 取消上一次未完成的请求和防抖
        cleanup();
        abortController = new AbortController();
        const currentController = abortController;
        const seq = ++requestSeq;

        return new Promise<MentionItem[]>((resolve) => {
          pendingResolve = resolve;
          debounceTimer = setTimeout(async () => {
            pendingResolve = null;
            try {
              const items = await fetchMentionItems({
                server: config.server!,
                query,
                queryParamName: config.queryParamName,
                headers: config.headers,
                responsePath: config.responsePath,
                transformResponse: config.transformResponse,
                signal: currentController.signal,
              });
              // 只有最新请求的结果才 resolve，防止过期结果导致 popup 闪空
              if (seq === requestSeq) resolve(items);
            } catch (err) {
              if (seq !== requestSeq) return;
              if (config.onError) {
                const error =
                  err != null && typeof err === 'object' && 'type' in err && 'message' in err
                    ? (err as Parameters<typeof config.onError>[0])
                    : {
                        type: 'server' as const,
                        message: err instanceof Error ? err.message : '提及查询失败',
                        cause: err,
                      };
                config.onError(error);
              }
              console.error('[RichTextEditor] 提及查询失败:', err);
              resolve([]);
            }
          }, 300);
        });
      }
      return Promise.resolve([]);
    },

    render: () => {
      let popup: HTMLElement | null = null;
      let items: MentionItem[] = [];
      let selectedIndex = 0;
      let commandFn: ((attrs: MentionNodeAttrs) => void) | null = null;
      // 保存 clientRect 引用，用于 scroll/resize 时实时更新位置
      let currentClientRect: (() => DOMRect | null) | null = null;

      function selectItem(index: number) {
        const item = items[index];
        if (item && commandFn) {
          commandFn({ id: String(item.id), label: item.label });
        }
      }

      function updatePopup() {
        if (!popup) return;
        popup.innerHTML = '';

        if (items.length === 0) {
          popup.style.display = 'none';
          return;
        }

        popup.style.display = 'block';

        items.forEach((item, index) => {
          const btn = document.createElement('button');
          btn.className = 'aix-rich-text-editor__mention-item';
          if (index === selectedIndex) {
            btn.classList.add('aix-rich-text-editor__mention-item--active');
          }
          btn.type = 'button';
          btn.textContent = item.label;
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectItem(index);
          });
          popup!.appendChild(btn);
        });
      }

      function updatePosition(clientRect?: (() => DOMRect | null) | null) {
        if (!popup || !clientRect) return;
        const rect = clientRect();
        if (!rect) return;

        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 4}px`;
      }

      function onScrollOrResize() {
        updatePosition(currentClientRect);
      }

      function addScrollListeners() {
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
      }

      function removeScrollListeners() {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      }

      return {
        onStart(props: SuggestionCallbackProps) {
          popup = document.createElement('div');
          popup.className = 'aix-rich-text-editor__mention-popup';
          document.body.appendChild(popup);

          items = props.items;
          commandFn = props.command;
          selectedIndex = 0;
          currentClientRect = props.clientRect ?? null;

          updatePosition(props.clientRect);
          updatePopup();
          addScrollListeners();
        },

        onUpdate(props: SuggestionCallbackProps) {
          items = props.items;
          commandFn = props.command;
          selectedIndex = 0;
          currentClientRect = props.clientRect ?? null;

          updatePosition(props.clientRect);
          updatePopup();
        },

        onKeyDown(props: { event: KeyboardEvent }): boolean {
          if (items.length === 0) return false;

          if (props.event.key === 'ArrowUp') {
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updatePopup();
            return true;
          }

          if (props.event.key === 'ArrowDown') {
            selectedIndex = (selectedIndex + 1) % items.length;
            updatePopup();
            return true;
          }

          if (props.event.key === 'Enter') {
            selectItem(selectedIndex);
            return true;
          }

          return false;
        },

        onExit() {
          cleanup();
          removeScrollListeners();
          currentClientRect = null;
          if (popup) {
            popup.remove();
            popup = null;
          }
        },
      };
    },
  } as MentionSuggestion;
}
