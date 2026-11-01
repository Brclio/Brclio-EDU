/** Serve split static videos without buffering the full media file in Worker memory. */
interface Assets { fetch(request: Request): Promise<Response> }
interface MediaPart { path: string; size: number }
interface Media { size: number; type: string; parts: MediaPart[]; sha256?: string }
interface PartRange { part: MediaPart; start: number; end: number }

function failure(message: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function validMedia(value: unknown): value is Media {
  if (!value || typeof value !== 'object') return false;
  const media = value as Media;
  if (!Number.isSafeInteger(media.size) || media.size < 0 || typeof media.type !== 'string' ||
      !/^(?:video|audio)\/[a-zA-Z0-9.+-]+$|^application\/octet-stream$/.test(media.type) ||
      !Array.isArray(media.parts) || media.parts.length > 10000) return false;
  let size = 0;
  for (const part of media.parts) {
    if (!part || typeof part.path !== 'string' || !/^\/content\/[a-zA-Z0-9._/-]+$/.test(part.path) ||
        part.path.split('/').some(piece => piece === '.' || piece === '..') ||
        !Number.isSafeInteger(part.size) || part.size <= 0) return false;
    size += part.size;
  }
  return size === media.size;
}
/** Inclusive byte range; null means invalid/unsatisfiable, not an absent header. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || size === 0 || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
  return { start, end: Math.min(end, size - 1) };
}
function selectParts(media: Media, start: number, end: number): PartRange[] {
  const result: PartRange[] = [];
  let offset = 0;
  for (const part of media.parts) {
    const next = offset + part.size;
    if (next > start && offset <= end) result.push({ part, start: Math.max(0, start - offset), end: Math.min(part.size, end + 1 - offset) });
    offset = next;
    if (offset > end) break;
  }
  return result;
}
async function openPart(part: PartRange, request: Request, assets: Assets): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; offset: number }> {
  const headers = new Headers({ Range: `bytes=${part.start}-${part.end - 1}` });
  const response = await assets.fetch(new Request(new URL(part.part.path, request.url), { headers, signal: request.signal }));
  if ((response.status !== 200 && response.status !== 206) || !response.body || response.headers.get('Content-Type')?.startsWith('text/html')) {
    await response.body?.cancel();
    throw new Error('Media part unavailable');
  }
  const partial = response.status === 206;
  if (partial && response.headers.get('Content-Range') !== `bytes ${part.start}-${part.end - 1}/${part.part.size}`) {
    await response.body.cancel();
    throw new Error('Unexpected part range');
  }
  const length = response.headers.get('Content-Length');
  if (length !== null && Number(length) !== (partial ? part.end - part.start : part.part.size)) {
    await response.body.cancel();
    throw new Error('Unexpected part length');
  }
  return { reader: response.body.getReader(), offset: partial ? part.start : 0 };
}
async function streamParts(parts: PartRange[], request: Request, assets: Assets): Promise<ReadableStream<Uint8Array>> {
  // Fetch just the first part before returning headers, so a missing first asset is a clean 502.
  let active = parts.length ? await openPart(parts[0], request, assets) : null;
  let index = 0;
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (index >= parts.length) { controller.close(); return; }
          const part = parts[index];
          if (!active) active = await openPart(part, request, assets);
          if (cancelled) { await active.reader.cancel(); return; }
          const { done, value } = await active.reader.read();
          if (cancelled) return;
          if (done) throw new Error('Media part truncated');
          const from = Math.max(0, part.start - active.offset);
          const to = Math.min(value.length, part.end - active.offset);
          active.offset += value.length;
          if (active.offset >= part.end) {
            await active.reader.cancel();
            active = null;
            index++;
          }
          if (to > from) { controller.enqueue(value.subarray(from, to)); return; }
        }
      } catch (error) {
        if (active) await active.reader.cancel().catch(() => {});
        if (!cancelled) controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      await active?.reader.cancel(reason);
    },
  });
}
async function entityTag(id: string, media: Media, indexTag: string | null): Promise<string> {
  if (media.sha256 && /^[a-f0-9]{64}$/i.test(media.sha256)) return `"sha256-${media.sha256.toLowerCase()}"`;
  // A manifest-derived validator is deliberately weak when a content hash was not supplied.
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${indexTag || ''}:${id}:${JSON.stringify(media)}`));
  const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `W/"media-${digest}"`;
}
export async function serveMedia(request: Request, assets: Assets): Promise<Response> {
  const match = /^\/api\/media\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})$/.exec(new URL(request.url).pathname);
  if (!match) return failure('媒体不存在。', 404);
  if (!['GET', 'HEAD'].includes(request.method)) return failure('请求方法不支持。', 405, { Allow: 'GET, HEAD' });
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return failure('仅允许从本站访问媒体。', 403);
  }
  try {
    const index = await assets.fetch(new Request(new URL('/content/media-index.json', request.url)));
    if (!index.ok) return failure('媒体不存在。', 404);
    const data: unknown = await index.json();
    if (!data || typeof data !== 'object' || !Object.hasOwn(data, match[1])) return failure('媒体不存在。', 404);
    const media = (data as Record<string, unknown>)[match[1]];
    if (!validMedia(media)) return failure('媒体索引无效。', 502);
    const etag = await entityTag(match[1], media, index.headers.get('ETag'));
    const headers = new Headers({ 'Content-Type': media.type, 'Accept-Ranges': 'bytes', ETag: etag,
      'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Origin' });
    const noneMatch = request.headers.get('If-None-Match');
    if (noneMatch?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
      return new Response(null, { status: 304, headers });
    }
    const rangeHeader = request.headers.get('Range');
    const ifRange = request.headers.get('If-Range');
    const useRange = rangeHeader !== null && (!ifRange || (!etag.startsWith('W/') && ifRange === etag));
    const range = useRange ? parseRange(rangeHeader, media.size) : { start: 0, end: media.size - 1 };
    if (!range) {
      headers.set('Content-Range', `bytes */${media.size}`);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Length', String(Math.max(0, range.end - range.start + 1)));
    if (useRange) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${media.size}`);
    if (request.method === 'HEAD' || media.size === 0) return new Response(null, { status: useRange ? 206 : 200, headers });
    const body = await streamParts(selectParts(media, range.start, range.end), request, assets);
    // Workers derives Content-Length from the body stream, ignoring a manually set header.
    // FixedLengthStream preserves exact lengths on deployed responses without buffering.
    const FixedLength = (globalThis as unknown as { FixedLengthStream?: new (length: number) => {
      readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>;
    } }).FixedLengthStream;
    if (FixedLength) {
      const fixed = new FixedLength(range.end - range.start + 1);
      void body.pipeTo(fixed.writable).catch(() => { /* Propagated to the response stream; includes playback cancellation. */ });
      return new Response(fixed.readable, { status: useRange ? 206 : 200, headers });
    }
    return new Response(body, { status: useRange ? 206 : 200, headers });
  } catch {
    return failure('媒体暂时不可用。', 502);
  }
}
