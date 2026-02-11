/**
 * ThemeScope - 嵌套主题作用域组件
 *
 * 利用 CSS 变量级联和 Vue provide/inject 嵌套特性，
 * 在子树中覆盖主题 Token，支持独立的 mode 和 config。
 */
import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  provide,
  ref,
  watch,
  type PropType,
} from 'vue';
import { THEME_INJECTION_KEY, type ThemeContext } from './theme-context';
import { useThemeContextOptional } from './use-theme-context';
import { ThemeDOMRenderer } from '../core/theme-dom-renderer';
import {
  generateThemeTokens,
  normalizeAlgorithm,
  darkAlgorithm,
  darkMixAlgorithm,
} from '../core/define-theme';
import { CSS_VAR_PREFIX } from '../utils/css-var';
import type { ThemeConfig, ThemeMode, ThemeTokens } from '../theme-types';

// 模块级计数器，确保多实例唯一性
let _counter = 0;

export default defineComponent({
  name: 'ThemeScope',
  props: {
    /** 嵌套主题配置 */
    config: {
      type: Object as PropType<ThemeConfig>,
      default: undefined,
    },
    /** 强制指定主题模式 */
    mode: {
      type: String as PropType<ThemeMode>,
      default: undefined,
    },
    /** CSS 变量前缀 */
    prefix: {
      type: String,
      default: CSS_VAR_PREFIX,
    },
  },
  setup(props, { slots }) {
    const scopeClass = `aix-scope-${++_counter}-${Math.random().toString(36).slice(2, 6)}`;

    const containerRef = ref<HTMLElement>();
    let renderer: ThemeDOMRenderer | null = null;

    const parentContext = useThemeContextOptional();

    const resolvedMode = computed<ThemeMode>(() => {
      if (props.mode) return props.mode;
      const algos = normalizeAlgorithm(props.config?.algorithm);
      if (algos.some((a) => a === darkAlgorithm || a === darkMixAlgorithm)) {
        return 'dark';
      }
      return parentContext?.mode ?? 'light';
    });

    const computedTokens = computed<ThemeTokens>(() =>
      generateThemeTokens(props.config || {}),
    );

    // 提供只读 scoped context（scoped 下通过 props 变更配置）
    const scopedContext: ThemeContext = {
      prefix: props.prefix,
      get mode() {
        return resolvedMode.value;
      },
      get config() {
        return props.config || {};
      },
      setMode: () => {},
      toggleMode: () => resolvedMode.value,
      applyTheme: () => {},
      setToken: () => {},
      setTokens: () => {},
      getToken: (key) => computedTokens.value[key],
      getTokens: () => computedTokens.value,
      reset: () => {},
      setTransition: () => ({
        duration: 200,
        easing: 'ease-in-out',
        enabled: true,
      }),
      getTransition: () => ({
        duration: 200,
        easing: 'ease-in-out',
        enabled: true,
      }),
      setComponentTheme: () => {},
      removeComponentTheme: () => {},
    };

    provide(THEME_INJECTION_KEY, scopedContext);

    function syncToDOM() {
      if (!renderer) return;
      renderer.setDataTheme(resolvedMode.value);
      const tokens = computedTokens.value;
      const overrides: Record<string, string> = {};
      for (const [key, val] of Object.entries(tokens)) {
        overrides[`--${props.prefix}-${key}`] =
          typeof val === 'number' ? String(val) : val;
      }
      renderer.applyOverrides(resolvedMode.value, overrides);
    }

    onMounted(() => {
      if (!containerRef.value) return;
      renderer = new ThemeDOMRenderer({
        prefix: props.prefix,
        scopeClass,
        container: containerRef.value,
      });
      syncToDOM();
    });

    watch([resolvedMode, computedTokens], () => syncToDOM(), { deep: true });

    onUnmounted(() => {
      renderer?.reset();
      renderer = null;
    });

    return () =>
      h('div', { ref: containerRef, class: scopeClass }, slots.default?.());
  },
});
