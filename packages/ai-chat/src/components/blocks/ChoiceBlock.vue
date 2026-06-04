<template>
  <ResultCard :title="typeLabel" :editable="!editing && !!block.editable" @edit="enterEdit">
    <!-- ============ 展示态 · review 模式（只读结果卡） ============ -->
    <template v-if="!editing && mode === 'review'">
      <div :class="ns.e('review')">
        <div :class="ns.e('stem')">
          <span :class="ns.e('stem-prefix')">{{ t.stemLabel }}：</span>
          {{ block.stem }}
        </div>
        <div :class="ns.e('review-options')">
          <div v-for="opt in block.options" :key="opt.id" :class="ns.e('review-option')">
            {{ opt.label }}. {{ opt.content }}
          </div>
        </div>
        <div v-if="answerText" :class="ns.e('answer')">{{ t.standardAnswer }}{{ answerText }}</div>
        <div v-if="block.analysis" :class="ns.e('analysis')">
          <span :class="ns.e('analysis-prefix')">{{ t.analysisLabel }}：</span>
          {{ block.analysis }}
        </div>
      </div>
    </template>

    <!-- ============ 展示态 · answer 模式（可点击作答，保留旧交互/DOM） ============ -->
    <template v-else-if="!editing">
      <div :class="ns.e('stem')">{{ block.stem }}</div>
      <ul :class="ns.e('options')" :role="multiple ? 'group' : 'radiogroup'">
        <li
          v-for="opt in block.options"
          :key="opt.id"
          :class="[ns.e('option'), { 'is-selected': selectedArr.includes(opt.id) }]"
          :role="multiple ? 'checkbox' : 'radio'"
          :aria-checked="selectedArr.includes(opt.id)"
          tabindex="0"
          @click="selectOption(opt.id)"
          @keydown="(e) => onOptionKeydown(e, opt.id)"
        >
          <span :class="ns.e('option-label')">{{ opt.label }}</span>
          <span :class="ns.e('option-content')">{{ opt.content }}</span>
        </li>
      </ul>
      <div v-if="answerText" :class="ns.e('answer')">{{ t.standardAnswer }}{{ answerText }}</div>
      <div v-if="block.analysis" :class="ns.e('analysis')">{{ block.analysis }}</div>
    </template>

    <!-- ============ 编辑态 ============ -->
    <div v-else :class="ns.e('edit')">
      <!-- 顶部「退出编辑 / 保存」按钮行 -->
      <div :class="ns.e('edit-actions')">
        <button type="button" :class="ns.e('exit')" @click="exitEdit">{{ t.exitEdit }}</button>
        <button type="button" :class="ns.e('save')" @click="save">{{ t.saveButton }}</button>
      </div>

      <!-- 题干 -->
      <div :class="ns.e('field')">
        <label :class="ns.e('label')">{{ t.stemLabel }}</label>
        <textarea
          :class="ns.e('stem-input')"
          :value="draft.stem"
          :placeholder="t.stemPlaceholder"
          rows="2"
          @input="draft.stem = ($event.target as HTMLTextAreaElement).value"
        />
      </div>

      <!-- 选项 -->
      <div :class="ns.e('field')">
        <div :class="ns.e('field-head')">
          <label :class="ns.e('label')">{{ t.optionsLabel }}</label>
          <span :class="ns.e('hint')">{{ t.mustSetAnswer }}</span>
        </div>
        <div v-for="(opt, i) in draft.options" :key="opt.id" :class="ns.e('edit-option')">
          <!-- 正确答案标记按钮（对号） -->
          <button
            type="button"
            :class="[ns.e('mark'), { 'is-checked': draft.answer.includes(opt.id) }]"
            :aria-label="opt.label"
            :aria-pressed="draft.answer.includes(opt.id)"
            @click="toggleAnswer(opt.id)"
          >
            <Check :class="ns.e('mark-icon')" />
          </button>
          <!-- 字母方框徽标 -->
          <span :class="ns.e('badge')">{{ opt.label }}</span>
          <!-- 选项内容 -->
          <input
            :class="ns.e('option-input')"
            :value="opt.content"
            :placeholder="t.optionPlaceholder"
            @input="opt.content = ($event.target as HTMLInputElement).value"
          />
          <!-- 上移 / 下移 -->
          <button
            type="button"
            :class="ns.e('icon-btn')"
            :disabled="i === 0"
            :aria-label="t.moveUp"
            @click="moveOption(i, -1)"
          >
            <ArrowUpward :class="ns.e('btn-icon')" />
          </button>
          <button
            type="button"
            :class="ns.e('icon-btn')"
            :disabled="i === draft.options.length - 1"
            :aria-label="t.moveDown"
            @click="moveOption(i, 1)"
          >
            <ArrowDownward :class="ns.e('btn-icon')" />
          </button>
          <!-- 删除（>2 项才显示） -->
          <button
            v-if="draft.options.length > 2"
            type="button"
            :class="[ns.e('icon-btn'), ns.e('icon-btn-danger')]"
            :aria-label="t.deleteButton"
            @click="removeOption(i)"
          >
            <Delete :class="ns.e('btn-icon')" />
          </button>
        </div>
        <button type="button" :class="ns.e('add')" @click="addOption">
          <AddCircle :class="ns.e('add-icon')" />
          {{ t.addOption }}
        </button>
      </div>

      <!-- 答案解析 -->
      <div :class="ns.e('field')">
        <label :class="ns.e('label')">{{ t.analysisLabel }}</label>
        <textarea
          :class="ns.e('analysis-input')"
          :value="draft.analysis"
          :placeholder="t.analysisPlaceholder"
          rows="3"
          @input="draft.analysis = ($event.target as HTMLTextAreaElement).value"
        />
      </div>
    </div>

    <!-- ============ 底部操作 pill（展示态：插入视频 / 删除） ============ -->
    <template v-if="!editing" #actions>
      <button type="button" :class="ns.e('pill')" @click="emitAction('insert-video', {})">
        <OndemandVideo :class="ns.e('pill-icon')" />
        {{ t.insertVideo }}
      </button>
      <button
        type="button"
        :class="[ns.e('pill'), ns.e('pill-danger')]"
        @click="emitAction('delete', {})"
      >
        <Delete :class="ns.e('pill-icon')" />
        {{ t.deleteButton }}
      </button>
    </template>
  </ResultCard>
