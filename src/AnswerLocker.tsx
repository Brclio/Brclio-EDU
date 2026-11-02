import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './answer-locker.css';

/** Free local replacement for diamond unlock; submission uses the normal quiz path. */
export default function AnswerLocker({ onUseReference }: { onUseReference: () => boolean }) {
  const [open, setOpen] = useState(false), [unlocked, setUnlocked] = useState(false), [unavailable, setUnavailable] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); trigger.current?.focus(); };
  }, [open]);
  const useAnswer = () => { if (onUseReference()) { setUnlocked(true); setOpen(false); } else setUnavailable(true); };
  return <><button ref={trigger} type="button" className={`answer-locker${unlocked ? ' answer-locker-unlocked' : ''}`} aria-label="获取参考答案" onClick={() => setOpen(true)} />{open && createPortal(<div className="answer-locker-modal"><div className="answer-locker-main" role="dialog" aria-modal="true" aria-labelledby="answer-locker-title"><button ref={closeButton} type="button" className="answer-locker-close" aria-label="关闭参考答案" onClick={() => setOpen(false)} /><div className="answer-locker-diamond" /><div id="answer-locker-title" className="answer-locker-title">获取答案</div><div className="answer-locker-desc">本地课程可免费查看参考答案</div><div className="answer-locker-note">{unavailable ? '本题未提供完整参考答案，请继续自行作答' : '查看后会填入参考答案并提交本题'}</div><button className="answer-locker-action" onClick={useAnswer}>查看答案</button></div></div>, document.body)}</>;
}
