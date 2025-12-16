<template>
  <div
    :class="['aix-sender', className, classNames?.root]"
    :style="styles?.root"
  >
    <!-- Prompt Input -->
    <div class="aix-sender__prompt-input">
      <!-- Content area with input -->
      <div
        :class="['aix-sender__content', classNames?.content]"
        :style="styles?.content"
      >
        <!-- Voice button (top-left) -->
        <button
          v-if="allowSpeech"
          :class="[
            'aix-sender__voice-button',
            { 'aix-sender__voice-button--recording': isRecording },
            classNames?.voiceButton,
          ]"
          :style="styles?.voiceButton"
          :disabled="disabled || loading"
          :aria-label="isRecording ? '停止录音' : '开始录音'"
          @click="toggleSpeech"
        >
          <slot name="voiceIcon">
            <Mic v-if="!isRecording" />
            <PauseCircle v-else />
          </slot>
        </button>

        <div
          :class="['aix-sender__input-wrapper', classNames?.inputWrapper]"
          :style="styles?.inputWrapper"
        >
          <!-- Slot 模式：结构化输入 -->
          <SlotTextArea
            v-if="isSlotMode"
            ref="slotTextAreaRef"
            :slot-config="effectiveSlotConfig!"
            :disabled="disabled || loading"
            :submit-type="submitType"
            @change="handleSlotValuesChange"
            @submit="handleSlotSubmit"
          />
          <!-- 普通模式：文本输入 -->
          <textarea
            v-else
            ref="textareaRef"
            v-model="inputValue"
            :placeholder="effectivePlaceholder"
            :disabled="disabled || loading"
            :maxlength="maxLength"
            :autofocus="autoFocus"
            :class="['aix-sender__input', classNames?.input]"
            :style="styles?.input"
            rows="1"
            @keydown="handleKeyDown"
            @input="handleInput"
          />
        </div>
      </div>

      <!-- Bottom actions bar -->
      <div
        :class="['aix-sender__footer', classNames?.footer]"
        :style="styles?.footer"
      >
        <!-- Skill selector (left) -->
        <div
          v-if="skills && skills.length > 0"
          :class="['aix-sender__skill-selector', classNames?.skillSelector]"
          :style="styles?.skillSelector"
        >
          <button
            v-for="skill in skills"
            :key="skill.key"
            class="aix-sender__skill-button"
            :class="{
              'aix-sender__skill-button--active':
                skill.key === internalActiveSkill,
            }"
            :disabled="disabled || skill.disabled"
            :title="skill.description"
            @click="handleSkillSelect(skill)"
          >
            <span v-if="skill.icon" class="aix-sender__skill-icon">
              <span v-if="typeof skill.icon === 'string'">{{
                skill.icon
              }}</span>
              <component :is="skill.icon" v-else />
            </span>
            <span class="aix-sender__skill-name">{{ skill.name }}</span>
          </button>
        </div>

        <!-- Model selector -->
        <button
          v-if="models && models.length > 0"
          :class="['aix-sender__model-button', classNames?.modelButton]"
          :style="styles?.modelButton"
          :disabled="disabled"
          @click="toggleModelSelector"
        >
          <Setting />
          <span>{{ currentModelLabel }}</span>
          <ArrowDropDown
            class="aix-sender__model-arrow"
            :class="{ 'aix-sender__model-arrow--open': showModelDropdown }"
          />
        </button>

        <!-- Send button (right) -->
        <button
          :class="['aix-sender__send-button', classNames?.sendButton]"
          :style="styles?.sendButton"
          :disabled="!canSend"
          :aria-label="loading ? t.sending : t.send"
          @click="handleSend"
        >
          <!-- Send Icon SVG -->
          <svg
            v-if="!loading"
            class="aix-sender__send-icon"
            width="16"
            height="16"
            viewBox="0 0 42 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g filter="url(#filter0_d_send)">
              <path
                d="M21 0.999999C30.9411 1 39 9.05888 39 19C39 28.9411 30.9411 37 21 37C11.0589 37 3 28.9411 3 19C3 9.05887 11.0589 0.999999 21 0.999999Z"
                fill="url(#paint0_linear_send)"
              />
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M26.1368 18.5284C26.3971 18.7888 26.3971 19.2109 26.1368 19.4712L21.4701 24.1379C21.2098 24.3983 20.7876 24.3983 20.5273 24.1379C20.2669 23.8776 20.2669 23.4554 20.5273 23.1951L24.0559 19.6665L16.332 19.6665C15.9638 19.6665 15.6654 19.368 15.6654 18.9998C15.6654 18.6316 15.9638 18.3332 16.332 18.3332L24.0559 18.3332L20.5273 14.8046C20.2669 14.5442 20.2669 14.1221 20.5273 13.8618C20.7876 13.6014 21.2098 13.6014 21.4701 13.8618L26.1368 18.5284Z"
                fill="white"
              />
            </g>
            <defs>
              <filter
                id="filter0_d_send"
                x="0"
                y="0"
                width="42"
                height="42"
                filterUnits="userSpaceOnUse"
                color-interpolation-filters="sRGB"
              >
                <feFlood flood-opacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feMorphology
                  radius="1"
                  operator="erode"
                  in="SourceAlpha"
                  result="effect1_dropShadow_send"
                />
                <feOffset dy="2" />
                <feGaussianBlur stdDeviation="2" />
                <feComposite in2="hardAlpha" operator="out" />
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"
                />
                <feBlend
                  mode="multiply"
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_send"
                />
                <feBlend
                  mode="normal"
                  in="SourceGraphic"
                  in2="effect1_dropShadow_send"
                  result="shape"
                />
              </filter>
              <linearGradient
                id="paint0_linear_send"
                x1="39"
                y1="19"
                x2="3"
                y2="19"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#323232" />
                <stop offset="1" stop-color="#222222" />
              </linearGradient>
            </defs>
          </svg>
          <Loading v-else class="aix-sender__loading-icon" />
        </button>

        <!-- Model dropdown -->
        <div v-if="showModelDropdown" class="aix-sender__model-dropdown">
          <div
            v-for="model in models"
            :key="model.id"
            class="aix-sender__model-item"
            :class="{
              'aix-sender__model-item--active':
                model.id === internalSelectedModel,
            }"
            @click="selectModel(model.id)"
          >
            <span v-if="model.icon" class="aix-sender__model-icon">{{
              model.icon
            }}</span>
            <div class="aix-sender__model-info">
              <div class="aix-sender__model-label">{{ model.label }}</div>
              <div v-if="model.description" class="aix-sender__model-desc">
                {{ model.description }}
              </div>
            </div>
            <span v-if="model.premium" class="aix-sender__model-badge"
              >Pro</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Sender 组件
 * @see ./types.ts - 类型定义
 */
