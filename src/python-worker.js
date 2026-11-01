// Runs in a dedicated module Worker. UI enforces a 20-second execution deadline.
// Pyodide 314 includes sqlite3 in its standard library.
const PYODIDE_BASE = new URL('/runtime/pyodide/', self.location.origin).href;
let runtime;
const sqlProgram = String.raw`
import sqlite3, re
connection = sqlite3.connect(':memory:')
# Original SQL lessons use MySQL CONCAT and CREATE OR REPLACE VIEW.
connection.create_function('CONCAT', -1, lambda *values: None if any(value is None for value in values) else ''.join(str(value) for value in values))
statement = ''
def execute_statement(statement):
    replacement = re.match(r'^\s*CREATE\s+OR\s+REPLACE\s+VIEW\s+([A-Za-z_][A-Za-z_0-9]*)\s+AS\b', statement, re.I)
    if replacement:
        connection.execute('DROP VIEW IF EXISTS "' + replacement.group(1) + '"')
        statement = re.sub(r'CREATE\s+OR\s+REPLACE\s+VIEW', 'CREATE VIEW', statement, count=1, flags=re.I)
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
// Compatibility is deliberately limited to APIs used by the imported historical lessons.
// The editor text stays untouched; each run has its own Worker and module state.
const courseCompatibility = String.raw`
import sys as _course_sys, types as _course_types, os as _course_os
if 'pandas' in __course_source or 'seaborn' in __course_source:
    import pandas as _course_pd
    import numpy as _course_np
    # pandas 3 inferred string dtype differs from the original lessons' object columns.
    _course_pd.options.future.infer_string = False
    if 'append' not in _course_pd.DataFrame.__dict__:
        def _course_append(self, other, ignore_index=False, verify_integrity=False, sort=False):
            if isinstance(other, dict):
                if not ignore_index: raise TypeError('Can only append a dict if ignore_index=True')
                other = _course_pd.DataFrame([other])
            elif isinstance(other, _course_pd.Series):
                other = other.to_frame().T
            elif isinstance(other, list) and other and not isinstance(other[0], _course_pd.DataFrame):
                other = _course_pd.DataFrame(other)
            pieces = [self] + (other if isinstance(other, list) else [other])
            return _course_pd.concat(pieces, ignore_index=ignore_index, verify_integrity=verify_integrity, sort=sort)
        _course_pd.DataFrame.append = _course_append
    _course_pd.DataFrame.iteritems = _course_pd.DataFrame.items
    _course_pd.Series.iteritems = _course_pd.Series.items
    def _course_wrap_csv(original):
        def read_csv(*args, **kwargs):
            whitespace = kwargs.pop('delim_whitespace', False)
            if whitespace:
                if 'sep' in kwargs or 'delimiter' in kwargs: raise ValueError('Specified a delimiter with both sep and delim_whitespace=True')
                kwargs['sep'] = r'\s+'
            return original(*args, **kwargs)
        return read_csv
    _course_pd.read_csv = _course_wrap_csv(_course_pd.read_csv)
    def _course_fillna(original):
        def fillna(self, value=None, *args, method=None, **kwargs):
            if method is None: return original(self, value, *args, **kwargs)
            if value is not None: raise ValueError("Cannot specify both 'value' and 'method'.")
            if args: raise TypeError('fillna() method compatibility accepts keyword arguments only')
            direction = {'pad': 'ffill', 'ffill': 'ffill', 'backfill': 'bfill', 'bfill': 'bfill'}.get(method)
            if direction is None: raise ValueError('Invalid fill method. Expecting pad (ffill) or backfill (bfill).')
            return getattr(self, direction)(**kwargs)
        return fillna
    _course_pd.DataFrame.fillna = _course_fillna(_course_pd.DataFrame.fillna)
    _course_pd.Series.fillna = _course_fillna(_course_pd.Series.fillna)
    def _course_numeric_default(original):
        def method(self, *args, **kwargs):
            kwargs.setdefault('numeric_only', True)
            return original(self, *args, **kwargs)
        return method
    for _course_method in ['mean', 'corr', 'quantile']:
        setattr(_course_pd.DataFrame, _course_method, _course_numeric_default(getattr(_course_pd.DataFrame, _course_method)))
    def _course_pivot(original):
        def pivot(self, *args, **kwargs):
            if len(args) > 3: raise TypeError('pivot() accepts at most 3 positional arguments')
            for key, value in zip(['index', 'columns', 'values'], args):
                if key in kwargs: raise TypeError('multiple values for '+key)
                kwargs[key] = value
            return original(self, **kwargs)
        return pivot
    _course_pd.DataFrame.pivot = _course_pivot(_course_pd.DataFrame.pivot)
    from pandas.core.groupby.groupby import GroupBy as _course_GroupBy
    def _course_get_group(original):
        def get_group(self, name, *args, **kwargs):
            if isinstance(self.keys, list) and len(self.keys) == 1 and not isinstance(name, tuple): name = (name,)
            return original(self, name, *args, **kwargs)
        return get_group
    _course_GroupBy.get_group = _course_get_group(_course_GroupBy.get_group)
    if 'pandas.util.testing' in __course_source:
        # Historical makeTimeDataFrame: N rows, four standard-normal columns, business-day index.
        _course_tm = _course_types.ModuleType('pandas.util.testing')
        _course_tm.N = 30
        _course_tm.K = 4
        def _course_make_time_frame(nper=None, freq='B'):
            n = _course_tm.N if nper is None else nper
            return _course_pd.DataFrame({c: _course_np.random.randn(n) for c in 'ABCD'[:_course_tm.K]}, index=_course_pd.date_range('2000-01-01', periods=n, freq=freq))
        _course_tm.makeTimeDataFrame = _course_make_time_frame
        _course_sys.modules['pandas.util.testing'] = _course_tm
        _course_pd.util.testing = _course_tm
