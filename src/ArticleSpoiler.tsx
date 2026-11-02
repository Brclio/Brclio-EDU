import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import SourceIcon from './SourceIcon';
import useSourceClickWave from './useSourceClickWave';
import './article-spoiler.css';

type Spring = { position: number; velocity: number; from: number; target: number };
/** The published react-spring default: mass 1, tension 170, friction 26, 1ms integration. */
export function advanceSpoilerSpring(spring: Spring, elapsed: number) {
  const precision = spring.from === spring.target ? .005 : Math.min(1, .001 * Math.abs(spring.target - spring.from));
  const restVelocity = precision / 10;
  for (let tick = 0; tick < Math.ceil(elapsed); tick++) {
    if (Math.abs(spring.velocity) <= restVelocity && Math.abs(spring.target - spring.position) <= precision) {
      spring.position = spring.target; spring.velocity = 0; return true;
    }
    spring.velocity += (-.000001 * 170 * (spring.position - spring.target) - .001 * 26 * spring.velocity);
    spring.position += spring.velocity;
  }
  return false;
}

export default function ArticleSpoiler({ data, children }: { data: { show_icon?: boolean; show_hint_text?: string; hide_hint_text?: string }; children: ReactNode }) {
  const [open, setOpen] = useState(false), [height, setHeight] = useState(0);
  const panel = useRef<HTMLDivElement>(null), collapse = useRef<HTMLDivElement>(null);
  const wave = useSourceClickWave();
  const running = useRef(false), previousTime = useRef<number | undefined>(undefined);
  const values = useRef({ height: { position: 0, velocity: 0, from: 0, target: 0 }, opacity: { position: 0, velocity: 0, from: 0, target: 0 } });
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => { if (!cancelled && panel.current) setHeight(panel.current.offsetHeight); };
    const images = Array.from(panel.current?.querySelectorAll('img') || []);
    if (images.length) Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => { img.addEventListener('load', () => resolve(), { once: true }); img.addEventListener('error', () => resolve(), { once: true }); }))).then(() => { if (!cancelled) timer = setTimeout(measure, 300); });
    else measure();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);
  useLayoutEffect(() => {
    const element = collapse.current;
    if (!element) return;
    const h = values.current.height, o = values.current.opacity;
    h.from = h.position; h.target = open ? height + 8 : 0;
    o.from = o.position; o.target = open ? 1 : 0;
    if (h.position === h.target && o.position === o.target) return;
    const continuing = running.current;
    let frame = 0, previous = continuing ? previousTime.current : undefined;
    running.current = true;
    element.dataset.animating = 'true';
    const animate = (now: number) => {
      const elapsed = previous === undefined ? 16.667 : Math.min(64, now - previous); previous = now; previousTime.current = now;
      const heightDone = advanceSpoilerSpring(h, elapsed), opacityDone = advanceSpoilerSpring(o, elapsed);
      element.style.height = `${h.position}px`; element.style.opacity = String(o.position);
      if (heightDone && opacityDone) { delete element.dataset.animating; running.current = false; previousTime.current = undefined; }
      else frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); delete element.dataset.animating; };
  }, [open, height]);
  return <div className={`edu-spoiler article-spoiler${open ? ' is-open' : ''}`}><div className="article-spoiler-trigger"><button {...wave} type="button" className="article-spoiler-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{data.show_icon && <span className="edu-spoiler-icon"><SourceIcon name="alert" size={16} /></span>}<span>{open ? data.hide_hint_text || '隐藏提示' : data.show_hint_text || '显示提示'}</span></button></div><div ref={collapse} className="article-spoiler-collapse" style={{ height: 0, opacity: 0 }}><div ref={panel} className="edu-spoiler-panel">{children}</div></div></div>;
}