import { useLocale } from '@aix/hooks';
import { Mic, PauseCircle, Setting, ArrowDropDown, Loading } from '@aix/icons';
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useSpeechInput } from '../../composables/useSpeechInput';
import { chatLocale } from '../../locale';
import SlotTextArea from './SlotTextArea.vue';
import type {
  SenderProps,
  SenderEmits,
  ModelOption,
  SlotValues,
  SkillConfig,
} from './types';

const props = withDefaults(defineProps<SenderProps>(), {
  value: '',
  disabled: false,
  loading: false,
  allowClear: true,
  autoFocus: false,
  autoSize: true,
  submitType: 'enter',
  allowSpeech: false,
});

const emit = defineEmits<SenderEmits>();

/*  国际化 */
const { t } = useLocale(chatLocale);

const inputValue = ref(props.value);
const textareaRef = ref<HTMLTextAreaElement>();
const slotTextAreaRef = ref<InstanceType<typeof SlotTextArea>>();
const showModelDropdown = ref(false);
const internalSelectedModel = ref(
  props.selectedModel || props.models?.[0]?.id || '',
);
const currentSlotValues = ref<SlotValues>({});
const internalActiveSkill = ref(
  props.activeSkill || props.skills?.[0]?.key || '',
);

/* ===== Skill 技能系统 ===== */

/**
 * 当前激活的技能配置
 */
const currentSkill = computed<SkillConfig | undefined>(() => {
  if (!props.skills || props.skills.length === 0) return undefined;
  return props.skills.find((s) => s.key === internalActiveSkill.value);
});

