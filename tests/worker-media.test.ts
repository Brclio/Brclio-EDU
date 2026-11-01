import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/index.ts';
import { parseRange } from '../worker/media.ts';

const origin = 'https://learn.example.com';
const content = new TextEncoder().encode('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
function mediaAssets(supportRange = false) {
  const pieces = [content.slice(0, 10), content.slice(10, 20), content.slice(20)];
  const fetched: string[] = [];
  const ranges: (string | null)[] = [];
  const manifest = { video: { size: content.length, type: 'video/mp4', sha256: 'a'.repeat(64),
    parts: pieces.map((part, i) => ({ path: `/content/media-parts/video-${i}.bin`, size: part.length })) } };
  let cancels = 0;
  const fetch = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    fetched.push(path);
    if (path === '/content/media-index.json') return Response.json(manifest);
    const match = /video-(\d)\.bin$/.exec(path);
    if (!match) return new Response('', { status: 404 });
    const range = request.headers.get('Range');
    ranges.push(range);
    const original = pieces[Number(match[1])];
    const selected = supportRange && range ? parseRange(range, original.length) : null;
    const bytes = selected ? original.slice(selected.start, selected.end + 1) : original;
    let cursor = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (cursor >= bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.slice(cursor, cursor + 3));
        cursor += 3;
      },
      cancel() { cancels++; },
    });
    const headers: Record<string, string> = { 'Content-Length': String(bytes.length), 'Content-Type': 'application/octet-stream' };
    if (selected) headers['Content-Range'] = `bytes ${selected.start}-${selected.end}/${original.length}`;
    return new Response(stream, { status: selected ? 206 : 200, headers });
  };
  return { fetch, fetched, ranges, manifest, get cancels() { return cancels; } };
}
function req(range?: string, method = 'GET', extra: Record<string, string> = {}) {
  return new Request(`${origin}/api/media/video`, { method, headers: { ...(range ? { Range: range } : {}), ...extra } });
}
function site(assets: ReturnType<typeof mediaAssets>) {
  const worker = createWorker();
  return (request: Request) => worker.fetch(request, { ASSETS: assets });
}

test('full media streams parts in order and never eagerly fetches the entire video', async () => {
  const assets = mediaAssets();
  const response = await site(assets)(req());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Length'), '36');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Type'), 'video/mp4');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(assets.fetched, ['/content/media-index.json', '/content/media-parts/video-0.bin']);
  assert.equal(await response.text(), new TextDecoder().decode(content));
  assert.equal(assets.fetched.length, 4);
});

for (const supportRange of [false, true]) {
  test(`byte ranges work across static chunk boundaries (asset Range support: ${supportRange})`, async () => {
    const cases = [
      ['bytes=0-0', 0, 0], ['bytes=35-35', 35, 35], ['bytes=8-22', 8, 22],
      ['bytes=10-19', 10, 19], ['bytes=22-', 22, 35], ['bytes=-4', 32, 35],
      ['bytes=-100', 0, 35], ['bytes=30-999', 30, 35],
    ] as const;
    for (const [header, start, end] of cases) {
      const assets = mediaAssets(supportRange);
      const response = await site(assets)(req(header));
      assert.equal(response.status, 206, header);
      assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/36`, header);
      assert.equal(response.headers.get('Content-Length'), String(end - start + 1), header);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), content.slice(start, end + 1), header);
      const expectedParts = assets.manifest.video.parts.filter((_, i) => [10, 20, 36][i] > start && [0, 10, 20][i] <= end);
      assert.equal(assets.fetched.length, expectedParts.length + 1, header);
    }
  });
}

test('HEAD returns full and partial metadata without reading any media parts', async () => {
  for (const range of [undefined, 'bytes=8-22']) {
    const assets = mediaAssets();
    const response = await site(assets)(req(range, 'HEAD'));
    assert.equal(response.status, range ? 206 : 200);
    assert.equal(response.headers.get('Content-Length'), range ? '15' : '36');
    assert.equal(await response.text(), '');
    assert.deepEqual(assets.fetched, ['/content/media-index.json']);
  }
});

test('invalid, multi-part and unsatisfiable ranges return 416 without fetching media', async () => {
  for (const range of ['bytes=36-', 'bytes=5-4', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=abc', 'items=0-1', 'bytes=99999999999999999-']) {
    const assets = mediaAssets();
    const response = await site(assets)(req(range));
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('Content-Range'), 'bytes */36', range);
    assert.equal(response.headers.get('Content-Length'), '0', range);
    assert.deepEqual(assets.fetched, ['/content/media-index.json']);
  }
});

test('ETag conditional requests and If-Range follow HTTP semantics', async () => {
  const assets = mediaAssets();
  const fetch = site(assets);
  const initial = await fetch(req(undefined, 'HEAD'));
  const etag = initial.headers.get('ETag')!;
  assert.equal(etag, `"sha256-${'a'.repeat(64)}"`);
  const unchanged = await fetch(req(undefined, 'GET', { 'If-None-Match': `"other", W/${etag}` }));
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const partial = await fetch(req('bytes=1-2', 'GET', { 'If-Range': etag }));
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), '12');
  const changed = await fetch(req('bytes=1-2', 'GET', { 'If-Range': '"outdated"' }));
  assert.equal(changed.status, 200);
  assert.deepEqual(new Uint8Array(await changed.arrayBuffer()), content);
});

test('missing IDs, unsupported methods, and cross-site media requests are rejected', async () => {
  const assets = mediaAssets();
  const fetch = site(assets);
  assert.equal((await fetch(new Request(`${origin}/api/media/missing`))).status, 404);
  assert.equal((await fetch(new Request(`${origin}/api/media/bad%2Fpath`))).status, 404);
  const post = await fetch(req(undefined, 'POST'));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  assert.equal((await fetch(req(undefined, 'GET', { Origin: 'https://evil.example' }))).status, 403);
  assert.equal((await fetch(req(undefined, 'GET', { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal((await fetch(req(undefined, 'HEAD', { Origin: origin }))).status, 200);
});

test('cancelling playback cancels the current part without fetching remaining files', async () => {
  const assets = mediaAssets();
  const response = await site(assets)(req());
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  await reader.cancel();
  assert.ok(assets.cancels > 0);
  assert.deepEqual(assets.fetched, ['/content/media-index.json', '/content/media-parts/video-0.bin']);
});

test('invalid manifests and missing first chunk produce clean errors', async () => {
  const worker = createWorker();
  const assets = mediaAssets();
  assets.manifest.video.parts[0].path = '/content/../../secret';
  assert.equal((await worker.fetch(req(), { ASSETS: assets })).status, 502);
  const missing = { fetch: async (request: Request) => new URL(request.url).pathname.endsWith('.json')
    ? Response.json(mediaAssets().manifest) : new Response('', { status: 404 }) };
  assert.equal((await worker.fetch(req(), { ASSETS: missing })).status, 502);
  const noIndex = { fetch: async () => new Response('', { status: 404 }) };
  assert.equal((await worker.fetch(req(), { ASSETS: noIndex })).status, 404);
});
