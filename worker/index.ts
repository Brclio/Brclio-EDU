import { serveMedia } from './media.ts';
import { runCode } from './execution.ts';
/** Anonymous, same-origin learning progress stored in a private GitHub repository. */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GITHUB_REPOSITORY?: string;
  GITHUB_BRANCH?: string;
  GITHUB_TOKEN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  SESSION_SECRET?: string;
  RUNNER_URL?: string;
  RUNNER_TOKEN?: string;
}
export type Answer = null | boolean | number | string | Answer[] | { [key: string]: Answer };
export interface LessonProgress {
  completed: boolean;
  updatedAt: string;
  code?: string;
  answers?: Record<string, Answer>;
}
export interface Progress {
  version: 1;
  updatedAt: string;
  lessons: Record<string, LessonProgress>;
  lastLesson?: { courseId: string; lessonId: string };
}
interface Dependencies {
  fetch?: typeof fetch;
  now?: () => number;
}
interface Config {
  repository: string;
  branch?: string;
  token?: string;
  appId?: string;
  installationId?: string;
  privateKey?: string;
  secret: string;
}
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_ANSWERS_BYTES = 256 * 1024;
const MAX_LESSONS = 2000;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function emptyProgress(): Progress {
  return { version: 1, updatedAt: '1970-01-01T00:00:00.000Z', lessons: {} };
}
function json(body: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Vary': 'Cookie, Origin',
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function getConfig(env: Env): Config | null {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !env.GITHUB_REPOSITORY ||
      !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(env.GITHUB_REPOSITORY)) return null;
  const appId = env.GITHUB_APP_CLIENT_ID || env.GITHUB_APP_ID;
  const appReady = appId && env.GITHUB_INSTALLATION_ID && /^\d+$/.test(env.GITHUB_INSTALLATION_ID) && env.GITHUB_APP_PRIVATE_KEY;
  if (!appReady && !env.GITHUB_TOKEN) return null;
  return { repository: env.GITHUB_REPOSITORY, secret: env.SESSION_SECRET, branch: env.GITHUB_BRANCH || undefined,
    ...(appReady ? { appId, installationId: env.GITHUB_INSTALLATION_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY } : { token: env.GITHUB_TOKEN }) };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, '包含不支持的数据字段。');
}
function timestamp(value: unknown, now: number): string {
  if (typeof value !== 'string' || value.length > 30 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new HttpError(400, '学习记录时间格式无效。');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < 0 || time > now + 5 * 60_000) throw new HttpError(400, '学习记录时间无效。');
  return new Date(time).toISOString();
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') throw new HttpError(400, '课程标识无效。');
  const id = String(value);
  if (!idPattern.test(id) || dangerousKeys.has(id)) throw new HttpError(400, '课程标识无效。');
  return id;
}
function answer(value: unknown, depth = 0): Answer {
  if (depth > 4) throw new HttpError(400, '答案嵌套过深。');
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && encoder.encode(value).length <= MAX_TEXT_BYTES) return value;
  if (Array.isArray(value) && value.length <= 100) return value.map(item => answer(item, depth + 1));
  if (isRecord(value) && Object.keys(value).length <= 100) {
    const result: Record<string, Answer> = {};
    for (const [key, item] of Object.entries(value)) {
      if (dangerousKeys.has(key) || key.length > 120) throw new HttpError(400, '答案字段无效。');
      result[key] = answer(item, depth + 1);
    }
    return result;
  }
  throw new HttpError(400, '答案格式或长度无效。');
}
export function validateProgress(value: unknown, now = Date.now()): Progress {
  if (!isRecord(value)) throw new HttpError(400, '学习记录必须为 JSON 对象。');
  fields(value, ['version', 'updatedAt', 'lessons', 'lastLesson']);
  if (value.version !== 1 || !isRecord(value.lessons) || Object.keys(value.lessons).length > MAX_LESSONS) {
    throw new HttpError(400, '学习记录格式无效或课程数量超限。');
  }
  const result: Progress = { version: 1, updatedAt: timestamp(value.updatedAt, now), lessons: {} };
  for (const [key, lesson] of Object.entries(value.lessons)) {
    identifier(key);
    if (!isRecord(lesson)) throw new HttpError(400, '课时记录格式无效。');
    fields(lesson, ['completed', 'updatedAt', 'code', 'answers']);
    if (typeof lesson.completed !== 'boolean') throw new HttpError(400, '课时完成状态无效。');
    const record: LessonProgress = { completed: lesson.completed, updatedAt: timestamp(lesson.updatedAt, now) };
    if (lesson.code !== undefined) {
      if (typeof lesson.code !== 'string' || encoder.encode(lesson.code).length > MAX_TEXT_BYTES) throw new HttpError(400, '代码超过 64 KiB 限制，请缩短代码或导出备份。');
      record.code = lesson.code;
    }
    if (lesson.answers !== undefined) {
      if (!isRecord(lesson.answers)) throw new HttpError(400, '答案必须为对象。');
      const answers = answer(lesson.answers) as Record<string, Answer>;
      if (encoder.encode(JSON.stringify(answers)).length > MAX_ANSWERS_BYTES) throw new HttpError(400, '单课答案和笔记超过 256 KiB 限制，请导出备份并精简记录。');
      record.answers = answers;
    }
    result.lessons[key] = record;
  }
  if (value.lastLesson !== undefined) {
    if (!isRecord(value.lastLesson)) throw new HttpError(400, '最近学习课时无效。');
    fields(value.lastLesson, ['courseId', 'lessonId']);
    result.lastLesson = { courseId: identifier(value.lastLesson.courseId), lessonId: identifier(value.lastLesson.lessonId) };
  }
  return result;
}
export function mergeProgress(existing: Progress, incoming: Progress): Progress {
  const merged: Progress = { ...existing, lessons: { ...existing.lessons } };
  for (const [id, lesson] of Object.entries(incoming.lessons)) {
    const previous = merged.lessons[id];
    if (!previous || lesson.updatedAt > previous.updatedAt) merged.lessons[id] = lesson;
  }
  if (incoming.updatedAt >= existing.updatedAt) {
    merged.updatedAt = incoming.updatedAt;
    if (incoming.lastLesson) merged.lastLesson = incoming.lastLesson;
  }
  return merged;
}
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function base64url(bytes: Uint8Array): string {
  return base64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function joinBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function der(tag: number, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  let size = bytes.length;
  const length: number[] = [];
  while (size > 0) { length.unshift(size & 255); size >>>= 8; }
  return joinBytes(new Uint8Array([tag, ...(bytes.length < 128 ? [bytes.length] : [128 + length.length, ...length])]), bytes);
}
function privateKeyBytes(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const pkcs1 = normalized.includes('-----BEGIN RSA PRIVATE KEY-----');
  if (!pkcs1 && !normalized.includes('-----BEGIN PRIVATE KEY-----')) throw new HttpError(503, 'GitHub App 私钥格式无效。');
  const bytes = unbase64(normalized.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''));
  if (!pkcs1) return bytes;
  // Wrap GitHub's PKCS#1 RSA key as PKCS#8 for the Workers Web Crypto API.
  const version = new Uint8Array([2, 1, 0]);
  const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  return der(0x30, joinBytes(version, rsaAlgorithm, der(0x04, bytes)));
}
export async function createAppJwt(appId: string, privateKey: string, now = Date.now()): Promise<string> {
  try {
    const key = await crypto.subtle.importKey('pkcs8', privateKeyBytes(privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const seconds = Math.floor(now / 1000);
    const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claims = base64url(encoder.encode(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: appId })));
    const payload = `${header}.${claims}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(payload));
    return `${payload}.${base64url(new Uint8Array(signature))}`;
  } catch { throw new HttpError(503, 'GitHub App 私钥配置无效。'); }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function cookieName(request: Request): string {
  return new URL(request.url).protocol === 'https:' ? '__Host-brclio_progress' : 'brclio_progress_dev';
}
async function readIdentity(request: Request, config: Config, now: number): Promise<string | null> {
  const name = cookieName(request);
  const token = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!token || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[a-f0-9]{32}$/.test(parts[0]) || !/^\d{10}$/.test(parts[1]) || !/^[\w-]{43}$/.test(parts[2])) return null;
  const expires = Number(parts[1]) * 1000;
  if (expires <= now || expires > now + (YEAR_SECONDS + 60) * 1000) return null;
  try {
    // Web Crypto verifies HMAC without a userland string comparison / timing leak.
    const signature = unbase64(parts[2].replace(/-/g, '+').replace(/_/g, '/') + '=');
    const valid = await crypto.subtle.verify('HMAC', await signingKey(config.secret), signature, encoder.encode(`${parts[0]}.${parts[1]}`));
    return valid ? parts[0] : null;
  } catch { return null; }
}
async function newIdentity(request: Request, config: Config, now: number): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID().replace(/-/g, '');
  const expires = Math.floor(now / 1000) + YEAR_SECONDS;
  const payload = `${id}.${expires}`;
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(config.secret), encoder.encode(payload))));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { id, cookie: `${cookieName(request)}=${payload}.${signature}; Path=/; Max-Age=${YEAR_SECONDS}; HttpOnly; SameSite=Lax${secure}` };
}
function sameOriginWrite(request: Request): void {
  const origin = request.headers.get('Origin');
  if (origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new HttpError(403, '只允许从本站保存学习记录。');
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new HttpError(415, '请使用 application/json。');
  }
}
async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > MAX_BODY_BYTES) throw new HttpError(413, '学习记录超过 2 MiB 限制，请导出备份并精简记录。');
  if (!request.body) throw new HttpError(400, '请求内容为空。');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, '学习记录超过 2 MiB 限制，请导出备份并精简记录。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(decoder.decode(bytes)); }
  catch { throw new HttpError(400, '请求内容不是有效的 JSON。'); }
}
function serialize(progress: Progress): string {
  // Stable ordering also avoids extra Git commits when a browser retries a saved state.
  const sorted = { ...progress, lessons: Object.fromEntries(Object.entries(progress.lessons).sort(([a], [b]) => a.localeCompare(b))) };
  return JSON.stringify(sorted, null, 2) + '\n';
}
export function createWorker(dependencies: Dependencies = {}) {
  const fetcher = dependencies.fetch || globalThis.fetch;
  const now = dependencies.now || Date.now;
  // Cache only the permission check, never another learner's progress.
  const verifiedRepositories = new Map<string, number>();
  const installationTokens = new Map<string, { token: string; expiresAt: number }>();
  const pendingTokens = new Map<string, Promise<string>>();
  function authKey(config: Config): string {
    return `${config.repository}\n${config.appId || ''}\n${config.installationId || ''}\n${config.privateKey || config.token}`;
  }
  async function installationToken(config: Config): Promise<string> {
    if (config.token) return config.token;
    const cacheKey = authKey(config);
    const cached = installationTokens.get(cacheKey);
    if (cached && cached.expiresAt > now() + 60_000) return cached.token;
    const pending = pendingTokens.get(cacheKey);
    if (pending) return pending;
    const operation = (async () => {
      const jwt = await createAppJwt(config.appId!, config.privateKey!, now());
      let response: Response;
      try {
        response = await fetcher(`https://api.github.com/app/installations/${config.installationId}/access_tokens`, {
          method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Brclio-EDU-Progress' },
          body: JSON.stringify({ repositories: [config.repository.split('/')[1]], permissions: { contents: 'write' } }),
        });
      } catch { throw new HttpError(502, 'GitHub App 授权暂时不可用，请稍后重试。'); }
      if (!response.ok) throw new HttpError(503, 'GitHub App 授权失败，请检查仓库安装和权限配置。');
      const result = await response.json() as { token?: string; expires_at?: string };
      const expiresAt = Date.parse(result.expires_at || '');
      if (!result.token || !Number.isFinite(expiresAt) || expiresAt <= now()) throw new HttpError(502, 'GitHub App 授权响应异常。');
      if (installationTokens.size > 10) installationTokens.clear();
      installationTokens.set(cacheKey, { token: result.token, expiresAt });
      return result.token;
    })();
    pendingTokens.set(cacheKey, operation);
    try { return await operation; }
    finally { pendingTokens.delete(cacheKey); }
  }
  async function github(config: Config, path: string, init: RequestInit = {}, retryAuth = true): Promise<Response> {
    const token = await installationToken(config);
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    headers.set('User-Agent', 'Brclio-EDU-Progress');
    if (init.body) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await fetcher(`https://api.github.com/repos/${config.repository}${path}`, {
        ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000),
      });
    } catch { throw new HttpError(502, '学习记录云端暂时不可用，请稍后重试。'); }
    if (response.status === 401 && config.appId && retryAuth) {
      installationTokens.delete(authKey(config));
      return github(config, path, init, false);
    }
    return response;
  }
  async function requirePrivateRepository(config: Config): Promise<void> {
    const key = authKey(config);
    if ((verifiedRepositories.get(key) || 0) > now()) return;
    const response = await github(config, '');
    if (!response.ok) throw new HttpError(502, '无法访问学习记录仓库，请检查服务器配置。');
    const repository = await response.json() as { private?: boolean };
    if (repository.private !== true) throw new HttpError(503, '学习记录仅支持私有仓库，请检查服务器配置。');
    if (verifiedRepositories.size > 10) verifiedRepositories.clear();
    verifiedRepositories.set(key, now() + 60_000);
  }
  function contentPath(id: string): string { return `/contents/progress/v1/${id.slice(0, 2)}/${id}.json`; }
  async function readProgress(config: Config, id: string): Promise<{ progress: Progress; sha?: string }> {
    const query = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : '';
    const response = await github(config, contentPath(id) + query, { headers: { Accept: 'application/vnd.github.object+json' } });
    if (response.status === 404) return { progress: emptyProgress() };
    if (!response.ok) throw new HttpError(502, '读取云端学习记录失败，请稍后重试。');
    try {
      const file = await response.json() as { type: string; content: string; encoding: string; sha: string; size: number };
      if (file.type !== 'file' || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_BODY_BYTES || typeof file.sha !== 'string') throw new Error('Invalid stored file');
      let bytes: Uint8Array;
      if (file.encoding === 'base64' && typeof file.content === 'string') {
        bytes = unbase64(file.content.replace(/\s/g, ''));
      } else if (file.encoding === 'none') {
        // GitHub omits base64 content above 1 MiB. Keep metadata's SHA for optimistic writes.
        const raw = await github(config, contentPath(id) + query, { headers: { Accept: 'application/vnd.github.raw+json' } });
        if (!raw.ok || !raw.body) throw new Error('Raw progress unavailable');
        const reader = raw.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY_BYTES || size > file.size) { await reader.cancel(); throw new Error('Stored progress exceeds limit'); }
          chunks.push(value);
        }
        bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      } else throw new Error('Unsupported stored encoding');
      if (bytes.byteLength !== file.size || bytes.byteLength > MAX_BODY_BYTES) throw new Error('Stored progress size mismatch');
      const value = JSON.parse(decoder.decode(bytes));
      return { progress: validateProgress(value, now()), sha: file.sha };
    } catch { throw new HttpError(502, '云端学习记录格式异常，已保留原记录，请联系站点维护者。'); }
  }
  async function writeProgress(config: Config, id: string, incoming: Progress): Promise<Progress> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await readProgress(config, id);
      const progress = mergeProgress(current.progress, incoming);
      if (Object.keys(progress.lessons).length > MAX_LESSONS) throw new HttpError(413, '学习记录数量超过限制。');
      const content = serialize(progress);
      const bytes = encoder.encode(content);
      if (bytes.length > MAX_BODY_BYTES) throw new HttpError(413, '合并后的学习记录超过 2 MiB 限制，请导出备份并精简记录。');
      if (current.sha && content === serialize(current.progress)) return progress;
      const response = await github(config, contentPath(id), {
        method: 'PUT', body: JSON.stringify({
          message: 'Save anonymous learning progress', content: base64(bytes),
          ...(current.sha ? { sha: current.sha } : {}),
          ...(config.branch ? { branch: config.branch } : {}),
        }),
      });
      if (response.ok) return progress;
      // Both concurrent updates and a concurrent first create require a fresh SHA.
      if (response.status === 409 || response.status === 422) continue;
      if (response.status === 403 || response.status === 429) throw new HttpError(503, '云端保存暂时受限，学习记录仍保留在本机，请稍后重试。');
      throw new HttpError(502, '保存云端学习记录失败，请稍后重试。');
    }
    throw new HttpError(409, '学习记录正在同步，请稍后重试。');
  }
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (path.startsWith('/api/media/')) return serveMedia(request, env.ASSETS);
      if (path === '/api/run') return runCode(request, env, dependencies.fetch || fetch);
      if (path !== '/api/progress') return json({ error: '接口不存在。' }, 404);
      if (request.method !== 'GET' && request.method !== 'PUT') {
        const response = json({ error: '请求方法不支持。' }, 405);
        response.headers.set('Allow', 'GET, PUT');
        return response;
      }
      let cookie: string | undefined;
      try {
        if (request.method === 'PUT') sameOriginWrite(request);
        const config = getConfig(env);
        if (!config) return json({ configured: false, progress: emptyProgress(), error: 'cloud_storage_not_configured' }, request.method === 'GET' ? 200 : 503);
        let id = await readIdentity(request, config, now());
        if (!id) {
          if (request.method === 'PUT') throw new HttpError(401, '请先刷新页面以建立匿名学习记录。');
          const created = await newIdentity(request, config, now());
          id = created.id;
          cookie = created.cookie;
        }
        if (request.method === 'GET') {
          await requirePrivateRepository(config);
          const { progress } = await readProgress(config, id);
          return json({ configured: true, progress }, 200, cookie);
        }
        const incoming = validateProgress(await readBody(request), now());
        await requirePrivateRepository(config);
        const progress = await writeProgress(config, id, incoming);
        return json({ configured: true, progress }, 200);
      } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status, cookie);
        return json({ error: '学习记录服务暂时不可用，请稍后重试。' }, 500, cookie);
      }
    },
  };
}
export default createWorker();
