<template>
  <div
    :class="[ns.b(), ns.is(block.state), ns.is('frozen', sent)]"
    role="group"
    :aria-label="title"
  >
    <div v-if="block.title" :class="ns.e('title')">{{ block.title }}</div>
    <div :class="ns.e('fields')">
      <template v-for="field in block.fields" :key="field.name">
        <!-- 选项组：原生 fieldset/legend 关联问题与选项，天然键盘可达、屏幕阅读器可正确播报组名 -->
        <fieldset v-if="field.type !== 'text'" :class="ns.e('field')">
          <legend :class="ns.e('question')">
            {{ field.question }}
            <span v-if="field.required" :class="ns.e('required')" :aria-label="t.confirmRequired">
              *
            </span>
          </legend>
          <label v-for="option in field.options ?? []" :key="option" :class="ns.e('option')">
            <input
              :type="field.type"
              :name="`${uid}-${field.name}`"
              :value="option"
              :checked="isChecked(field, option)"
              :disabled="!interactive"
              @change="onToggle(field, option, $event)"
            />
            <span :class="ns.e('option-label')">{{ option }}</span>
          </label>
        </fieldset>
        <div v-else :class="ns.e('field')">
          <label :class="ns.e('question')" :for="`${uid}-${field.name}`">
            {{ field.question }}
            <span v-if="field.required" :class="ns.e('required')" :aria-label="t.confirmRequired">
              *
            </span>
          </label>
          <input
            :id="`${uid}-${field.name}`"
            type="text"
            :class="ns.e('text')"
            :value="typeof field.answer === 'string' ? field.answer : ''"
            :disabled="!interactive"
            @input="onText(field, $event)"
          />
        </div>
      </template>
    </div>
    <p v-if="hintVisible" :class="ns.e('hint')">{{ t.confirmHint }}</p>
    <p v-if="autoFilled" :class="ns.e('auto-filled')">{{ t.confirmAutoFilled }}</p>
    <p v-if="invalid" :class="ns.e('error')" role="alert">{{ t.confirmRequired }}</p>
    <div :class="ns.e('actions')">
      <button
        v-if="block.state === 'awaiting' || block.state === 'submitting'"
        type="button"
        :class="ns.e('submit')"
        :disabled="!interactive"
        @click="submit(false)"
      >
        {{ block.state === 'submitting' || sent ? t.confirmSubmitting : t.confirmSubmit }}
      </button>
      <span v-else :class="ns.e('status')">
        {{ block.state === 'submitted' ? t.confirmSubmitted : t.confirmExpired }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
export interface UserConfirmBlockProps {
  /** user_confirm 类型的 block */
  block: Extract<ContentBlock, { type: 'user_confirm' }>;
  /** 气泡上下文（status/role/key）；**刻意不参与可交互性判定**，见下方 interactive 注释 */
  info: BubbleContentInfo;
  /** 打字机态：确认卡不逐字，仅注册表统一透传，本组件不消费 */
  typing?: boolean;
  /** 改答案（数据补丁）：逐层转发到 useChat.updateBlock 落地 */
  onBlockAction?: BlockActionHandler;
  /** 点提交（需宿主处置的意图）：逐层转发到 AiChat 的 block-intent，组件库不自动落地 */
  onBlockIntent?: BlockIntentHandler;
}
</script>

<script setup lang="ts">
import { useNamespace, useLocale, useId } from '@aix/hooks';
import { computed, ref, watch, watchEffect } from 'vue';
import { useConfirmDeadline } from '../../composables/useConfirmDeadline';
import { locale } from '../../locale';
import type {
  ContentBlock,
  BubbleContentInfo,
  BlockActionHandler,
  BlockIntentHandler,
  ConfirmField,
} from '../../types';

// 注册表统一向渲染器透传 block/info/typing/onBlockAction/onBlockIntent；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<UserConfirmBlockProps>();
const ns = useNamespace('user-confirm');
const { t } = useLocale(locale);
const uid = useId();

const title = computed(() => props.block.title || t.value.confirmTitle);

// 已上抛提交意图（手动或自动）：立刻本地冻结，防连点二次提交。
// 宿主随后把 state 置 submitting/submitted，两者取或即最终冻结态。
const sent = ref(false);
const invalid = ref(false);

// 解冻信号：state 由非 awaiting **回到** awaiting（宿主推进过 submitting、请求失败后回置）。
// 只认这一种往返，不认「state 一直是 awaiting 期间的任意重渲染」——后者是块数据被别处更新，
// 误解冻会让请求在途时又能点一次。反过来，宿主若收到 intent 后从不推进 state，卡片会保持
// 冻结：这是刻意的契约（收到 submit 意图就必须推进 state），否则失败即无声，用户无从判断。
watch(
  () => props.block.state,
  (state, prev) => {
    if (state === 'awaiting' && prev !== 'awaiting') sent.value = false;
  },
);

/**
 * 可交互性闸门**只看卡片自己的 state 与超时时间线**，绝不掺入 info.status。
 *
 * 确认卡的提交通常是「流已收尾后带 Last-Event-ID 续流」——正因为流结束了才需要 resume，
 * 所以「消息 success + 卡片 awaiting」恰恰是用户应该填写的状态。若按 status 禁用，
 * 卡片一出现、流一结束就变只读，用户永远填不了，功能直接废掉。
 */
const interactive = computed(() => props.block.state === 'awaiting' && !sent.value);

/** 按 defaultValue 补齐尚未作答的字段；幂等（已有答案不覆盖），可重复应用 */
const applyDefaults = (fields: ConfirmField[]): ConfirmField[] =>
  fields.map((f) =>
    isAnswered(f) || f.defaultValue === undefined ? f : { ...f, answer: f.defaultValue },
  );

const isAnswered = (f: ConfirmField): boolean =>
  Array.isArray(f.answer) ? f.answer.length > 0 : !!f.answer;

const isChecked = (f: ConfirmField, option: string): boolean =>
  Array.isArray(f.answer) ? f.answer.includes(option) : f.answer === option;

/**
 * 回写答案：**不 mutate props**，整份 fields 作为补丁经 BlockAction 上抛，
 * 由 useChat.updateBlock 统一落地（组件是纯受控的，值只来自 props.block.fields）。
 */
const patchFields = (fields: ConfirmField[]) => {
  props.onBlockAction?.({ blockId: props.block.id, type: 'answer', patch: { fields } });
};

/** 任何手动交互都撤销整条超时时间线（与 V5 一致：用户已接管，不再自动代填/代交） */
const onManualInput = () => {
  deadline.cancel();
  invalid.value = false;
};

const withAnswer = (target: ConfirmField, answer: ConfirmField['answer']): ConfirmField[] =>
  props.block.fields.map((f) => (f.name === target.name ? { ...f, answer } : f));

const onToggle = (field: ConfirmField, option: string, event: Event) => {
  onManualInput();
  const checked = (event.target as HTMLInputElement).checked;
  if (field.type === 'radio') {
    patchFields(withAnswer(field, option));
    return;
  }
  const current = Array.isArray(field.answer) ? field.answer : [];
  const next = checked ? [...current, option] : current.filter((v) => v !== option);
  patchFields(withAnswer(field, next));
};

const onText = (field: ConfirmField, event: Event) => {
  onManualInput();
  patchFields(withAnswer(field, (event.target as HTMLInputElement).value));
};

/**
 * 提交：只上抛意图，宿主自行续流 / 落库并把 state 推进到 submitting → submitted。
 * autoFill 提交（超时自动触发）跳过必填校验——自动填充未必满足必填，是否受理由宿主判断。
 */
const submit = (autoFill: boolean) => {
  if (!interactive.value) return;
  const fields = autoFill ? applyDefaults(props.block.fields) : props.block.fields;
  if (!autoFill && fields.some((f) => f.required && !isAnswered(f))) {
    invalid.value = true;
    return;
  }
  invalid.value = false;
  deadline.cancel();
  sent.value = true;
  props.onBlockIntent?.({
    blockId: props.block.id,
    type: 'submit',
    payload: { formId: props.block.formId, fields, ...(autoFill ? { autoFill: true } : {}) },
  });
};

// 超时时间线：提示 → 按默认值自动填充 → 自动提交。三重兜底（绝对时刻 / visibilitychange
// 补偿 / 排程前补发已过点节点）在 useConfirmDeadline 内，块类型无关，后续 tool_use 的
// awaiting-approval 可直接复用。
const deadline = useConfirmDeadline({
  createdAt: () => props.block.createdAt,
  timeout: () => props.block.timeout,
  active: interactive,
  onAutoFill: () => patchFields(applyDefaults(props.block.fields)),
  onAutoSubmit: () => submit(true),
});
const hintVisible = computed(() => deadline.hinted.value && interactive.value);
const autoFilled = deadline.autoFilled;

// 开发期护栏（与 Bubble 未注册渲染器、useChat.updateBlock 未命中同风格）：
// field.name 是同卡内的唯一键——重名会同时踩三处坑（v-for key 冲突、radio 的 name 撞成
// 一组、按 name 回写答案时多个字段被一起改），且全是静默错乱，难排查。每块只告警一次。
let warnedDuplicate = false;
watchEffect(() => {
  if (warnedDuplicate) return;
  const seen = new Set<string>();
  const duplicated = props.block.fields
    .map((f) => f.name)
    .filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
  if (!duplicated.length) return;
  warnedDuplicate = true;
  console.warn(
    `[ai-chat] user_confirm 块（formId="${props.block.formId}"）存在重名字段：${[
      ...new Set(duplicated),
    ].join('、')}。field.name 需在同一张卡内唯一，否则选项分组与答案回写都会错乱。`,
  );
});
</script>

<style lang="scss">
.aix-user-confirm {
  margin-top: var(--aix-marginSM);
  padding: var(--aix-paddingSM) var(--aix-padding);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadius);
  background-color: var(--aix-colorFillQuaternary);

  // 提交在途 / 已冻结：整卡不可点，避免请求回来前的重复交互（对应 V5 的 frozen）
  &.is-submitting,
  &.is-frozen {
    opacity: 0.7;
    pointer-events: none;
  }

  // 终态：去掉交互观感，回归普通只读回显
  &.is-submitted,
  &.is-expired {
    background-color: transparent;
  }

  &__title {
    margin-bottom: var(--aix-marginXS);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__fields {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginSM);
  }

  // fieldset 自带的边框/内边距在卡片内是噪音，统一清零后按本组件节奏排版
  &__field {
    margin: 0;
    padding: 0;
    border: none;
  }

  &__question {
    display: block;
    margin-bottom: var(--aix-marginXXS);
    padding: 0;
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
  }

  &__required {
    color: var(--aix-colorError);
  }

  &__option {
    display: flex;
    align-items: center;
    gap: var(--aix-marginXXS);
    padding: var(--aix-paddingXXS) 0;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    cursor: pointer;

    input:disabled {
      cursor: default;
    }

    // 只读态（提交后 / 已失效）不再有可点观感
    input:disabled + .aix-user-confirm__option-label {
      color: var(--aix-colorTextTertiary);
    }
  }

  &__text {
    width: 100%;
    height: var(--aix-controlHeight);
    padding: 0 var(--aix-paddingSM);
    transition: border-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorder);
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorBgContainer);
    color: var(--aix-colorText);
    font-family: inherit;
    font-size: var(--aix-fontSize);

    &:focus {
      border-color: var(--aix-colorPrimary);
      outline: none;
    }
  }

  &__hint,
  &__auto-filled {
    margin: var(--aix-marginXS) 0 0;
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__error {
    margin: var(--aix-marginXS) 0 0;
    color: var(--aix-colorError);
    font-size: var(--aix-fontSizeSM);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--aix-marginSM);
  }

  &__submit {
    display: inline-flex;
    align-items: center;
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-padding);
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: 999px;
    background-color: var(--aix-colorPrimary);
    color: var(--aix-colorTextLight);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--aix-colorPrimaryHover);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &__status {
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }
}
</style>
