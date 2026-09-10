import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { FigmaApiProvider } from '../../../src/core/baseline/figma-api-provider';
import { FigmaClient } from '../../../src/core/figma/client';

let dir: string;

function png(width: number, height: number): Blob {
  const p = new PNG({ width, height });
  p.data.fill(200);
  return new Blob([new Uint8Array(PNG.sync.write(p))]);
}

interface MockState {
  version: string;
  metaStatus: number;
  imageUrl: string | null;
  imageCalls: number;
}

function makeClient(state: MockState): FigmaClient {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/meta')) {
      if (state.metaStatus !== 200)
        return new Response(JSON.stringify({ err: 'Forbidden' }), { status: state.metaStatus });
      return new Response(
        JSON.stringify({ file: { name: 'F', version: state.version, last_touched_at: 'x' } }),
      );
    }
    if (url.includes('/images/')) {
      state.imageCalls++;
      const scale = new URL(url).searchParams.get('scale');
      return new Response(
        JSON.stringify({
          err: null,
          images: { '1:2': state.imageUrl ? `${state.imageUrl}?s=${scale}` : null },
        }),
      );
    }
    if (url.includes('s3.local')) {
      const scale = Number(new URL(url).searchParams.get('s') ?? 1);
      return new Response(png(10 * scale, 10 * scale));
    }
    return new Response('nf', { status: 404 });
  }) as unknown as typeof fetch;
  return new FigmaClient({ accessToken: 't', fetchImpl, maxRetries: 0 });
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-figma-api-'));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('FigmaApiProvider', () => {
  it('downloads at the requested scale, caches by version, and reuses the cache', async () => {
    const state: MockState = {
      version: '1',
      metaStatus: 200,
      imageUrl: 'https://s3.local/a.png',
      imageCalls: 0,
    };
    const cacheDir = path.join(dir, 'cache1');
    const provider = new FigmaApiProvider({ fileKey: 'KEY', cacheDir, client: makeClient(state) });

    const first = await provider.fetch({
      source: '1:2',
      outputPath: path.join(dir, 'out1.png'),
      scale: 2,
    });
    expect(first.success).toBe(true);
    expect(first.metadata?.dimensions).toEqual({ width: 20, height: 20 });
    expect(first.metadata?.figmaInfo).toMatchObject({
      fileKey: 'KEY',
      nodeId: '1:2',
      version: '1',
    });
    expect(state.imageCalls).toBe(1);
    await expect(fs.access(path.join(cacheDir, 'KEY', '1-2@2x.png'))).resolves.toBeUndefined();

    // 同版本再次获取：命中缓存，不再请求 images
    const provider2 = new FigmaApiProvider({ fileKey: 'KEY', cacheDir, client: makeClient(state) });
    const second = await provider2.fetch({
      source: '1:2',
      outputPath: path.join(dir, 'out2.png'),
      scale: 2,
    });
    expect(second.success).toBe(true);
    expect(state.imageCalls).toBe(1);

    // 不同 scale 是不同缓存条目
    await provider2.fetch({ source: '1:2', outputPath: path.join(dir, 'out3.png'), scale: 1 });
    expect(state.imageCalls).toBe(2);
    await expect(fs.access(path.join(cacheDir, 'KEY', '1-2@1x.png'))).resolves.toBeUndefined();
  });

  it('invalidates the cache when the file version changes and on refresh', async () => {
    const state: MockState = {
      version: '1',
      metaStatus: 200,
      imageUrl: 'https://s3.local/a.png',
      imageCalls: 0,
    };
    const cacheDir = path.join(dir, 'cache2');
    await new FigmaApiProvider({ fileKey: 'KEY', cacheDir, client: makeClient(state) }).fetch({
      source: '1:2',
      outputPath: path.join(dir, 'v1.png'),
    });
    expect(state.imageCalls).toBe(1);

    state.version = '2';
    await new FigmaApiProvider({ fileKey: 'KEY', cacheDir, client: makeClient(state) }).fetch({
      source: '1:2',
      outputPath: path.join(dir, 'v2.png'),
    });
    expect(state.imageCalls).toBe(2);

    await new FigmaApiProvider({
      fileKey: 'KEY',
      cacheDir,
      refresh: true,
      client: makeClient(state),
    }).fetch({
      source: '1:2',
      outputPath: path.join(dir, 'v3.png'),
    });
    expect(state.imageCalls).toBe(3);
  });

  it('degrades to no caching when /meta is forbidden, but still fetches', async () => {
    const state: MockState = {
      version: '1',
      metaStatus: 403,
      imageUrl: 'https://s3.local/a.png',
      imageCalls: 0,
    };
    const cacheDir = path.join(dir, 'cache3');
    const provider = new FigmaApiProvider({ fileKey: 'KEY', cacheDir, client: makeClient(state) });

    const result = await provider.fetch({
      source: '1:2',
      outputPath: path.join(dir, 'nometa.png'),
    });
    expect(result.success).toBe(true);
    expect(result.metadata?.figmaInfo?.version).toBe('');
    await expect(fs.access(path.join(cacheDir, 'KEY'))).rejects.toThrow();
  });

  it('returns a failed result with a clear message when Figma returns no image url', async () => {
    const state: MockState = { version: '1', metaStatus: 200, imageUrl: null, imageCalls: 0 };
    const provider = new FigmaApiProvider({ fileKey: 'KEY', client: makeClient(state) });
    const result = await provider.fetch({ source: '1:2', outputPath: path.join(dir, 'none.png') });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/did not return an image/);
  });

  it('fails without a fileKey and resolves structured sources', async () => {
    const state: MockState = {
      version: '1',
      metaStatus: 200,
      imageUrl: 'https://s3.local/a.png',
      imageCalls: 0,
    };
    const provider = new FigmaApiProvider({ client: makeClient(state) });
    const missing = await provider.fetch({ source: '1:2', outputPath: path.join(dir, 'x.png') });
    expect(missing.success).toBe(false);
    expect(missing.error?.message).toMatch(/fileKey is missing/);

    const ok = await provider.fetch({
      source: { type: 'figma-api', source: '1-2', fileKey: 'KEY' },
      outputPath: path.join(dir, 'y.png'),
    });
    expect(ok.success).toBe(true);
    expect(ok.metadata?.figmaInfo?.nodeId).toBe('1:2');
  });
});
