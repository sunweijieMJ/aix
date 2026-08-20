<template>
  <!-- 空列表不渲染（与 AttachmentBlock 一致），避免显示「来源 0」的空标题 -->
  <div v-if="block.items.length" :class="ns.b()">
    <div :class="ns.e('title')">
      {{ t.sourcesTitle }}
      <span :class="ns.e('count')">{{ block.items.length }}</span>
    </div>
    <ol :class="ns.e('list')">
      <li v-for="(item, i) in links" :key="i" :class="ns.e('item')">
        <component
          :is="item.href ? 'a' : 'div'"
          :class="ns.e('link')"
          :href="item.href"
          :target="item.href ? '_blank' : undefined"
          :rel="item.href ? 'noopener noreferrer' : undefined"
        >
          <span :class="ns.e('index')">{{ i + 1 }}</span>
          <img v-if="item.iconSrc" :class="ns.e('favicon')" :src="item.iconSrc" alt="" />
          <span v-else-if="item.iconText" :class="ns.e('emoji')">{{ item.iconText }}</span>
          <span :class="ns.e('content')">
            <span :class="ns.e('item-title')">{{ item.title }}</span>
            <span v-if="item.snippet" :class="ns.e('snippet')">{{ item.snippet }}</span>
          </span>
        </component>
      </li>
    </ol>
  </div>
</template>

<script lang="ts">
export interface SourcesBlockProps {
  /** sources 类型的 block（一次性追加的引用来源列表） */
  block: Extract<ContentBlock, { type: 'sources' }>;
  /** 气泡上下文（注册表统一透传，本组件暂不消费） */
  info?: BubbleContentInfo;
  /** 打字机态（注册表统一透传 boolean | 节奏配置，引用来源不逐字，故不消费） */
  typing?: boolean | BubbleTypingConfig;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed } from 'vue';
import { useAiChatLocale } from '../../composables/useAiChatLocale';
import type { ContentBlock, BubbleContentInfo, BubbleTypingConfig } from '../../types';
import { safeUrl, safeImageSrc, isImageSource } from '../../utils/url';

// 注册表统一向渲染器透传 block/info/typing；本组件只消费 block，关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<SourcesBlockProps>();
const ns = useNamespace('sources-block');
const { t } = useAiChatLocale();

// 来源链接可能来自模型/检索结果（不可信），渲染前经 safeUrl 协议白名单过滤：
// 安全 url 渲染为可点击 <a>，不安全（如 javascript:）则 href 为 undefined → 降级为 <div> 纯展示。
//
// icon 同样不可信，且是 emoji / 图片地址二义，故分两步：
// ① isImageSource 先分流「这是不是一个图片地址」——emoji 与短文本走文本渲染（iconText）；
// ② 判为图片地址的再过 safeImageSrc 白名单（放行 http(s)/data:image/blob:），与包内其余
//    <img> 路径（ImageThumb / markdownWalker / imageRenderers / ImagePreview）同一层防护。
// 两步都不能省：只做 ① 会让 icon 绕过白名单，与紧邻的 href 口径不一致；
// 只做 ② 则 emoji 会被 safeUrl 当作「无协议的相对路径」原样放行、渲染成必然失败的裂图。
// 判为图片地址但未过白名单时 iconSrc/iconText 双空：既不出裂图，也不把 `data:text/html,…`
// 这类原文当 emoji 显示出来。
const links = computed(() =>
  props.block.items.map((item) => {
    const isImageIcon = isImageSource(item.icon);
    return {
      ...item,
      href: safeUrl(item.url),
      iconSrc: isImageIcon ? safeImageSrc(item.icon) : undefined,
      iconText: isImageIcon ? undefined : item.icon,
    };
  }),
);
</script>

<style lang="scss">
.aix-sources-block {
  margin-top: var(--aix-marginSM);

  &__title {
    display: flex;
    align-items: center;
    gap: var(--aix-marginXXS);
    margin-bottom: var(--aix-marginXS);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 var(--aix-paddingXXS);
    border-radius: var(--aix-borderRadiusSM);
    background: var(--aix-colorFillTertiary);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXS);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__link {
    display: flex;
    align-items: flex-start;
    gap: var(--aix-marginXS);
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorBgContainer);
    color: inherit;
    text-decoration: none;
  }

  a.aix-sources-block__link {
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorPrimaryBorderHover);
      background: var(--aix-colorFillQuaternary);
    }
  }

  &__index {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--aix-colorFillTertiary);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    line-height: 1;
  }

  &__favicon {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: var(--aix-borderRadiusSM);
    object-fit: cover;
  }

  &__emoji {
    flex: none;
    font-size: var(--aix-fontSize);
    line-height: 18px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--aix-marginXXS);
  }

  &__item-title {
    overflow: hidden;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.aix-sources-block__link:hover .aix-sources-block__item-title {
    color: var(--aix-colorPrimary);
  }

  /* 摘要最多两行，超出省略 */
  &__snippet {
    display: -webkit-box;
    overflow: hidden;
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    line-height: var(--aix-lineHeight);
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
</style>
