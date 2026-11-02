import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Content from './Content';
import SourceEditor, { sourceLanguageLabel } from './SourceEditor';
import { EditorHelpLauncher } from './EditorHelp';
import { needsServer, RemoteCodeRunner, runtimeLanguage, type CodeRunner } from './execution';
import { updateLesson, useProgress } from './progress';
import './challenge-dialog.css';
type Data = Record<string, any>;
const markdown = (text: string, id: string) => ({ type: 'Markdown', content: { text, comp_id: id } });
function description(data: Data) {
  const sections = [markdown(data.problem_statement_md || '', 'problem')];
  for (const [field, title] of [['input_format_md', '输入格式'], ['constraints_md', '限制条件'], ['output_format_md', '输出格式']]) if (data[field]?.trim()) sections.push(markdown(`### ${title}\n${data[field]}`, field));
  const samples = (data.testcases || []).filter((test: Data) => test.sample).slice(0, 3);
  samples.forEach((test: Data, i: number) => { const suffix = samples.length > 1 ? `-${i + 1}` : ''; let text = ''; if (test.stdin?.trim()) text += `### 示例输入${suffix}\n\`\`\`text\n${test.stdin}\n\`\`\`\n`; if (test.expected_output?.trim()) text += `### 示例输出${suffix}\n\`\`\`text\n${test.expected_output}\n\`\`\`\n`; if (test.explanation?.trim()) text += `> **解释**:\n${test.explanation}`; sections.push(markdown(text, `sample-${i}`)); });
  return sections;
}

