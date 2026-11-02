import { useEffect, useRef, useState } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/mode/python/python';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/css/css';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/addon/selection/mark-selection';
import './source-editor.css';

type Props = { value: string; language?: string; engine: 'monaco' | 'codemirror'; readOnly?: boolean; source?: boolean; fullscreen?: boolean; label?: string; highlightLines?: string; onChange?: (value: string) => void };
type EditorHandle = { getValue: () => string; setValue: (value: string) => void; focus: () => void };
declare global { interface HTMLElement { eduEditor?: EditorHandle } }
let monacoPromise: Promise<any> | undefined;
function loadMonaco(): Promise<any> {
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((resolve, reject) => {
    const host = window as any;
    if (host.monaco?.editor) { resolve(host.monaco); return; }
    const load = () => {
      host.require.config({ paths: { vs: '/runtime/monaco/vs' } });
      host.require(['vs/editor/editor.main'], () => resolve(host.monaco), reject);
    };
    if (host.require?.config) load();
    else {
      const script = document.createElement('script');
      script.src = '/runtime/monaco/vs/loader.js';
      script.onload = load;
      script.onerror = () => reject(new Error('代码编辑器加载失败，请刷新重试。'));
      document.head.append(script);
    }
  }).catch(error => { monacoPromise = undefined; throw error; });
  return monacoPromise;
}
export function sourceLanguageLabel(language: string) {
  const value = language.toLowerCase();
  return value === 'javascript' ? 'JS' : value.includes('python') ? 'PY' : value.includes('go') ? 'GO' : value.toUpperCase();
}
function monacoLanguage(language: string) {
  // Exact public source sl() mapping. Execution normalization is deliberately separate.
  const value = language.toLowerCase();
  return value.includes('python') || value === 'turtle' ? 'python' : value.includes('go') ? 'go' : value === 'c++' ? 'cpp' : value === 'nodejs' || value === 'js' ? 'javascript' : value === 'bash' ? 'shell' : value;
}

/** The original site uses Monaco 0.34.0 for solo lessons and CM 5.65.3 for articles. */
export default function SourceEditor({ value, language = 'python', engine, readOnly = false, source = false, fullscreen = false, label = '代码', highlightLines = '', onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef({ value, readOnly, onChange });
  current.current = { value, readOnly, onChange };
  const editor = useRef<any>(null);
  const changing = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = ref.current!;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const changed = () => { if (!changing.current) current.current.onChange?.(editor.current.getValue()); };
    const expose = (instance: any) => { element.eduEditor = instance; element.dataset.editorReady = 'true'; };
    if (engine === 'codemirror') {
      const instance = CodeMirror(element, {
        value: current.current.value, theme: 'monokai', lineNumbers: true,
        // The original article Code component sets Python mode for every language.
        mode: language === 'html' ? 'htmlmixed' : language,
        readOnly: current.current.readOnly, styleSelectedText: true,
        screenReaderLabel: label,
      } as CodeMirror.EditorConfiguration);
      editor.current = instance;
      instance.setSize(null, 'auto');
      instance.on('change', changed);
      // Preserve the original 1-second marker delay, zero-based indices, and trailing-whitespace => line 0 behavior.
      const highlights: CodeMirror.TextMarker[] = [];
      const highlightTimer = window.setTimeout(() => {
        if (highlightLines) highlightLines.split(/\s+/).map(Number).forEach(line => {
          try { highlights.push(instance.markText({ line, ch: 0 }, { line: line + 1, ch: 0 }, { className: 'edu-source-highlighted' })); } catch { /* Original ignores out-of-range marker definitions. */ }
        });
      }, 1000);
      const observer = new ResizeObserver(() => instance.refresh());
      observer.observe(element);
      expose(instance);
      dispose = () => { window.clearTimeout(highlightTimer); observer.disconnect(); instance.off('change', changed); highlights.forEach(mark => mark.clear()); instance.getWrapperElement().remove(); };
    } else {
      loadMonaco().then(monaco => {
        if (cancelled) return;
        const instance = monaco.editor.create(element, {
          value: current.current.value, language: monacoLanguage(language), theme: 'vs-dark',
          automaticLayout: true, readOnly: current.current.readOnly, fontSize: 16,
          minimap: { enabled: false }, scrollBeyondLastLine: false,
          ...(source ? { lineNumbers: 'off', folding: false, lineDecorationsWidth: 0, renderLineHighlight: 'none', overviewRulerBorder: false } : {}),
        });
        editor.current = instance;
        const changeListener = instance.onDidChangeModelContent(changed);
        const resize = () => { if (source) { element.style.height = `${instance.getModel().getLineCount() * 24}px`; instance.layout(); } };
        const sizeListener = instance.onDidContentSizeChange(resize);
        resize(); expose(instance);
        dispose = () => { changeListener.dispose(); sizeListener.dispose(); const model = instance.getModel(); instance.dispose(); model?.dispose(); };
      }).catch(cause => { if (!cancelled) setError(String(cause.message || cause)); });
    }
    return () => { cancelled = true; delete element.eduEditor; delete element.dataset.editorReady; dispose?.(); editor.current = null; };
  }, [engine, language, source, highlightLines]);
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    if (instance.getValue() !== value) {
      changing.current = true;
      if (engine === 'monaco') { const position = instance.getPosition(); instance.setValue(value); if (position) instance.setPosition(position); }
      else { const position = instance.getCursor(); instance.setValue(value); instance.setCursor(position); }
      changing.current = false;
    }
    if (engine === 'monaco') instance.updateOptions({ readOnly });
    else instance.setOption('readOnly', readOnly);
  }, [value, readOnly, engine]);
  return <div className={`edu-source-editor ${fullscreen ? 'edu-source-editor-full' : ''} ${source ? 'edu-source-editor-readonly' : ''}`} data-editor-engine={engine} aria-label={label} ref={ref}>{error && <p role="alert">{error}</p>}</div>;
}
