// Runs in a dedicated module Worker. UI enforces a 20-second execution deadline.
// Pyodide 314 includes sqlite3 in its standard library.
const PYODIDE_BASE = new URL('/runtime/pyodide/', self.location.origin).href;
let runtime;
const sqlProgram = `
import sqlite3
connection = sqlite3.connect(':memory:')
statement = ''
def execute_statement(statement):
    cursor = connection.execute(statement)
    if cursor.description:
        print(' | '.join(column[0] for column in cursor.description))
        for row in cursor:
            print(' | '.join(str(value) if value is not None else 'NULL' for value in row))
for character in sql_source:
    statement += character
    if character == ';' and sqlite3.complete_statement(statement):
        if statement.strip(): execute_statement(statement)
        statement = ''
if statement.strip(): execute_statement(statement)
connection.close()
`;
const fixturePatch = `
import io as _fixture_io
import email.message as _fixture_email
import urllib.request as _fixture_urllib
import urllib.response as _fixture_response
_fixture_bodies = {}
for _fixture_url, _fixture_info in __course_fixtures.items():
    with open(_fixture_info['file'], 'rb') as _fixture_file:
        _fixture_bodies[_fixture_url] = (_fixture_file.read(), _fixture_info['contentType'])
_fixture_original_urlopen = getattr(_fixture_urllib.urlopen, '_brclio_original', _fixture_urllib.urlopen)
def _fixture_urlopen(url, data=None, *args, **kwargs):
    _url = url.full_url if isinstance(url, _fixture_urllib.Request) else str(url)
    _method = url.get_method() if isinstance(url, _fixture_urllib.Request) else ('POST' if data is not None else 'GET')
    if _method.upper() == 'GET' and data is None and _url in _fixture_bodies:
        _body, _content_type = _fixture_bodies[_url]
        _headers = _fixture_email.Message()
        _headers['Content-Type'] = _content_type
        _headers['Content-Length'] = str(len(_body))
        _response = _fixture_response.addinfourl(_fixture_io.BytesIO(_body), _headers, _url, code=200)
        _response.msg = 'OK'
        return _response
    __report_network(_url)
    return _fixture_original_urlopen(url, data, *args, **kwargs)
_fixture_urlopen._brclio_original = _fixture_original_urlopen
_fixture_urllib.urlopen = _fixture_urlopen
try:
    import requests as _fixture_requests
except ImportError:
    _fixture_requests = None
if _fixture_requests is not None:
    _fixture_original_request = getattr(_fixture_requests.sessions.Session.request, '_brclio_original', _fixture_requests.sessions.Session.request)
    def _fixture_request(self, method, url, *args, **kwargs):
        # Requests query parameters change the resource; only the exact fixture URL matches.
        if str(method).upper() == 'GET' and str(url) in _fixture_bodies and not kwargs.get('params') and not self.params:
            _body, _content_type = _fixture_bodies[str(url)]
            _response = _fixture_requests.Response()
            _response.status_code = 200
            _response.reason = 'OK'
            _response.headers['Content-Type'] = _content_type
            _response.headers['Content-Length'] = str(len(_body))
            _response.encoding = 'utf-8'
            _response._content = _body
            _response.raw = _fixture_io.BytesIO(_body)
            _response.url = str(url)
            _response.request = _fixture_requests.Request(method='GET', url=str(url)).prepare()
            return _response
        __report_network(str(url))
        return _fixture_original_request(self, method, url, *args, **kwargs)
    _fixture_request._brclio_original = _fixture_original_request
    _fixture_requests.sessions.Session.request = _fixture_request
`;
self.onmessage = async ({ data }) => {
  const { code, stdin = '', language = 'python', files = [], testcases = [], judge = false } = data;
  let outputLength = 0, outputLines = 0, captured = '';
  const testing = testcases.length > 0;
  const send = (type, value) => self.postMessage({ type, value });
  const output = (line, stderr = false) => {
    outputLines++; outputLength += String(line).length;
    if (outputLines > 1000 || outputLength > 100000) {
      if (outputLines === 1001 && !testing) send('stdout', '…输出过多，后续内容已省略。');
      return;
    }
    captured += String(line) + '\n';
    if (!testing) send(stderr ? 'stderr' : 'stdout', String(line));
  };
  try {
    if (language !== 'javascript') {
      send('status', '正在加载 Python 运行环境，首次运行需要下载资源…');
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
      runtime ||= await loadPyodide({ indexURL: PYODIDE_BASE });
      for (const file of files) {
        const name = file.file_name || file.name || file.filename;
        let content = file.content ?? file.code ?? file.text;
        const fileUrl = file.url || file.file;
        if (content == null && typeof fileUrl === 'string') {
          const response = await fetch(fileUrl.startsWith('//') ? `https:${fileUrl}` : fileUrl, { credentials: 'omit' });
          if (!response.ok) throw new Error(`附加文件无法下载：${name || fileUrl}`);
          content = new Uint8Array(await response.arrayBuffer());
        }
        if (typeof name === 'string' && (typeof content === 'string' || content instanceof Uint8Array) && !name.includes('..') && !name.startsWith('/')) {
          const parts = name.split('/'); parts.pop();
          if (parts.length) runtime.FS.mkdirTree(parts.join('/'));
          runtime.FS.writeFile(name, content);
        }
      }
      // Locally imported course datasets must also exist in Python's virtual FS.
      const assetPaths = [...new Set(Array.from(code.matchAll(/["'](\/content\/assets\/[^"'\n]+)["']/g), match => match[1]))];
      for (const path of assetPaths) {
        const response = await fetch(path, { credentials: 'omit' });
        if (!response.ok) throw new Error(`课程数据文件加载失败：${path}`);
        const parts = path.split('/'); parts.pop();
        runtime.FS.mkdirTree(parts.join('/'));
        runtime.FS.writeFile(path, new Uint8Array(await response.arrayBuffer()));
      }
      send('status', '正在准备程序需要的 Python 库…');
      if (language !== 'sql') await runtime.loadPackagesFromImports(code);
      // BeautifulSoup selects these parsers by string, which import scanning cannot see.
      if (/['"]lxml(?:-xml)?['"]/.test(code)) await runtime.loadPackage('lxml');
      if (language !== 'sql' && /\b(?:requests|urllib)\b|https?:/.test(code)) {
        const fixtureResponse = await fetch('/content/fixture-map.json', { credentials: 'omit' });
        if (fixtureResponse.ok && fixtureResponse.headers.get('content-type')?.includes('json')) {
          const map = await fixtureResponse.json();
          const fixtures = {};
          runtime.FS.mkdirTree('/course-fixtures');
          let fixtureIndex = 0;
          for (const [url, item] of Object.entries(map)) {
            if (!item?.path?.startsWith('/content/fixtures/')) continue;
            const response = await fetch(item.path, { credentials: 'omit' });
            if (!response.ok) throw new Error(`教学网页无法加载：${item.path}`);
            const file = `/course-fixtures/${fixtureIndex++}.html`;
            runtime.FS.writeFile(file, new Uint8Array(await response.arrayBuffer()));
            fixtures[url] = { file, contentType: item.contentType || 'text/html; charset=utf-8' };
          }
          const globals = runtime.toPy({ __course_fixtures: fixtures, __report_network: url => send('status', `该地址未打包，需要联网且允许浏览器访问：${url}`) });
          try { runtime.runPython(fixturePatch, { globals }); } finally { globals.destroy(); }
        }
      }
      if (/\bmatplotlib\b/.test(code)) runtime.runPython("import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt; plt.show = lambda *args, **kwargs: None");
      runtime.setStdout({ batched: line => output(line) });
      runtime.setStderr({ batched: line => output(line, true) });
    }
    const execute = async (input) => {
      if (language === 'javascript') {
        const lines = input.split(/\r?\n/); let position = 0;
        const consoleProxy = Object.fromEntries(['log', 'info', 'warn', 'error'].map(key => [key, (...args) => output(args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' '))]));
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        await new AsyncFunction('console', 'prompt', code)(consoleProxy, () => lines[position++] ?? null);
      } else {
        const lines = input.split(/\r?\n/); let position = 0;
        runtime.setStdin({ stdin: () => position < lines.length ? lines[position++] : null, isatty: false });
        const globals = runtime.toPy({ __name__: '__main__', sql_source: code });
        try {
          const result = await runtime.runPythonAsync(language === 'sql' ? sqlProgram : code, { globals });
          if (result?.destroy) result.destroy();
          if (!testing && /\b(?:matplotlib|plt\.)/.test(code)) {
            const plots = runtime.runPython(`
import sys, io, base64
_plots = []
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as _plt
    for _figure_id in _plt.get_fignums():
        _buffer = io.BytesIO()
        _plt.figure(_figure_id).savefig(_buffer, format='png', bbox_inches='tight', dpi=120)
        _plots.append('data:image/png;base64,' + base64.b64encode(_buffer.getvalue()).decode('ascii'))
    _plt.close('all')
_plots
`, { globals });
            try { send('plots', plots.toJs()); } finally { plots.destroy(); }
          }
        } finally { globals.destroy(); }
      }
    };
    send('running');
    if (testing) {
      const results = [];
      for (const [index, testcase] of testcases.entries()) {
        captured = ''; outputLines = 0; outputLength = 0;
        let error = '';
        try { await execute(String(testcase.stdin || '')); } catch (failure) { error = failure?.message || String(failure); }
        const expected = String(testcase.expected_output ?? '');
        const normalize = value => value.replace(/\r\n/g, '\n').trimEnd();
        results.push({ case_no: testcase.case_no || index + 1, input: testcase.stdin || '', expected_output: expected, actual_output: captured, succeeded: !error && normalize(captured) === normalize(expected), reason: error });
      }
      send('testResults', results);
    } else {
      await execute(stdin);
      if (judge) {
        const match = captured.match(/<__educative_test_results__>([\s\S]*?)<\/__educative_test_results__>/);
        if (match) send('testResults', JSON.parse(match[1]).test_results || []);
        else send('status', '测试代码已运行，未返回结构化判题结果。');
      }
    }
    send('done');
  } catch (error) { send('error', error?.message || String(error)); }
};
