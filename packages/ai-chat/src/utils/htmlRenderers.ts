import { useLocale } from '@aix/hooks';
import { Launch } from '@aix/icons';
import { defineComponent, h, ref, computed, onMounted, onUnmounted } from 'vue';
import { locale } from '../locale';
import type { MarkdownRenderers } from './markdownWalker';

/** 单实例递增 id：区分同页面多个 HTML Sandbox 块的 postMessage 归属 */
let sandboxIdCounter = 0;

/** 测试用：重置实例 id 计数器 */
export function __resetHtmlSandboxId(): void {
  sandboxIdCounter = 0;
}

const MIN_FRAME_HEIGHT = 60;
// 高度上限：恶意/异常内容可自报任意 scrollHeight（如 1e9），无上限会撑爆页面布局
const MAX_FRAME_HEIGHT = 20000;
const RESIZE_MESSAGE_TYPE = 'aix-html-sandbox-resize';

/** 转义 `&`/`"`：把 srcdoc 文档整体塞进另一层 HTML 的双引号属性值时用（新窗口打开场景） */
function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * 拼出沙箱 iframe 的 srcdoc 文档：把用户内容作为 body 片段注入，并附带一段小脚本——
 * 用 ResizeObserver 监听 body 尺寸，经 postMessage 把高度上报给父页面，父页面按 id
 * 匹配对应实例更新 iframe 高度。id 由调用方传入，内联 / 新窗口两处 iframe 各用不同 id，
 * 互不干扰。
 */
function buildSrcDoc(code: string, id: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:8px;box-sizing:border-box;font-family:sans-serif;}</style>' +
    `</head><body>${code}<script>(function(){` +
    'function send(){try{parent.postMessage({' +
    `type:${JSON.stringify(RESIZE_MESSAGE_TYPE)},id:${JSON.stringify(id)},` +
    "height:document.body.scrollHeight},'*');}catch(e){}}" +
    'if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}' +
    "window.addEventListener('load',send);send();" +
    '})();</script></body></html>'
  );
}

/**
 * HTML Sandbox 渲染块：`allowHtml` 开启时 `html_block` / ```html 围栏共用本组件。
 *
 * 安全模型：`settled` 后用 `srcdoc` 注入 `<iframe sandbox="allow-scripts">`——不加
 * `allow-same-origin`/`allow-popups`/`allow-top-navigation`，iframe 得到不透明
 * origin：脚本能跑，但读不到父页面 DOM/cookie/localStorage，也无法跳顶层页面/开弹窗。
 * 不走 DOMPurify 消毒——sandbox 隔离本身是安全边界，消毒会剥离 `<script>`，与「允许
 * 执行 JS」矛盾。流式未 `settled` 时维持原始代码展示，不渲染 iframe（避免半截 HTML）。
 */
