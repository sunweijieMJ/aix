<template>
  <div :class="[ns.b(), ns.m(placement)]">
    <div v-if="avatar || $slots.avatar" :class="ns.e('avatar')">
      <slot name="avatar"><img :src="avatar" alt="" /></slot>
    </div>
    <div :class="ns.e('wrapper')">
      <div v-if="$slots.header" :class="ns.e('header')"><slot name="header" /></div>
      <div :class="[ns.e('content'), ns.em('content', variant), ns.em('content', shape)]">
        <span v-if="loading" :class="ns.e('loading')">
          <i
            v-for="i in 3"
            :key="i"
            :class="ns.e('dot')"
            :style="{ animationDelay: `${i * 0.15}s` }"
          />
        </span>
        <div v-else-if="editing" :class="ns.e('edit')">
          <textarea
            v-model="draft"
            :class="ns.e('edit-input')"
            rows="2"
            :aria-label="t.editButton"
          />
          <div :class="ns.e('edit-actions')">
            <button type="button" :class="ns.e('edit-cancel')" @click="cancelEdit">
              {{ t.exitEdit }}
            </button>
            <button type="button" :class="ns.e('edit-save')" @click="saveEdit">
              {{ t.saveButton }}
            </button>
          </div>
        </div>
        <template v-else>
          <slot name="content" :blocks="content" :info="info">
            <component :is="renderedNode" v-if="contentRender" />
            <template v-else>
              <!-- 单一注册表分发：内置 text/reasoning/sources/thought-chain/choice 与用户 blockRenderers
                   合并后统一查表，无对应渲染器的块（如自定义未注册类型）安全跳过（开发期 console.warn 提示）。 -->
              <template v-for="block in content" :key="block.id">
                <component
                  :is="renderers[block.type]"
                  v-if="renderers[block.type]"
                  :block="block"
                  :info="info"
                  :typing="typing"
                  :on-block-action="handleBlockAction"
                >
                  <!-- 透传消费方提供的「非保留」具名插槽（约定 <块类型>-<内部slot>）给块渲染器，
                       由其映射到内部组件对应 slot。v-for 仅遍历实际存在的插槽，不产生幽灵插槽。 -->
                  <template v-for="name in blockSlotNames" :key="name" #[name]="sp">
                    <slot :name="name" v-bind="sp" />
                  </template>
                </component>
              </template>
            </template>
          </slot>
          <!-- 出错态：提示 + 重试入口（点击向上冒泡，由 AiChat 调 onReload） -->
          <span v-if="status === 'error'" :class="ns.e('error')">
            <span :class="ns.e('error-text')">{{ t.errorMessage }}</span>
            <button type="button" :class="ns.e('retry')" @click="emit('retry')">
              {{ t.retryButton }}
            </button>
          </span>
        </template>
      </div>
      <button
        v-if="canEdit && !editing"
        type="button"
        :class="ns.e('edit-btn')"
        :aria-label="t.editButton"
        :title="t.editButton"
        @click="enterEdit"
      >
        <Edit />
      </button>
      <div v-if="$slots.footer" :class="ns.e('footer')"><slot name="footer" /></div>
    </div>
  </div>
</template>

<script lang="ts">
import type { BlockAction } from '../types';

// 注：与下方 <script setup> 的类型 import 合并后属同一模块，BlockAction 仅在此声明一次，
// setup 块不再重复 import，避免 vue-tsc 报 Duplicate identifier。
export interface BubbleEmits {
  /** 出错态点击重试（由 AiChat 调 onReload） */
  (e: 'retry'): void;
  /** 交互块上抛的动作（携带所属消息 key），由 AiChat 调 updateBlock */
  (e: 'block-action', payload: { messageKey: string | number; action: BlockAction }): void;
  /** 用户消息内联编辑保存，携带新文本（由 AiChat 调 onEdit） */
  (e: 'edit', text: string): void;
}
</script>

