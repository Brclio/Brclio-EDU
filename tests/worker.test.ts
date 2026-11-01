import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createWorker, createAppJwt, validateProgress, mergeProgress, type Env, type Progress } from '../worker/index.ts';

const NOW = Date.parse('2026-11-01T10:00:00.000Z');
const ORIGIN = 'https://learn.example.com';
const env: Env = {
  ASSETS: { fetch: async () => new Response('static course page') },
  GITHUB_REPOSITORY: 'owner/private-progress', GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'test-only-token', SESSION_SECRET: 'test-secret-with-more-than-thirty-two-characters',
};
const blank = (): Progress => ({ version: 1, updatedAt: '1970-01-01T00:00:00.000Z', lessons: {} });
const state = (id: string, time = '2026-11-01T09:59:00.000Z', code?: string): Progress => ({
  version: 1, updatedAt: time,
  lessons: { [id]: { completed: true, updatedAt: time, ...(code !== undefined ? { code } : {}) } },
  lastLesson: { courseId: '1', lessonId: id },
});
function request(method = 'GET', cookie?: string, body?: unknown, origin = ORIGIN): Request {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (method === 'PUT') { headers.set('Origin', origin); headers.set('Content-Type', 'application/json'); }
  return new Request(`${ORIGIN}/api/progress`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
function cookieOf(response: Response): string {
  const cookie = response.headers.get('Set-Cookie');
  assert.ok(cookie);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  return cookie.split(';')[0];
}
function fakeGitHub(options: { public?: boolean; conflict?: boolean } = {}) {
  const files = new Map<string, { value: Progress; sha: string }>();
  let commits = 0;
  let metadataReads = 0;
  let conflictingWrite = options.conflict;
  let contentReads = 0;
  const requests: { url: string; method: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.redirect, 'manual', 'Workers only supports manual/follow redirect modes');
    const method = init?.method || 'GET';
    requests.push({ url, method });
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${env.GITHUB_TOKEN}`);
    assert.ok(url.startsWith('https://api.github.com/repos/owner/private-progress'));
    if (!url.includes('/contents/')) {
      metadataReads++;
      return Response.json({ private: !options.public });
    }
    const path = new URL(url).pathname;
    const file = files.get(path);
    if (method === 'GET') {
      contentReads++;
      if (!file) return new Response('', { status: 404 });
      const content = Buffer.from(JSON.stringify(file.value));
      return Response.json({ type: 'file', encoding: 'base64', content: content.toString('base64'), size: content.length, sha: file.sha });
    }
    const body = JSON.parse(String(init?.body));
    assert.equal(body.branch, 'main');
    if (conflictingWrite) {
      conflictingWrite = false;
      files.set(path, { value: state('1:concurrent', '2026-11-01T09:58:00.000Z'), sha: 'other-tab-sha' });
      return Response.json({ message: 'sha mismatch' }, { status: 409 });
    }
    if (file && body.sha !== file.sha) return new Response('', { status: 409 });
    if (!file && body.sha) return new Response('', { status: 409 });
    commits++;
    files.set(path, { value: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), sha: `sha-${commits}` });
    return Response.json({ content: { sha: `sha-${commits}` } }, { status: 201 });
  };
  return { files, fetcher, requests, get commits() { return commits; }, get metadataReads() { return metadataReads; }, get contentReads() { return contentReads; } };
}

test('unconfigured deployments keep courses and local progress usable', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('No network expected'); } });
  const localEnv = { ASSETS: env.ASSETS };
  const response = await worker.fetch(request(), localEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { configured: false, progress: blank(), error: 'cloud_storage_not_configured' });
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const put = await worker.fetch(request('PUT', undefined, state('1')), localEnv);
  assert.equal(put.status, 503);
  const page = await worker.fetch(new Request(`${ORIGIN}/learn`), localEnv);
  assert.equal(await page.text(), 'static course page');
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/not-found`), localEnv)).status, 404);
});

test('two anonymous browsers have separate records; Unicode round-trips through GitHub', async () => {
  const github = fakeGitHub();
  const worker = createWorker({ fetch: github.fetcher, now: () => NOW });
  const first = cookieOf(await worker.fetch(request(), env));
  const second = cookieOf(await worker.fetch(request(), env));
  assert.notEqual(first, second);
  const progress = state('1:2', undefined, 'print("你好，编程！🐍")');
  progress.lessons['1:2'].answers = { answer: ['你好', 'A'], nested: { correct: true } };
  const saved = await worker.fetch(request('PUT', first, progress), env);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).progress, progress);
  assert.deepEqual((await (await worker.fetch(request('GET', first), env)).json()).progress, progress);
  assert.deepEqual((await (await worker.fetch(request('GET', second), env)).json()).progress, blank());
  assert.equal(github.metadataReads, 1);
  assert.equal(github.commits, 1);
  assert.match([...github.files.keys()][0], /\/contents\/progress\/v1\/[a-f0-9]{2}\/[a-f0-9]{32}\.json$/);
});

