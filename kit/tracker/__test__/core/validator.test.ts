import { describe, expect, it, vi } from 'vitest';
import { TrackerValidator } from '../../src/core/validator.js';

describe('TrackerValidator', () => {
  it('合法事件名应通过校验', () => {
    const validator = new TrackerValidator(true);
    expect(validator.validate('app_zdydmh_home_top_app_ck', {})).toBe(true);
    expect(validator.validate('web_portal_login_btn_ck', {})).toBe(true);
    expect(validator.validate('mp_mini_page_view', {})).toBe(true);
  });

  it('不合法事件名应校验失败', () => {
    const validator = new TrackerValidator(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(validator.validate('invalid_event', {})).toBe(false);
    expect(validator.validate('APP_UPPER_CASE', {})).toBe(false);
    expect(validator.validate('no_prefix', {})).toBe(false);

    warnSpy.mockRestore();
  });

  it('预置事件（$ 开头）应跳过校验', () => {
    const validator = new TrackerValidator(true);
    expect(validator.validate('$pageview', {})).toBe(true);
    expect(validator.validate('$pageclose', {})).toBe(true);
  });

  it('属性白名单应过滤非法属性', () => {
    const validator = new TrackerValidator({
      allowedProperties: ['content_title', 'content_pos'],
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      validator.validate('app_test_event_ck', {
        content_title: '标题',
        unknown_prop: '非法',
      }),
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('global_ 前缀属性应跳过白名单检查', () => {
    const validator = new TrackerValidator({
      allowedProperties: ['content_title'],
    });

    expect(
      validator.validate('app_test_event_ck', {
        content_title: '标题',
        global_product_type: 'Web', // global_ 前缀跳过
      }),
    ).toBe(true);
  });

  it('block 模式下 shouldBlock 应返回 true', () => {
    const validator = new TrackerValidator({ onViolation: 'block' });
    expect(validator.shouldBlock()).toBe(true);
  });

  it('warn 模式下 shouldBlock 应返回 false', () => {
    const validator = new TrackerValidator({ onViolation: 'warn' });
    expect(validator.shouldBlock()).toBe(false);
  });

  it('自定义正则应生效', () => {
    const validator = new TrackerValidator({
      eventNamePattern: /^custom_[a-z]+$/,
    });
    expect(validator.validate('custom_event', {})).toBe(true);
    expect(validator.validate('app_test_ck', {})).toBe(false);
  });
});
