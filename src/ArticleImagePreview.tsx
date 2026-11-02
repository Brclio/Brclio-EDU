import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import './article-image-preview.css';

type Point = { x: number; y: number };
type IconName = 'eye' | 'close' | 'zoom-in' | 'zoom-out' | 'rotate-right' | 'rotate-left';
const origin: Point = { x: 0, y: 0 };
function PreviewIcon({ name }: { name: IconName }) {
  return <span className="article-preview-icon"><svg width="1em" height="1em" fill="currentColor" aria-hidden="true"><use href={`/content/site-ui/image-preview-icons.svg#${name}`} /></svg></span>;
}

/** Matches the source Ant Image viewer: integer zoom, quarter turns and bounded drag. */
export default function ArticleImagePreview({ src, alt = '', onClose, previewOrigin }: { src: string; alt?: string; onClose: () => void; previewOrigin?: Point }) {
  const [scale, setScale] = useState(1), [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<Point>(origin), [moving, setMoving] = useState(false), [closing, setClosing] = useState(false);
  const image = useRef<HTMLImageElement>(null), container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const live = useRef({ scale, rotation, position, onClose });
  live.current = { scale, rotation, position, onClose };
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => live.current.onClose(), 200);
  };
  const zoom = (direction: number) => { setScale(value => Math.max(1, value + direction)); setPosition(origin); };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    container.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    const wheel = (event: WheelEvent) => { event.preventDefault(); if (event.deltaY) zoom(event.deltaY > 0 ? -1 : 1); };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('wheel', wheel);
      document.body.style.overflow = overflow;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      previousFocus?.focus();
    };
  }, []);
  const move = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointer) return;
    const next = { x: event.clientX - drag.current.x, y: event.clientY - drag.current.y };
    live.current.position = next; setPosition(next);
  };
  const release = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointer) return;
    drag.current = null; setMoving(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const element = image.current;
    if (!element) return;
    const state = live.current, rotated = Math.abs(state.rotation % 180) === 90;
    const width = (rotated ? element.offsetHeight : element.offsetWidth) * state.scale;
    const height = (rotated ? element.offsetWidth : element.offsetHeight) * state.scale;
    if (width <= innerWidth && height <= innerHeight) { setPosition(origin); return; }
    const rect = element.getBoundingClientRect(), next = { ...state.position };
    // Preserve source behavior: oversize axes cannot expose an empty edge, while
    // the shorter axis snaps back only when dragged beyond the viewport.
    for (const [axis, start, size, viewport] of [['x', rect.left, width, innerWidth], ['y', rect.top, height, innerHeight]] as const) {
      const half = (size - viewport) / 2;
      if (size > viewport) {
        if (start > 0) next[axis] = half;
        else if (start + size < viewport) next[axis] = -half;
      } else if (start < 0 || start + size > viewport) next[axis] = start < 0 ? half : -half;
    }
    setPosition(next);
  };
  const tools: { name: IconName; label: string; action: () => void; disabled?: boolean }[] = [
    { name: 'close', label: '关闭预览', action: close },
    { name: 'zoom-in', label: '放大', action: () => zoom(1) },
    { name: 'zoom-out', label: '缩小', action: () => zoom(-1), disabled: scale === 1 },
    { name: 'rotate-right', label: '向右旋转', action: () => setRotation(value => value + 90) },
    { name: 'rotate-left', label: '向左旋转', action: () => setRotation(value => value - 90) },
  ];
  return createPortal(<div className={`article-image-preview-root${closing ? ' article-preview-closing' : ''}`}>
    <div className="article-image-preview-mask" />
    <div ref={container} role="dialog" aria-modal="true" aria-label="图片预览" tabIndex={-1} className={`article-image-preview-wrap${moving ? ' article-preview-moving' : ''}`} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="article-image-preview-body" style={{ transformOrigin: previewOrigin ? `${previewOrigin.x}px ${previewOrigin.y}px` : undefined }}>
        <ul className="article-image-preview-operations">{tools.map(tool => <li key={tool.name}><button type="button" aria-label={tool.label} disabled={tool.disabled} onClick={tool.action}><PreviewIcon name={tool.name} /></button></li>)}</ul>
        <div className="article-image-preview-image-wrapper" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
          <img ref={image} src={src} alt={alt} draggable={false} className="article-image-preview-image" style={{ transform: `scale3d(${scale}, ${scale}, 1) rotate(${rotation}deg)` }} onClick={event => event.stopPropagation()} onDoubleClick={() => { setScale(1); setPosition(origin); }} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); drag.current = { x: event.clientX - position.x, y: event.clientY - position.y, pointer: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); setMoving(true); }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} />
        </div>
      </div>
    </div>
  </div>, document.body);
}

export function ArticlePreviewImage({ src, alt = '', width, hasBorder, borderColor }: { src: string; alt?: string; width?: number | string; hasBorder?: boolean; borderColor?: string }) {
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false);
  const [previewOrigin, setPreviewOrigin] = useState<Point>();
  useEffect(() => { setOpen(false); setFailed(false); }, [src]);
  return <><div className="article-preview-trigger" style={{ width }} role="button" tabIndex={0} aria-label={alt ? `预览图片：${alt}` : '预览图片'} onClick={event => { if (!failed) { setPreviewOrigin({ x: event.clientX, y: event.clientY }); setOpen(true); } }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!failed) { setPreviewOrigin(undefined); setOpen(true); } } }}>
    <img src={src} alt={alt} onError={() => setFailed(true)} style={hasBorder !== false ? { borderWidth: 1, borderStyle: 'solid', borderColor } : { border: 0 }} />
    {!failed && <span className="article-preview-hover"><span><PreviewIcon name="eye" />Preview</span></span>}
  </div>{open && <ArticleImagePreview src={src} alt={alt} previewOrigin={previewOrigin} onClose={() => setOpen(false)} />}</>;
}