export default function ChallengeDialog({ courseId, challengeId, onClose, hideAnswer = false }: { courseId: string; challengeId: number; onClose: () => void; hideAnswer?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<CodeRunner | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { progress } = useProgress();
  const lessonId = `challenge-${challengeId}`;
  const saved = progress.lessons[`${courseId}:${lessonId}`];
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [files, setFiles] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState('');
  const [tab, setTab] = useState('problem');
  const [confirm, setConfirm] = useState<'close' | 'reset' | null>(null);
  const [answer, setAnswer] = useState(false);
  const [answerClosing, setAnswerClosing] = useState(false);
  const closeAnswer = () => { setAnswerClosing(true); setTimeout(() => { setAnswer(false); setAnswerClosing(false); }, 400); };
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');
  const [results, setResults] = useState<Data[] | null>(null);
  const [history, setHistory] = useState<Data[]>(saved?.answers?.__submissions || []);
  const [artifacts, setArtifacts] = useState<Data[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const template = data?.code_templates?.[0] || {};
  const extraFiles: Data[] = template.additional_files || [];
  const visibleFiles = extraFiles.filter(file => !file.hidden);
  const active = visibleFiles.find(file => (file.file_name || file.name) === activeFile);
  const passed = Boolean(!error && results?.length && results.every(result => result.succeeded));
  const stop = () => { worker.current?.terminate(); worker.current = null; if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = () => { if (passed) onClose(); else setConfirm('close'); };
  useEffect(() => {
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.current?.showModal();
    const controller = new AbortController();
    fetch(`/content/challenges/${challengeId}.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw Error('挑战加载失败'); return response.json(); }).then(value => {
      setData(value); const initial = value.code_templates[0]; const stored = saved?.answers?.[`challenge-${challengeId}:code:0`]; setCode(stored?.code ?? initial.template ?? ''); setFiles(stored?.files || {});
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => { controller.abort(); stop(); document.body.style.overflow = before; };
  }, [challengeId]);
  const run = () => {
    if (busy || !code.trim() || !data) return;
    stop(); setBusy(true); setError(''); setOutput(''); setResults(null); setArtifacts([]); setPlots([]); setStatus('正在加载运行环境…');
    const language = runtimeLanguage(template.language);
    const runCode = [template.template_head || template.prepend_code || '', code, template.template_tail || template.append_code || ''].filter(Boolean).join('\n');
    const allFiles = extraFiles.map(file => ({ ...file, content: files[file.file_name || file.name] ?? file.content }));
    const remote = needsServer(language, runCode, allFiles);
    const runner: CodeRunner = remote ? new RemoteCodeRunner() : new Worker(new URL('./python-worker.js', import.meta.url), { type: 'module' });
    worker.current = runner;
    let testResults: Data[] = []; let stdout = '';
    const finish = (failure = '') => {
      if (worker.current !== runner) return;
      const correct = !failure && testResults.length > 0 && testResults.every(test => test.succeeded);
      const entry = { at: new Date().toISOString(), code, files, correct, output: stdout, error: failure, testResults };
      const submissions = [entry, ...history].slice(0, 20);
      setHistory(submissions); setResults(testResults); setError(failure); setStatus(failure ? '运行出错' : testResults.length ? correct ? '答案正确' : '答案错误' : '运行结束'); setBusy(false); setTab('result');
      updateLesson(courseId, lessonId, { completed: saved?.completed || Boolean(correct), answers: { ...saved?.answers, [`challenge-${challengeId}:code:0`]: { code, files, checked: testResults.length > 0, correct: Boolean(correct), testResults }, __submissions: submissions } });
      stop();
    };
    const timeout = (delay: number) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => finish('程序运行超时，已停止。'), delay); };
    timeout(120000);
    runner.onmessage = ({ data: message }) => {
      if (worker.current !== runner) return;
      if (message.type === 'status') setStatus(message.value);
      if (message.type === 'running') { setStatus('运行中…'); timeout(remote ? 70000 : 20000); }
      if (message.type === 'stdout' || message.type === 'stderr') { stdout = (stdout + message.value + '\n').slice(-100000); setOutput(stdout); }
      if (message.type === 'testResults') testResults = message.value;
      if (message.type === 'plots') setPlots(message.value);
      if (message.type === 'files') setArtifacts((message.value || []).filter((file: Data) => /^(blob:|data:)/.test(file.url)));
      if (message.type === 'error') finish(message.value);
      if (message.type === 'done') finish();
    };
    runner.onerror = event => finish(event.message || '运行环境加载失败');
    runner.postMessage({ language, sourceLanguage: template.language, code: runCode, files: allFiles, testcases: data.testcases || [], stdin: '' });
  };
  // A result belongs to the submitted source, never to a later edit or reset.
  // Submission history and the previously earned completion stay in progress.
  const invalidateResult = () => {
    setResults(null); setError(''); setStatus(''); setOutput(''); setArtifacts([]); setPlots([]);
    setTab(previous => previous === 'result' ? 'problem' : previous);
  };
  const reset = () => { stop(); setBusy(false); setCode(template.template || ''); setFiles({}); invalidateResult(); setConfirm(null); };
  const md = (components: Data[]) => <Content components={components} answers={{}} onAnswer={() => {}} mode="solo" />;
  return createPortal(<dialog ref={dialog} className="challenge-dialog" aria-label="课程挑战" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="challenge-header"><div><button aria-label="关闭挑战" className="challenge-close" onClick={close}><svg width="24" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1L11 11M11 1L1 11" stroke="#2D3846" strokeWidth="1.8" strokeLinecap="round" /></svg></button><span>{data?.title || '挑战练习'}</span>{data?.difficulty && <small>{data.difficulty}</small>}</div><div>{data && code !== template.template && <button onClick={() => setConfirm('reset')}>重置代码</button>}{data && !hideAnswer && <button onClick={() => setAnswer(true)}>查看答案</button>}<button className="challenge-primary" aria-label={busy ? '运行中…' : '运行代码 ▶'} disabled={busy || !data || !code.trim()} onClick={run}>{busy ? '运行中…' : <>{'运行代码 \u00a0'}<svg width="11" height="14" viewBox="0 0 11 14" aria-hidden="true"><path d="M10.5 6.13397C11.1667 6.51888 11.1667 7.48112 10.5 7.86602L1.5 13.0622C0.833332 13.4471 3.43203e-07 12.966 3.76852e-07 12.1962L8.31114e-07 1.80385C8.64763e-07 1.03405 0.833334 0.552922 1.5 0.937822L10.5 6.13397Z" fill="currentColor" /></svg></>}</button></div></header>
    {!data ? <p role={error ? 'alert' : 'status'}>{error || '正在加载挑战…'}</p> : <div className="challenge-body"><section className="challenge-left"><div className="challenge-tabs" role="tablist" aria-label="挑战内容">{[['problem', '题目描述'], ...(results ? [['result', '测试结果']] : []), ['log', '提交记录']].map(([key, title]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{title}</button>)}</div><div className="challenge-description">
      {tab === 'problem' && <>{md(description(data))}{data.hint_md?.trim() && <aside className="challenge-hint"><img src="/content/site-ui/challenge-hint.svg" alt="" />{md([markdown(data.hint_md, 'hint')])}</aside>}</>}
      {tab === 'result' && <div className="challenge-results"><p role="status">{status}</p>{error && <pre role="alert">{error}</pre>}{results?.map((result, i) => <details key={i} open={!result.succeeded}><summary>{result.succeeded ? '✓' : '×'} 测试用例 {result.case_no || i + 1}</summary>{[['输入', result.input], ['预期输出', result.expected_output], ['实际输出', result.actual_output], ['说明', result.reason]].map(([title, text]) => text != null && <div key={title}><h4>{title}</h4><pre>{text}</pre></div>)}</details>)}{!results?.length && <><p>当前题目未提供公开测试用例，运行输出供自行核对。</p><pre aria-label="运行结果">{output}</pre></>}{plots.map((plot, i) => <img key={i} src={plot} alt={`运行图表 ${i + 1}`} />)}{artifacts.map(file => <a key={file.name} href={file.url} download={file.name}>{file.name}</a>)}</div>}
      {tab === 'log' && <div className="challenge-history">{history.length ? history.map((entry, i) => <details key={`${entry.at}-${i}`}><summary>{new Date(entry.at).toLocaleString('zh-CN')}　{entry.correct ? '通过' : entry.error ? '运行出错' : '未通过'}</summary><pre>{entry.code}</pre>{entry.error && <p>{entry.error}</p>}</details>) : <p>暂无提交记录</p>}</div>}
    </div></section><section className="challenge-right" aria-label="挑战代码编辑器"><div className="challenge-code-header"><div className="challenge-file-tabs">{template.file_name && <button aria-pressed={!activeFile} onClick={() => setActiveFile('')}>{template.file_name}</button>}{visibleFiles.map(file => <button key={file.file_name || file.name} aria-pressed={activeFile === (file.file_name || file.name)} onClick={() => setActiveFile(file.file_name || file.name)}>{file.file_name || file.name}</button>)}</div><details className="challenge-mode"><summary>用例模式</summary><p>1. 判题引擎自动给出输入，运行提交代码，需处理 input 及 输出内容；<br />2. 判题标准: 代码运行不报错且输出内容与测试用例匹配，则正确；<br />3. 可修改模板代码，保证输出与测试用例输出匹配 即可。</p></details><span className="challenge-language">{sourceLanguageLabel(template.language)}</span></div><div className="challenge-editor"><SourceEditor key={activeFile} value={active ? files[activeFile] ?? active.content ?? '' : code} language={template.language} engine="monaco" fullscreen readOnly={busy || Boolean(active?.read_only)} onChange={value => { invalidateResult(); if (active) setFiles(previous => ({ ...previous, [activeFile]: value })); else setCode(value); }} /></div>{passed && <footer className="challenge-success"><strong>实践出真知!</strong><span>完成挑战</span><button onClick={onClose}>继续</button></footer>}{busy && <div className="challenge-running" role="status">{status}</div>}</section></div>}
    {answer && <div className={`challenge-answer-backdrop ${answerClosing ? 'is-closing' : ''}`} onClick={closeAnswer}><section className="challenge-answer" role="dialog" aria-label="答案" onClick={event => event.stopPropagation()}><header><button aria-label="‹ 隐藏" onClick={closeAnswer}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15.0711 4.99998L11.5355 8.53551L8 12.071L15.0711 19.1421" stroke="#6B7F99" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>隐藏</button><span>答案</span></header><div className="challenge-answer-body"><SourceEditor value={template.solution_code || ''} engine="monaco" language={template.language} fullscreen readOnly /></div></section></div>}
    <EditorHelpLauncher request={{ courseId, lessonId, code, hints: data?.hint_md ? [data.hint_md] : [], solution: hideAnswer ? undefined : template.solution_code }} />
    {confirm && <div className="challenge-confirm-backdrop"><section className="challenge-confirm" role="dialog" aria-label={confirm === 'close' ? '你确认要退出吗?' : '重置代码'}><h2>{confirm === 'close' ? '你确认要退出吗?' : '重置代码'}<button aria-label="关闭确认" onClick={() => setConfirm(null)}><svg width="24" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1L11 11M11 1L1 11" stroke="#2D3846" strokeWidth="1.8" strokeLinecap="round" /></svg></button></h2><div className="challenge-confirm-body"><p>{confirm === 'close' ? '退出后，你输入的数据将不会被保存' : '重置后，你输入的代码将被清空'}</p><div><button onClick={() => confirm === 'close' ? onClose() : setConfirm(null)}>{confirm === 'close' ? '退出' : '取消'}</button><button className="challenge-primary" onClick={() => confirm === 'close' ? setConfirm(null) : reset()}>{confirm === 'close' ? '继续解决问题' : '确定'}</button></div></div></section></div>}
  </dialog>, document.body);
}