if 'matplotlib' in __course_source or 'seaborn' in __course_source:
    import matplotlib as _course_mpl
    _course_mpl.use('Agg')
    import matplotlib.pyplot as _course_plt
    _course_plt.show = lambda *args, **kwargs: None
    # Original server falls back to these exact DejaVuSans bytes for these missing names.
    # Alias the existing fallback only; do not introduce a different-looking font.
    if 'xkcd' in __course_source or 'SongTi' in __course_source:
        from matplotlib import font_manager as _course_fm
        _course_fallback = _course_fm.findfont('DejaVu Sans')
        for _course_font_name in ['SongTi', 'xkcd', 'xkcd Script', 'Humor Sans', 'Comic Neue', 'Comic Sans MS']:
            _course_fm.fontManager.ttflist.append(_course_fm.FontEntry(fname=_course_fallback, name=_course_font_name))
        _course_fm.fontManager._findfont_cached.cache_clear()

    from matplotlib.figure import Figure as _course_Figure
    def _course_gca(original):
        def gca(self, **kwargs):
            if not kwargs: return original(self)
            projection = kwargs.get('projection', 'rectilinear')
            for ax in reversed(self.axes):
                if ax.name == projection:
                    self.sca(ax)
                    return ax
            return self.add_subplot(1, 1, 1, **kwargs)
        return gca
    _course_Figure.gca = _course_gca(_course_Figure.gca)
    # Matplotlib <=3.5 accepted signed symmetric errors: +/- endpoints are the same.
    # Preserve only that symmetric, non-limit case; asymmetric invalid errors still fail.
    from matplotlib.axes import Axes as _course_Axes
    def _course_errorbar(original):
        def errorbar(self, x, y, yerr=None, xerr=None, *args, **kwargs):
            import numpy as np
            if not any(kwargs.get(k, False) is not False for k in ['xlolims','xuplims','ylolims','yuplims']):
                if yerr is not None and np.ndim(yerr) <= 1: yerr = np.abs(yerr)
                if xerr is not None and np.ndim(xerr) <= 1: xerr = np.abs(xerr)
            return original(self, x, y, yerr=yerr, xerr=xerr, *args, **kwargs)
        return errorbar
    _course_Axes.errorbar = _course_errorbar(_course_Axes.errorbar)
