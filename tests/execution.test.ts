import test from 'node:test';
import assert from 'node:assert/strict';
import { runCode, validateExecution } from '../worker/execution.ts';
import { runtimeLanguage, supportsExecution, needsServer, RemoteCodeRunner } from '../src/execution.ts';

const origin = 'https://edu.example.com';
const env = { RUNNER_URL: 'https://runner.example.com/run', RUNNER_TOKEN: 'test-only-secret-with-more-than-32-characters' };
const payload = { language: 'c', code: '#include <stdio.h>\nint main(){puts("Hello");}', stdin: '', files: [], testcases: [] };
const request = (body: unknown = payload, extra = {}, method = 'POST') => new Request(`${origin}/api/run`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...extra }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });

test('execution proxy validates origin and paths before contacting the runner', async () => {
  const noNetwork = async () => { throw Error('must not fetch'); };
  assert.equal((await runCode(request(payload, { Origin: 'https://evil.example' }), env, noNetwork)).status, 403);
  assert.equal((await runCode(request({ ...payload, files: [{ file_name: '../private', content: '' }] }), env, noNetwork)).status, 400);
  assert.equal((await runCode(request({ ...payload, url: 'https://evil.example' }), env, noNetwork)).status, 400);
  assert.equal((await runCode(request(payload, {}, 'GET'), env, noNetwork)).status, 405);
  assert.equal((await runCode(request(payload, { 'Content-Type': 'text/plain' }), env, noNetwork)).status, 415);
});
test('execution request bounds Unicode bytes, inputs, files, tests and duplicate paths', () => {
  assert.throws(() => validateExecution({ ...payload, code: '中'.repeat(50_000) }));
  assert.throws(() => validateExecution({ ...payload, files: [{ file_name: '/absolute', content: '' }] }));
  assert.throws(() => validateExecution({ ...payload, files: [{ file_name: 'a', content: '' }, { file_name: 'a', content: '' }] }));
  assert.throws(() => validateExecution({ ...payload, testcases: Array(9).fill({ stdin: '', expected_output: '' }) }));
  assert.deepEqual(validateExecution(payload), payload);
});
test('proxy forwards only to configured HTTPS backend with auth and hashed client ID', async () => {
  const response = await runCode(request(), env, async (url, init) => {
    assert.equal(url, env.RUNNER_URL);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), `Bearer ${env.RUNNER_TOKEN}`);
    assert.match(headers.get('X-Client-Id')!, /^[a-f0-9]{64}$/);
    assert.notEqual(headers.get('X-Client-Id'), '192.0.2.1');
    assert.equal(init?.redirect, 'manual');
    assert.deepEqual(JSON.parse(String(init?.body)), payload);
    return Response.json({ stdout: 'Hello\n', stderr: '', exitCode: 0, timedOut: false });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).stdout, 'Hello\n');
});
test('proxy handles rate limit, busy state and invalid response without exposing credentials', async () => {
  for (const status of [429, 503, 401, 302]) {
    const response = await runCode(request(), env, async () => new Response(env.RUNNER_TOKEN, { status, headers: { 'Retry-After': '10' } }));
    assert.equal(response.status, status === 429 || status === 503 ? status : 502);
    assert.ok(!(await response.text()).includes(env.RUNNER_TOKEN));
  }
  assert.equal((await runCode(request(), env, async () => Response.json({ invalid: true }))).status, 502);
});
test('runtime routing handles original aliases and six incorrectly labelled C snippets', () => {
  assert.equal(runtimeLanguage('python38', 'eefde1c8-868a-396f-bce2-bb1b134d12eb'), 'c');
  for (const [input, expected] of [['go-1165', 'go'], ['golang', 'go'], ['c++', 'cpp'], ['nodejs', 'javascript'], ['c#', 'csharp'], ['shell', 'sh']]) assert.equal(runtimeLanguage(input), expected);
  assert.equal(needsServer('python', 'import multiprocessing\npool = multiprocessing.Pool()'), true);
  assert.equal(needsServer('python', 'import numpy'), false);
  assert.equal(supportsExecution('go'), true);
  assert.equal(supportsExecution('raw'), false);
});
test('default browser transport preserves the native Window.fetch receiver', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function () {
    assert.equal(this, globalThis, 'native browser fetch rejects a runner instance receiver');
    return Response.json({ stdout: '6', stderr: '', exitCode: 0, timedOut: false });
  };
  try {
    const runner = new RemoteCodeRunner();
    await new Promise<void>((resolve, reject) => {
      runner.onmessage = ({ data }) => { if (data.type === 'done') resolve(); if (data.type === 'error') reject(new Error(data.value)); };
      runner.postMessage(payload);
    });
  } finally { globalThis.fetch = original; }
});
test('remote adapter preserves stdin, edited files and actual failing public test results', async () => {
  const messages: any[] = [];
  const runner = new RemoteCodeRunner(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.files[0].content, 'edited');
    assert.equal(body.files[0].hidden, undefined);
    assert.equal(body.testcases[0].expected_output, '3\n');
    return Response.json({ stdout: '4\n', stderr: '', exitCode: 0, timedOut: false, testResults: [{ succeeded: false, actual_output: '4\n' }] });
  });
  await new Promise<void>(resolve => {
    runner.onmessage = ({ data }) => { messages.push(data); if (data.type === 'done') resolve(); };
    runner.postMessage({ ...payload, stdin: 'input', files: [{ file_name: 'a.txt', content: 'edited', hidden: true }], testcases: [{ case_no: 1, stdin: '', expected_output: '3\n' }] });
  });
  assert.equal(messages.find(m => m.type === 'testResults').value[0].succeeded, false);
  assert.equal(messages.find(m => m.type === 'stdout').value, '4');
});
test('remote cancellation discards late completion and compile errors remain errors', async () => {
  let complete: (response: Response) => void;
  const messages: any[] = [];
  const runner = new RemoteCodeRunner(() => new Promise(resolve => { complete = resolve; }));
  runner.onmessage = ({ data }) => messages.push(data);
  runner.postMessage(payload); runner.terminate();
  complete!(Response.json({ stdout: 'late', stderr: '', exitCode: 0, timedOut: false }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(!messages.some(m => m.type === 'done' || m.type === 'stdout'));
  const failed = new RemoteCodeRunner(async () => Response.json({ stdout: '', stderr: 'syntax error', exitCode: 1, timedOut: false }));
  await new Promise<void>(resolve => { failed.onmessage = ({ data }) => { messages.push(data); if (data.type === 'error') resolve(); }; failed.postMessage(payload); });
  assert.ok(messages.some(m => m.type === 'stderr' && m.value === 'syntax error'));
});

const judgeEnvelope = (value: unknown) => `<__educative_test_results__>${JSON.stringify(value)}</__educative_test_results__>`;
async function judgeMessages(stdout: string, extra = {}) {
  const messages: any[] = [];
  const runner = new RemoteCodeRunner(async () => Response.json({ stdout, stderr: '', exitCode: 0, timedOut: false, ...extra }));
  await new Promise<void>(resolve => {
    runner.onmessage = ({ data }) => {
      messages.push(data);
      if (data.type === 'done' || data.type === 'error') resolve();
    };
    runner.postMessage({ ...payload, judge: true });
  });
  return messages;
}
test('author judge rejects missing, malformed, empty and non-boolean result protocols', { timeout: 2000 }, async t => {
  const invalid: Record<string, string> = {
    'missing envelope': 'ordinary program output',
    'malformed JSON': '<__educative_test_results__>{broken}</__educative_test_results__>',
    'missing results': judgeEnvelope({}),
    'object instead of array': judgeEnvelope({ test_results: { succeeded: true } }),
    'empty results': judgeEnvelope({ test_results: [] }),
    'null entry': judgeEnvelope({ test_results: [null] }),
    'string success': judgeEnvelope({ test_results: [{ succeeded: 'true' }] }),
    'numeric success': judgeEnvelope({ test_results: [{ succeeded: 1 }] }),
    'partly invalid array': judgeEnvelope({ test_results: [{ succeeded: true }, {}] }),
  };
  for (const [name, stdout] of Object.entries(invalid)) await t.test(name, async () => {
    const messages = await judgeMessages(stdout);
    assert.equal(messages.at(-1)?.type, 'error');
    assert.ok(!messages.some(message => message.type === 'done' || message.type === 'testResults'));
  });
});
test('author judge preserves a valid rejection and accepts boolean success only', { timeout: 2000 }, async () => {
  for (const succeeded of [false, true]) {
    const results = [{ succeeded, reason: succeeded ? 'Succeeded' : 'Incorrect Output', expected_output: '7', actual_output: succeeded ? '7' : '-999' }];
    const messages = await judgeMessages(`learner output\n${judgeEnvelope({ test_results: results })}`);
    assert.deepEqual(messages.find(message => message.type === 'testResults')?.value, results);
    assert.equal(messages.at(-1)?.type, 'done');
    assert.ok(!messages.some(message => message.type === 'error'));
  }
});
test('valid author results do not conceal process timeout, exit failure or truncated output', { timeout: 2000 }, async () => {
  const stdout = judgeEnvelope({ test_results: [{ succeeded: true }] });
  for (const failure of [{ timedOut: true }, { exitCode: 1 }, { outputTruncated: true }]) {
    const messages = await judgeMessages(stdout, failure);
    assert.equal(messages.at(-1)?.type, 'error');
    assert.ok(!messages.some(message => message.type === 'done'));
  }
});
