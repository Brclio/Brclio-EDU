/** Same-origin bridge to the isolated, authenticated course execution service. */
export interface ExecutionEnv { RUNNER_URL?: string; RUNNER_TOKEN?: string }
const encoder = new TextEncoder();
const languages = new Set(['c', 'cpp', 'java', 'go', 'javascript', 'python', 'sql', 'sh', 'bash', 'typescript', 'csharp', 'ruby', 'rust', 'php', 'swift']);
class InputError extends Error {}
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
function bounded(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.includes('\0') || encoder.encode(value).length > limit) throw new InputError();
  return value;
}
export function validateExecution(value: any) {
  if (!object(value) || Object.keys(value).some(k => !['language', 'code', 'stdin', 'files', 'testcases'].includes(k)) || !languages.has(value.language)) throw new InputError();
  const code = bounded(value.code, 128 * 1024), stdin = bounded(value.stdin ?? '', 64 * 1024);
  if (!Array.isArray(value.files ?? []) || (value.files?.length ?? 0) > 32) throw new InputError();
  const names = new Set<string>(); let total = 0;
  const files = (value.files ?? []).map((file: any) => {
    if (!object(file) || Object.keys(file).some(k => !['file_name', 'content'].includes(k))) throw new InputError();
    const name = bounded(file.file_name, 240), content = bounded(file.content, 128 * 1024);
    if (!name || /[\\\x00-\x1f]/.test(name) || name.split('/').some(part => ['', '.', '..'].includes(part)) || names.has(name)) throw new InputError();
    names.add(name); total += encoder.encode(content).length;
    if (total > 128 * 1024) throw new InputError();
    return { file_name: name, content };
  });
  if (!Array.isArray(value.testcases ?? []) || (value.testcases?.length ?? 0) > 8) throw new InputError();
  const testcases = (value.testcases ?? []).map((item: any, index: number) => {
    if (!object(item) || Object.keys(item).some(k => !['case_no', 'stdin', 'expected_output'].includes(k))) throw new InputError();
    const case_no = item.case_no ?? index + 1;
    if (!['string', 'number'].includes(typeof case_no) || String(case_no).length > 64) throw new InputError();
    return { case_no, stdin: bounded(item.stdin ?? '', 64 * 1024), expected_output: bounded(item.expected_output, 64 * 1024) };
  });
  return { language: value.language, code, stdin, files, testcases };
}
async function limitedBody(response: Request | Response, max: number): Promise<string> {
  const reader = response.body?.getReader(); if (!reader) return '';
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw new InputError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
const json = (body: unknown, status = 200, retry?: string) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  ...(retry && /^\d{1,3}$/.test(retry) ? { 'Retry-After': retry } : {}),
} });
export async function runCode(request: Request, env: ExecutionEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return json({ error: '请求方法不支持。' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: '请在课程网站内运行代码。' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({ error: '请求格式无效。' }, 415);
  if (Number(request.headers.get('Content-Length')) > 256 * 1024) return json({ error: '代码和附件超过大小限制。' }, 413);
  if (!env.RUNNER_URL?.startsWith('https://') || !env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32) return json({ error: '在线运行服务尚未配置。' }, 503);
  let payload: ReturnType<typeof validateExecution>;
  try { payload = validateExecution(JSON.parse(await limitedBody(request, 256 * 1024))); }
  catch { return json({ error: '代码、语言、附件路径或测试数据无效，或超过大小限制。' }, 400); }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${env.RUNNER_TOKEN}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`));
  const client = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 65_000);
  try {
    const upstream = await fetcher(env.RUNNER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Brclio-EDU-Worker/1.0', Authorization: `Bearer ${env.RUNNER_TOKEN}`, 'X-Client-Id': client }, body: JSON.stringify(payload), redirect: 'manual', signal: controller.signal });
    if (!upstream.ok) {
      const message = upstream.status === 429 ? '最多每分钟运行 6 次，请稍后重试。' : upstream.status === 503 ? '运行服务正在处理另一个任务，请稍后重试。' : '运行服务暂时不可用，请稍后重试。';
      return json({ error: message }, [429, 503].includes(upstream.status) ? upstream.status : 502, upstream.headers.get('Retry-After') || undefined);
    }
    const value = JSON.parse(await limitedBody(upstream, 2 * 1024 * 1024));
    if (!object(value) || typeof value.stdout !== 'string' || typeof value.stderr !== 'string' || typeof value.exitCode !== 'number' || typeof value.timedOut !== 'boolean') throw new Error('Invalid result');
    return json(value);
  } catch { return json({ error: controller.signal.aborted ? '编译或运行超时，请简化程序后重试。' : '运行服务连接失败，请稍后重试。' }, 502); }
  finally { clearTimeout(timer); }
}
