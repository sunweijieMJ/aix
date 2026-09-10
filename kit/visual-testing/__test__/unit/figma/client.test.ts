import { describe, it, expect, vi } from 'vitest';
import { FigmaClient, FigmaApiError, resolveFigmaToken } from '../../../src/core/figma/client';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('resolveFigmaToken', () => {
  it('prefers configured token', () => {
    expect(resolveFigmaToken('cfg')).toBe('cfg');
  });
  it('falls back to env', () => {
    const prev = process.env.FIGMA_TOKEN;
    process.env.FIGMA_TOKEN = 'env-token';
    try {
      expect(resolveFigmaToken()).toBe('env-token');
    } finally {
      if (prev === undefined) delete process.env.FIGMA_TOKEN;
      else process.env.FIGMA_TOKEN = prev;
    }
  });
  it('throws with guidance when missing', () => {
    const prev = { a: process.env.FIGMA_TOKEN, b: process.env.FIGMA_ACCESS_TOKEN };
    delete process.env.FIGMA_TOKEN;
    delete process.env.FIGMA_ACCESS_TOKEN;
    try {
      expect(() => resolveFigmaToken()).toThrow(/file_content:read/);
    } finally {
      if (prev.a !== undefined) process.env.FIGMA_TOKEN = prev.a;
      if (prev.b !== undefined) process.env.FIGMA_ACCESS_TOKEN = prev.b;
    }
  });
});

describe('FigmaClient', () => {
  it('sends X-Figma-Token header and parses nodes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        name: 'File',
        version: '42',
        lastModified: '2026-01-01',
        nodes: { '1:2': { document: { id: '1:2', name: 'Frame', type: 'FRAME' } } },
      }),
    );
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl });

    const res = await client.getNode('KEY', '1:2');

    expect(res.node.name).toBe('Frame');
    expect(res.version).toBe('42');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.figma.com/v1/files/KEY/nodes?ids=1%3A2');
    expect((init as RequestInit).headers).toEqual({ 'X-Figma-Token': 'tok' });
  });

  it('throws 404 when node missing from response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ name: 'F', version: '1', lastModified: '', nodes: { '1:2': null } }),
      );
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl });
    await expect(client.getNode('KEY', '1:2')).rejects.toMatchObject({ status: 404 });
  });

  it('explains 403 with scope hint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ err: 'Forbidden' }, 403));
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl, maxRetries: 0 });
    await expect(client.getFileMeta('KEY')).rejects.toThrow(/file_content:read/);
  });

  it('retries on 429 honoring retry-after', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(
        jsonResponse({ file: { name: 'F', version: '7', last_touched_at: 'x' } }),
      );
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl, maxRetries: 2 });

    const meta = await client.getFileMeta('KEY');

    expect(meta.version).toBe('7');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reads image url map with the requested scale', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ err: null, images: { '1:2': 'https://s3/x.png' } }));
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl });
    const urls = await client.getImageUrls('KEY', ['1:2'], { scale: 2 });
    expect(urls['1:2']).toBe('https://s3/x.png');
    expect(fetchImpl.mock.calls[0]![0]).toContain('scale=2');
  });

  it('reports Figma render errors from the images endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ err: 'Render failed', images: {} }));
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl });
    await expect(client.getImageUrls('KEY', ['1:2'])).rejects.toThrow(/Render failed/);
  });

  it('fails clearly when the image url is null and never stores the signed url on download errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ err: null, images: { '1:2': null } }))
      .mockResolvedValueOnce(
        jsonResponse({
          err: null,
          images: { '1:2': 'https://s3.local/a.png?X-Amz-Signature=secret' },
        }),
      )
      .mockResolvedValueOnce(new Response('gone', { status: 403 }));
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl });

    await expect(client.downloadNodeImage('KEY', '1:2', '/tmp/x.png')).rejects.toThrow(
      /did not return an image/,
    );

    const err = (await client.downloadNodeImage('KEY', '1:2', '/tmp/x.png').then(
      () => null,
      (e: unknown) => e,
    )) as FigmaApiError;
    expect(err).toBeInstanceOf(FigmaApiError);
    expect(err.endpoint).toBe('s3.local/a.png');
    expect(JSON.stringify(err)).not.toContain('secret');
  });

  it('wraps network errors as FigmaApiError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const client = new FigmaClient({ accessToken: 'tok', fetchImpl, maxRetries: 0 });
    await expect(client.getFileMeta('KEY')).rejects.toBeInstanceOf(FigmaApiError);
  });
});