if 'seaborn' in __course_source:
    import seaborn as _course_sns
    def _course_xy(original):
        def plot(*args, **kwargs):
            if args:
                for key, value in zip(['x', 'y'], args[:2]):
                    if key in kwargs: raise TypeError('multiple values for '+key)
                    kwargs[key] = value
                args = args[2:]
            return original(*args, **kwargs)
        return plot
    for _course_method in ['lineplot', 'barplot', 'scatterplot', 'jointplot', 'boxplot', 'violinplot']:
        setattr(_course_sns, _course_method, _course_xy(getattr(_course_sns, _course_method)))
    def _course_dataset(original):
        def load_dataset(name, cache=True, data_home=None, **kwargs):
            if name == 'flights':
                import pandas
                frame = pandas.read_csv('/course-data/flights.csv', **kwargs)
                frame['month'] = pandas.Categorical(frame['month'], frame['month'].unique())
                return frame
            return original(name, cache=cache, data_home=data_home, **kwargs)
        return load_dataset
    _course_sns.load_dataset = _course_dataset(_course_sns.load_dataset)
if 'load_boston' in __course_source:
    import sklearn.datasets as _course_datasets
    import numpy as _course_np
    from sklearn.utils import Bunch as _course_Bunch
    def _course_load_boston(*, return_X_y=False, as_frame=False):
        import csv
        with open('/course-data/boston_house_prices.csv', newline='') as f:
            rows = list(csv.reader(f))
        values = _course_np.asarray(rows[2:], dtype=float)
        data, target = values[:, :-1], values[:, -1]
        names = _course_np.asarray(rows[1][:-1])
        frame = None
        if as_frame:
            import pandas as pd
            frame = pd.DataFrame(values, columns=list(names)+['MEDV'])
            data, target = frame[list(names)], frame['MEDV']
        if return_X_y: return data, target
        with open('/course-data/boston_house_prices.rst') as f: description = f.read()
        return _course_Bunch(data=data, target=target, feature_names=names, DESCR=description, filename='/course-data/boston_house_prices.csv', data_module='sklearn.datasets.data', frame=frame)
    _course_datasets.load_boston = _course_load_boston
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
            _response.encoding = _fixture_requests.utils.get_encoding_from_headers(_response.headers)
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
  const { code, stdin = '', language = 'python', sourceLanguage = language, files = [], testcases = [], judge = false } = data;
  let outputLength = 0, outputLines = 0, captured = '';
  const testing = testcases.length > 0;
  const send = (type, value) => self.postMessage({ type, value });
  const output = (line, stderr = false) => {
    // Original API serializes carriage-return output as line breaks.
    const chunk = (String(line) + '\n').replace(/\r\n|\r/g, '\n');
    line = chunk.slice(0, -1);
    outputLines++; outputLength += String(line).length;
    if (outputLines > 1000 || outputLength > 100000) {
      if (outputLines === 1001 && !testing) send('stdout', '…输出过多，后续内容已省略。');
      return;
    }
    captured += chunk;
    if (!testing) send(stderr ? 'stderr' : 'stdout', String(line));
  };
  try {
    if (language !== 'javascript') {
      send('status', '正在加载 Python 运行环境，首次运行需要下载资源…');
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
      runtime ||= await loadPyodide({ indexURL: PYODIDE_BASE });
      runtime.FS.mkdirTree('/usercode/output');
      runtime.FS.chdir('/usercode');
      runtime.FS.mkdirTree('/course-data');
      const courseData = [];
      if (code.includes('raw_data.csv')) courseData.push(['raw_data.csv', '/usercode/raw_data.csv']);
      if (code.includes('/usercode/books.txt')) courseData.push(['books.txt', '/usercode/books.txt']);
      if (/load_dataset\s*\(\s*['"]flights['"]/.test(code)) courseData.push(['flights.csv', '/course-data/flights.csv']);
      if (/\bload_boston\b/.test(code)) courseData.push(['boston_house_prices.csv', '/course-data/boston_house_prices.csv'], ['boston_house_prices.rst', '/course-data/boston_house_prices.rst']);
      for (const [name, destination] of courseData) {
        const response = await fetch(`/content/runtime-data/${name}`, { credentials: 'omit' });
        if (!response.ok) throw new Error(`课程内置数据文件加载失败：${name}`);
        runtime.FS.writeFile(destination, new Uint8Array(await response.arrayBuffer()));
      }
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
          // 009/386 ships the exact Auto MPG data under a transposed filename.
          // Retain that original file and add only this verified dataset alias.
          if (name === 'auto-mgp.data' && typeof content === 'string' && /['"]auto-mpg\.data['"]/.test(code) && !files.some(item => (item.file_name || item.name || item.filename) === 'auto-mpg.data')) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
            const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            if (hash === '48b830e11feee5572525f8f1691ddb9d38d3d7b7063edcd8fca672c2a5e17d8d') runtime.FS.writeFile('auto-mpg.data', content);
          }
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
      if (language !== 'sql') {
        runtime.globals.set('__course_source', code);
        // An unfinished function can make import discovery return no packages.
        // Report its actual syntax error before compatibility imports mask it.
        runtime.runPython("import ast as _course_ast; compile(__course_source, '<exec>', 'exec', flags=_course_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)");
        await runtime.loadPackagesFromImports(code);
        if (/\.(?:to_excel|read_excel)\s*\(/.test(code)) await runtime.loadPackage('openpyxl');
        runtime.runPython(courseCompatibility);
      }
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
        const readLine = () => lines[position++] ?? '';
        const inspect = (value, seen = new Set()) => {
          if (value === null || typeof value !== 'object') {
            if (typeof value === 'string') return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
            if (typeof value === 'function') return `[Function${value.name ? ': ' + value.name : ''}]`;
            return String(value);
          }
          if (seen.has(value)) return '[Circular]';
          const next = new Set(seen).add(value), item = value => inspect(value, next);
          if (Array.isArray(value)) return value.length ? '[ ' + value.map(item).join(', ') + ' ]' : '[]';
          if (value instanceof Date) return value.toISOString();
          if (value instanceof RegExp) return String(value);
          if (value instanceof Error) return value.stack || String(value);
          if (value instanceof Map) return `Map(${value.size}) { ` + [...value].map(([key, value]) => item(key) + ' => ' + item(value)).join(', ') + ' }';
          if (value instanceof Set) return `Set(${value.size}) { ` + [...value].map(item).join(', ') + ' }';
          const members = Object.entries(value).map(([key, value]) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : item(key)) + ': ' + item(value));
          const name = value.constructor?.name;
          return (name && name !== 'Object' ? name + ' ' : '') + (members.length ? '{ ' + members.join(', ') + ' }' : '{}');
        };
        const consoleProxy = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug', 'dir'].map(key => [key, (...args) => output(args.map(value => typeof value === 'string' ? value : inspect(value)).join(' '), ['warn', 'error'].includes(key))]));
        // Keep the worker alive for actual scheduled work; nested timers and promise
        // continuations in the async lessons must finish before UI terminates the worker.
        const pending = new Set(); let asyncError;
        const nativeSetTimeout = self.setTimeout.bind(self), nativeClearTimeout = self.clearTimeout.bind(self);
        const schedule = (callback, delay = 0, ...args) => {
          const id = nativeSetTimeout(() => { pending.delete(id); try { callback(...args); } catch (error) { asyncError = error; } }, delay);
          pending.add(id); return id;
        };
        const cancel = id => { pending.delete(id); nativeClearTimeout(id); };
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const nodeEntry = ['nodejs', 'node'].includes(String(sourceLanguage).toLowerCase()) ? '\n;if (typeof main === "function") await main();' : '';
        await new AsyncFunction('console', 'prompt', 'readLine', 'setTimeout', 'clearTimeout', code + nodeEntry)(consoleProxy, () => lines[position++] ?? null, readLine, schedule, cancel);
        while (pending.size) { await new Promise(resolve => nativeSetTimeout(resolve, 5)); if (asyncError) throw asyncError; }
        await Promise.resolve();
        if (asyncError) throw asyncError;
      } else {
        // The original course runner preserves CR in CRLF input() values.
        const lines = input.split('\n'); let position = 0;
        runtime.setStdin({ stdin: () => position < lines.length ? lines[position++] : null, isatty: false });
        const globals = runtime.toPy({ __name__: '__main__', sql_source: code });
        try {
          let executionError;
          try {
            const result = await runtime.runPythonAsync(language === 'sql' ? sqlProgram : code, { globals });
            if (result?.destroy) result.destroy();
          } catch (error) { executionError = error; }
          // Preserve saved figures even if the source later raises (e.g. its plt.chose typo).
          if (!testing && language === 'python') {
            const plots = runtime.runPython(`
import sys, io, base64, os
_plots = []
_exports = []
_export_bytes = 0
_export_warnings = []
# Source lessons often save a PNG and close the figure. Preserve that saved image.
for _root, _dirs, _files in os.walk('/usercode/output'):
    for _name in sorted(_files):
        _ext = os.path.splitext(_name)[1].lower()
        _path = os.path.join(_root, _name)
        if _ext in ('.png', '.jpg', '.jpeg', '.svg'):
            _mime = {'.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml'}[_ext]
            with open(os.path.join(_root, _name), 'rb') as _file:
                _plots.append('data:' + _mime + ';base64,' + base64.b64encode(_file.read()).decode('ascii'))
        else:
            _mime = {'.csv':'text/csv', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt':'text/plain', '.json':'application/json'}.get(_ext, 'application/octet-stream')
            _size = os.path.getsize(_path)
            if _export_bytes + _size > 10 * 1024 * 1024:
                _export_warnings.append('导出文件超过每次运行 10 MiB 总上限，未返回：' + _name)
                continue
            with open(_path, 'rb') as _file: _bytes = _file.read()
            _export_bytes += len(_bytes)
            _exports.append({'name': os.path.relpath(_path, '/usercode/output'), 'mime': _mime, 'size': len(_bytes), 'url': 'data:' + _mime + ';base64,' + base64.b64encode(_bytes).decode('ascii')})
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as _plt
    for _figure_id in ([] if _plots else _plt.get_fignums()):
        _buffer = io.BytesIO()
        _plt.figure(_figure_id).savefig(_buffer, format='png', bbox_inches='tight', dpi=120)
        _plots.append('data:image/png;base64,' + base64.b64encode(_buffer.getvalue()).decode('ascii'))
    _plt.close('all')
[_plots, _exports, _export_warnings]
`, { globals });
            try {
              const [images, files, warnings] = plots.toJs({ dict_converter: Object.fromEntries });
              if (images.length) send('plots', images);
              if (files.length) send('files', files);
              for (const warning of warnings) send('stderr', warning);
            } finally { plots.destroy(); }
          }
          if (executionError) throw executionError;
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
        const normalize = value => value.replace(/\r\n|\r/g, '\n').trimEnd();
        results.push({ case_no: testcase.case_no || index + 1, input: testcase.stdin || '', expected_output: expected, actual_output: captured, succeeded: !error && normalize(captured) === normalize(expected), reason: error });
      }
      send('testResults', results);
    } else {
      await execute(stdin);
      if (judge) {
        const match = captured.match(/<__educative_test_results__>([\s\S]*?)<\/__educative_test_results__>/);
        if (!match) throw new Error('判题未返回结构化测试结果，无法判定通过。');
        let results;
        try { results = JSON.parse(match[1]).test_results; }
        catch { throw new Error('判题返回的测试结果不是有效 JSON，无法判定通过。'); }
        if (!Array.isArray(results) || !results.length || results.some(result => !result || typeof result.succeeded !== 'boolean')) {
          throw new Error('判题返回的测试结果为空或格式无效，无法判定通过。');
        }
        send('testResults', results);
      }
    }
    send('done');
  } catch (error) { send('error', error?.message || String(error)); }
};
