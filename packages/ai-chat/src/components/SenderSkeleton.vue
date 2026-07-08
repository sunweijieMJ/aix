<template>
  <div :class="ns.b()" aria-hidden="true">
    <div :class="ns.e('main')">
      <Skeleton :rows="1" />
    </div>
    <div :class="ns.e('toolbar')">
      <span :class="ns.e('tool')" />
      <span :class="ns.e('spacer')" />
      <span :class="ns.e('send')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import Skeleton from './Skeleton.vue';

const ns = useNamespace('sender-skeleton');
</script>

<style lang="scss">
.aix-sender-skeleton {
  display: flex;
  flex-direction: column;
  padding: var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingSM);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusLG);
  background-color: var(--aix-colorBgContainer);
  box-shadow: var(--aix-shadowSM);
  gap: var(--aix-sizeXS);

  &__main {
    padding: var(--aix-paddingXS) 0;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding-top: var(--aix-paddingXXS);
  }

  &__tool {
    display: inline-flex;
    flex: none;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorFillTertiary);
  }

  &__spacer {
    flex: 1 1 auto;
  }

  &__send {
    display: inline-flex;
    flex: none;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorFillSecondary);
  }
}
</style>