const HtmlSandboxBlock = defineComponent({
  name: 'AixHtmlSandboxBlock',
  props: {
    code: { type: String, required: true },
    settled: { type: Boolean, required: true },
  },
  setup(props) {
    const { t } = useLocale(locale);
    const instanceId = `aix-html-sandbox-${sandboxIdCounter++}`;
    const mode = ref<'preview' | 'code'>('preview');
    const frameHeight = ref(MIN_FRAME_HEIGHT);
    const frameEl = ref<HTMLIFrameElement | null>(null);

    const srcDoc = computed(() => buildSrcDoc(props.code, instanceId));

    const onMessage = (e: MessageEvent) => {
      // 归属校验以 e.source 为准：type/id 可被同页任意 iframe/窗口伪造（instanceId 是
      // 可预测的自增序列，双 bundle 场景计数器各自从 0 起还会碰撞），仅凭 id 匹配
      // 等于把沙箱高度控制权交给整个页面
      const win = frameEl.value?.contentWindow;
      if (!win || e.source !== win) return;
      const data = e.data as { type?: string; id?: string; height?: number } | null;
      if (!data || data.type !== RESIZE_MESSAGE_TYPE || data.id !== instanceId) return;
      const height = Number(data.height);
      if (Number.isFinite(height) && height > 0) {
        frameHeight.value = Math.min(
          MAX_FRAME_HEIGHT,
          Math.max(MIN_FRAME_HEIGHT, Math.ceil(height)),
        );
      }
    };
    onMounted(() => window.addEventListener('message', onMessage));
    onUnmounted(() => window.removeEventListener('message', onMessage));

    const openInNewWindow = () => {
      const win = window.open('', '_blank');
      if (!win) return; // 弹窗被浏览器拦截：静默失败
      const doc = buildSrcDoc(props.code, `${instanceId}-window`);
      win.document.open();
      win.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>HTML</title>' +
          '<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;display:block;}</style>' +
          `</head><body><iframe sandbox="allow-scripts" srcdoc="${escapeHtmlAttr(doc)}"></iframe></body></html>`,
      );
      win.document.close();
    };

    return () => {
      if (!props.settled) {
        return h('pre', { class: 'aix-md-html-sandbox-source' }, h('code', props.code));
      }

      const header = h('div', { class: 'aix-md-html-sandbox__header' }, [
        h('div', { class: 'aix-md-html-sandbox__tabs' }, [
          h(
            'button',
            {
              type: 'button',
              class: ['aix-md-html-sandbox__tab', mode.value === 'preview' && 'is-active'],
              'aria-pressed': mode.value === 'preview',
              onClick: () => (mode.value = 'preview'),
            },
            t.value.htmlSandboxPreview,
          ),
          h(
            'button',
            {
              type: 'button',
              class: ['aix-md-html-sandbox__tab', mode.value === 'code' && 'is-active'],
              'aria-pressed': mode.value === 'code',
              onClick: () => (mode.value = 'code'),
            },
            t.value.htmlSandboxCode,
          ),
        ]),
        h('div', { class: 'aix-md-html-sandbox__actions' }, [
          h(
            'button',
            {
              type: 'button',
              class: 'aix-md-html-sandbox__action',
              'aria-label': t.value.htmlSandboxOpenNewWindow,
              title: t.value.htmlSandboxOpenNewWindow,
              onClick: openInNewWindow,
            },
            [h(Launch)],
          ),
        ]),
      ]);

      const body = h('div', { class: 'aix-md-html-sandbox__body' }, [
        h('iframe', {
          ref: frameEl,
          class: 'aix-md-html-sandbox__frame',
          sandbox: 'allow-scripts',
          srcdoc: srcDoc.value,
          style: {
            height: `${frameHeight.value}px`,
            display: mode.value === 'preview' ? 'block' : 'none',
          },
        }),
        h(
          'pre',
          {
            class: 'aix-md-html-sandbox__code',
            style: { display: mode.value === 'code' ? 'block' : 'none' },
          },
          h('code', props.code),
        ),
      ]);

      return h('div', { class: 'aix-md-html-sandbox', 'data-sandbox-id': instanceId }, [
        header,
        body,
      ]);
    };
  },
});

/**
 * HTML 渲染器：`allowHtml` 开启时启用。`html_block`（原始 HTML 段落）与 `fence:html`
 * （```html 围栏）共用 HtmlSandboxBlock，经 sandbox iframe 隔离渲染，不再依赖 DOMPurify。
 * `html_inline`（行内裸标签）P1 维持丢弃、保留周边文本，与此前行为一致。
 */
export function createHtmlRenderers(): MarkdownRenderers {
  return {
    html_block: ({ token, info }) =>
      h(HtmlSandboxBlock, { code: token.content, settled: info.committed ?? !info.streaming }),
    'fence:html': ({ token, info }) =>
      h(HtmlSandboxBlock, { code: token.content, settled: info.committed ?? !info.streaming }),
    html_inline: () => '',
  };
}