</template>

<script lang="ts">
import type {
  BubbleContentInfo,
  ContentBlock,
  BlockActionHandler,
  ChoiceOption,
} from '../../types';

export interface ChoiceBlockProps {
  /** 选择题块：type:'choice'，单 / 多选由 multiple 区分 */
  block: Extract<ContentBlock, { type: 'choice' }>;
  /** 气泡上下文（注册表透传，本组件不直接使用，声明以吸收避免落为 attr） */
  info?: BubbleContentInfo;
  /** 打字机态（注册表透传；卡片不逐字，声明以吸收） */
  typing?: boolean;
  /** 块动作回调（作答 / 编辑保存 / pill 操作经此上抛） */
  onBlockAction?: BlockActionHandler;
}
</script>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useLocale } from '@aix/hooks';
import { Check, Delete, AddCircle, OndemandVideo, ArrowUpward, ArrowDownward } from '@aix/icons';
import ResultCard from '../ResultCard.vue';
import { useNamespace } from '../../composables/useNamespace';
import { locale } from '../../locale';
import { genBlockId } from '../../utils/helpers';

// 注册表统一透传 block/info/typing/onBlockAction；本组件显式声明这些 prop，
// 关闭属性继承避免未消费的 info/typing 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<ChoiceBlockProps>();
const ns = useNamespace('choice');
const { t } = useLocale(locale);

const editing = ref(false);