/**
 * 当前有效的 slotConfig（优先使用 skill 的，其次使用 props 的）
 */
const effectiveSlotConfig = computed(() => {
  // 优先使用当前技能的 slotConfig
  if (
    currentSkill.value?.slotConfig &&
    currentSkill.value.slotConfig.length > 0
  ) {
    return currentSkill.value.slotConfig;
  }
  // 其次使用 props 的 slotConfig
  return props.slotConfig;
});

/**
 * 当前有效的 placeholder
 */
const effectivePlaceholder = computed(() => {
  // 优先使用当前技能的 placeholder
  if (currentSkill.value?.placeholder) {
    return currentSkill.value.placeholder;
  }
  // 其次使用 props 的 placeholder
  return props.placeholder || '输入消息...';
});

/**
 * 处理技能选择
 */
function handleSkillSelect(skill: SkillConfig) {
  if (skill.disabled) return;

  internalActiveSkill.value = skill.key;
  emit('update:activeSkill', skill.key);
  emit('skillChange', skill);

  // 重置 slot 值
  currentSlotValues.value = {};
  slotTextAreaRef.value?.reset();
}

// 监听外部 activeSkill 变化
watch(
  () => props.activeSkill,
  (newValue) => {
    if (newValue && newValue !== internalActiveSkill.value) {
      internalActiveSkill.value = newValue;
    }
  },
);

/* ===== Slot 模式相关 ===== */

/**
 * 是否为 Slot 模式
 */
const isSlotMode = computed(() => {
  return effectiveSlotConfig.value && effectiveSlotConfig.value.length > 0;
});

/**
 * 处理 Slot 值变化
 */
function handleSlotValuesChange(values: SlotValues) {
  currentSlotValues.value = values;
  emit('slotChange', values);
}

/**
 * 处理 Slot 模式提交
 */
function handleSlotSubmit(values: SlotValues) {
  if (props.disabled || props.loading) return;

  // 生成文本摘要
  const textSummary = generateSlotTextSummary(values);
  // 提交时包含 skill 信息
  emit('submit', textSummary, values, currentSkill.value);

  // 重置
  slotTextAreaRef.value?.reset();
  currentSlotValues.value = {};
}

/**
 * 生成 Slot 值的文本摘要
 */
function generateSlotTextSummary(values: SlotValues): string {
  const config = effectiveSlotConfig.value;
  if (!config) return '';

  const parts: string[] = [];
  config.forEach((slot) => {
    if (slot.type === 'text') {
      parts.push(slot.value);
    } else if (slot.key && values[slot.key]) {
      parts.push(String(values[slot.key]));
    }
  });

  return parts.join(' ').trim();
}

/* 草稿保存功能 */
const DEFAULT_DRAFT_KEY = 'aix_chat_draft';
let draftTimer: ReturnType<typeof setTimeout> | null = null;

// 获取草稿 key（支持禁用）
const getDraftKey = () => {
  if (props.draftKey === false) return null;
  return props.draftKey || DEFAULT_DRAFT_KEY;
};

// 加载草稿
const loadDraft = () => {
  const key = getDraftKey();
  if (!key) return;
  try {
    const draft = localStorage.getItem(key);
    if (draft && !props.value) {
      inputValue.value = draft;
    }
  } catch (error) {
    console.warn('[Sender] 加载草稿失败:', error);
  }
};

// 保存草稿（防抖）
const saveDraft = (value: string) => {
  const key = getDraftKey();
  if (!key) return;
  if (draftTimer) {
    clearTimeout(draftTimer);
  }
  draftTimer = setTimeout(() => {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('[Sender] 保存草稿失败:', error);
    }
    draftTimer = null;
  }, 500);
};

// 清除草稿
const clearDraft = () => {
  const key = getDraftKey();
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('[Sender] 清除草稿失败:', error);
  }
};

// 清理定时器
const cleanupDraftTimer = () => {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
};

/*  语音输入功能 */
const { isRecording, startSpeech, stopSpeech, toggleSpeech } = useSpeechInput({
  speech: props.speech,
  disabled: props.disabled,
  loading: props.loading,
  inputValue,
  onInputUpdate: (value) => {
    emit('update:value', value);
    emit('change', value);
  },
  onSpeechStart: () => emit('speechStart'),
  onSpeechEnd: (text) => emit('speechEnd', text),
  onSpeechError: (error) => emit('speechError', error),
});