<script setup lang="ts">
import { computed, watchEffect, useSlots, ref } from 'vue';
import { useLocale } from '@aix/hooks';
import type { BubbleProps, BubbleContentInfo, BlockRenderers } from '../types';
import { useNamespace } from '../composables/useNamespace';
import TextBlock from './blocks/TextBlock.vue';
import ReasoningBlock from './blocks/ReasoningBlock.vue';
import ThoughtChainBlock from './blocks/ThoughtChainBlock.vue';
import ChoiceBlock from './blocks/ChoiceBlock.vue';
import SourcesBlock from './blocks/SourcesBlock.vue';
import { locale } from '../locale';
import { Edit } from '@aix/icons';
import { messageText } from '../utils/helpers';

const props = withDefaults(defineProps<BubbleProps>(), {
  content: () => [],
  role: 'ai',
  placement: 'start',
  variant: 'filled',
  shape: 'round',
  loading: false,
  typing: false,
  blockRenderers: () => ({}),
});

const emit = defineEmits<BubbleEmits>();

// 交互渲染器经统一回调上抛动作；补齐所属消息 key 后向上转发，由 AiChat 落到 useChat.updateBlock。
const handleBlockAction = (action: BlockAction) =>
  emit('block-action', { messageKey: props.itemKey ?? '', action });

const ns = useNamespace('bubble');
const { t } = useLocale(locale);
const slots = useSlots();

// Bubble 自身消费的保留插槽；其余具名插槽视为「块插槽」透传给块渲染器。
const RESERVED_SLOTS = ['avatar', 'header', 'content', 'footer'];
const blockSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !RESERVED_SLOTS.includes(n)),
);

// 块渲染注册表：内置 text → TextBlock、reasoning → ReasoningBlock（折叠思考过程）、
// thought-chain → ThoughtChainBlock（Agent 步骤时间线），与 props.blockRenderers 合并（用户优先，可覆盖内置）。
// 收敛为单一注册表，避免内置类型硬编码先于注册表导致无法覆盖、内置与扩展走两套机制。
const builtinRenderers: BlockRenderers = {
  text: TextBlock,
  reasoning: ReasoningBlock,
  'thought-chain': ThoughtChainBlock,
  sources: SourcesBlock,
  // 单 / 多选统一由 ChoiceBlock 渲染（multiple 区分）。
  choice: ChoiceBlock,
};
const renderers = computed<BlockRenderers>(() => ({
  ...builtinRenderers,
  ...props.blockRenderers,
}));

// 开发期提示：内容块无对应渲染器时跳过渲染并告警（每种类型仅一次），
// 避免如未注册的 sources 块被静默丢弃而难以排查。
const warnedTypes = new Set<string>();
watchEffect(() => {
  for (const block of props.content ?? []) {
    if (!renderers.value[block.type] && !warnedTypes.has(block.type)) {
      warnedTypes.add(block.type);
      console.warn(
        `[AiChat] 内容块类型 "${block.type}" 没有注册渲染器，已跳过渲染。请通过 blockRenderers 注册对应组件。`,
      );
    }
  }
});

const info = computed<BubbleContentInfo>(() => ({
  status: props.status,
  role: props.role,
  key: props.itemKey ?? '',
}));

const renderedNode = computed(() =>
  props.contentRender ? props.contentRender(props.content, info.value) : null,
);

// 内联编辑：仅 user 气泡且 editable、非 loading 时可进入
const canEdit = computed(() => props.editable && props.role === 'user' && !props.loading);
const editing = ref(false);
const draft = ref('');
const enterEdit = () => {
  draft.value = messageText({ id: '', role: props.role ?? 'ai', content: props.content ?? [] });
  editing.value = true;
};
const saveEdit = () => {
  const text = draft.value.trim();
  if (!text) return; // 空内容不提交
  emit('edit', text);
  editing.value = false;
};
const cancelEdit = () => {
  editing.value = false;
};
</script>