test('tampered or missing identity cannot write to another learner', async () => {
  const github = fakeGitHub();
  const worker = createWorker({ fetch: github.fetcher, now: () => NOW });
  const cookie = cookieOf(await worker.fetch(request(), env));
  const signedValue = cookie.split('=')[1];
  const changed = signedValue[0] === 'a' ? 'b' : 'a';
  const tampered = `${cookie.split('=')[0]}=${changed}${signedValue.slice(1)}`;
  for (const invalid of [undefined, tampered, cookie.replace(/.$/, '!')]) {
    const response = await worker.fetch(request('PUT', invalid, state('1')), env);
    assert.equal(response.status, 401);
  }
  assert.equal(github.commits, 0);
  const replacement = cookieOf(await worker.fetch(request('GET', tampered), env));
  assert.notEqual(replacement, cookie);
});

test('expired signed cookies cannot save', async () => {
  const github = fakeGitHub();
  let time = NOW;
  const worker = createWorker({ fetch: github.fetcher, now: () => time });
  const cookie = cookieOf(await worker.fetch(request(), env));
  time += 366 * 24 * 60 * 60 * 1000;
  assert.equal((await worker.fetch(request('PUT', cookie, state('1')), env)).status, 401);
});

test('write rejects cross-origin, missing Origin, and non-JSON requests before calling GitHub', async () => {
  let calls = 0;
  const worker = createWorker({ fetch: async () => { calls++; throw new Error('No GitHub call expected'); } });
  assert.equal((await worker.fetch(request('PUT', undefined, state('1'), 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/progress`, { method: 'PUT', body: '{}' }), env)).status, 403);
  const text = new Request(`${ORIGIN}/api/progress`, { method: 'PUT', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal((await worker.fetch(text, env)).status, 415);
  assert.equal(calls, 0);
});

test('private repository is required and upstream details are never sent to the browser', async () => {
  const github = fakeGitHub({ public: true });
  const worker = createWorker({ fetch: github.fetcher, now: () => NOW });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.equal(github.contentReads, 0);
  const unavailable = createWorker({ fetch: async () => Response.json({ secret: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY }, { status: 403 }), now: () => NOW });
  const error = await unavailable.fetch(request(), env);
  const body = await error.text();
  assert.equal(error.status, 502);
  assert.ok(!body.includes(env.GITHUB_TOKEN!));
  assert.ok(!body.includes(env.GITHUB_REPOSITORY!));
});

test('concurrent GitHub updates retry with latest SHA and preserve both lessons', async () => {
  const github = fakeGitHub({ conflict: true });
  const worker = createWorker({ fetch: github.fetcher, now: () => NOW });
  const cookie = cookieOf(await worker.fetch(request(), env));
  const response = await worker.fetch(request('PUT', cookie, state('1:mine')), env);
  assert.equal(response.status, 200);
  const saved = (await response.json()).progress;
  assert.deepEqual(Object.keys(saved.lessons).sort(), ['1:concurrent', '1:mine']);
  assert.equal(saved.lastLesson.lessonId, '1:mine');
  assert.equal(github.requests.filter(item => item.method === 'PUT').length, 2);
  assert.equal(github.commits, 1);
});

test('older offline state cannot undo newer completion and no-op save avoids a commit', async () => {
  const github = fakeGitHub();
  const worker = createWorker({ fetch: github.fetcher, now: () => NOW });
  const cookie = cookieOf(await worker.fetch(request(), env));
  const newer = state('1:2');
  await worker.fetch(request('PUT', cookie, newer), env);
  const older = state('1:2', '2026-11-01T09:00:00.000Z');
  older.lessons['1:2'].completed = false;
  const response = await worker.fetch(request('PUT', cookie, older), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).progress.lessons['1:2'].completed, true);
  await worker.fetch(request('PUT', cookie, newer), env);
  assert.equal(github.commits, 1);
});

test('invalid fields, malicious object keys, and future timestamps are rejected', () => {
  const valid = state('1:2');
  assert.throws(() => validateProgress({ ...valid, path: '../../secret' }, NOW));
  assert.throws(() => validateProgress({ ...valid, lessons: JSON.parse('{"__proto__":{"completed":true,"updatedAt":"2026-11-01T09:59:00.000Z"}}') }, NOW));
  assert.throws(() => validateProgress({ ...valid, lessons: { '1:2': { ...valid.lessons['1:2'], answers: JSON.parse('{"constructor":{"prototype":{"bad":true}}}') } } }, NOW));
  assert.throws(() => validateProgress({ ...valid, updatedAt: '2099-01-01T00:00:00.000Z' }, NOW));
  assert.throws(() => validateProgress({ ...valid, lessons: { '1:2': { ...valid.lessons['1:2'], code: 'x'.repeat(65537) } } }, NOW));
  assert.deepEqual(validateProgress({ ...valid, lastLesson: { courseId: 1, lessonId: 2 } }, NOW).lastLesson, { courseId: '1', lessonId: '2' });
});

test('actual streaming body size is enforced even without Content-Length', async () => {
  const github = fakeGitHub();
  const worker = createWorker({ fetch: github.fetcher, now: () => NOW });
  const cookie = cookieOf(await worker.fetch(request(), env));
  const oversized = state('1');
  oversized.lessons['1'].code = 'x'.repeat(2 * 1024 * 1024 + 1);
  const response = await worker.fetch(request('PUT', cookie, oversized), env);
  assert.equal(response.status, 413);
  assert.equal(github.commits, 0);
});

test('corrupted GitHub record is never replaced by an incoming save', async () => {
  let writes = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (init?.method === 'PUT') writes++;
    if (!String(input).includes('/contents/')) return Response.json({ private: true });
    return Response.json({ type: 'file', encoding: 'base64', sha: 'existing-sha', size: 10, content: Buffer.from('{broken').toString('base64') });
  };
  const worker = createWorker({ fetch: fetcher, now: () => NOW });
  const first = await worker.fetch(request(), env);
  assert.equal(first.status, 502);
  const cookie = cookieOf(first);
  const response = await worker.fetch(request('PUT', cookie, state('1')), env);
  assert.equal(response.status, 502);
  assert.equal(writes, 0);
});

test('independent lesson timestamps decide merges', () => {
  const remote = state('1', '2026-11-01T09:58:00.000Z');
  remote.lessons['2'] = { completed: false, updatedAt: '2026-11-01T09:00:00.000Z' };
  const incoming = state('2', '2026-11-01T09:59:00.000Z');
  const merged = mergeProgress(remote, incoming);
  assert.equal(merged.lessons['1'].completed, true);
  assert.equal(merged.lessons['2'].completed, true);
  assert.equal(remote.lessons['2'].completed, false);
});

const testKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pkcs1Pem = testKeys.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const pkcs8Pem = testKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const appEnv: Env = { ...env, GITHUB_TOKEN: undefined, GITHUB_APP_ID: '5566305', GITHUB_INSTALLATION_ID: '123456', GITHUB_APP_PRIVATE_KEY: pkcs1Pem };

test('App JWT signs with PKCS#1 and PKCS#8 RSA keys and the expected short lifetime', async () => {
  for (const pem of [pkcs1Pem, pkcs8Pem, pkcs1Pem.replace(/\n/g, '\\n')]) {
    const jwt = await createAppJwt('5566305', pem, NOW);
    const [header, claims, signature] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
    assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), { iat: NOW / 1000 - 60, exp: NOW / 1000 + 540, iss: '5566305' });
    assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), testKeys.publicKey, Buffer.from(signature, 'base64url')), true);
  }
});

test('App token is scoped to the target repository, coalesced, cached, and refreshed before expiry', async () => {
  let time = NOW;
  let exchanges = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.redirect, 'manual');
    const auth = new Headers(init?.headers).get('Authorization')!;
    if (url.includes('/app/installations/123456/access_tokens')) {
      exchanges++;
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), { repositories: ['private-progress'], permissions: { contents: 'write' } });
      const parts = auth.replace('Bearer ', '').split('.');
      assert.equal(verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), testKeys.publicKey, Buffer.from(parts[2], 'base64url')), true);
      return Response.json({ token: `installation-token-${exchanges}`, expires_at: new Date(time + 3600_000).toISOString() });
    }
    assert.equal(auth, `Bearer installation-token-${exchanges}`);
    if (url.includes('/contents/')) return new Response('', { status: 404 });
    return Response.json({ private: true });
  };
  const worker = createWorker({ fetch: fetcher, now: () => time });
  const responses = await Promise.all([worker.fetch(request(), appEnv), worker.fetch(request(), appEnv)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(exchanges, 1);
  const cookie = cookieOf(responses[0]);
  await worker.fetch(request('GET', cookie), appEnv);
  assert.equal(exchanges, 1);
  time += 59 * 60_000 + 1_000;
  assert.equal((await worker.fetch(request('GET', cookie), appEnv)).status, 200);
  assert.equal(exchanges, 2);
});

test('a revoked installation token is refreshed once and private-key errors stay private', async () => {
  let exchanges = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/access_tokens')) {
      exchanges++;
      return Response.json({ token: `token-${exchanges}`, expires_at: new Date(NOW + 3600_000).toISOString() });
    }
    if (exchanges === 1) return new Response('', { status: 401 });
    if (url.includes('/contents/')) return new Response('', { status: 404 });
    return Response.json({ private: true });
  };
  const worker = createWorker({ fetch: fetcher, now: () => NOW });
  assert.equal((await worker.fetch(request(), appEnv)).status, 200);
  assert.equal(exchanges, 2);
  const invalid = await worker.fetch(request(), { ...appEnv, GITHUB_APP_PRIVATE_KEY: 'not-a-real-key' });
  assert.equal(invalid.status, 503);
  assert.ok(!(await invalid.text()).includes('not-a-real-key'));
});


test('GitHub redirects are rejected without forwarding installation credentials', async () => {
  const destinations: string[] = [];
  const worker = createWorker({ now: () => NOW, fetch: async (input, init) => {
    destinations.push(String(input));
    assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/token' } });
  } });
  const response = await worker.fetch(request(), appEnv);
  assert.equal(response.status, 503);
  assert.equal(destinations.length, 1);
  assert.ok(destinations[0].startsWith('https://api.github.com/app/installations/'));
});

test('records above 1 MiB load via GitHub raw content and retain metadata SHA when saving', async () => {
  const large: Progress = { version: 1, updatedAt: '2026-11-01T09:58:00.000Z', lessons: {} };
  for (let i = 0; i < 20; i++) large.lessons[`015:${i}`] = {
    completed: true, updatedAt: large.updatedAt, code: 'x'.repeat(60_000), answers: { __notes: '笔记'.repeat(1000) },
  };
  const stored = JSON.stringify(large);
  const size = Buffer.byteLength(stored);
  assert.ok(size > 1024 * 1024 && size < 2 * 1024 * 1024);
  let rawReads = 0;
  let written: any;
  const fetcher: typeof fetch = async (input, init) => {
    if (!String(input).includes('/contents/')) return Response.json({ private: true });
    if (init?.method === 'PUT') {
      written = JSON.parse(String(init.body));
      return Response.json({ content: { sha: 'updated-sha' } });
    }
    if (new Headers(init?.headers).get('Accept') === 'application/vnd.github.raw+json') {
      rawReads++;
      return new Response(stored);
    }
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/vnd.github.object+json');
    return Response.json({ type: 'file', encoding: 'none', content: '', size, sha: 'large-file-sha' });
  };
  const worker = createWorker({ fetch: fetcher, now: () => NOW });
  const first = await worker.fetch(request(), env);
  const cookie = cookieOf(first);
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).progress, large);
  const saved = await worker.fetch(request('PUT', cookie, state('015:936')), env);
  assert.equal(saved.status, 200);
  assert.equal(written.sha, 'large-file-sha');
  assert.equal(rawReads, 2);
  const merged = JSON.parse(Buffer.from(written.content, 'base64').toString());
  assert.equal(Object.keys(merged.lessons).length, 21);
  assert.equal(merged.lessons['015:0'].code.length, 60_000);
});

test('oversized stored metadata is rejected before downloading raw content', async () => {
  let rawReads = 0;
  const worker = createWorker({ now: () => NOW, fetch: async (input, init) => {
    if (!String(input).includes('/contents/')) return Response.json({ private: true });
    if (new Headers(init?.headers).get('Accept') === 'application/vnd.github.raw+json') rawReads++;
    return Response.json({ type: 'file', encoding: 'none', content: '', size: 2 * 1024 * 1024 + 1, sha: 'oversized-sha' });
  } });
  assert.equal((await worker.fetch(request(), env)).status, 502);
  assert.equal(rawReads, 0);
});

test('64 KiB code and note strings use UTF-8 byte limits', () => {
  const progress = state('015:936');
  progress.lessons['015:936'].answers = { __notes: 'x'.repeat(65536) };
  progress.lessons['015:936'].code = 'x'.repeat(65536);
  assert.equal(validateProgress(progress, NOW).lessons['015:936'].answers?.__notes, progress.lessons['015:936'].answers.__notes);
  progress.lessons['015:936'].answers.__notes = '字'.repeat(22000);
  assert.throws(() => validateProgress(progress, NOW));
});
