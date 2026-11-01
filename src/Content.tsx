import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import './content.css';
import './quiz.css';
import { webPreviewDocument } from './content-web';
import { courseMathMarkdown } from './content-math';
import { runtimeLanguage, supportsExecution, needsServer, RemoteCodeRunner, type CodeRunner } from './execution';
import { orderedQuizAnswers, quizBlankKeys, quizExpectedBlank, normalizeQuizAnswer } from './content-model';

const LazyMindMap = lazy(() => import('./MindMap'));
type Data = Record<string, any>;
export type ContentProps = { components: any[]; answers: Record<string, any>; onAnswer: (id: string, value: any) => void };
const absolute = (url: string) => url?.startsWith('//') ? `https:${url}` : url;
const safeImage = (url: string) => /^(https?:\/\/|\/|data:image\/|blob:)/i.test(url || '') ? absolute(url) : '';
function localLink(url = '') {
  const match = url.match(/^https?:\/\/edu\.py2fun\.com\/(?:learn#\/)?course\/([^/]+)\/page\/(\d+)/);
  return match ? `#/course/${match[1]}/page/${match[2]}` : absolute(url);
}
function Markdown({ text, code }: { text?: string; code?: any }) {
  const schema = { ...defaultSchema, tagNames: [...(defaultSchema.tagNames || []), 'video', 'audio', 'source'], attributes: { ...defaultSchema.attributes, video: ['src', 'controls', 'poster', 'width', 'height', 'preload'], audio: ['src', 'controls', 'preload'], source: ['src', 'type'] } };
  return <div className="edu-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], [rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false }]]} components={{
    a: ({ href, children }) => <a href={localLink(href)} {...(href?.startsWith('http') && !href.includes('edu.py2fun.com/course') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>,
    img: ({ src, alt }) => <img src={safeImage(String(src || ''))} alt={alt || ''} loading="lazy" />,
    video: ({ src, children }) => <MediaVideo src={src}>{children}</MediaVideo>,
    ...(code ? { code } : {}),
  }}>{courseMathMarkdown(text || '')}</ReactMarkdown></div>;
}

function Quiz({ question, id, answers, onAnswer }: { question: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const options: Data[] = question.question_options || [];
  const saved = answers[id] || {};
  const selected: number[] = Array.isArray(saved.selected) ? saved.selected : [];
  const blanks: Record<string, string> = saved.blanks || {};
  const kind = question.question_type || 'single_choice';
  const fill = ['drag_and_drop', 'typein', 'type_in', 'multi_type_in', 'fill_in', 'fill_blank'].includes(kind);
  const reorder = kind === 'reorder';
  const sourceOrder = options.map((_, i) => i);
  const choiceOrder: number[] = Array.isArray(saved.optionOrder) && saved.optionOrder.length === options.length && new Set(saved.optionOrder).size === options.length && saved.optionOrder.every((value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) < options.length) ? saved.optionOrder : sourceOrder;
  const order: number[] = Array.isArray(saved.order) && saved.order.length === options.length ? saved.order : options.map((_, i) => i).reverse();
  const move = (from: number, to: number) => { const next = [...order]; next.splice(to, 0, next.splice(from, 1)[0]); change({ order: next }); };
  const multi = ['mult_choice', 'multiple_choice', 'multi_choice'].includes(kind);
  const text = question.question_text || question.question_text_html || '';
  const standalone = kind === 'type_in' || kind === 'typein';
  const tokens = fill ? quizBlankKeys(kind, text, options) : [];
  const change = (patch: Data) => onAnswer(id, { ...saved, ...patch, checked: false, correct: null });
  const retry = () => {
    const previous = reorder ? order : choiceOrder;
    const shuffled = [...previous];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    if (shuffled.length > 1 && shuffled.every((value, i) => value === previous[i])) shuffled.push(shuffled.shift()!);
    onAnswer(id, { ...saved, selected: [], blanks: {}, order: reorder ? shuffled : order, optionOrder: shuffled, checked: false, correct: null, checkedAt: null });
  };
  const setBlank = (key: string, value: string) => change({ blanks: { ...blanks, [key]: value } });
  const expectedFor = (key: string) => quizExpectedBlank(kind, options, tokens.indexOf(key));
  const check = () => {
    const expected = options.map((option, i) => option.correct ? i : -1).filter(i => i >= 0);
    const correct = reorder ? order.every((optionIndex, position) => options[optionIndex] === orderedQuizAnswers(options)[position]) : fill ? tokens.length > 0 && tokens.every(key => expectedFor(key).some(option => normalizeQuizAnswer(option.text) === normalizeQuizAnswer(blanks[key])))
      : expected.length > 0 && expected.length === selected.length && expected.every(i => selected.includes(i));
    onAnswer(id, { ...saved, selected, blanks, order, checked: true, correct, checkedAt: new Date().toISOString() });
  };
  const input = (key: string) => <input key={key} className="edu-blank" aria-label={`填空 ${Number(key) + 1}`} autoComplete="off" disabled={Boolean(saved.checked)} value={blanks[key] || ''} onChange={event => setBlank(key, event.target.value)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!saved.checked) setBlank(key, event.dataTransfer.getData('text/plain')); }} style={{ width: `${Math.max(7, (blanks[key] || '').length + 2)}ch` }} />;
  function fillCode({ children, className, ...rest }: any) {
    const value = String(children);
    if (!/__(\d+)__/.test(value)) return <code className={className} {...rest}>{children}</code>;
    const parts: ReactNode[] = []; let offset = 0;
    for (const match of value.matchAll(/__(\d+)__/g)) { parts.push(value.slice(offset, match.index)); parts.push(input(match[1] ?? match[2])); offset = match.index! + match[0].length; }
    parts.push(value.slice(offset));
    return <code className="edu-fill-code">{parts}</code>;
  }
  // Keep ReactMarkdown's component identity stable so typing does not remount
  // the blank inputs (which would otherwise discard focus after one character).
  const fillRenderer = useRef(fillCode);
  fillRenderer.current = fillCode;
  const stableFillCode = useMemo(() => (props: any) => fillRenderer.current(props), []);
  return <section className="edu-quiz" aria-label="课后练习">
    <div className="edu-quiz-label"><span>✎</span> {reorder ? '排序练习' : multi ? '多选题' : fill ? '填空练习' : '单选题'}</div>
    <Markdown text={text} code={fill && !standalone ? stableFillCode : undefined} />
    {fill ? <>
      {(standalone || !/__(\d+)__/.test(text)) && <div className="edu-blank-list">{tokens.map(key => <label key={key}>第 {Number(key) + 1} 空 {input(key)}</label>)}</div>}
      {kind === 'drag_and_drop' && <><p className="edu-help">将选项拖入空格，或点击选项填入下一个空格。</p><div className="edu-word-bank">{choiceOrder.map(i => <button type="button" key={i} disabled={Boolean(saved.checked)} draggable={!saved.checked} onDragStart={event => event.dataTransfer.setData('text/plain', options[i].text)} onClick={() => { const key = tokens.find(token => !blanks[token]) ?? tokens[0]; if (key != null) setBlank(key, options[i].text); }}>{options[i].text}</button>)}</div></>}
    </> : reorder ? <div className="edu-reorder">{order.map((optionIndex, position) => <div className="edu-reorder-item" data-option-index={optionIndex} key={optionIndex} draggable={!saved.checked} onDragStart={event => event.dataTransfer.setData('text/plain', String(position))} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (!saved.checked && Number.isInteger(from) && from >= 0 && from < order.length) move(from, position); }}><span>{position + 1}</span><Markdown text={options[optionIndex].text} /><button aria-label="上移" disabled={Boolean(saved.checked) || !position} onClick={() => move(position, position - 1)}>↑</button><button aria-label="下移" disabled={Boolean(saved.checked) || position === order.length - 1} onClick={() => move(position, position + 1)}>↓</button></div>)}</div> : <div className="edu-options">{choiceOrder.map(i => { const option = options[i]; return <label key={option.id || i} data-option-index={i} className={`edu-option ${selected.includes(i) ? 'selected' : ''} ${saved.checked && saved.correct && selected.includes(i) ? 'correct' : ''} ${saved.checked && !saved.correct && selected.includes(i) && !option.correct ? 'incorrect' : ''}`}><input type={multi ? 'checkbox' : 'radio'} name={`quiz-${id}`} disabled={Boolean(saved.checked)} checked={selected.includes(i)} onChange={() => change({ selected: multi ? selected.includes(i) ? selected.filter(item => item !== i) : [...selected, i] : [i] })} /><span className="edu-option-key">{option.key || String.fromCharCode(65 + i)}</span><Markdown text={option.text || option.text_html} /></label>; })}</div>}
    <div className={`edu-quiz-actions ${saved.checked ? 'is-checked' : ''}`}><button className="edu-primary" type="button" onClick={saved.checked ? retry : check} disabled={!saved.checked && (reorder ? !order.length : fill ? !tokens.length || tokens.some(key => !blanks[key]?.trim()) : !selected.length)}>{saved.checked ? '再试一次' : '检查答案'}</button>{saved.checked && <span role="status" className={saved.correct ? 'edu-success' : 'edu-error'}>{saved.correct ? '✓ 答案正确' : '× 答案错误'}</span>}</div>
    {saved.checked && options.some(option => option.explanation?.md_text || option.explanation?.md_html) && <details className="edu-explanation"><summary>查看解析</summary>{options.filter((option, i) => saved.correct ? option.correct : selected.includes(i)).map((option, i) => <Markdown key={i} text={option.explanation?.md_text || option.explanation?.md_html} />)}</details>}
  </section>;
}