<style lang="scss">
.aix-bubble {
  display: flex;
  align-items: flex-start;
  gap: var(--aix-sizeSM);
  margin-bottom: var(--aix-paddingLG);

  &--end {
    flex-direction: row-reverse;
  }

  &__avatar {
    flex: none;

    img {
      display: block;
      width: 36px;
      height: 36px;
      border: 1px solid var(--aix-colorBorderSecondary);
      border-radius: 50%;
      background-color: var(--aix-colorFillTertiary);
      object-fit: cover;
    }
  }

  &__wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXXS);
    min-width: 0;
  }

  &--end &__wrapper {
    align-items: flex-end;
  }

  &__header {
    padding: 0 var(--aix-paddingXXS);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__content {
    position: relative;
    max-width: min(680px, 100%);
    padding: var(--aix-paddingSM) var(--aix-padding);
    transition:
      border-color var(--aix-motionDurationMid) var(--aix-motionEaseInOut),
      box-shadow var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    overflow-wrap: break-word;

    /* AI 气泡：白底卡片，细边 + 极轻阴影，在浅灰背景上浮起 */
    &--filled {
      border: 1px solid var(--aix-colorBorderSecondary);
      border-radius: var(--aix-borderRadiusLG);
      background-color: var(--aix-colorBgContainer);
      box-shadow: var(--aix-shadowXS);
    }

    &--outlined {
      border: 1px solid var(--aix-colorBorder);
      border-radius: var(--aix-borderRadiusLG);
    }

    &--shadow {
      border-radius: var(--aix-borderRadiusLG);
      background-color: var(--aix-colorBgContainer);
      box-shadow: var(--aix-shadowSM);
    }

    &--borderless {
      padding-right: 0;
      padding-left: 0;
    }

    &--round {
      border-radius: var(--aix-borderRadiusLG);
    }

    &--corner {
      border-radius: var(--aix-borderRadiusLG);
    }
  }

  /* 贴角变体：靠头像一侧收一个尖角，指向说话者 */
  &--start &__content--corner {
    border-top-left-radius: var(--aix-borderRadiusXS);
  }

  &--end &__content--corner {
    border-top-right-radius: var(--aix-borderRadiusXS);
  }

  /* 用户气泡：主色浅底，去边框 */
  &--end &__content--filled {
    border-color: transparent;
    background-color: var(--aix-colorPrimaryBg);
    box-shadow: none;
  }

  &__footer {
    padding: 0 var(--aix-paddingXXS);
  }

  &__edit-btn {
    display: inline-flex;
    align-items: center;
    align-self: flex-end;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    padding: 0;
    transition: opacity var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    opacity: 0;
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }
  }

  &__wrapper:hover &__edit-btn,
  &__edit-btn:focus-visible {
    opacity: 1;
  }

  &__edit {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXXS);
    min-width: 240px;
  }

  &__edit-input {
    width: 100%;
    padding: var(--aix-paddingXS);
    border: 1px solid var(--aix-colorBorder);
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorBgContainer);
    color: var(--aix-colorText);
    font-family: inherit;
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    resize: vertical;

    &:focus {
      border-color: var(--aix-colorPrimary);
      outline: none;
    }
  }

  &__edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--aix-sizeXS);
  }

  &__edit-cancel,
  &__edit-save {
    padding: 2px var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorder);
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
  }

  &__edit-save {
    border-color: transparent;
    background-color: var(--aix-colorPrimary);
    color: var(--aix-colorTextLight);
  }

  @media (hover: none) {
    &__edit-btn {
      opacity: 1;
    }
  }

  &__error {
    display: inline-flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    margin-top: var(--aix-marginXXS);
    color: var(--aix-colorError);
    font-size: var(--aix-fontSizeSM);
  }

  &__retry {
    padding: 2px var(--aix-paddingXS);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorErrorBorder);
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorError);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorError);
      background-color: var(--aix-colorErrorBg);
    }
  }

  &__loading {
    display: inline-flex;
    gap: 5px;
    padding: var(--aix-paddingXXS) 0;
  }

  &__dot {
    width: 6px;
    height: 6px;
    animation: aix-bubble-wave 1.2s infinite ease-in-out;
    border-radius: 50%;
    background-color: var(--aix-colorTextTertiary);
  }
}

@keyframes aix-bubble-wave {
  0%,
  100% {
    transform: translateY(-2px);
    opacity: 0.6;
  }

  50% {
    transform: translateY(2px);
    opacity: 1;
  }
}
</style>
