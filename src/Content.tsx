import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, isValidElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import SoloReactMarkdown from 'react-markdown-solo';
import soloGfm from 'remark-gfm-solo';
import soloMath from 'remark-math-solo';
import SourceReactMarkdown from 'react-markdown-source';
import sourceGfm from 'remark-gfm-source';
import sourceMath from 'remark-math-source';
import rehypeCourseKatex from './rehype-course-katex';
import 'katex-solo/dist/katex.min.css';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import SourceEditor, { sourceLanguageLabel } from './SourceEditor';
import SourceWebPreview, {useNativePreviewDialogs} from './SourceWebPreview';
import { EditorHelpLauncher, openEditorHelp } from './EditorHelp';
import SourceIcon from './SourceIcon';
import ArticleAnimation from './ArticleAnimation';
import ArticleSpoiler from './ArticleSpoiler';
import QuizCode from './QuizCode';
import ArticleMarkdownCode from './ArticleMarkdownCode';
import SoloMarkdownCode from './SoloMarkdownCode';
import ArticleQuiz from './ArticleQuiz';
import { ArticlePreviewImage } from './ArticleImagePreview';
import CourseSvg, { loadCourseSvg } from './CourseSvg';
import { renderArticleGlossaryChildren } from './ArticleGlossary';
import { useProgress } from './progress';
import './content.css';
import './quiz.css';
import './content-workspace.css';
import { webPreviewDocument } from './content-web';
import { courseMathMarkdown } from './content-math';
import { runtimeLanguage, supportsExecution, needsServer, RemoteCodeRunner, type CodeRunner } from './execution';
import { orderedQuizAnswers, quizBlankKeys, quizExpectedBlank, normalizeQuizAnswer, validQuizOrder, shuffledQuizOrder, codeNeedsInput } from './content-model';

