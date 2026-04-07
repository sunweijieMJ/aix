import type { AnyExtension } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { loadFeatureExtensions, type EnhancedFeatureName } from '../constants';
import type { RichTextEditorProps } from '../types';

export interface UseEditorExtensionsReturn {
  /** 构建完整的扩展数组（异步，按需加载增强功能） */
  buildExtensions: () => Promise<AnyExtension[]>;
}

/**
 * 管理 Tiptap 扩展的按需加载和组装
 */
export function useEditorExtensions(props: RichTextEditorProps): UseEditorExtensionsReturn {
  /** 构建完整扩展数组 */
  async function buildExtensions(): Promise<AnyExtension[]> {
    const extensions: AnyExtension[] = [];

    // ===== 1. 基础功能（始终加载） =====
    // StarterKit v3 已内置 Link 和 Underline，通过 configure 传入配置避免重复注册
    extensions.push(
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
      }),
    );
    extensions.push(
      Placeholder.configure({
        placeholder: () => props.placeholder || '',
      }),
    );

    // ===== 2. 增强功能（按 Props 按需加载） =====
    const loadTasks: Promise<void>[] = [];

    // 辅助函数：添加加载任务
    function addFeature(name: EnhancedFeatureName, enabled: unknown) {
      if (!enabled) return;
      const config = typeof enabled === 'object' ? enabled : undefined;
      loadTasks.push(
        loadFeatureExtensions(name, config).then((exts) => {
          extensions.push(...exts);
        }),
      );
    }

    addFeature('table', props.table as unknown);
    addFeature('taskList', props.taskList as unknown);
    addFeature('image', props.image as unknown);
    addFeature('video', props.video as unknown);
    addFeature('textAlign', props.textAlign as unknown);
    addFeature('textColor', props.textColor as unknown);
    addFeature('fontSize', props.fontSize as unknown);
    addFeature('fontFamily', props.fontFamily as unknown);
    addFeature('superscriptSubscript', props.superscriptSubscript as unknown);
    addFeature('characterCount', props.characterCount as unknown);
    addFeature('mention', props.mention as unknown);
    addFeature('highlight', props.highlight as unknown);
    addFeature('markdown', props.markdown as unknown);

    // 并行加载所有启用的增强功能
    await Promise.all(loadTasks);

    // ===== 3. 用户自定义扩展（最后追加，优先级最高） =====
    if (props.extensions?.length) {
      extensions.push(...props.extensions);
    }

    // ===== 4. 扩展去重（保留最后出现的，用户自定义扩展优先级最高） =====
    const seen = new Set<string>();
    return extensions
      .reverse()
      .filter((ext) => {
        const name = ext.name;
        if (!name || !seen.has(name)) {
          if (name) seen.add(name);
          return true;
        }
        return false;
      })
      .reverse();
  }

  return {
    buildExtensions,
  };
}
