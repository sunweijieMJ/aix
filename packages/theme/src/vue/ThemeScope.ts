/**
 * ThemeScope - 嵌套主题作用域组件
 *
 * 利用 CSS 变量级联和 Vue provide/inject 嵌套特性，
 * 在子树中覆盖主题 Token，支持独立的 mode 和 config。
 *
 * 特性：
 * - inherit: 默认继承父级配置，合并 seed/token/components
 * - transparent: 默认 display:contents，不影响父级 flex/grid 布局
 * - 差异化注入：只注入与基线不同的 CSS 变量，而非全量 300+
 * - 组件级覆盖：支持 config.components 组件级主题覆写
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
  generateAllComponentOverrides,
  normalizeAlgorithm,
  mergeThemeConfig,
  computeScopedOverrides,
  darkAlgorithm,
  darkMixAlgorithm,
} from '../core/define-theme';
import { defaultSeedTokens } from '../core/seed-derivation';
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
    /**
     * 是否继承父级主题配置（默认 true）
     * - true: 合并父级 seed/token/components，子级覆盖父级
     * - false: 从默认值重建，完全独立
     */
    inherit: {
      type: Boolean,
      default: true,
    },
    /** CSS 变量前缀 */
    prefix: {
      type: String,
      default: CSS_VAR_PREFIX,
    },
    /** 容器标签类型（默认 'div'） */
    tag: {
      type: String,
      default: 'div',
    },
    /**
     * 布局透明模式（默认 true）
     * - true: 添加 display:contents，容器不参与布局但 CSS 变量正常级联
     * - false: 正常盒模型，可接受外部 class/style
     */
    transparent: {
      type: Boolean,
      default: true,
    },
  },
  setup(props, { slots }) {
    const scopeClass = `aix-scope-${++_counter}-${Math.random().toString(36).slice(2, 6)}`;

    const containerRef = ref<HTMLElement>();
    let renderer: ThemeDOMRenderer | null = null;

    const parentContext = useThemeContextOptional();

    // 合并配置：inherit=true 时合并父级，否则直接使用子级配置
    const mergedConfig = computed<ThemeConfig>(() => {
      const childConfig = props.config || {};
      if (!props.inherit || !parentContext) return childConfig;
      return mergeThemeConfig(parentContext.config, childConfig);
    });

    // 解析 mode（优先级：props.mode > algorithm 推断 > parent.mode > 'light'）
    const resolvedMode = computed<ThemeMode>(() => {
      if (props.mode) return props.mode;
      const algos = normalizeAlgorithm(mergedConfig.value.algorithm);
      if (algos.some((a) => a === darkAlgorithm || a === darkMixAlgorithm)) {
        return 'dark';
      }
      return parentContext?.mode ?? 'light';
    });

    // 生成完整 tokens
    const computedTokens = computed<ThemeTokens>(() =>
      generateThemeTokens(mergedConfig.value),
    );

    // 基线 tokens（用于差异化计算）
    // 有父级时直接用父级 tokens；无父级时用相同暗色算法类型的默认 tokens
    const baselineTokens = computed<ThemeTokens>(() => {
      if (parentContext) {
        return parentContext.getTokens();
      }
      const algos = normalizeAlgorithm(mergedConfig.value.algorithm);
      const darkAlgo = algos.find(
        (a) => a === darkAlgorithm || a === darkMixAlgorithm,
      );
      return generateThemeTokens(darkAlgo ? { algorithm: darkAlgo } : {});
    });

    // 只读警告函数（仅开发环境输出警告）
    const warnReadonly = (method: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[ThemeScope] ${method}() 在 ThemeScope 内部不可用。` +
            `ThemeScope 是只读的嵌套主题作用域，请通过 props 变更配置。`,
        );
      }
    };

    // 提供只读 scoped context（scoped 下通过 props 变更配置）
    const scopedContext: ThemeContext = {
      get prefix() {
        return props.prefix;
      },
      get mode() {
        return resolvedMode.value;
      },
      get config() {
        return mergedConfig.value;
      },
      setMode: () => warnReadonly('setMode'),
      toggleMode: () => {
        warnReadonly('toggleMode');
        return resolvedMode.value;
      },
      applyTheme: () => warnReadonly('applyTheme'),
      setToken: () => warnReadonly('setToken'),
      setTokens: () => warnReadonly('setTokens'),
      getToken: (key) => computedTokens.value[key],
      getTokens: () => computedTokens.value,
      reset: () => warnReadonly('reset'),
      setTransition: () => warnReadonly('setTransition'),
      getTransition: () => ({
        duration: mergedConfig.value.transition?.duration ?? 200,
        easing: mergedConfig.value.transition?.easing ?? 'ease-in-out',
        enabled: mergedConfig.value.transition?.enabled ?? true,
      }),
      setComponentTheme: () => warnReadonly('setComponentTheme'),
      removeComponentTheme: () => warnReadonly('removeComponentTheme'),
    };

    provide(THEME_INJECTION_KEY, scopedContext);

    function syncToDOM() {
      if (!renderer) return;

      const transition = mergedConfig.value.transition;
      const components = mergedConfig.value.components;

      const componentOverrides =
        components && Object.keys(components).length > 0
          ? generateAllComponentOverrides(
              components,
              computedTokens.value,
              { ...defaultSeedTokens, ...mergedConfig.value.seed },
              normalizeAlgorithm(mergedConfig.value.algorithm),
            )
          : undefined;

      renderer.syncAll({
        mode: resolvedMode.value,
        transition: {
          duration: transition?.duration ?? 200,
          easing: transition?.easing ?? 'ease-in-out',
          enabled: transition?.enabled ?? true,
        },
        overrides: computeScopedOverrides(
          computedTokens.value,
          baselineTokens.value,
          props.prefix,
        ),
        componentOverrides,
      });
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

    // 监听 resolvedMode、computedTokens 和 mergedConfig 的变化
    // mergedConfig 包含 transition/components 等不影响 computedTokens 但需要同步到 DOM 的配置
    watch([resolvedMode, computedTokens, mergedConfig], () => syncToDOM());

    onUnmounted(() => {
      renderer?.reset();
      renderer = null;
    });

    return () =>
      h(
        props.tag,
        {
          ref: containerRef,
          class: [scopeClass, props.transparent && 'aix-scope-transparent'],
        },
        slots.default?.(),
      );
  },
});
