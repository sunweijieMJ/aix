import { describe, expect, it } from 'vitest';
import { CommonPropertiesManager } from '../../src/core/common-properties.js';

describe('CommonPropertiesManager', () => {
  it('应支持静态值', () => {
    const manager = new CommonPropertiesManager({
      global_product_type: 'Web',
      global_app_version: '1.0.0',
    } as any);

    const resolved = manager.resolve();
    expect(resolved.global_product_type).toBe('Web');
    expect(resolved.global_app_version).toBe('1.0.0');
  });

  it('应支持动态函数（每次 resolve 时执行）', () => {
    let counter = 0;
    const manager = new CommonPropertiesManager();
    manager.update({
      dynamic_value: () => {
        counter++;
        return `call_${counter}`;
      },
    });

    expect(manager.resolve().dynamic_value).toBe('call_1');
    expect(manager.resolve().dynamic_value).toBe('call_2');
  });

  it('传 null 应删除属性', () => {
    const manager = new CommonPropertiesManager({
      global_product_type: 'Web',
    } as any);

    expect(manager.resolve().global_product_type).toBe('Web');

    manager.update({ global_product_type: null } as any);
    expect(manager.resolve().global_product_type).toBeUndefined();
  });

  it('merge 时事件属性应优先于公共属性', () => {
    const manager = new CommonPropertiesManager({
      global_product_type: 'Web',
    } as any);

    const merged = manager.merge({
      global_product_type: 'App', // 覆盖公共属性
      content_title: '测试',
    });

    expect(merged.global_product_type).toBe('App');
    expect(merged.content_title).toBe('测试');
  });

  it('update 应累加而非替换', () => {
    const manager = new CommonPropertiesManager();
    manager.update({ key_a: 'a' });
    manager.update({ key_b: 'b' });

    const resolved = manager.resolve();
    expect(resolved.key_a).toBe('a');
    expect(resolved.key_b).toBe('b');
  });
});
