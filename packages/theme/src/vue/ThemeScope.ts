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
 * - SSR 同构：scoped/组件覆写 <style> 与 data-theme 由 render 函数输出，
 *   服务端首屏即带 scoped 样式，无 FOUC；CSS 变量内容由确定性 computed 派生，
 *   配合 useId 的稳定 scopeClass，客户端 hydration 不会 mismatch。
 */
import { computed, defineComponent, h, provide, useId, type PropType } from 'vue';
import { THEME_INJECTION_KEY, type ThemeContext } from './theme-context';
import { useThemeContextOptional } from './use-theme-context';
import {
  buildOverridesCss,
  buildOverridesSelector,
  buildComponentOverridesCss,
} from '../core/theme-dom-renderer';
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
    // 使用 Vue useId 生成 SSR/客户端一致的唯一标识，避免 hydration mismatch
    // （useId 返回形如 'v-0' 的字符串，对 SSR 多请求与多实例均唯一）
    const scopeClass = `aix-scope-${useId() ?? ''}`;

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
    const computedTokens = computed<ThemeTokens>(() => generateThemeTokens(mergedConfig.value));

    // 基线 tokens（用于差异化计算）
    // 有父级时直接用父级 tokens；无父级时用相同暗色算法类型的默认 tokens
    const baselineTokens = computed<ThemeTokens>(() => {
      if (parentContext) {
        return parentContext.getTokens();
      }
      const algos = normalizeAlgorithm(mergedConfig.value.algorithm);
      const darkAlgo = algos.find((a) => a === darkAlgorithm || a === darkMixAlgorithm);
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

    // 差异化 scoped 覆写 CSS（仅注入与基线不同的变量）。
    // 改为 render 函数输出 <style>，使 SSR 首屏即带 scoped 样式、无 FOUC。
    const overridesCss = computed(() => {
      const overrides = computeScopedOverrides(
        computedTokens.value,
        baselineTokens.value,
        props.prefix,
      );
      const selector = buildOverridesSelector(resolvedMode.value, scopeClass, false);
      return buildOverridesCss(selector, overrides);
    });

    // 组件级覆写 CSS
    const componentOverridesCss = computed(() => {
      const components = mergedConfig.value.components;
      if (!components || Object.keys(components).length === 0) return '';
      const overrides = generateAllComponentOverrides(
        components,
        computedTokens.value,
        { ...defaultSeedTokens, ...mergedConfig.value.seed },
        normalizeAlgorithm(mergedConfig.value.algorithm),
      );
      return buildComponentOverridesCss(props.prefix, scopeClass, overrides);
    });

    // 过渡配置（兜底默认值），用于 render 时声明式绑定 class/CSS 变量
    const transition = computed(() => {
      const t = mergedConfig.value.transition;
      return {
        enabled: t?.enabled ?? true,
        duration: t?.duration ?? 200,
        easing: t?.easing ?? 'ease-in-out',
      };
    });

    return () => {
      const children = [];
      // 用 innerHTML 注入原始 CSS：<style> 是 raw-text 元素，若作为文本子节点，
      // 真实 SSR(renderToString) 会对其做 HTML 转义，使选择器中的 ' 变成 &#39;
      // 而浏览器不会在 raw-text 内解码实体，导致 scoped 选择器失效。innerHTML 走原样输出。
      const oCss = overridesCss.value;
      if (oCss) {
        children.push(
          h('style', {
            id: `${props.prefix}-theme-overrides-${scopeClass}`,
            innerHTML: oCss,
          }),
        );
      }
      const cCss = componentOverridesCss.value;
      if (cCss) {
        children.push(
          h('style', {
            id: `${props.prefix}-component-overrides-${scopeClass}`,
            innerHTML: cCss,
          }),
        );
      }
      const slotContent = slots.default?.();
      if (slotContent) children.push(slotContent);

      const { enabled, duration, easing } = transition.value;
      return h(
        props.tag,
        {
          // data-theme 写在容器上，配合 scoped 选择器 .${scopeClass}[data-theme]
          'data-theme': resolvedMode.value,
          class: [
            scopeClass,
            props.transparent && 'aix-scope-transparent',
            enabled && `${props.prefix}-theme-transition`,
          ],
          style: enabled
            ? {
                [`--${props.prefix}-transition-duration`]: `${duration}ms`,
                [`--${props.prefix}-transition-easing`]: easing,
              }
            : undefined,
        },
        children,
      );
    };
  },
});
