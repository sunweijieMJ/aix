import type {
  MentionNodeAttrs,
  MentionOptions,
} from '@tiptap/extension-mention';
import type { MentionConfig, MentionItem } from '../types';

/** suggestion 配置类型（从 MentionOptions 中提取） */
type MentionSuggestion = MentionOptions<
  MentionItem,
  MentionNodeAttrs
>['suggestion'];

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
export function createMentionSuggestion(
  config?: MentionConfig,
): MentionSuggestion {
  return {
    char: config?.trigger ?? '@',
    // 禁用前缀限制，默认只允许空格后触发，不适用于中文等无空格分隔的语言
    allowedPrefixes: null,

    items: ({ query }) => {
      if (!config?.queryItems) return [];
      return config.queryItems(query) as MentionItem[];
    },

    render: () => {
      let popup: HTMLElement | null = null;
      let items: MentionItem[] = [];
      let selectedIndex = 0;
      let commandFn: ((attrs: MentionNodeAttrs) => void) | null = null;

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

      return {
        onStart(props: SuggestionCallbackProps) {
          popup = document.createElement('div');
          popup.className = 'aix-rich-text-editor__mention-popup';
          document.body.appendChild(popup);

          items = props.items;
          commandFn = props.command;
          selectedIndex = 0;

          updatePosition(props.clientRect);
          updatePopup();
        },

        onUpdate(props: SuggestionCallbackProps) {
          items = props.items;
          commandFn = props.command;
          selectedIndex = 0;

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
          if (popup) {
            popup.remove();
            popup = null;
          }
        },
      };
    },
  } as MentionSuggestion;
}
