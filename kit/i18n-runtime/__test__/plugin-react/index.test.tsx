import { render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { I18nRuntimeEngine } from '../../src/core/engine.js';
import { I18nRuntimeProvider, useI18nRuntime } from '../../src/plugin-react/index.js';

describe('useI18nRuntime', () => {
  it('未在 I18nRuntimeProvider 内部使用时应抛错', () => {
    expect(() => renderHook(() => useI18nRuntime())).toThrow('I18nRuntimeProvider');
  });
});

describe('I18nRuntimeProvider', () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__I18N_RUNTIME_STARTED__ = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('install 时应调用 engine.start()，未传 initialLanguage 时保持显示原文', () => {
    let capturedEngine: I18nRuntimeEngine | undefined;
    function EngineCapture(): ReactNode {
      capturedEngine = useI18nRuntime();
      return null;
    }

    render(
      <I18nRuntimeProvider provider="backend" apiBase="/api/i18n" languages={['en']}>
        <EngineCapture />
      </I18nRuntimeProvider>,
    );

    expect(capturedEngine!.getLanguage()).toBe('zh');
  });

  it('传入 initialLanguage 时应在 mount 后自动调用一次 setLanguage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { translations: [] } }),
      }),
    );

    let capturedEngine: I18nRuntimeEngine | undefined;
    function EngineCapture(): ReactNode {
      capturedEngine = useI18nRuntime();
      return null;
    }

    render(
      <I18nRuntimeProvider
        provider="backend"
        apiBase="/api/i18n"
        languages={['en']}
        initialLanguage="en"
      >
        <EngineCapture />
      </I18nRuntimeProvider>,
    );

    await waitFor(() => expect(capturedEngine!.getLanguage()).toBe('en'));

    vi.unstubAllGlobals();
  });

  it('unmount 时应调用 engine.stop()', () => {
    let capturedEngine: I18nRuntimeEngine | undefined;
    function EngineCapture(): ReactNode {
      capturedEngine = useI18nRuntime();
      return null;
    }

    const { unmount } = render(
      <I18nRuntimeProvider provider="backend" apiBase="/api/i18n" languages={['en']}>
        <EngineCapture />
      </I18nRuntimeProvider>,
    );

    const stopSpy = vi.spyOn(capturedEngine!, 'stop');
    unmount();

    expect(stopSpy).toHaveBeenCalledOnce();
  });
});
