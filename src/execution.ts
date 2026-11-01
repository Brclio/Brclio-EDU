export type RunMessage = { type: string; value?: any };
export interface CodeRunner {
  onmessage: ((event: { data: RunMessage }) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  postMessage(message: any): void;
  terminate(): void;
}
// These six original C snippets were labelled python38 in the original API.
const originalC = new Set(['eefde1c8-868a-396f-bce2-bb1b134d12eb', '66f83076-959e-33b4-9b59-aa0028d2343a', 'e57f0c41-ee74-3283-a26f-8e7060b19dd7', 'f0550bca-19fc-3883-8cb7-7c0dca870999', 'd4df3257-f249-3343-b150-d0d2df9d7925', '467a8f6f-974c-386e-9792-7b06244d8e96']);
export function runtimeLanguage(raw: string, id = ''): string {
  if (originalC.has(id)) return 'c';
  const value = raw.toLowerCase();
  if (value.startsWith('python') || value === 'py') return 'python';
  return ({ 'c++': 'cpp', 'c++11': 'cpp', 'c++14': 'cpp', 'c++17': 'cpp', js: 'javascript', node: 'javascript', nodejs: 'javascript', sqlite: 'sql', sqlite3: 'sql', golang: 'go', 'go-1165': 'go', shell: 'sh', ts: 'typescript', 'c#': 'csharp', cs: 'csharp', html5: 'html' } as Record<string, string>)[value] || value;
}
export const remoteLanguages = new Set(['c', 'cpp', 'java', 'go', 'sh', 'bash', 'typescript', 'csharp', 'ruby', 'rust', 'php', 'swift']);
export const supportsExecution = (language: string) => ['python', 'javascript', 'html', 'sql'].includes(language) || remoteLanguages.has(language);
export function needsServer(language: string, code: string, files: any[] = []) {
  return remoteLanguages.has(language) || language === 'python' && /\b(?:from\s+multiprocessing\b|import\s+multiprocessing\b)/.test([code, ...files.map(f => f.content || '')].join('\n'));
}
export class RemoteCodeRunner implements CodeRunner {
  onmessage: CodeRunner['onmessage'] = null;
  onerror: CodeRunner['onerror'] = null;
  private controller = new AbortController();
  // Window.fetch must keep its native receiver when stored on an instance.
  constructor(private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  terminate() { this.controller.abort(); }
  private send(type: string, value?: any) { if (!this.controller.signal.aborted) this.onmessage?.({ data: { type, value } }); }
  postMessage(message: any) { void this.run(message); }
  private async run(message: any) {
    this.send('status', '正在编译并运行…');
    this.send('running', { remote: true });
    try {
      const body = { language: message.language, code: message.code, stdin: message.stdin || '',
        files: (message.files || []).filter((f: any) => typeof f.content === 'string').map((f: any) => ({ file_name: f.file_name || f.name, content: f.content })),
        testcases: (message.testcases || []).map((t: any, index: number) => ({ case_no: t.case_no ?? index + 1, stdin: String(t.stdin ?? t.input ?? ''), expected_output: String(t.expected_output ?? t.expectedOutput ?? t.output ?? '') })),
      };
      const response = await this.fetcher('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: this.controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '运行服务暂时不可用，请稍后重试。');
      if (result.stdout) this.send('stdout', result.stdout.replace(/\n$/, ''));
      if (result.stderr) this.send('stderr', result.stderr.replace(/\n$/, ''));
      if (result.testResults?.length) this.send('testResults', result.testResults);
      else if (message.judge) {
        const match = String(result.stdout).match(/<__educative_test_results__>([\s\S]*?)<\/__educative_test_results__>/);
        const results = match ? JSON.parse(match[1]).test_results : null;
        if (!Array.isArray(results) || !results.length || results.some(item => !item || typeof item.succeeded !== 'boolean')) throw new Error('判题代码未返回有效测试结果，请检查程序后重试。');
        this.send('testResults', results);
      }
      if (result.timedOut || result.exitCode || result.outputTruncated) this.send('error', result.timedOut ? '\n程序超过运行时限，已停止。' : result.outputTruncated ? '\n输出超过大小限制，已停止。' : `\n程序退出，状态码 ${result.exitCode}。`);
      else this.send('done');
    } catch (error) { if (!this.controller.signal.aborted) this.send('error', error instanceof Error ? error.message : '运行服务连接失败。'); }
  }
}