const LazyMindMap = lazy(() => import('./MindMap'));
const LazyChallengeDialog = lazy(() => import('./ChallengeDialog'));
type Data = Record<string, any>;
export type ContentProps = { components: any[]; answers: Record<string, any>; onAnswer: (id: string, value: any) => void; mode?: 'solo' | 'article' };
const ContentMode = createContext<'solo' | 'article'>('article');
const absolute = (url: string) => url?.startsWith('//') ? `https:${url}` : url;
const safeImage = (url: string) => /^(https?:\/\/|\/|data:image\/|blob:)/i.test(url || '') ? absolute(url) : '';
function localLink(url = '') {
  const match = url.match(/^https?:\/\/edu\.py2fun\.com\/(?:learn#\/)?course\/([^/]+)\/page\/(\d+)/);
  return match ? `#/course/${match[1]}/page/${match[2]}` : absolute(url);
}
function markdownCodeChild(children: any) { return Array.isArray(children) ? children.find(isValidElement) || children[0] : children; }
function Markdown({ text, code }: { text?: string; code?: any }) {
  const mode = useContext(ContentMode);
  const MarkdownRenderer: any = mode === 'article' ? SourceReactMarkdown : SoloReactMarkdown;
  const schema = { ...defaultSchema, tagNames: [...(defaultSchema.tagNames || []), 'video', 'audio', 'source', 'font', 'center', 'katex', 'u'], attributes: { ...defaultSchema.attributes, font: ['size', 'color', 'face'], span: [...(defaultSchema.attributes?.span || []), ['className', 'math', 'math-inline']], div: [...(defaultSchema.attributes?.div || []), ['className', 'math', 'math-display']], video: ['src', 'controls', 'poster', 'width', 'height', 'preload'], audio: ['src', 'controls', 'preload'], source: ['src', 'type'] } };
  return <div className="edu-markdown"><MarkdownRenderer remarkPlugins={mode === 'article' ? [sourceGfm, sourceMath] : [soloGfm, soloMath]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], [rehypeCourseKatex, { mode }]]} components={{
    ...(mode === 'article' ? { ol: ({children}: any) => <ol>{children}</ol>, p: ({ children }: any) => <p>{renderArticleGlossaryChildren(children)}</p>, code: ({children, className}: any) => <span className="article-inline-typography"><code className={className}>{children}</code></span> } : {}),
    a: ({ href, children }) => <a href={localLink(href)} {...(href?.startsWith('/content/fixtures/') || href?.startsWith('http') && !href.includes('edu.py2fun.com/course') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>,
    img: ({ src, alt }) => mode === 'article' ? <span className="article-inline-image"><img src={safeImage(String(src || ''))} alt={alt || ''} loading="eager" /></span> : <img src={safeImage(String(src || ''))} alt={alt || ''} loading="lazy" />,
    video: ({ src, children }) => <MediaVideo src={src}>{children}</MediaVideo>,
    ...(mode === 'article' ? { pre: ({ children }: any) => <ArticleMarkdownCode>{isValidElement<{children:any}>(markdownCodeChild(children)) ? markdownCodeChild(children).props.children : children}</ArticleMarkdownCode> } : !code ? { pre: ({ children }: any) => <SoloMarkdownCode className={isValidElement<{className?:string}>(markdownCodeChild(children)) ? markdownCodeChild(children).props.className : undefined}>{isValidElement<{children:any}>(markdownCodeChild(children)) ? markdownCodeChild(children).props.children : children}</SoloMarkdownCode> } : {}),
    ...(code ? { code } : {}),
  }}>{courseMathMarkdown(text || '')}</MarkdownRenderer></div>;
}

function Quiz({ question, id, answers, onAnswer }: { question: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const mode = useContext(ContentMode);
  const options: Data[] = question.question_options || [];
  const saved = answers[id] || {};
  const selected: number[] = Array.isArray(saved.selected) ? saved.selected : [];
  const blanks: Record<string, string> = saved.blanks || {};
  const kind = question.question_type || 'single_choice';
  const fill = ['drag_and_drop', 'typein', 'type_in', 'multi_type_in', 'fill_in', 'fill_blank'].includes(kind);
  const reorder = kind === 'reorder';
  const initialOrder = useMemo(() => shuffledQuizOrder(options, reorder), [id, options, reorder]);
  const choiceOrder: number[] = validQuizOrder(saved.optionOrder, options.length) ? saved.optionOrder : initialOrder;
  const order: number[] = validQuizOrder(saved.order, options.length) ? saved.order : initialOrder;
  const move = (from: number, to: number) => { const next = [...order]; next.splice(to, 0, next.splice(from, 1)[0]); change({ order: next }); };
  const multi = ['mult_choice', 'multiple_choice', 'multi_choice'].includes(kind);
  const text = question.question_text || question.question_text_html || '';
  const standalone = kind === 'type_in' || kind === 'typein';
  const tokens = fill ? quizBlankKeys(kind, text, options) : [];
  const focusedBlank = useRef('');
  const quizRef = useRef<HTMLElement>(null);
  useEffect(() => { if (mode === 'solo' && fill) quizRef.current?.querySelector<HTMLInputElement>('.edu-blank')?.focus(); }, [id, mode, fill]);
  const change = (patch: Data) => onAnswer(id, { ...saved, optionOrder: choiceOrder, ...patch, checked: false, correct: null });
  const retry = () => {
    const shuffled = shuffledQuizOrder(options, reorder);
    focusedBlank.current = tokens[0] || '';
    onAnswer(id, { ...saved, selected: [], blanks: {}, order: reorder ? shuffled : order, optionOrder: shuffled, checked: false, correct: null, checkedAt: null });
  };
  const setBlank = (key: string, value: string) => change({ blanks: { ...blanks, [key]: value } });
  const chooseWord = (value: string) => {
    const key = tokens.includes(focusedBlank.current) ? focusedBlank.current : tokens[0];
    if (key == null || saved.checked) return;
    setBlank(key, value);
    const next = tokens[tokens.indexOf(key) + 1];
    focusedBlank.current = next ?? key; if (next) quizRef.current?.querySelector<HTMLInputElement>(`[data-blank-key="${next}"]`)?.focus();
  };
  const expectedFor = (key: string) => quizExpectedBlank(kind, options, tokens.indexOf(key));
  const check = () => {
    const expected = options.map((option, i) => option.correct ? i : -1).filter(i => i >= 0);
    const correct = reorder ? order.every((optionIndex, position) => options[optionIndex] === orderedQuizAnswers(options)[position]) : fill ? tokens.length > 0 && tokens.every(key => expectedFor(key).some(option => normalizeQuizAnswer(option.text) === normalizeQuizAnswer(blanks[key])))
      : expected.length > 0 && expected.length === selected.length && expected.every(i => selected.includes(i));
    onAnswer(id, { ...saved, selected, blanks, order, checked: true, correct, checkedAt: new Date().toISOString() });
  };
  const input = (key: string) => <input key={key} data-blank-key={key} className={`edu-blank ${saved.checked ? saved.correct ? 'correct' : 'incorrect' : ''}`} aria-label={`填空 ${Number(key) + 1}`} autoComplete="off" disabled={Boolean(saved.checked)} value={blanks[key] || ''} onFocus={() => { focusedBlank.current = key; }} onChange={event => setBlank(key, event.target.value)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!saved.checked) setBlank(key, event.dataTransfer.getData('text/plain')); }} style={{ width: `${Math.max(80, (blanks[key] || '').length * 13)}px` }} />;
  function fillCode({ children, className, ...rest }: any) {
    const value = String(children);
    if (!/__(\d+)__/.test(value)) return mode === 'solo' ? <QuizCode className={className} {...rest}>{children}</QuizCode> : <code className={className} {...rest}>{children}</code>;
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
  return <section ref={quizRef} className="edu-quiz" aria-label="课后练习">
    <div className="edu-quiz-label"><span>✎</span> {reorder ? '排序练习' : multi ? '多选题' : fill ? '填空练习' : '单选题'}</div>
    <Markdown text={text} code={mode === 'solo' || (fill && !standalone) ? stableFillCode : undefined} />
    {fill ? <>
      {(standalone || !/__(\d+)__/.test(text)) && <div className="edu-blank-list">{tokens.map(key => <label key={key}>第 {Number(key) + 1} 空 {input(key)}</label>)}</div>}
      {kind === 'drag_and_drop' && <><p className="edu-help">将选项拖入空格，或选中空格后点击选项。</p><div className="edu-word-bank">{choiceOrder.filter(i => !Object.values(blanks).includes(options[i].text)).map(i => <button type="button" key={i} disabled={Boolean(saved.checked)} draggable={!saved.checked} onDragStart={event => event.dataTransfer.setData('text/plain', options[i].text)} onClick={() => chooseWord(options[i].text)}>{options[i].text}</button>)}</div></>}
    </> : reorder ? <div className="edu-reorder">{order.map((optionIndex, position) => <div className="edu-reorder-item" data-option-index={optionIndex} key={optionIndex} draggable={!saved.checked} onDragStart={event => event.dataTransfer.setData('text/plain', String(position))} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (!saved.checked && Number.isInteger(from) && from >= 0 && from < order.length) move(from, position); }}><span aria-hidden="true"><i/><i/><i/></span><span className="edu-option-source-text">{options[optionIndex].text}</span><button aria-label="上移" disabled={Boolean(saved.checked) || !position} onClick={() => move(position, position - 1)}>↑</button><button aria-label="下移" disabled={Boolean(saved.checked) || position === order.length - 1} onClick={() => move(position, position + 1)}>↓</button></div>)}</div> : <div className="edu-options">{choiceOrder.map(i => { const option = options[i]; return <label key={option.id || i} data-option-index={i} className={`edu-option ${selected.includes(i) ? 'selected' : ''} ${saved.checked && saved.correct && selected.includes(i) ? 'correct' : ''} ${saved.checked && !saved.correct && selected.includes(i) && !option.correct ? 'incorrect' : ''}`}><input type={multi ? 'checkbox' : 'radio'} name={`quiz-${id}`} disabled={Boolean(saved.checked)} checked={selected.includes(i)} onChange={() => change({ selected: multi ? selected.includes(i) ? selected.filter(item => item !== i) : [...selected, i] : [i] })} /><span className="edu-option-key">{option.key || String.fromCharCode(65 + i)}</span>{mode === 'solo' ? <span className="edu-option-source-text">{option.text || option.text_html}</span> : <Markdown text={option.text || option.text_html} />}</label>; })}</div>}
    <div className={`edu-quiz-actions ${saved.checked ? 'is-checked' : ''}`}><button className="edu-primary" type="button" onClick={saved.checked ? retry : check} disabled={!saved.checked && (reorder ? !order.length : fill ? !tokens.length || tokens.some(key => !blanks[key]?.trim()) : multi ? selected.length !== options.filter(option => option.correct).length : !selected.length)}>{saved.checked ? '再试一次' : '检查答案'}</button>{saved.checked && <span role="status" className={saved.correct ? 'edu-success' : 'edu-error'}>{saved.correct ? '✓ 答案正确' : '× 答案错误'}</span>}</div>
    {saved.checked && options.some(option => option.explanation?.md_text || option.explanation?.md_html) && <details className="edu-explanation"><summary>查看解析</summary>{options.filter((option, i) => saved.correct ? option.correct : selected.includes(i)).map((option, i) => <Markdown key={i} text={option.explanation?.md_text || option.explanation?.md_html} />)}</details>}
  </section>;
}

