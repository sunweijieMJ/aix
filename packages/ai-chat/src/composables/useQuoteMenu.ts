import { useLocale } from '@aix/hooks';
import { Copy, InfoOutline, Language, QuestionCircle } from '@aix/icons';
import { computed, markRaw, ref, toValue, watch } from 'vue';
import type { Component, InjectionKey, MaybeRefOrGetter, Ref } from 'vue';
import { locale } from '../locale';
import type { AiChatLocale } from '../locale';
import type {
  ChatMessage,
  Quote,
  QuoteActionContext,
  QuoteActionItem,
  QuoteActionKey,
  QuoteActionsItems,
  QuoteAnchor,
  ResolvedQuoteAction,
} from '../types';
import { genQuoteId } from '../utils/helpers';
import type { ActiveSelection, LongPressTrigger } from './useTextSelection';

/** AiChat 注入、QuoteBlock/QuoteChip 消费的回链函数（独立使用时 inject 为 null → 点击无操作） */
export const QUOTE_LOCATE_KEY: InjectionKey<(quote: Quote) => void> = Symbol('aix-quote-locate');

export interface UseQuoteMenuOptions {
  selection: Ref<ActiveSelection | null>;
  trigger?: Ref<LongPressTrigger | null>;
  actions?: MaybeRefOrGetter<QuoteActionsItems | undefined>;
  insertQuote: (q: Quote) => void;
  setSenderValue?: (text: string) => void;
  focusSender: () => void;
  send?: (meta?: { quotes?: Quote[] }) => void;
  copy: (text: string) => void | Promise<boolean>;
  onLocate?: (anchor: QuoteAnchor) => void;
  messageFor?: (messageId: string) => ChatMessage | undefined;
}

export interface UseQuoteMenuReturn {
  visible: Ref<boolean>;
  mode: Ref<'menu' | 'selecting'>;
  items: Ref<ResolvedQuoteAction[]>;
  source: Ref<'pointer' | 'keyboard' | 'longpress'>;
  invoke: (key: string) => void;
  close: () => void;
  locate: (quote: Quote) => void;
}

const DEFAULT_ACTIONS: QuoteActionsItems = ['explain', 'ask', 'translate', 'copy'];

/** 内置动作表：label 走 locale；run 的差异仅在「是否写 textarea / 是否加 chip」 */
const BUILTIN: Record<
  QuoteActionKey,
  { icon: Component; label: (t: AiChatLocale) => string; run: (ctx: QuoteActionContext) => void }
> = {
  explain: {
    icon: markRaw(InfoOutline),
    label: (t) => t.quoteExplain,
    run: (ctx) => ctx.insertQuote(),
  },
  ask: {
    icon: markRaw(QuestionCircle),
    label: (t) => t.quoteAsk,
    run: (ctx) => ctx.ask(), // 内置 ask 无 prompt：加 chip + 仅聚焦，用户自己补充问题
  },
  translate: {
    icon: markRaw(Language),
    label: (t) => t.quoteTranslate,
    run: (ctx) => ctx.insertQuote(),
  },
  copy: {
    icon: markRaw(Copy),
    label: (t) => t.copyButton,
    run: (ctx) => ctx.copy(),
  },
};

export function useQuoteMenu(options: UseQuoteMenuOptions): UseQuoteMenuReturn {
  const { t } = useLocale(locale);
  const visible = ref(false);

  // 当前作用对象：精选 active 优先，退回 trigger.defaultTarget（整条消息）
  const currentAnchor = computed<QuoteAnchor | null>(
    () => options.selection.value?.anchor ?? options.trigger?.value?.defaultTarget ?? null,
  );
  const mode = computed<'menu' | 'selecting'>(() =>
    options.selection.value ? 'selecting' : 'menu',
  );
  const source = computed<'pointer' | 'keyboard' | 'longpress'>(() =>
    options.selection.value ? options.selection.value.source : 'longpress',
  );

  // 有目标即开、目标消失即关；close() 只关不清目标（下一次选区变化重新打开）
  watch(currentAnchor, (a) => {
    visible.value = !!a;
  });

  const resolved = computed<(ResolvedQuoteAction & { _item: QuoteActionKey | QuoteActionItem })[]>(
    () =>
      (toValue(options.actions) ?? DEFAULT_ACTIONS).map((it) =>
        typeof it === 'string'
          ? {
              key: it,
              label: BUILTIN[it].label(t.value),
              icon: BUILTIN[it].icon,
              _item: it,
            }
          : { key: it.key, label: it.label, icon: it.icon, disabled: it.disabled, _item: it },
      ),
  );
  const items = computed<ResolvedQuoteAction[]>(() =>
    resolved.value.map(({ key, label, icon, disabled }) => ({ key, label, icon, disabled })),
  );

  const close = () => {
    visible.value = false;
  };

  /** 以当前作用对象构造 Quote（intent 由动作决定） */
  const makeQuote = (intent?: string): Quote | null => {
    const anchor = currentAnchor.value;
    return anchor ? { id: genQuoteId(), anchor, intent } : null;
  };

  const buildCtx = (intent: string): QuoteActionContext | null => {
    const quote = makeQuote(intent);
    if (!quote) return null;
    return {
      quote,
      message: options.messageFor?.(quote.anchor.source.messageId),
      // insertQuote：仅加 chip + 聚焦，textarea 保持用户已敲的内容
      insertQuote: (q?: Quote) => {
        options.insertQuote(q ?? quote);
        options.focusSender();
        close();
      },
      // ask：加 chip + 有 prompt 才写 textarea + 聚焦；不自动 send
      ask: (q?: Quote, prompt?: string) => {
        options.insertQuote(q ?? quote);
        if (prompt) options.setSenderValue?.(prompt);
        options.focusSender();
        close();
      },
      // copy：仅复制，不加 chip、不聚焦。优先原文 rawText——exact 已折叠空白，
      // 多行选区（代码块）直接复制 exact 会变成单行
      copy: (text?: string) => {
        void options.copy(text ?? quote.anchor.rawText ?? quote.anchor.exact);
        close();
      },
      close,
    };
  };

  const invoke = (key: string) => {
    const hit = resolved.value.find((i) => i.key === key);
    if (!hit || hit.disabled) return;
    const ctx = buildCtx(key);
    if (!ctx) return;
    if (typeof hit._item === 'string') {
      BUILTIN[hit._item].run(ctx);
    } else {
      hit._item.onClick(ctx);
    }
  };

  const locate = (quote: Quote) => options.onLocate?.(quote.anchor);

  return { visible, mode, items, source, invoke, close, locate };
}
