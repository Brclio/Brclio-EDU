import { useEffect, useRef, useState } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

/** Actual SVG markmap: branch collapse, dragging, wheel zoom and fit-to-view. */
export default function MindMap({ data }: { data: Record<string, any> }) {
  const svg = useRef<SVGSVGElement>(null), view = useRef<Markmap>(null);
  const [zoom, setZoom] = useState(100);
  const source = String(data.text || ''), height = Math.max(240, Number(data.height || 400));
  useEffect(() => {
    const transformer = new Transformer([]);
    // The original lesson is Markdown; do not enable executable embedded HTML.
    transformer.md.set({ html: false });
    const { root } = transformer.transform(source);
    const map = Markmap.create(svg.current!, { duration: 180, autoFit: true, maxWidth: 300, pan: true, zoom: true }, root);
    view.current = map;
    const makeAccessible = () => {
      for (const circle of svg.current?.querySelectorAll('circle') || []) {
        circle.setAttribute('role', 'button'); circle.setAttribute('tabindex', '0');
        const parent = circle.parentElement;
        circle.setAttribute('aria-label', `展开或收起 ${parent?.textContent || '导图分支'}`);
        circle.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); circle.dispatchEvent(new MouseEvent('click', { bubbles: true })); } };
      }
    };
    const observer = new MutationObserver(makeAccessible);
    observer.observe(svg.current!, { childList: true, subtree: true }); makeAccessible();
    const resize = new ResizeObserver(() => { void map.fit(); setZoom(100); });
    resize.observe(svg.current!);
    return () => { observer.disconnect(); resize.disconnect(); map.destroy(); view.current = null; };
  }, [source]);
  const scale = (factor: number) => { void view.current?.rescale(factor); setZoom(previous => Math.round(previous * factor)); };
  const reset = () => {
    const transformer = new Transformer([]); transformer.md.set({ html: false });
    void view.current?.setData(transformer.transform(source).root).then(() => view.current?.fit()); setZoom(100);
  };
  return <section className="edu-mindmap-interactive" aria-label={data.caption || '知识导图'}><div className="edu-mindmap-toolbar"><span>点击圆点展开或收起 · 拖动移动导图</span><button aria-label="缩小导图" onClick={() => scale(1 / 1.1)}>−</button><span>{zoom}%</span><button aria-label="放大导图" onClick={() => scale(1.1)}>＋</button><button aria-label="重置导图" onClick={reset}>重置导图</button></div><svg ref={svg} className="edu-markmap-svg" aria-label={data.caption || '知识导图'} style={{ display: 'block', width: '100%', height, background: '#fff' }} /></section>;
}