/** 归一化为数组：null/undefined → []，标量 → [v]，数组原样返回 */
const toArr = (v: string | string[] | undefined | null): string[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

/** 是否多选（默认单选） */
const multiple = computed(() => props.block.multiple ?? false);

/** 展示模式：'review' 只读结果卡（默认）/ 'answer' 可点击作答 */
const mode = computed<'review' | 'answer'>(() => props.block.mode ?? 'review');

/** 题型标签 */
const typeLabel = computed(() =>
  multiple.value ? t.value.multiChoiceType : t.value.singleChoiceType,
);

/** 归一化后的用户作答数组 */
const selectedArr = computed(() => toArr(props.block.selected));

/** 标准答案展示文本（多个用、连接选项 label） */
const answerText = computed(() => {
  const ids = toArr(props.block.answer);
  return ids
    .map((id) => props.block.options.find((o) => o.id === id)?.label)
    .filter((label): label is string => !!label)
    .join('、');
});

const emitAction = (type: string, patch: Record<string, unknown>) =>
  props.onBlockAction?.({ blockId: props.block.id, type, patch });

// ---------- answer 模式作答 ----------
const selectOption = (id: string) => {
  if (multiple.value) {
    const next = selectedArr.value.includes(id)
      ? selectedArr.value.filter((x) => x !== id)
      : [...selectedArr.value, id];
    emitAction('select', { selected: next });
  } else {
    // 单选与旧组件一致：传 string
    emitAction('select', { selected: id });
  }
};

// 键盘作答：Enter / 空格触发选中（与点击等价），提升无障碍可达性。
const onOptionKeydown = (e: KeyboardEvent, id: string) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    selectOption(id);
  }
};

// ---------- 编辑态 ----------
interface Draft {
  stem: string;
  options: ChoiceOption[];
  /** 正确答案选项 id 数组（单选时长度 0 或 1） */
  answer: string[];
  analysis: string;
}
// 编辑草稿：进入编辑时从 block 深拷贝，编辑过程只动草稿，保存才上抛、退出即丢弃。
const draft = reactive<Draft>({ stem: '', options: [], answer: [], analysis: '' });

const enterEdit = () => {
  draft.stem = props.block.stem;
  draft.options = props.block.options.map((o) => ({ ...o }));
  draft.answer = toArr(props.block.answer);
  draft.analysis = props.block.analysis ?? '';
  editing.value = true;
};

const exitEdit = () => {
  editing.value = false;
};

/** 标记 / 取消标记正确答案；单选互斥（标记新的清旧的），多选切换数组成员 */
const toggleAnswer = (id: string) => {
  if (multiple.value) {
    draft.answer = draft.answer.includes(id)
      ? draft.answer.filter((x) => x !== id)
      : [...draft.answer, id];
  } else {
    draft.answer = [id];
  }
};

// 选项字母按当前顺序重排（A/B/C/D…），增删/移动后保持连续。
const relabel = () => {
  draft.options.forEach((o, i) => {
    o.label = String.fromCharCode(65 + i);
  });
};

const addOption = () => {
  // 复用 genBlockId 生成选项 id，保持与其他块 id 风格一致，避免 new- 前缀长期留存数据
  draft.options.push({ id: genBlockId(), label: '', content: '' });
  relabel();
};

const removeOption = (i: number) => {
  const [removed] = draft.options.splice(i, 1);
  // 删除被选为答案的项时，从答案数组移除该 id
  if (removed) draft.answer = draft.answer.filter((x) => x !== removed.id);
  relabel();
};

const moveOption = (i: number, dir: -1 | 1) => {
  const j = i + dir;
  if (j < 0 || j >= draft.options.length) return;
  const [moved] = draft.options.splice(i, 1);
  if (!moved) return;
  draft.options.splice(j, 0, moved);
  relabel();
};

const save = () => {
  // 单选取 answer[0]（无则 undefined），多选取整个数组
  const answer = multiple.value ? [...draft.answer] : draft.answer[0];
  emitAction('edit', {
    stem: draft.stem,
    options: draft.options.map((o) => ({ ...o })),
    multiple: multiple.value,
    answer,
    analysis: draft.analysis,
  });
  editing.value = false;
};
</script>