/*  监听外部 value 变化 */
watch(
  () => props.value,
  (newValue) => {
    inputValue.value = newValue;
  },
);

/*  监听外部 selectedModel 变化 */
watch(
  () => props.selectedModel,
  (newValue) => {
    if (newValue) {
      internalSelectedModel.value = newValue;
    }
  },
);

/**
 * 是否可以发送
 */
const canSend = computed(() => {
  if (props.disabled || props.loading) return false;

  // Slot 模式：检查是否有任何填写的值
  if (isSlotMode.value) {
    const values = currentSlotValues.value;
    return Object.keys(values).some((key) => {
      const val = values[key];
      return val !== undefined && val !== null && String(val).trim() !== '';
    });
  }

  // 普通模式：检查输入内容
  return inputValue.value.trim().length > 0;
});

/**
 * 当前选中模型的显示名称
 */
const currentModelLabel = computed(() => {
  const model = props.models?.find(
    (m: ModelOption) => m.id === internalSelectedModel.value,
  );
  return model?.label || '选择模型';
});

/**
 * 自动调整 textarea 高度
 */
const adjustTextareaHeight = () => {
  if (props.autoSize && textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
  }
};

/**
 * 输入处理
 */
const handleInput = () => {
  emit('update:value', inputValue.value);
  emit('change', inputValue.value);
  // 保存草稿
  saveDraft(inputValue.value);
  nextTick(() => {
    adjustTextareaHeight();
  });
};

/**
 * 键盘事件处理
 * 根据 submitType 配置决定提交方式：
 * - 'enter': Enter 提交，Shift+Enter 换行
 * - 'shiftEnter': Shift+Enter 提交，Enter 换行
 * - 'ctrlEnter': Ctrl/Cmd+Enter 提交，Enter 换行
 * - false: 禁用键盘提交
 */
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return;

  const { submitType } = props;

  // 禁用键盘提交
  if (submitType === false) return;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

  switch (submitType) {
    case 'enter':
      // Enter 提交，Shift+Enter 换行
      if (!e.shiftKey && !isCtrlOrCmd) {
        e.preventDefault();
        handleSend();
      }
      break;
    case 'shiftEnter':
      // Shift+Enter 提交，Enter 换行
      if (e.shiftKey && !isCtrlOrCmd) {
        e.preventDefault();
        handleSend();
      }
      break;
    case 'ctrlEnter':
      // Ctrl/Cmd+Enter 提交，Enter 换行
      if (isCtrlOrCmd && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      break;
  }
};

/**
 * 发送消息
 */
const handleSend = () => {
  if (!canSend.value) return;

  // Slot 模式：使用 handleSlotSubmit
  if (isSlotMode.value) {
    handleSlotSubmit(currentSlotValues.value);
    return;
  }

  // 普通模式
  const message = inputValue.value.trim();
  emit('submit', message);

  // 清空输入
  inputValue.value = '';
  emit('update:value', '');

  // 清除草稿
  clearDraft();

  // 重置高度
  if (props.autoSize) {
    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.style.height = 'auto';
      }
    });
  }
};

/**
 * 切换模型选择器
 */
const toggleModelSelector = () => {
  showModelDropdown.value = !showModelDropdown.value;
};

/**
 * 选择模型
 */
const selectModel = (modelId: string) => {
  internalSelectedModel.value = modelId;
  showModelDropdown.value = false;
  emit('update:selectedModel', modelId);
  emit('modelChange', modelId);
};

/**
 * 处理外部点击关闭下拉框
 */
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  // 检查点击是否在下拉框或模型按钮之外
  if (
    showModelDropdown.value &&
    !target.closest('.aix-sender__model-dropdown') &&
    !target.closest('.aix-sender__model-button')
  ) {
    showModelDropdown.value = false;
  }
};

/*  生命周期钩子 */
onMounted(() => {
  // 加载草稿
  loadDraft();
  // 监听外部点击
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  // 清理定时器
  cleanupDraftTimer();
  // 移除事件监听
  document.removeEventListener('click', handleClickOutside);
});