function SourceCloseIcon() { return <svg width="24" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1L11 11M11 1L1 11" stroke="#2D3846" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function SourceRunIcon() { return <svg width="11" height="14" viewBox="0 0 11 14" aria-hidden="true"><path d="M10.5 6.13397C11.1667 6.51888 11.1667 7.48112 10.5 7.86602L1.5 13.0622C0.833332 13.4471 3.43203e-07 12.966 3.76852e-07 12.1962L8.31114e-07 1.80385C8.64763e-07 1.03405 0.833334 0.552922 1.5 0.937822L10.5 6.13397Z" fill="currentColor" /></svg>; }

function CodeBlock({ data, id, answers, onAnswer }: { data: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const mode = useContext(ContentMode);
  const initial = String(data.content ?? data.template ?? '');
  const cardSource = String(data.short_content || initial);
  const articleKind = data.runnable === false && data.judge === false ? 'pure' : data.runnable === true ? 'runnable' : data.judge === true ? 'judge' : 'initial';
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
  const [preview, setPreview] = useState<{html:string;run:number}|null>(null);
  const htmlFrame=useRef<HTMLIFrameElement>(null);
  const htmlDialogChannel=useRef(crypto.randomUUID());
  useNativePreviewDialogs(htmlFrame,htmlDialogChannel.current);
  const [testResults, setTestResults] = useState<Data[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<{ name: string; url: string; mime: string; size: number }[]>([]);
  const [workspace, setWorkspace] = useState(false);
  const [inputPrompt, setInputPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hints: Data[] = Array.isArray(data.judge_hints) ? data.judge_hints : [];
  const workerRef = useRef<CodeRunner | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = () => { workerRef.current?.terminate(); workerRef.current = null; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; };
  useEffect(() => cleanup, []);
  useEffect(() => {
    if (!workspace || !dialogRef.current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current.showModal();
    return () => { document.body.style.overflow = previous; };
  }, [workspace]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer); }, [copied]);
  const save = (patch: Data) => { const next = { ...savedRef.current, ...patch }; savedRef.current = next; onAnswer(id, next); };
  const edit = (patch: Data) => { setTestResults([]); save({ ...patch, checked: false, correct: null, testResults: [] }); };
  const reset = () => {
    cleanup(); setBusy(false); setStatus('');
    // The original article editor keeps its last console/artifact result when
    // resetting source. Completion and judging still belong to the new source.
    if (mode === 'solo') { setOutput(''); setPlots([]); setDownloads([]); setPreview(null); setError(false); }
    edit({ code: initial, files: {} });
  };
  const stop = () => { cleanup(); setBusy(false); setStatus('运行已停止'); };
  const closeWorkspace = () => { if (busy) stop(); setInputPrompt(false); dialogRef.current?.close(); setWorkspace(false); };
  const run = (testing = false) => {
    let results: Data[] = [];
    setTestResults([]);
    setPlots([]);
    setDownloads([]);
    cleanup(); setOutput(''); setError(false); setStatus('');
    if (isHTML) { setPreview(previous=>({html:webPreviewDocument(code,'','','',{nativeDialogChannel:htmlDialogChannel.current}),run:(previous?.run||0)+1})); return; }
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
  const languageLabel = sourceLanguageLabel(String(data.language || 'python3'));
  const helpRequest = { code, hints: hints.map(hint => String(hint.text || hint.text_html || '')), solution: data.show_solution !== false ? data.solution_content || data.solution_code : undefined };
  const filesView = visibleFiles.length > 0 && <div className="edu-file-tabs" role="tablist" aria-label="代码文件"><button role="tab" aria-selected={!activeFile} onClick={() => setActiveFile('')}>{data.entry_file_name || data.file_name || (isPython ? 'main.py' : '主程序')}</button>{visibleFiles.map(file => { const name = file.file_name || file.name; return <button key={name} role="tab" aria-selected={activeFile === name} onClick={() => setActiveFile(name)}>{name}{file.read_only ? ' · 只读' : ''}</button>; })}</div>;
  const editor = (fullscreen = false) => <SourceEditor key={activeFile} highlightLines={fullscreen ? '' : data.high_lighted_lines || ''} value={activeExtra ? extraSource(activeExtra) : code} engine={fullscreen ? 'monaco' : 'codemirror'} language={fullscreen ? String(data.language || 'python3') : 'python'} fullscreen={fullscreen} readOnly={Boolean((activeExtra ? activeExtra.read_only : data.read_only) || busy)} onChange={value => activeExtra ? edit({ files: { ...savedRef.current.files, [activeFile]: value } }) : edit({ code: value })} label={activeFile ? `代码 ${activeFile}` : '代码'} />;
  const resultsView = <>
    {(output || busy) && <pre className={`edu-output ${error ? 'error' : ''}`} aria-label="运行结果" tabIndex={0}>{output || '等待输出…'}</pre>}
    {testResults.length > 0 && <div className="edu-test-results" aria-live="polite"><p className={testResults.every(result => result.succeeded) ? 'edu-success' : 'edu-error'}>通过 {testResults.filter(result => result.succeeded).length} / {testResults.length} 个公开测试</p>{testResults.map((result, index) => <details key={index}><summary>{result.succeeded ? '✓' : '✗'} 测试 {result.case_no || index + 1}</summary><dl><dt>输入</dt><dd><pre>{result.input || '（无）'}</pre></dd><dt>预期输出</dt><dd><pre>{result.expected_output}</pre></dd><dt>实际输出</dt><dd><pre>{result.actual_output}</pre></dd>{result.reason && <><dt>说明</dt><dd>{result.reason}</dd></>}</dl></details>)}</div>}
    {plots.map((plot, index) => <figure className="edu-plot" key={index}><img src={plot} alt={`程序生成的图表 ${index + 1}`} /></figure>)}
    {downloads.length > 0 && <div className="edu-generated-files"><span>程序生成的文件</span>{downloads.map(file => <a key={file.name} href={file.url} download={file.name}>{file.name} · 下载（{Math.max(1, Math.round(file.size / 1024))} KB）</a>)}</div>}
    {preview && <iframe ref={htmlFrame} key={preview.run} title="HTML 运行结果" className="edu-html-preview" sandbox="allow-scripts allow-forms" srcDoc={preview.html} />}
  </>;
  if (mode === 'solo') return <section className="edu-code-block edu-solo-code" aria-label="代码示例">
    <div className="edu-solo-code-source"><SourceEditor value={cardSource} engine="monaco" language={String(data.language || 'python3')} readOnly source label="课程示例代码" />
      <div className="edu-solo-code-tags"><button type="button" onClick={() => { navigator.clipboard.writeText(cardSource).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? '复制成功' : '复制'}</button><button type="button" className="edu-ai-help" onClick={() => openEditorHelp(helpRequest)}>AI答疑</button><span>{languageLabel}</span></div>
    </div>
    {data.runnable !== false && <button type="button" className="edu-primary edu-try-code" onClick={() => setWorkspace(true)}>尝试一下</button>}
    {workspace && createPortal(<dialog ref={dialogRef} className="edu-code-workspace" aria-label={data.title || '代码练习'} onCancel={event => { event.preventDefault(); closeWorkspace(); }}>
      <header className="edu-workspace-header"><button type="button" className="edu-workspace-close" aria-label="关闭代码练习" onClick={closeWorkspace}><SourceCloseIcon /></button><span>{data.title || ''}</span><div className="edu-workspace-actions"><button type="button" className="edu-primary" aria-label={busy ? '停止 ■' : '运行 ▶'} onClick={() => { if (busy) stop(); else if (codeNeedsInput(language, code)) setInputPrompt(true); else run(false); }}>{busy ? '停止 ■' : <>{'运行 \u00a0'}<SourceRunIcon /></>}</button></div></header>
      <div className="edu-workspace-body"><div className="edu-workspace-editor"><div className="edu-workspace-language"><span>{languageLabel}</span></div>{filesView}<div className="edu-workspace-code">{editor(true)}</div></div><div className="edu-workspace-output"><div className="edu-workspace-result-tools">{output && <button type="button" className="edu-ai-help" onClick={() => openEditorHelp(helpRequest)}>AI答疑</button>}<span aria-live="polite" className={`edu-workspace-status ${error ? 'edu-error' : 'edu-help'}`}>{status}</span></div>{resultsView}</div></div>
      {inputPrompt && <div className="edu-input-prompt-backdrop"><section className="edu-input-prompt" role="dialog" aria-label="看起来你需要参数输入"><header><h2>看起来你需要参数输入</h2><button type="button" aria-label="关闭参数输入" onClick={() => setInputPrompt(false)}><SourceCloseIcon /></button></header><div className="edu-input-prompt-body"><textarea aria-label="程序标准输入" value={stdin} onChange={event => edit({ stdin: event.target.value })} placeholder="请输入, 换行可输入多个参数" rows={5} /><div className="edu-input-prompt-handler"><button type="button" className="edu-primary" onClick={() => { setInputPrompt(false); run(false); }}>尝试一下</button></div></div></section></div>}
      <EditorHelpLauncher request={helpRequest} />
    </dialog>, document.body)}
  </section>;
  const Card = ({ title, close, children }: { title: string; close: () => void; children: ReactNode }) => <div className="edu-article-extra"><section className="edu-article-card"><header><span>{title}</span><button type="button" aria-label={`关闭${title}`} onClick={close}><svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M563.8 512l262.5-312.9a8 8 0 00-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L512 449.3 295.9 191.7a16 16 0 00-12.3-5.7h-79.8a8 8 0 00-6.1 13.1L460.2 512 197.7 824.9a8 8 0 006.1 13.1h79.8c4.7 0 9.2-2.1 12.3-5.7L512 574.7l216.1 257.6c3 3.6 7.5 5.7 12.3 5.7h79.8a8 8 0 006.1-13.1L563.8 512z" /></svg></button></header><div className="edu-article-card-body">{children}</div></section></div>;
  return <section className={`edu-code-block ${articleKind === 'pure' ? 'edu-code-static' : ''}`} aria-label="代码编辑器">
    <div className="edu-article-code-body">{filesView}{editor()}</div>
    {articleKind !== 'pure' && <><footer className="edu-code-actions"><div className="edu-article-code-buttons"><button type="button" className="edu-primary" onClick={busy ? stop : () => run(articleKind === 'judge')}>{busy ? '停止运行' : articleKind === 'judge' ? '提交代码' : '运行代码'}</button>{hints.length > 0 && <button type="button" className="edu-test-button" onClick={() => { setHintsOpen(value => !value); setHintIndex(0); }}>{hintsOpen ? '隐藏提示' : '获取提示？'}</button>}{data.show_solution === true && <button type="button" className="edu-test-button" onClick={() => setSolutionOpen(value => !value)}>{solutionOpen ? '隐藏答案' : '查看答案'}</button>}</div><button type="button" className="edu-code-reset" onClick={reset}>重置代码</button></footer>
    {hintsOpen && <Card title={`第${hintIndex + 1}/${hints.length}条提示`} close={() => setHintsOpen(false)}><div className="edu-article-hints"><button type="button" aria-label="上一条提示" disabled={hintIndex === 0} onClick={() => setHintIndex(value => value - 1)}><svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M724 218.3V141c0-6.7-7.7-10.4-12.9-6.3L260.4 486.7a31.9 31.9 0 000 50.4l450.7 352c5.3 4.1 12.9.4 12.9-6.3v-77.3c0-4.9-2.3-9.6-6.1-12.6L357.4 512l360.5-281.1c3.8-3 6.1-7.7 6.1-12.6z" /></svg></button><div className="edu-article-hint-slide"><Markdown text={hints[hintIndex]?.text || hints[hintIndex]?.text_html || ''} /></div><button type="button" aria-label="下一条提示" disabled={hintIndex === hints.length - 1} onClick={() => setHintIndex(value => value + 1)}><svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M765.7 486.8L314.9 134.7c-5.3-4.1-12.9-.4-12.9 6.3v77.3c0 4.9 2.3 9.6 6.1 12.6L668.6 512 308.1 793.1a16 16 0 00-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a32 32 0 000-50.4z" /></svg></button></div></Card>}
    {solutionOpen && <Card title="参考答案" close={() => setSolutionOpen(false)}><Markdown text={'```python3\n' + (data.solution_content || data.solution_code || '') + '\n```'} /></Card>}
    {resultsView}</>}
    {data.caption && <div className="edu-caption">{data.caption}</div>}
  </section>;
}

function Tabs({ data, id, answers, onAnswer }: { data: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const tabs: Data[] = data.code_contents || data.code_templates || [];
  const [active, setActive] = useState(0);
  return <div className="edu-code-tabs"><div role="tablist" aria-label="代码语言">{tabs.map((tab, index) => <button key={index} role="tab" aria-selected={active === index} onClick={() => setActive(index)}><span className="edu-code-tab-icon"><img src={`/content/site-ui/languages/${encodeURIComponent(tab.language || 'python3')}.svg`} alt="" /></span><span>{tab.title || tab.language}</span></button>)}</div>{tabs[active] && <CodeBlock key={active} data={{...tabs[active], testcases: data.testcases}} id={tabs[active].comp_id || `${id}:code:${active}`} answers={answers} onAnswer={onAnswer} />}</div>;
}

function WebExample({ data, id, answers, onAnswer }: { data: Data; id: string } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const mode = useContext(ContentMode);
  const files: Data[] = data.jotted?.files || [];
  const saved = answers[id] || {};
  const [tab, setTab] = useState('result');
  const [workspace, setWorkspace] = useState(false);
  const [preview, setPreview] = useState<{ html: string; run: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const consoleChannel = useRef(crypto.randomUUID());
  const inlineFrame = useRef<HTMLIFrameElement>(null);
  useNativePreviewDialogs(inlineFrame,consoleChannel.current);
  useEffect(() => {
    if (!workspace || !dialogRef.current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current.showModal();
    return () => { document.body.style.overflow = previous; };
  }, [workspace]);
  const source = (type: string) => saved[type] ?? files.find(file => file.type === type)?.content ?? '';
  const html = webPreviewDocument(source('html'), source('css'), source('js'), source('hiddenjs'), {nativeDialogChannel:consoleChannel.current,...(mode === 'solo' ? {consoleChannel:consoleChannel.current}:{})});
  if (mode === 'solo' && data.language) {
    const language = data.language === 'html' ? 'html' : data.language === 'css' ? 'css' : 'js';
    const initial = files.find(file => file.type === language)?.content || '';
    const close = () => { dialogRef.current?.close(); setWorkspace(false); setPreview(null); };
    return <section className="edu-code-block edu-solo-code" aria-label="网页代码示例"><div className="edu-solo-code-source"><SourceEditor value={initial} engine="monaco" language={language} readOnly source label="课程示例代码" /><div className="edu-solo-code-tags"><button type="button" onClick={() => { void navigator.clipboard.writeText(initial).catch(() => {}); }}>复制</button><span>{language.toUpperCase()}</span></div></div>{data.runnable !== false && <button type="button" className="edu-primary edu-try-code" onClick={() => setWorkspace(true)}>尝试一下</button>}
      {workspace && createPortal(<dialog ref={dialogRef} className="edu-code-workspace" aria-label="网页代码练习" onCancel={event => { event.preventDefault(); close(); }}><header className="edu-workspace-header"><button type="button" className="edu-workspace-close" aria-label="关闭代码练习" onClick={close}><SourceCloseIcon /></button><span>{data.title || '尝试一下'}</span><div className="edu-workspace-actions"><button type="button" className="edu-primary" aria-label="运行 ▶" onClick={() => setPreview(previous => ({ html, run: (previous?.run || 0) + 1 }))}>{'运行 \u00a0'}<SourceRunIcon /></button></div></header><div className="edu-web-workspace-body">{['html', 'css', 'js'].map(type => <section key={type} className="edu-workspace-editor" aria-label={`${type.toUpperCase()} 编辑器`}><div className="edu-workspace-language"><span>{type.toUpperCase()}</span></div><div className="edu-workspace-code"><SourceEditor value={source(type)} engine="monaco" language={type} fullscreen onChange={value => onAnswer(id, { ...saved, [type]: value })} label={`${type.toUpperCase()} 代码`} /></div></section>)}<section className="edu-web-workspace-result" aria-label="网页运行结果"><SourceWebPreview html={preview?.html} run={preview?.run} channel={consoleChannel.current} /></section></div><EditorHelpLauncher request={{ code: html }} /></dialog>, document.body)}
    </section>;
  }
  return <section className="edu-web-example"><div className="edu-web-tabs" role="tablist" aria-label="网页示例">{['result', 'html', 'css', 'js'].map(type => <button key={type} role="tab" aria-selected={tab === type} onClick={() => setTab(type)}>{type === 'result' ? '运行结果' : type.toUpperCase()}</button>)}</div>{tab === 'result' ? <iframe ref={inlineFrame} title={data.caption || '交互式网页示例'} sandbox="allow-scripts allow-forms" srcDoc={files.length ? html : undefined} src={!files.length ? absolute(data.file) : undefined} style={{ width:'100%', height:Math.min(800, Number(data.jotted?.height || 400)), border:0 }} /> : <SourceEditor value={source(tab)} engine="codemirror" language={tab === 'js' ? 'javascript' : tab} onChange={value => onAnswer(id, {...saved, [tab]:value})} />}<p className="edu-caption">{data.jotted?.caption || data.caption}</p></section>;
}

function MediaVideo({ src, children }: { src?: string; children?: ReactNode }) {
  return <video controls preload="metadata" src={src ? absolute(src) : undefined} style={{ maxWidth: '100%' }}>{children}</video>;
}

function SvgFrame({ svg, height = 380, title = '课程图示' }: { svg: string; height?: number; title?: string }) {
  // An opaque, scriptless frame safely retains the source SVG's styles and linked images.
  const doc = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:white}svg{display:block;max-width:100%;height:auto;margin:auto}</style></head><body>${svg}</body></html>`;
  return <iframe className="edu-svg-frame" title={title} sandbox="" srcDoc={doc} style={{ height }} loading="lazy" />;
}
function Animation({ data, answers, onAnswer }: { data: Data } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const mode = useContext(ContentMode);
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
      try { await image.decode(); if (mode === 'article' && target.file.endsWith('.svg')) await loadCourseSvg(target.file); } catch { /* onload still confirms a usable image */ }
      if (!cancelled) { setIndex(requested); setLoading(false); }
    };
    image.onerror = () => { if (!cancelled) { setLoading(false); setFailed(true); setPlaying(false); } };
    image.src = safeImage(target.file);
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [requested, retry, frames, mode]);
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
  const height = Number(data.height || frame?.height || 380);
  return <figure className="edu-animation" aria-busy={loading}>
    <div className="edu-animation-stage" style={{ '--frame-height': `${height}px` } as any}>{frame?.file && mode === 'article' && frame.file.endsWith('.svg') ? <CourseSvg src={frame.file} width={Number(data.width || frame.width || 600)} height={height} label={frame.caption || '课程分步动画'} /> : frame?.file ? <img className="edu-animation-image" src={safeImage(frame.file)} alt={frame.caption || '课程分步动画'} /> : frame?.svg_xml || frame?.svg_string ? <SvgFrame svg={frame.svg_xml || frame.svg_string} height={height} title={frame.caption || '分步动画'} /> : frame?.components ? <Content components={frame.components} answers={answers} onAnswer={onAnswer} /> : <p className="edu-help">该动画帧未提供可显示的图像。</p>}
      {loading && <span role="status" className="edu-animation-loading">正在加载第 {requested + 1} 步…</span>}
      {failed && <div role="alert" className="edu-animation-loading">第 {requested + 1} 步加载失败 <button onClick={() => setRetry(value => value + 1)}>重试</button></div>}
    </div>
    <figcaption>{frame?.caption || data.caption}</figcaption><div className="edu-animation-controls" style={frames.length < 2 ? { display: 'none' } : undefined}><button className="animation-previous" type="button" disabled={index === 0 || loading} aria-label="上一步" onClick={() => go(index - 1)}>{mode === 'article' ? <span className="animation-icon"><SourceIcon name="left" /></span> : '← 上一步'}</button><button className="animation-play" type="button" disabled={!frames.length || (loading && !playing)} onClick={() => { if (index === frames.length - 1) setRequested(0); setPlaying(!playing); }}>{playing ? '暂停' : '▷ 播放'}</button><span className="animation-counter" aria-live="polite">{frames.length ? index + 1 : 0}/{frames.length}</span><button className="animation-next" type="button" disabled={index >= frames.length - 1 || loading} aria-label="下一步" onClick={() => go(index + 1)}>{mode === 'article' ? <span className="animation-icon"><SourceIcon name="right" /></span> : '下一步 →'}</button><button className="animation-reset" type="button" title="重播动画" aria-label="重播动画" onClick={() => go(0)}><span className="animation-icon"><SourceIcon name="reload" /></span></button></div><input type="range" hidden={frames.length < 2} aria-label="动画步骤" min="0" max={Math.max(0, frames.length - 1)} value={index} onChange={event => go(Number(event.target.value))} /></figure>;
}
function Spoiler({ data }: { data: Data }) {
  const [open, setOpen] = useState(false);
  return <details className="edu-spoiler" onToggle={event => setOpen(event.currentTarget.open)}><summary>{data.show_icon && <span className="edu-spoiler-icon"><SourceIcon name="alert" size={16} /></span>}<span>{open ? data.hide_hint_text || '隐藏提示' : data.show_hint_text || '显示提示'}</span></summary><div className="edu-spoiler-panel"><Markdown text={data.text || data.text_html} /></div></details>;
}
function Tree({ node }: { node: Data }) { return node ? <div className="edu-tree-node"><span>{node.content}</span>{(node.left_child || node.right_child) && <div><Tree node={node.left_child} /><Tree node={node.right_child} /></div>}</div> : null; }
function Diagram({ data, type }: { data: Data; type: string }) {
  if (type === 'Matrix' && data.svg_string) return <figure className="edu-diagram edu-diagram-Matrix"><CourseSvg source={data.svg_string} label={data.caption || '课程图示'} />{data.caption && <figcaption>{data.caption}</figcaption>}</figure>;
  if (data.file) return <figure className={`edu-diagram edu-diagram-${type}`}><div className="edu-diagram-svg"><img src={safeImage(data.file)} alt={data.caption || '课程图示'} /></div>{data.caption && <figcaption>{data.caption}</figcaption>}</figure>;
  if (data.svg_string || data.svg) return <SvgFrame svg={data.svg_string || data.svg} height={Number(data.height || data.svg_height || 350)} />;
  if (type === 'BinaryTree') return <div className="edu-tree"><Tree node={data.root} /></div>;
  if (type === 'Matrix') { const cols = data.matrix_data?.cols || []; return <div className="edu-matrix">{cols.map((column: Data, i: number) => <div key={i}>{column.cells?.map((cell: Data, j: number) => <span key={j} style={{ background: cell.color }}>{cell.text || '\u00a0'}</span>)}</div>)}</div>; }
  if (type === 'CanvasText') { try { return <p>{JSON.parse(data.text_json || '{}').text}</p>; } catch { return null; } }
  return <div className={`edu-array ${data.isVerticalArray || type === 'Stack' ? 'vertical' : ''}`}>{data.nodes?.map((node: Data, i: number) => <span key={node.id || i} style={{ background: node.fillcolor }}>{node.content}<small>{i}</small></span>)}</div>;
}

function SoloCoach({ data, resolved }: { data: Data; resolved: Data }) {
  const [open, setOpen] = useState(false);
  const { progress } = useProgress();
  const courseId = location.hash.match(/\/course\/([^/]+)/)?.[1] || 'local';
  const challengeId = Number(resolved.challenge_id || data.challenge_id || data.id);
  const done = progress.lessons[`${courseId}:challenge-${challengeId}`]?.completed;
  return <><section className="edu-coach-card"><div className="edu-coach-header"><svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" rx="4" fill="#D26A54"/><path d="M40 23.2361L43.3147 33.4377C43.5825 34.2617 44.3504 34.8197 45.2168 34.8197H55.9434L47.2654 41.1246C46.5645 41.6339 46.2711 42.5366 46.5389 43.3607L49.8536 53.5623L41.1756 47.2574C40.4746 46.7481 39.5254 46.7481 38.8244 47.2574L30.1464 53.5623L33.4611 43.3607C33.7289 42.5366 33.4355 41.6339 32.7346 41.1246L24.0566 34.8197H34.7832C35.6496 34.8197 36.4175 34.2617 36.6853 33.4377L40 23.2361Z" stroke="white" strokeWidth="2" fill="none"/></svg><div><div className="edu-coach-name">{data.name || data.title || resolved.title}</div><div className="edu-coach-description">{data.description}</div></div></div><button className={`edu-primary${done ? ' edu-coach-finished' : ''}`} onClick={() => setOpen(true)}>练习 (+10钻石){done && ' ✓'}</button></section>{open && <Suspense fallback={<p role="status">正在加载挑战…</p>}><LazyChallengeDialog courseId={courseId} challengeId={challengeId} onClose={() => setOpen(false)} /></Suspense>}</>;
}

function LessonImage({data,type}:{data:Data;type:string}) {
  const mode=useContext(ContentMode);
  const img=<img src={safeImage(data.file)} alt={data.caption || '课程插图'} loading="lazy" style={{width:data.metadata?.width ? `${data.metadata.width}px` : undefined,...(data.has_border ? {border:`1px solid ${data.border_color || '#ccc'}`} : {})}}/>;
  return <figure className={`edu-image edu-image-${type}`}>{mode==='article' && type==='Image' ? <ArticlePreviewImage src={safeImage(data.file)} alt={data.caption || '课程插图'} width={data.metadata?.width} hasBorder={data.has_border} borderColor={data.border_color}/> : mode==='article' && type==='MxGraphWidget' ? <span className="edu-source-image">{img}</span> : img}{data.caption && type!=='Image' && <figcaption>{data.caption}</figcaption>}</figure>;
}

function Component({ component, index, answers, onAnswer }: { component: Data; index: number } & Pick<ContentProps, 'answers' | 'onAnswer'>) {
  const mode = useContext(ContentMode);
  const data: Data = component.content || {}; const type = component.type;
  const id = String(data.comp_id || component.comp_id || `${type}-${index}`);
  const resolved = component.resolved || data.resolved;
  const common = { answers, onAnswer };
  switch (type) {
    case 'MarkdownEditor': case 'Markdown': case 'Text': return <Markdown text={data.text || data.text_html || ''} />;
    case 'Note': return <aside className="edu-note"><svg className="edu-note-icon" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 2C8.27 2 2 8.27 2 16C2 23.732 8.27 30 16 30C23.734 30 30 23.732 30 16C30 8.27 23.734 2 16 2ZM16 24C15.174 24 14.5 23.328 14.5 22.5C14.5 21.672 15.174 21 16 21C16.832 21 17.5 21.672 17.5 22.5C17.5 23.328 16.832 24 16 24ZM17.5 16.5C17.5 17.33 16.832 18 16 18C15.174 18 14.5 17.33 14.5 16.5V9.5C14.5 8.67 15.174 8 16 8C16.832 8 17.5 8.67 17.5 9.5V16.5Z" fill="#FF9A00"/></svg><Markdown text={data.text || data.text_html} /></aside>;
    case 'SpoilerEditor': return mode === 'article' ? <ArticleSpoiler data={data}><Markdown text={data.text || data.text_html} /></ArticleSpoiler> : <Spoiler data={data} />;
    case 'CanvasImage': case 'Image': case 'MxGraphWidget': return typeof data.file === 'string' ? <LessonImage data={data} type={type}/> : data.svg || data.svg_string ? <SvgFrame svg={data.svg || data.svg_string} /> : <p className="edu-help">图示资源暂未提供。</p>;
    case 'Code': return <CodeBlock data={data} id={id} {...common} />;
    case 'TabbedCode': return <Tabs data={data} id={id} {...common} />;
    case 'Quiz': if (mode === 'article') return <ArticleQuiz data={data} id={id} answers={answers} onAnswer={onAnswer} renderMarkdown={text => <Markdown text={text} />} />; return <>{data.title && <h2>{data.title}</h2>}{(data.questions || []).map((question: Data, i: number) => <Quiz key={question.question_id || i} question={question} id={`${id}:${question.question_id || i}`} {...common} />)}</>;
    case 'QuizRef': case 'QuestionRef': return resolved ? <><Content components={resolved.knowledges || []} {...common} /><Quiz question={resolved} id={id} {...common} /></> : <Unavailable title={data.title} />;
    case 'Knowledge': case 'KnowledgeRef': return resolved ? <Content components={resolved.knowledges || resolved.components || []} {...common} /> : <Unavailable title={data.title} />;
    case 'Coach': if (mode === 'solo' && resolved) return <SoloCoach data={data} resolved={resolved} />;
    case 'ChallengeRef': case 'CodeChallengeRef':
      if (mode === 'solo' && resolved) {
        const sample = resolved.testcases?.[0] || {};
        const example = (title: string, value: string) => value ? `\n### ${title}\n\`\`\`python\n${value}\n\`\`\`\n` : '';
        return <Markdown text={(resolved.problem_statement_md || '') + example('示例输入', sample.stdin ?? ' ') + example('示例输出', sample.expected_output ?? ' ')} />;
      }
      return resolved ? <section className="edu-challenge"><Markdown text={resolved.problem_statement_md || resolved.description || ''} />{resolved.input_format_md && <><h3>输入格式</h3><Markdown text={resolved.input_format_md} /></>}{resolved.output_format_md && <><h3>输出格式</h3><Markdown text={resolved.output_format_md} /></>}{resolved.constraints_md && <Markdown text={resolved.constraints_md} />}{resolved.hint_md && <details className="edu-spoiler"><summary>查看提示</summary><Markdown text={resolved.hint_md} /></details>}<Tabs data={resolved} id={id} {...common} />{!resolved.testcases?.length && <p className="edu-help">当前题目未提供公开测试用例。运行结果供自行核对，不代表通过原站判题。</p>}</section> : <Unavailable title={data.title} />;
    case 'Columns': return <div className="edu-columns">{(data.comps || []).map((child: Data, i: number) => <div key={child.content?.comp_id || i} style={{ width: `${child.width || 100 / Math.max(1, data.comps?.length || 1)}%` }}><Component component={child} index={i} {...common} /></div>)}</div>;
    case 'JsHtml': return <WebExample data={{ ...data, jotted: { files: [{ type:'html', content: data.html_code || '' }, { type:'css', content: data.css_code || '' }, { type:'js', content: data.js_code || '' }] } }} id={id} {...common} />;
    case 'RunJS': return <WebExample data={data} id={id} {...common} />;
    case 'Graphviz': case 'SequenceDiagrams': return data.svg_string ? <SvgFrame svg={data.svg_string} height={Number(data.height || 350)} /> : <Markdown text={'```text\n' + (data.text || '') + '\n```'} />;
    case 'CanvasAnimation': return mode === 'article' ? <ArticleAnimation data={data}/> : <Animation data={data} {...common} />;
    case 'EducativeArray': case 'Stack': case 'BinaryTree': case 'Matrix': case 'CanvasText': case 'MxGraph': return <Diagram data={data} type={type} />;
    case 'MarkMap': return <Suspense fallback={<p className="edu-help">正在加载知识导图…</p>}><LazyMindMap data={data} /></Suspense>;
    case 'Video': return data.file || data.url ? <MediaVideo src={data.file || data.url} /> : <Unavailable title={data.title} />;
    default: return data.text ? <Markdown text={data.text} /> : data.components ? <Content components={data.components} {...common} /> : <Unavailable title={data.title || type} />;
  }
}
function Unavailable({ title }: { title?: string }) { return <div className="edu-unavailable">{title && <strong>{title}</strong>}<p>这部分原始内容暂未获取，可继续学习其他内容。</p></div>; }
export function Content({ components, answers, onAnswer, mode }: ContentProps) {
  const inheritedMode = useContext(ContentMode);
  return <ContentMode.Provider value={mode || inheritedMode}><div className="edu-content">{(Array.isArray(components) ? components : []).map((component, index) => <Component key={component.content?.comp_id || `${component.type}-${index}`} component={component} index={index} answers={answers} onAnswer={onAnswer} />)}</div></ContentMode.Provider>;
}
export default Content;
