<template>
  <div class="app">
    <header class="header">
      <h1>🎨 AIX 组件库示例</h1>
      <div class="mode-badge">
        <span>联调模式: </span>
        <code>{{ linkMode }}</code>
        <button class="theme-toggle" @click="toggleMode">
          {{ mode === 'light' ? '🌙' : '☀️' }} 切换主题
        </button>
      </div>
    </header>

    <main class="main">
      <section class="section">
        <h2>Button 组件</h2>
        <p class="description">演示 @aix/button 组件的各种用法</p>

        <div class="demo-group">
          <h3>基础按钮</h3>
          <div class="demo-row">
            <Button>默认按钮</Button>
            <Button type="primary"> 主要按钮 </Button>
            <Button type="dashed"> 虚线按钮 </Button>
            <Button type="text"> 文本按钮 </Button>
            <Button type="link"> 链接按钮 </Button>
          </div>
        </div>

        <div class="demo-group">
          <h3>禁用状态</h3>
          <div class="demo-row">
            <Button disabled> 禁用按钮 </Button>
            <Button type="primary" disabled> 主要按钮 </Button>
            <Button type="dashed" disabled> 虚线按钮 </Button>
          </div>
        </div>

        <div class="demo-group">
          <h3>加载状态</h3>
          <div class="demo-row">
            <Button :loading="loading" @click="handleClick">
              {{ loading ? '加载中...' : '点击加载' }}
            </Button>
            <Button type="primary" :loading="loading" @click="handleClick">
              提交表单
            </Button>
          </div>
        </div>

        <div class="demo-group">
          <h3>不同尺寸</h3>
          <div class="demo-row">
            <Button size="small"> 小型按钮 </Button>
            <Button size="medium"> 中等按钮 </Button>
            <Button size="large"> 大型按钮 </Button>
          </div>
        </div>
      </section>

      <section class="section info-section">
        <h2>💡 使用说明</h2>
        <div class="info-card">
          <h3>源码模式 (当前)</h3>
          <pre><code>pnpm dev
# 或
VITE_LINK_MODE=source pnpm dev</code></pre>
          <ul>
            <li>✅ 支持热更新 (HMR)</li>
            <li>✅ 修改组件库源码即时生效</li>
            <li>✅ 调试方便，可查看源码</li>
          </ul>
        </div>

        <div class="info-card">
          <h3>Yalc 模式</h3>
          <pre><code>VITE_LINK_MODE=yalc pnpm dev</code></pre>
          <ul>
            <li>✅ 测试打包后的产物</li>
            <li>✅ 模拟真实发布环境</li>
            <li>⚠️ 需要先执行 <code>pnpm link:publish</code></li>
          </ul>
        </div>
      </section>

      <section class="section">
        <h2>🔧 实时测试</h2>
        <p class="description">
          尝试修改
          <code>packages/button/src/Button.vue</code>
          文件，页面会自动更新（源码模式下）
        </p>
      </section>
    </main>

    <footer class="footer">
      <p>AIX Vue Component Library - 组件库联调示例</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@aix/button';
import { useTheme } from '@aix/theme';
import { ref } from 'vue';

// 初始化主题
const { mode, toggleMode } = useTheme();

// 检测联调模式
const linkMode = import.meta.env.VITE_LINK_MODE || 'source';

const loading = ref(false);

const handleClick = () => {
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
  }, 2000);
};
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.header {
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
  color: white;
  text-align: center;
}

.header h1 {
  margin: 0 0 1rem;
  font-size: 2.5rem;
  font-weight: 600;
}

.mode-badge {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  background: rgb(255 255 255 / 0.2);
  font-size: 0.9rem;
}

.mode-badge code {
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.2);
  color: #ffd700;
  font-weight: bold;
}

.theme-toggle {
  margin-left: 1rem;
  padding: 0.4rem 1rem;
  transition: all 0.3s;
  border: 1px solid rgb(255 255 255 / 0.3);
  border-radius: 20px;
  background: rgb(255 255 255 / 0.1);
  color: white;
  font-size: 0.9rem;
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: rgb(255 255 255 / 0.5);
  background: rgb(255 255 255 / 0.2);
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.section {
  margin-bottom: 2rem;
  padding: 2rem;
  border-radius: 12px;
  background: white;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.08);
}

.section h2 {
  margin-top: 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #667eea;
  color: #333;
  font-size: 1.8rem;
}

.description {
  margin-bottom: 1.5rem;
  color: #666;
}

.demo-group {
  margin-bottom: 2rem;
}

.demo-group:last-child {
  margin-bottom: 0;
}

.demo-group h3 {
  margin-bottom: 1rem;
  color: #555;
  font-size: 1.2rem;
}

.demo-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.info-section {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.info-card {
  margin-bottom: 1rem;
  padding: 1.5rem;
  border-left: 4px solid #667eea;
  border-radius: 8px;
  background: white;
}

.info-card:last-child {
  margin-bottom: 0;
}

.info-card h3 {
  margin-top: 0;
  color: #667eea;
  font-size: 1.1rem;
}

.info-card pre {
  margin: 1rem 0;
  padding: 1rem;
  overflow-x: auto;
  border-radius: 6px;
  background: #282c34;
  color: #abb2bf;
}

.info-card code {
  font-family: Consolas, Monaco, monospace;
  font-size: 0.9rem;
}

.info-card ul {
  margin: 0;
  padding-left: 1.5rem;
}

.info-card li {
  margin: 0.5rem 0;
  color: #555;
}

.info-card li code {
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  background: #f0f0f0;
  color: #e83e8c;
}

.footer {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #2c3e50;
  color: white;
  text-align: center;
}

.footer p {
  margin: 0;
}

/* 全局样式重置 */
:global(body) {
  margin: 0;
  background: #f5f7fa;
  color: #333;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
}

:global(*) {
  box-sizing: border-box;
}
</style>