<style lang="scss">
.aix-choice {
  /* ============ 展示态 · review ============ */
  &__review {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginSM);
  }

  &__review-options {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXS);
  }

  &__review-option {
    color: var(--aix-colorText);
    line-height: var(--aix-lineHeight);
  }

  &__stem {
    color: var(--aix-colorText);
    font-weight: var(--aix-fontWeightStrong);
    line-height: var(--aix-lineHeight);
  }

  &__stem-prefix,
  &__analysis-prefix {
    font-weight: var(--aix-fontWeightStrong);
  }

  /* ============ 展示态 · answer（交互作答） ============ */
  &__options {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXS);
    margin: var(--aix-marginSM) 0 0;
    padding: 0;
    list-style: none;
  }

  &__option {
    display: flex;
    gap: var(--aix-sizeXS);
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorBgContainer);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorPrimaryBorder);
    }

    &:focus-visible {
      outline: 2px solid var(--aix-colorPrimary);
      outline-offset: 1px;
    }

    &.is-selected {
      border-color: var(--aix-colorPrimary);
      background: var(--aix-colorPrimaryBg);
    }
  }

  &__option-label {
    flex: none;
    color: var(--aix-colorTextSecondary);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__answer,
  &__analysis {
    color: var(--aix-colorText);
    line-height: var(--aix-lineHeight);
  }

  &__answer {
    font-weight: var(--aix-fontWeightStrong);
  }

  /* answer 模式答案/解析需与上方选项拉开间距（review 模式由 flex gap 控制） */
  &__options ~ &__answer,
  &__options ~ &__analysis {
    margin-top: var(--aix-marginSM);
  }

  /* ============ 底部操作 pill ============ */
  &__pill {
    display: inline-flex;
    align-items: center;
    gap: var(--aix-sizeXXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorPrimaryBorder);
    }
  }

  &__pill-icon {
    width: 16px;
    height: 16px;
  }

  &__pill-danger {
    color: var(--aix-colorError);

    &:hover {
      border-color: var(--aix-colorErrorBorder);
    }
  }

  /* ============ 编辑态 ============ */
  &__edit {
    display: flex;
    flex-direction: column;
    gap: var(--aix-margin);
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXS);
  }

  &__field-head {
    display: flex;
    align-items: baseline;
    gap: var(--aix-sizeXS);
  }

  &__label {
    color: var(--aix-colorText);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__hint {
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__stem-input,
  &__analysis-input,
  &__option-input {
    width: 100%;
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusSM);
    background: var(--aix-colorFillTertiary);
    color: var(--aix-colorText);
    font-family: inherit;
    font-size: var(--aix-fontSize);
    resize: vertical;

    &::placeholder {
      color: var(--aix-colorTextPlaceholder);
    }

    &:focus {
      border-color: var(--aix-colorTextTertiary);
      outline: none;
    }
  }

  &__edit-option {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
  }

  &__option-input {
    flex: 1;
  }

  /* 正确答案标记按钮（对号） */
  &__mark {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: 50%;
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    &.is-checked {
      border-color: var(--aix-colorPrimary);
      background: var(--aix-colorPrimaryBg);
      color: var(--aix-colorPrimary);
    }
  }

  &__mark-icon {
    width: 12px;
    height: 12px;
  }

  /* 字母方框徽标：16×16 方角 */
  &__badge {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusXS);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
  }

  &__icon-btn {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusSM);
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorTextSecondary);
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__icon-btn-danger {
    color: var(--aix-colorError);
  }

  &__btn-icon {
    width: 14px;
    height: 14px;
  }

  /* 新增选项胶囊 */
  &__add {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--aix-sizeXXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingSM);
    border: none;
    border-radius: 999px;
    background: var(--aix-colorFillQuaternary);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
  }

  &__add-icon {
    width: 14px;
    height: 14px;
  }

  &__edit-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--aix-sizeXS);
    padding-bottom: var(--aix-marginSM);
    border-bottom: 1px solid var(--aix-colorBorderSecondary);
  }

  &__exit,
  &__save {
    padding: var(--aix-paddingXXS) var(--aix-padding);
    border-radius: var(--aix-borderRadiusSM);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
  }

  &__exit {
    border: 1px solid var(--aix-colorBorderSecondary);
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorTextSecondary);
  }

  &__save {
    border: none;
    background: var(--aix-colorText);
    color: var(--aix-colorBgContainer);
  }
}
</style>
