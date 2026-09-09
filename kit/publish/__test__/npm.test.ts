/**
 * 失败原因的判定：哪些文本参与判定、判定结果是重试还是放弃。
 *
 * 只覆盖纯函数。publish 重试链路的其余部分要发真实网络请求，不在这里验。
 */

import { describe, expect, it } from 'vitest';
import { bodyLimitWarning, errorText, fastFailureHint, isTransient } from '../src/core/npm';
import type { ExecError } from '../src/utils/exec';

/** 造一个 exec 失败时抛出的错误对象 */
const execError = ({
  stderr,
  reason,
  cause,
}: {
  stderr?: string;
  reason?: string;
  cause?: { message?: string };
} = {}): ExecError => {
  const error = new Error(reason ?? 'boom', { cause }) as ExecError;
  error.stderr = stderr;
  error.reason = reason;
  return error;
};

// npm publish 把整份 tarball 清单写进 stderr（实测 33KB / 657 行的 npm notice），
// 让 chunk 文件名参与判定会把确定性错误误判成网络抖动、或反过来
const NOTICE_NOISE = [
  'npm notice 📦  @demo/pkg@1.0.0',
  'npm notice 1.2kB js/useNetworkStatus-a1b2c3.js',
  'npm notice 3.4kB js/socket-hang-up-helper.js',
].join('\n');

describe('errorText', () => {
  it('只取 npm 自己的报错行，tarball 清单不参与判定', () => {
    const text = errorText(
      execError({ stderr: `${NOTICE_NOISE}\nnpm error code ECONNRESET\nnpm error network` }),
    );

    expect(text).toContain('ECONNRESET');
    expect(text).not.toContain('useNetworkStatus');
  });

  it('老版本 npm 的 ERR! 前缀同样认', () => {
    const text = errorText(execError({ stderr: `${NOTICE_NOISE}\nnpm ERR! code E403` }));

    expect(text).toContain('E403');
    expect(text).not.toContain('npm notice');
  });

  it('没有 npm 报错行时回落到 reason 与 cause —— cause 那一半不能省', () => {
    const text = errorText(
      execError({ reason: '命令执行失败: npm publish', cause: { message: 'spawn npm ENOENT' } }),
    );

    expect(text).toContain('命令执行失败: npm publish');
    expect(text).toContain('ENOENT');
  });

  it('什么都没有时给空串而不是抛错', () => {
    expect(errorText(undefined)).toBe('');
  });
});

describe('isTransient', () => {
  it.each([
    'npm error code ECONNRESET',
    'npm error socket hang up',
    'npm error 503 Service Unavailable',
  ])('%s 判为网络类，可重试', (line) => {
    expect(isTransient(execError({ stderr: `${NOTICE_NOISE}\n${line}` }))).toBe(true);
  });

  it.each(['npm error code EPUBLISHCONFLICT', 'npm error code E403', 'npm error code ENEEDAUTH'])(
    '%s 是确定性错误，不重试',
    (line) => {
      expect(isTransient(execError({ stderr: `${NOTICE_NOISE}\n${line}` }))).toBe(false);
    },
  );

  it('确定性错误与网络关键词同时出现时以确定性为准', () => {
    const error = execError({
      stderr: 'npm error code EPUBLISHCONFLICT\nnpm error network timeout',
    });
    expect(isTransient(error)).toBe(false);
  });

  // 分不清的失败不重试：publish 非幂等，盲目重试的代价比白等一轮大
  it('两头都匹配不上时不重试', () => {
    expect(isTransient(execError({ stderr: 'npm error something entirely new' }))).toBe(false);
    expect(isTransient(execError())).toBe(false);
  });

  it('chunk 文件名不会把确定性错误伪装成网络抖动', () => {
    // js/useNetworkStatus-*.js 里的 network 是 TRANSIENT 那条正则的裸词
    const error = execError({ stderr: `${NOTICE_NOISE}\nnpm error code E403 Forbidden` });
    expect(isTransient(error)).toBe(false);
  });
});

describe('bodyLimitWarning', () => {
  // 上限是按 base64 之后的 body 算的：8MB 的 tarball 上行已经 10.7MB，越过了 Verdaccio 的默认值
  it('上行体积越过服务端默认上限时告警', () => {
    expect(bodyLimitWarning(8 * 1024 * 1024)).toContain('max_body_size');
  });

  it('压在上限之内的不告警', () => {
    expect(bodyLimitWarning(7 * 1024 * 1024)).toBeNull();
    expect(bodyLimitWarning(1024)).toBeNull();
  });
});

describe('fastFailureHint', () => {
  const target = { name: '@demo/pkg', version: '1.0.0', registry: 'http://registry.test:4873/' };

  it('一分钟内断连时给出三个排查方向，并报出上行体积', () => {
    const hint = fastFailureHint({ ...target, seconds: 9, packed: 20 * 1024 * 1024 });

    expect(hint).toContain('26.7 MB');
    expect(hint).toContain('max_body_size');
    expect(hint).toContain('noproxy');
    expect(hint).toContain('npm view @demo/pkg@1.0.0');
  });

  // 传够久才断的更可能真是链路问题，那时提示「查代理」是误导
  it('传够久才失败的不提示', () => {
    expect(fastFailureHint({ ...target, seconds: 60, packed: 20 * 1024 * 1024 })).toBeNull();
    expect(fastFailureHint({ ...target, seconds: 1800 })).toBeNull();
  });

  it('体积没量到时照旧给方向，只是不提上行体积', () => {
    const hint = fastFailureHint({ ...target, seconds: 5 });

    expect(hint).toContain('max_body_size');
    expect(hint).not.toContain('上行约');
  });
});
