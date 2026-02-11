<template>
  <div class="demo-page">
    <h2>{{ $t('components__ButtonDemo__button') }}</h2>
    <p class="description">{{ $t('components__ButtonDemo__aixbuttondemo') }}</p>

    <div class="demo-group">
      <h3>{{ $t('components__ButtonDemo__basicbutton') }}</h3>
      <div class="demo-row">
        <Button>{{ $t('components__ButtonDemo__defaultbutton') }}</Button>
        <Button type="primary">
          {{ $t('components__ButtonDemo__primarybutton') }}
        </Button>
        <Button type="dashed">
          {{ $t('components__ButtonDemo__dashedbutton') }}
        </Button>
        <Button type="text">
          {{ $t('components__ButtonDemo__textbutton') }}
        </Button>
        <Button type="link">
          {{ $t('components__ButtonDemo__linkbutton') }}
        </Button>
      </div>
    </div>

    <div class="demo-group">
      <h3>{{ $t('components__ButtonDemo__disabledstate') }}</h3>
      <div class="demo-row">
        <Button disabled>
          {{ $t('components__ButtonDemo__disabledbutton') }}
        </Button>
        <Button type="primary" disabled>
          {{ $t('components__ButtonDemo__primarybutton') }}
        </Button>
        <Button type="dashed" disabled>
          {{ $t('components__ButtonDemo__dashedbutton') }}
        </Button>
      </div>
    </div>

    <div class="demo-group">
      <h3>{{ $t('components__ButtonDemo__loadingstate') }}</h3>
      <div class="demo-row">
        <Button :loading="loading" @click="handleClick">
          {{
            loading
              ? $t('components__ButtonDemo__loadingindicator')
              : $t('components__ButtonDemo__clicktoload')
          }}
        </Button>
        <Button type="primary" :loading="loading" @click="handleClick">
          {{ $t('components__ButtonDemo__submitform') }}
        </Button>
      </div>
    </div>

    <div class="demo-group">
      <h3>{{ $t('components__ButtonDemo__differentsizes') }}</h3>
      <div class="demo-row">
        <Button size="small">
          {{ $t('components__ButtonDemo__smallbutton') }}
        </Button>
        <Button size="medium">
          {{ $t('components__ButtonDemo__mediumbutton') }}
        </Button>
        <Button size="large">
          {{ $t('components__ButtonDemo__largebutton') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@aix/button';
import { ref } from 'vue';

const loading = ref(false);

const handleClick = () => {
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
  }, 2000);
};
</script>
