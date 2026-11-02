import { Children, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './article-glossary.css';

export default function ArticleGlossary({ title, description }: { title: string; description: string }) {
  const id = useId(), trigger = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false), [closing, setClosing] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, bottom: false });
  const clear = () => { if (timer.current) clearTimeout(timer.current); if (exitTimer.current) clearTimeout(exitTimer.current); };
  const show = (delay = 100) => { clear(); timer.current = setTimeout(() => { setClosing(false); setOpen(true); }, delay); };
  const hide = (delay = 100) => { clear(); timer.current = setTimeout(() => { setClosing(true); exitTimer.current = setTimeout(() => { setOpen(false); setClosing(false); }, 200); }, delay); };
  useEffect(() => () => clear(), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !popup.current) return;
      const rect = trigger.current.getBoundingClientRect(), height = popup.current.offsetHeight;
      const bottom = rect.top - height - 4 < 0;
      setPosition({ left: Math.floor(Math.max(0, Math.min(innerWidth - 280, rect.left + rect.width / 2 - 140))) + scrollX, top: Math.round(bottom ? rect.bottom + 4 : rect.top - height - 4) + scrollY, bottom });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, title, description]);
  return <><span ref={trigger} className="article-glossary-term" tabIndex={0} aria-describedby={open ? id : undefined} onMouseEnter={() => show()} onMouseLeave={() => hide()} onFocus={() => show(0)} onBlur={() => hide()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); hide(0); } }}><u>{title}</u></span>{open && createPortal(<div ref={popup} className={`article-glossary-popover ${position.bottom ? 'article-glossary-bottom' : 'article-glossary-top'}${closing ? ' article-glossary-closing' : ''}`} style={{ left: position.left, top: position.top }} onMouseEnter={() => { clear(); setClosing(false); }} onMouseLeave={() => hide()}><div className="article-glossary-arrow"><span /></div><div className="article-glossary-inner" role="tooltip" id={id}><div className="article-glossary-title">{title}</div><div className="article-glossary-content"><div>{description}</div></div></div></div>, document.body)}</>;
}

/** Source Re.De only transforms string children of Markdown paragraphs. */
export function renderArticleGlossaryChildren(children: ReactNode): ReactNode {
  return Children.map(children, child => {
    if (typeof child !== 'string') return child;
    const pieces = child.split('#key#');
    if (pieces.length <= 1) return child;
    return pieces.map((piece, index) => {
      if (!/\S+:.+/.test(piece)) return piece;
      const [title, description] = piece.split(':');
      return <ArticleGlossary key={index} title={title} description={description} />;
    });
  });
}