/*  暴露方法供外部调用 */
defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear: () => {
    inputValue.value = '';
    emit('update:value', '');
  },
  startSpeech,
  stopSpeech,
});
</script>

<style scoped lang="scss">
.aix-sender {
  display: flex;
  position: relative;
  box-sizing: border-box;
  flex-direction: column;
  width: 100%;
  transition: all 0.3s;
  border: 1px solid var(--colorBorder);
  border-radius: calc(var(--borderRadius, 6px) * 2);
  background: var(--colorBgContainer, #fff);
  box-shadow:
    0 1px 2px 0 rgb(0 0 0 / 0.03),
    0 1px 6px -1px rgb(0 0 0 / 0.02),
    0 2px 4px 0 rgb(0 0 0 / 0.02);

  /* 聚焦状态 */
  &:focus-within {
    border-color: var(--colorPrimary);
    box-shadow:
      0 2px 4px -1px rgb(0 0 0 / 0.1),
      0 4px 6px -2px rgb(0 0 0 / 0.05);
  }

  &__prompt-input {
    display: flex;
    flex-direction: column;
  }

  &__content {
    display: flex;
    align-items: flex-start;
    gap: var(--paddingXS);
    padding-block: var(--paddingSM);
    padding-inline: var(--padding) var(--paddingSM);
  }

  &__input-wrapper {
    display: flex;
    flex: 1;
    align-items: center;
  }

  &__input {
    flex: auto;
    min-height: 22px;
    max-height: 120px;
    padding: 0;
    overflow-y: auto;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--colorText);
    font-size: var(--fontSize);
    line-height: var(--lineHeight);
    resize: none;

    &:focus {
      outline: none;
    }

    &:disabled {
      color: var(--colorTextDisabled);
      cursor: not-allowed;
    }

    &::placeholder {
      color: var(--colorTextPlaceholder);
    }

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: var(--borderRadiusXS);
      background: var(--colorFillTertiary);

      &:hover {
        background: var(--colorFillSecondary);
      }
    }
  }

  &__voice-button {
    display: inline-flex;
    flex: none;
    align-items: center;
    align-self: flex-start;
    justify-content: center;
    width: var(--controlHeight);
    height: var(--controlHeight);
    padding: 0;
    transition: all 0.3s;
    border: 1px solid var(--colorBorder);
    border-radius: calc(var(--borderRadius) * 2);
    background: var(--colorBgContainer);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
      color: var(--colorText);
    }

    &:hover:not(:disabled) {
      border-color: var(--colorPrimary);
      color: var(--colorPrimary);

      svg {
        color: var(--colorPrimary);
      }
    }

    &:disabled {
      border-color: var(--colorBorder);
      color: var(--colorTextDisabled);
      cursor: not-allowed;

      svg {
        color: var(--colorTextDisabled);
      }
    }

    &--recording {
      animation: recordingPulse 1.5s infinite;
      border-color: var(--colorError);
      background: var(--colorError);

      svg {
        color: var(--colorTextLight);
      }
    }
  }

  &__send-button {
    display: inline-flex;
    grid-column: 2;
    align-items: center;
    justify-content: center;
    justify-self: end;
    width: var(--controlHeight);
    height: var(--controlHeight);
    padding: 0;
    transition: all 0.3s;
    border: none;
    border-radius: calc(var(--borderRadius) * 2);
    background: var(--colorText);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--colorPrimary);
    }

    &:disabled {
      background: var(--colorBgContainerDisabled);
      cursor: not-allowed;
    }
  }

  &__send-icon {
    width: 16px;
    height: 16px;
  }

  &__loading-icon {
    width: 16px;
    height: 16px;
    animation: loadingSpin 1s linear infinite;
    color: var(--colorTextLight);
  }

  &__footer {
    display: grid;
    position: relative;
    grid-template-columns: auto 1fr;
    align-items: center;
    padding-block-end: var(--paddingSM);
    padding-inline: var(--paddingSM);
    gap: var(--paddingSM);
  }

  &__model-button {
    display: inline-flex;
    align-items: center;
    max-width: 200px;
    height: var(--controlHeightSM);
    padding-block: var(--paddingXXS);
    padding-inline: var(--paddingSM);
    transition: all 0.3s;
    border: 1px solid var(--colorBorder);
    border-radius: calc(var(--borderRadius) * 2);
    background: var(--colorBgContainer);
    color: var(--colorText);
    font-size: var(--fontSizeSM);
    cursor: pointer;
    gap: 6px;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    svg {
      flex: none;
      width: 14px;
      height: 14px;
    }

    &:hover:not(:disabled) {
      border-color: var(--colorPrimary);
      color: var(--colorPrimary);
    }

    &:disabled {
      border-color: var(--colorBorder);
      color: var(--colorTextDisabled);
      cursor: not-allowed;
    }
  }

  &__model-arrow {
    transition: transform 0.3s;

    &--open {
      transform: rotate(180deg);
    }
  }

  &__model-dropdown {
    position: absolute;
    z-index: 1000;
    bottom: 100%;
    left: var(--paddingSM);
    min-width: 280px;
    max-height: 320px;
    margin-bottom: 8px;
    overflow-y: auto;
    border: 1px solid var(--colorBorder);
    border-radius: var(--borderRadius);
    background: var(--colorBgContainer);
    box-shadow: var(--shadow-lg);
  }

  &__model-item {
    display: flex;
    align-items: center;
    padding: var(--paddingSM);
    gap: var(--paddingXS);
    transition: background 0.3s;
    cursor: pointer;

    &:hover {
      background: var(--colorBgTextHover);
    }

    &--active {
      background: var(--colorPrimaryBg);
      color: var(--colorPrimary);
    }
  }

  &__model-icon {
    flex: none;
    font-size: 20px;
  }

  &__model-info {
    flex: 1;
    min-width: 0;
  }

  &__model-label {
    font-size: var(--fontSize);
    font-weight: 500;
    line-height: 1.4;
  }

  &__model-desc {
    margin-top: 2px;
    overflow: hidden;
    color: var(--colorTextSecondary);
    font-size: var(--fontSizeSM);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__model-badge {
    flex: none;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--colorWarningBg);
    color: var(--colorWarning);
    font-size: 12px;
    font-weight: 600;
  }

  /* Skill 选择器样式 */
  &__skill-selector {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--paddingXXS, 4px);
  }

  &__skill-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: var(--controlHeightSM, 24px);
    padding-block: var(--paddingXXS, 4px);
    padding-inline: var(--paddingSM, 12px);
    transition: all 0.2s;
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: calc(var(--borderRadius, 6px) * 2);
    background: var(--colorBgContainer, #fff);
    color: var(--colorTextSecondary, #666);
    font-size: var(--fontSizeSM, 12px);
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--colorPrimary, #1677ff);
      color: var(--colorPrimary, #1677ff);
    }

    &--active {
      border-color: var(--colorPrimary, #1677ff);
      background: var(--colorPrimaryBg, #e6f4ff);
      color: var(--colorPrimary, #1677ff);
    }

    &:disabled {
      border-color: var(--colorBorder, #d9d9d9);
      background: var(--colorBgContainerDisabled, #f5f5f5);
      color: var(--colorTextDisabled, #bfbfbf);
      cursor: not-allowed;
    }
  }

  &__skill-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }

  &__skill-name {
    white-space: nowrap;
  }
}

/*  加载旋转动画 */
@keyframes loadingSpin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/*  录音脉冲动画 */
@keyframes recordingPulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 var(--colorError);
  }

  50% {
    opacity: 0.85;
    box-shadow: 0 0 0 10px transparent;
  }
}

/*  响应式设计 */
@media (width <= 768px) {
  .aix-sender {
    &__content {
      padding-block: var(--paddingXS);
      padding-inline: var(--paddingSM);
    }

    &__input {
      font-size: var(--fontSizeSM);
    }

    &__voice-button,
    &__send-button {
      width: var(--controlHeightSM);
      height: var(--controlHeightSM);

      svg {
        width: 14px;
        height: 14px;
      }
    }

    &__send-icon,
    &__loading-icon {
      width: 14px;
      height: 14px;
    }
  }
}
</style>