function CodeBlock({ data, id, answers, onAnswer }: { data: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const initial = String(data.content ?? data.template ?? '');
  const saved = answers[id] || {};
  const code = typeof saved.code === 'string' ? saved.code : initial;
  const stdin = typeof saved.stdin === 'string' ? saved.stdin : '';
  const language = runtimeLanguage(String(data.language || 'python3'), data.comp_id || id);
  const isPython = language.startsWith('python') || language === 'py';
  const isJS = ['javascript', 'js', 'nodejs'].includes(language);
  const isHTML = ['html', 'html5'].includes(language);
  const isSQL = ['sql', 'sqlite', 'sqlite3'].includes(language);
  const supported = supportsExecution(language);
  const savedRef = useRef(saved); savedRef.current = saved;
  const extraFiles: Data[] = data.additional_content || data.additional_files || [];
  const visibleFiles = extraFiles.filter(file => !file.hidden && (file.file_name || file.name) && typeof file.content === 'string');
  const [activeFile, setActiveFile] = useState('');
  const activeExtra = visibleFiles.find(file => (file.file_name || file.name) === activeFile);
  const extraSource = (file: Data) => saved.files?.[file.file_name || file.name] ?? file.content;
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState('');
  const [testResults, setTestResults] = useState<Data[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<{ name: string; url: string; mime: string; size: number }[]>([]);
  const canTest = !isHTML && supported && (data.testcases?.length || (data.judge !== false && data.judge_content?.author_code));
  const workerRef = useRef<CodeRunner | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = () => { workerRef.current?.terminate(); workerRef.current = null; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; };
  useEffect(() => cleanup, []);
  const extensions = useMemo(() => isPython ? [python()] : isJS ? [javascript()] : language === 'cpp' || language === 'c' ? [cpp()] : [], [language, isPython, isJS]);
  const save = (patch: Data) => { const next = { ...savedRef.current, ...patch }; savedRef.current = next; onAnswer(id, next); };
  const edit = (patch: Data) => { setTestResults([]); save({ ...patch, checked: false, correct: null, testResults: [] }); };
  const reset = () => { cleanup(); setBusy(false); setOutput(''); setPlots([]); setDownloads([]); setPreview(''); setStatus(''); setError(false); edit({ code: initial, files: {} }); };
  const stop = () => { cleanup(); setBusy(false); setStatus('运行已停止'); };
  const run = (testing = false) => {
    let results: Data[] = [];
    setTestResults([]);
    setPlots([]);
    setDownloads([]);
    cleanup(); setOutput(''); setError(false); setStatus('');
    if (isHTML) { setPreview(code); return; }
    if (!supported) return;
    setBusy(true);
    const prefix = [data.hidden_code_content?.prepend_code || data.prepend_code || data.template_head || '', testing ? data.judge_content_prepend : ''].filter(Boolean).join('\n');
    const suffix = [data.hidden_code_content?.append_code || data.append_code || data.template_tail || '', testing && data.judge_content?.author_code, testing && data.judge_content?.ed_code].filter(Boolean).join('\n');
    const runCode = [prefix, code, suffix].filter(Boolean).join('\n');
    const files = extraFiles.map(file => ({ ...file, ...(typeof file.content === 'string' ? { content: extraSource(file) } : {}) }));
    const remote = needsServer(language, runCode, files);
    const worker: CodeRunner = remote ? new RemoteCodeRunner() : new Worker(new URL('./python-worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const timeOut = (message: string, delay: number) => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => { cleanup(); setBusy(false); setError(true); setStatus(message); }, delay); };
    timeOut('运行环境加载超时，请检查网络后重试。', 120000);
    worker.onmessage = ({ data: message }) => {
      if (workerRef.current !== worker) return;
      if (message.type === 'status') setStatus(message.value);
      if (message.type === 'running') { setStatus('运行中…'); timeOut(remote ? '编译或运行超时，请简化程序后重试。' : '程序运行超过 20 秒，已停止。请检查循环或减少计算量。', remote ? 70000 : 20000); }
      if (message.type === 'stdout' || message.type === 'stderr') setOutput(previous => (previous + message.value + '\n').slice(-100000));
      if (message.type === 'testResults') { results = message.value; setTestResults(results); }
      if (message.type === 'plots') setPlots(message.value);
      if (message.type === 'files') setDownloads((message.value || []).filter(file => /^(data:|blob:)/.test(file.url)));
      if (message.type === 'error') { setError(true); setOutput(previous => previous + message.value); setStatus('运行出错'); setBusy(false); cleanup(); }
      if (message.type === 'done') { setStatus('运行结束'); setBusy(false); cleanup(); save({ lastRunAt: new Date().toISOString(), ...(testing && results.length ? { checked: true, correct: results.every(result => result.succeeded), testResults: results } : {}) }); }
    };
    worker.onerror = event => { setError(true); setStatus(event.message || '运行环境加载失败，请稍后重试。'); setBusy(false); cleanup(); };
    worker.postMessage({ code: runCode, stdin, language, sourceLanguage: String(data.language || language), files, testcases: testing ? data.testcases || [] : [], judge: testing && !!data.judge_content?.author_code });
  };
  const download = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = data.entry_file_name || data.file_name || (isPython ? 'main.py' : isJS ? 'index.js' : 'code.txt'); link.click(); URL.revokeObjectURL(url);
  };
  return <section className="edu-code-block" aria-label="代码编辑器">
    <header className="edu-code-toolbar"><span>{data.entry_file_name || data.file_name || data.title || (isPython ? 'main.py' : language)}</span><div><button type="button" onClick={reset}>重置</button><button type="button" onClick={download}>下载</button></div></header>
    {visibleFiles.length > 0 && <div className="edu-file-tabs" role="tablist" aria-label="代码文件"><button role="tab" aria-selected={!activeFile} onClick={() => setActiveFile('')}>{data.entry_file_name || data.file_name || (isPython ? 'main.py' : '主程序')}</button>{visibleFiles.map(file => { const name = file.file_name || file.name; return <button key={name} role="tab" aria-selected={activeFile === name} onClick={() => setActiveFile(name)}>{name}{file.read_only ? ' · 只读' : ''}</button>; })}</div>}
    <CodeMirror key={activeFile} value={activeExtra ? extraSource(activeExtra) : code} extensions={extensions} minHeight="110px" maxHeight="560px" editable={!(activeExtra ? activeExtra.read_only : data.read_only) && !busy} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} onChange={value => activeExtra ? edit({ files: { ...savedRef.current.files, [activeFile]: value } }) : edit({ code: value })} aria-label={activeFile ? `代码 ${activeFile}` : '代码'} />
    {supported && !isHTML && data.runnable !== false && <details className="edu-stdin"><summary>标准输入（input）</summary><textarea aria-label="程序标准输入" value={stdin} onChange={event => edit({ stdin: event.target.value })} placeholder="需要 input() 的程序，在这里填写输入，每行一项。" rows={3} /></details>}
    <footer className="edu-code-actions">{supported && data.runnable !== false ? <button type="button" className="edu-primary" onClick={busy ? stop : () => run(false)}>{busy ? '■ 停止运行' : isHTML ? '▷ 预览' : '▷ 运行'}</button> : <span className="edu-help">{data.runnable === false ? '代码示例' : `${language} 需要对应编译或运行环境，可下载代码在本地运行。`}</span>}{canTest && <button type="button" className="edu-test-button" disabled={busy} onClick={() => run(true)}>运行测试</button>}<span aria-live="polite" className={error ? 'edu-error' : 'edu-help'}>{status}</span></footer>
    {(output || busy) && <pre className={`edu-output ${error ? 'error' : ''}`} aria-label="运行结果" tabIndex={0}>{output || '等待输出…'}</pre>}
    {testResults.length > 0 && <div className="edu-test-results" aria-live="polite"><p className={testResults.every(result => result.succeeded) ? 'edu-success' : 'edu-error'}>通过 {testResults.filter(result => result.succeeded).length} / {testResults.length} 个公开测试</p>{testResults.map((result, index) => <details key={index}><summary>{result.succeeded ? '✓' : '✗'} 测试 {result.case_no || index + 1}</summary><dl><dt>输入</dt><dd><pre>{result.input || '（无）'}</pre></dd><dt>预期输出</dt><dd><pre>{result.expected_output}</pre></dd><dt>实际输出</dt><dd><pre>{result.actual_output}</pre></dd>{result.reason && <><dt>说明</dt><dd>{result.reason}</dd></>}</dl></details>)}</div>}
    {plots.map((plot, index) => <figure className="edu-plot" key={index}><img src={plot} alt={`程序生成的图表 ${index + 1}`} /></figure>)}
    {downloads.length > 0 && <div className="edu-generated-files"><span>程序生成的文件</span>{downloads.map(file => <a key={file.name} href={file.url} download={file.name}>{file.name} · 下载（{Math.max(1, Math.round(file.size / 1024))} KB）</a>)}</div>}
    {preview && <iframe title="HTML 运行结果" className="edu-html-preview" sandbox="allow-scripts" srcDoc={preview} />}
    {data.caption && <p className="edu-caption">{data.caption}</p>}
    {(data.solution_content?.trim() || data.solution_code?.trim()) && <details className="edu-solution"><summary>查看参考答案</summary><pre><code>{data.solution_content || data.solution_code}</code></pre></details>}
  </section>;
}

function Tabs({ data, id, answers, onAnswer }: { data: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const tabs: Data[] = data.code_contents || data.code_templates || [];
  const [active, setActive] = useState(0);
  return <div className="edu-code-tabs"><div role="tablist" aria-label="代码语言">{tabs.map((tab, index) => <button key={index} role="tab" aria-selected={active === index} onClick={() => setActive(index)}>{tab.title || tab.language}</button>)}</div>{tabs[active] && <CodeBlock key={active} data={{...tabs[active], testcases: data.testcases}} id={tabs[active].comp_id || `${id}:code:${active}`} answers={answers} onAnswer={onAnswer} />}</div>;
}

function WebExample({ data, id, answers, onAnswer }: { data: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const files: Data[] = data.jotted?.files || [];
  const saved = answers[id] || {};
  const [tab, setTab] = useState('result');
  const source = (type: string) => saved[type] ?? files.find(file => file.type === type)?.content ?? '';
  const html = webPreviewDocument(source('html'), source('css'), source('js'), source('hiddenjs'));
  return <section className="edu-web-example"><div className="edu-web-tabs" role="tablist" aria-label="网页示例">{['result', 'html', 'css', 'js'].map(type => <button key={type} role="tab" aria-selected={tab === type} onClick={() => setTab(type)}>{type === 'result' ? '运行结果' : type.toUpperCase()}</button>)}</div>{tab === 'result' ? <iframe title={data.caption || '交互式网页示例'} sandbox="allow-scripts" srcDoc={files.length ? html : undefined} src={!files.length ? absolute(data.file) : undefined} style={{ width:'100%', height:Math.min(800, Number(data.jotted?.height || 400)), border:0 }} /> : <CodeMirror value={source(tab)} minHeight="180px" maxHeight="450px" extensions={tab === 'js' ? [javascript()] : []} onChange={value => onAnswer(id, {...saved, [tab]:value})} />}<p className="edu-caption">{data.jotted?.caption || data.caption}</p></section>;
}

function MediaVideo({ src, children }: { src?: string; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return <div className="edu-media">{failed ? <p className="edu-unavailable">{src?.includes('bignet.mp4') ? '原站这段视频已失效（404），课程正文仍可学习。' : '视频暂时无法加载，请检查网络或稍后重试。'}</p> : <video controls preload="metadata" src={src ? absolute(src) : undefined} style={{ maxWidth: '100%' }} onError={() => setFailed(true)}>{children}</video>}</div>;
}
function SvgFrame({ svg, height = 380, title = '课程图示' }: { svg: string; height?: number; title?: string }) {
  // An opaque, scriptless frame safely retains the source SVG's styles and linked images.
  const doc = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:white}svg{display:block;max-width:100%;height:auto;margin:auto}</style></head><body>${svg}</body></html>`;
  return <iframe className="edu-svg-frame" title={title} sandbox="" srcDoc={doc} style={{ height }} loading="lazy" />;
}
function Animation({ data, answers, onAnswer }: { data: Data } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const frames: Data[] = data.canvas_objects || data.frames || [];
  const [index, setIndex] = useState(0);
  const [requested, setRequested] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const target = frames[requested];
    setFailed(false);
    if (!target?.file) { setIndex(requested); setLoading(false); return; }
    setLoading(true);
    const image = new Image();
    image.onload = async () => {
      try { await image.decode(); } catch { /* onload still confirms a usable image */ }
      if (!cancelled) { setIndex(requested); setLoading(false); }
    };
    image.onerror = () => { if (!cancelled) { setLoading(false); setFailed(true); setPlaying(false); } };
    image.src = safeImage(target.file);
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [requested, retry, frames]);
  useEffect(() => {
    for (const target of [frames[index - 1], frames[index + 1]]) if (target?.file) { const image = new Image(); image.src = safeImage(target.file); }
  }, [index, frames]);
  useEffect(() => {
    if (!playing || loading || failed || requested !== index) return;
    if (index >= frames.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setRequested(index + 1), 1400);
    return () => clearTimeout(timer);
  }, [playing, index, requested, loading, failed, frames.length]);
  const frame = frames[index];
  const go = (next: number) => { setPlaying(false); setRequested(next); };
  const height = Math.min(600, Number(frame?.height || data.height || 380));
  return <figure className="edu-animation" aria-busy={loading}>
    <div className="edu-animation-stage" onClick={event => { if (!(event.target as HTMLElement).closest("button") && !loading && !failed && index < frames.length - 1) go(index + 1); }} style={{ '--frame-height': `${height}px` } as any}>{frame?.file ? <img className="edu-animation-image" src={safeImage(frame.file)} alt={frame.caption || '课程分步动画'} /> : frame?.svg_xml || frame?.svg_string ? <SvgFrame svg={frame.svg_xml || frame.svg_string} height={height} title={frame.caption || '分步动画'} /> : frame?.components ? <Content components={frame.components} answers={answers} onAnswer={onAnswer} /> : <p className="edu-help">该动画帧未提供可显示的图像。</p>}
      {loading && <span role="status" className="edu-animation-loading">正在加载第 {requested + 1} 步…</span>}
      {failed && <div role="alert" className="edu-animation-loading">第 {requested + 1} 步加载失败 <button onClick={() => setRetry(value => value + 1)}>重试</button></div>}
    </div>
    <figcaption>{frame?.caption || data.caption}</figcaption><div className="edu-animation-controls"><button className="animation-previous" type="button" disabled={index === 0 || loading} onClick={() => go(index - 1)}>← 上一步</button><button className="animation-play" type="button" disabled={!frames.length || (loading && !playing)} onClick={() => { if (index === frames.length - 1) setRequested(0); setPlaying(!playing); }}>{playing ? '暂停' : '▷ 播放'}</button><span className="animation-counter" aria-live="polite">{frames.length ? index + 1 : 0} / {frames.length}</span><button className="animation-next" type="button" disabled={index >= frames.length - 1 || loading} onClick={() => go(index + 1)}>下一步 →</button><button className="animation-reset" type="button" title="重播动画" aria-label="重播动画" onClick={() => go(0)}>⟳</button></div><input type="range" aria-label="动画步骤" min="0" max={Math.max(0, frames.length - 1)} value={index} onChange={event => go(Number(event.target.value))} /></figure>;
}
function Tree({ node }: { node: Data }) { return node ? <div className="edu-tree-node"><span>{node.content}</span>{(node.left_child || node.right_child) && <div><Tree node={node.left_child} /><Tree node={node.right_child} /></div>}</div> : null; }
function Diagram({ data, type }: { data: Data; type: string }) {
  if (data.svg_string || data.svg) return <SvgFrame svg={data.svg_string || data.svg} height={Number(data.height || data.svg_height || 350)} />;
  if (type === 'BinaryTree') return <div className="edu-tree"><Tree node={data.root} /></div>;
  if (type === 'Matrix') { const cols = data.matrix_data?.cols || []; return <div className="edu-matrix">{cols.map((column: Data, i: number) => <div key={i}>{column.cells?.map((cell: Data, j: number) => <span key={j} style={{ background: cell.color }}>{cell.text || '\u00a0'}</span>)}</div>)}</div>; }
  if (type === 'CanvasText') { try { return <p>{JSON.parse(data.text_json || '{}').text}</p>; } catch { return null; } }
  return <div className={`edu-array ${data.isVerticalArray || type === 'Stack' ? 'vertical' : ''}`}>{data.nodes?.map((node: Data, i: number) => <span key={node.id || i} style={{ background: node.fillcolor }}>{node.content}<small>{i}</small></span>)}</div>;
}

function Component({ component, index, answers, onAnswer }: { component: Data; index: number } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const data: Data = component.content || {}; const type = component.type;
  const id = String(data.comp_id || component.comp_id || `${type}-${index}`);
  const resolved = component.resolved || data.resolved;
  const common = { answers, onAnswer };
  switch (type) {
    case 'MarkdownEditor': case 'Markdown': case 'Text': return <>{data.title && <h2>{data.title}</h2>}<Markdown text={data.text || data.text_html || ''} /></>;
    case 'Note': return <aside className="edu-note"><span aria-hidden="true">💡</span><Markdown text={data.text || data.text_html} /></aside>;
    case 'SpoilerEditor': return <details className="edu-spoiler"><summary>{data.show_hint_text || '显示提示'}</summary><Markdown text={data.text || data.text_html} /></details>;
    case 'CanvasImage': case 'Image': case 'MxGraphWidget': return typeof data.file === 'string' ? <figure className="edu-image"><img src={safeImage(data.file)} alt={data.caption || '课程插图'} loading="lazy" style={{ maxWidth: data.metadata?.width ? `${data.metadata.width}px` : '100%' }} />{data.caption && <figcaption>{data.caption}</figcaption>}</figure> : data.svg || data.svg_string ? <SvgFrame svg={data.svg || data.svg_string} /> : <p className="edu-help">图示资源暂未提供。</p>;
    case 'Code': return <CodeBlock data={data} id={id} {...common} />;
    case 'TabbedCode': return <Tabs data={data} id={id} {...common} />;
    case 'Quiz': return <>{data.title && <h2>{data.title}</h2>}{(data.questions || []).map((question: Data, i: number) => <Quiz key={question.question_id || i} question={question} id={`${id}:${question.question_id || i}`} {...common} />)}</>;
    case 'QuizRef': case 'QuestionRef': return resolved ? <><Content components={resolved.knowledges || []} {...common} /><Quiz question={resolved} id={id} {...common} /></> : <Unavailable title={data.title} />;
    case 'Knowledge': case 'KnowledgeRef': return resolved ? <Content components={resolved.knowledges || resolved.components || []} {...common} /> : <Unavailable title={data.title} />;
    case 'Coach': case 'ChallengeRef': case 'CodeChallengeRef': return resolved ? <section className="edu-challenge"><Markdown text={resolved.problem_statement_md || resolved.description || ''} />{resolved.input_format_md && <><h3>输入格式</h3><Markdown text={resolved.input_format_md} /></>}{resolved.output_format_md && <><h3>输出格式</h3><Markdown text={resolved.output_format_md} /></>}{resolved.constraints_md && <Markdown text={resolved.constraints_md} />}{resolved.hint_md && <details className="edu-spoiler"><summary>查看提示</summary><Markdown text={resolved.hint_md} /></details>}<Tabs data={resolved} id={id} {...common} />{!resolved.testcases?.length && <p className="edu-help">当前题目未提供公开测试用例。运行结果供自行核对，不代表通过原站判题。</p>}</section> : <Unavailable title={data.title} />;
    case 'Columns': return <div className="edu-columns">{(data.comps || []).map((child: Data, i: number) => <div key={child.content?.comp_id || i} style={{ flex: child.width || 1 }}><Component component={child} index={i} {...common} /></div>)}</div>;
    case 'JsHtml': return data.language === 'js' && !data.html_code && !data.css_code && !/\b(document|window|alert|prompt|confirm)\b/.test(data.js_code || '') ? <CodeBlock data={{ ...data, content: data.js_code, language: 'javascript' }} id={id} {...common} /> : data.runnable === false ? <CodeBlock data={{ ...data, content: data.html_code || data.css_code || data.js_code, language: data.language }} id={id} {...common} /> : <WebExample data={{ ...data, jotted: { files: [{ type:'html', content: data.html_code || '' }, { type:'css', content: data.css_code || '' }, { type:'js', content: data.js_code || '' }] } }} id={id} {...common} />;
    case 'RunJS': return <WebExample data={data} id={id} {...common} />;
    case 'Graphviz': case 'SequenceDiagrams': return data.svg_string ? <SvgFrame svg={data.svg_string} height={Number(data.height || 350)} /> : <Markdown text={'```text\n' + (data.text || '') + '\n```'} />;
    case 'CanvasAnimation': return <Animation data={data} {...common} />;
    case 'EducativeArray': case 'Stack': case 'BinaryTree': case 'Matrix': case 'CanvasText': case 'MxGraph': return <Diagram data={data} type={type} />;
    case 'MarkMap': return <Suspense fallback={<p className="edu-help">正在加载知识导图…</p>}><LazyMindMap data={data} /></Suspense>;
    case 'Video': return data.file || data.url ? <MediaVideo src={data.file || data.url} /> : <Unavailable title={data.title} />;
    default: return data.text ? <Markdown text={data.text} /> : data.components ? <Content components={data.components} {...common} /> : <Unavailable title={data.title || type} />;
  }
}
function Unavailable({ title }: { title?: string }) { return <div className="edu-unavailable">{title && <strong>{title}</strong>}<p>这部分原始内容暂未获取，可继续学习其他内容。</p></div>; }
export function Content({ components, answers, onAnswer }: ContentProps) {
  return <div className="edu-content">{(Array.isArray(components) ? components : []).map((component, index) => <Component key={component.content?.comp_id || `${component.type}-${index}`} component={component} index={index} answers={answers} onAnswer={onAnswer} />)}</div>;
}
export default Content;
