import test from 'node:test';
import assert from 'node:assert/strict';

const key = 'brclio-edu-progress-v1';
const blank = () => ({ version: 1, updatedAt: '1970-01-01T00:00:00.000Z', lessons: {} });
async function fixture(fetcher: typeof fetch) {
  const original = { window: (globalThis as any).window, localStorage: (globalThis as any).localStorage,
    fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const storage = new Map<string, string>();
  const events = new Map<string, (event: any) => void>();
  const timers = new Map<number, () => void>();
  let sequence = 0;
  let writes = 0;
  (globalThis as any).window = { addEventListener: (name: string, callback: any) => events.set(name, callback) };
  (globalThis as any).localStorage = { getItem: (name: string) => storage.get(name) || null,
    setItem: (name: string, value: string) => { writes++; storage.set(name, value); } };
  globalThis.fetch = fetcher;
  globalThis.setTimeout = ((fn: () => void) => { timers.set(++sequence, fn); return sequence; }) as any;
  globalThis.clearTimeout = ((id: number) => timers.delete(id)) as any;
  const module = await import(`../src/progress.ts?case=${Math.random()}`);
  return { module, storage, events, get writes() { return writes; },
    async runTimer() {
      const [id, callback] = [...timers.entries()].at(-1)!;
      timers.delete(id); callback();
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    },
    restore() { Object.assign(globalThis, original); },
  };
}

test('initial cloud outage retries while browser stays online and uploads saved edits', async () => {
  const methods: string[] = [];
  let first = true;
  const f = await fixture(async (_, init) => {
    const method = init?.method || 'GET'; methods.push(method);
    if (first) { first = false; return new Response('', { status: 503 }); }
    return Response.json({ configured: true, progress: method === 'PUT' ? JSON.parse(String(init?.body)) : blank() });
  });
  try {
    await f.module.initProgress();
    f.module.updateLesson('015', '936', { completed: true });
    await f.runTimer();
    assert.deepEqual(methods, ['GET', 'GET', 'PUT']);
    assert.equal(JSON.parse(f.storage.get(key)!).lessons['015:936'].completed, true);
  } finally { f.restore(); }
});

test('cross-tab changes persist the merged union without storage-event ping-pong', async () => {
  const f = await fixture(async () => Response.json({ configured: false, progress: blank() }));
  try {
    f.module.updateLesson('015', '936', { completed: true });
    const other = { ...blank(), updatedAt: '2026-01-01T00:00:00.000Z', lessons: {
      '016:42': { completed: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    } };
    f.events.get('storage')!({ key, newValue: JSON.stringify(other) });
    const persisted = f.storage.get(key)!;
    assert.deepEqual(Object.keys(JSON.parse(persisted).lessons).sort(), ['015:936', '016:42']);
    const writes = f.writes;
    f.events.get('storage')!({ key, newValue: persisted });
    assert.equal(f.writes, writes);
  } finally { f.restore(); }
});

test('expired or cleared anonymous cookie re-establishes a session before retrying', async () => {
  const methods: string[] = [];
  let rejected = false;
  const f = await fixture(async (_, init) => {
    const method = init?.method || 'GET'; methods.push(method);
    if (method === 'PUT' && !rejected) { rejected = true; return new Response('', { status: 401 }); }
    return Response.json({ configured: true, progress: method === 'PUT' ? JSON.parse(String(init?.body)) : blank() });
  });
  try {
    await f.module.initProgress();
    f.module.updateLesson('015', '936', { completed: true });
    await f.module.syncProgress();
    await f.runTimer();
    assert.deepEqual(methods, ['GET', 'PUT', 'GET', 'PUT']);
  } finally { f.restore(); }
});

test('two edits within one millisecond receive distinct merge timestamps', async () => {
  const f = await fixture(async () => Response.json({ configured: false, progress: blank() }));
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-11-01T00:00:00.000Z');
    f.module.updateLesson('015', '936', { completed: false });
    const first = JSON.parse(f.storage.get(key)!).lessons['015:936'].updatedAt;
    f.module.updateLesson('015', '936', { completed: true });
    const second = JSON.parse(f.storage.get(key)!).lessons['015:936'].updatedAt;
    assert.ok(second > first);
  } finally { Date.now = originalNow; f.restore(); }
});

test('permanent size errors do not repeatedly upload the same invalid record', async () => {
  let puts = 0;
  const f = await fixture(async (_, init) => {
    if (init?.method === 'PUT') { puts++; return Response.json({ error: '学习记录超过 2 MiB 限制。' }, { status: 413 }); }
    return Response.json({ configured: true, progress: blank() });
  });
  try {
    await f.module.initProgress();
    f.module.updateLesson('015', '936', { completed: true });
    await f.module.syncProgress();
    await f.runTimer();
    assert.equal(puts, 1);
    assert.equal(JSON.parse(f.storage.get(key)!).lessons['015:936'].completed, true);
  } finally { f.restore(); }
});

test('backup import accepts records above the old 256 KiB limit and rejects above 2 MiB', async () => {
  const f = await fixture(async () => Response.json({ configured: false, progress: blank() }));
  try {
    const progress: any = { ...blank(), updatedAt: '2026-11-01T09:00:00.000Z', lessons: {} };
    for (let i = 0; i < 10; i++) progress.lessons[`015:${i}`] = { completed: true, updatedAt: progress.updatedAt, answers: { __notes: 'x'.repeat(60000) } };
    f.module.importProgress(JSON.stringify(progress));
    assert.equal(Object.keys(JSON.parse(f.storage.get(key)!).lessons).length, 10);
    assert.throws(() => f.module.importProgress(JSON.stringify({ ...progress, ignored: 'x'.repeat(2 * 1024 * 1024) })), /2 MiB/);
  } finally { f.restore(); }
});
