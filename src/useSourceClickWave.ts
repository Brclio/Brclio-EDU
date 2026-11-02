import { useEffect, useRef, type MouseEvent } from 'react';
import './source-click-wave.css';

type Wave = {
  timer?: ReturnType<typeof setTimeout>;
  frame?: number;
  animationStart: boolean;
  reset: () => void;
  start: (event: Event) => void;
  end: (event: Event) => void;
};

/** The original Ant button wave, including the next-task restart on repeated clicks. */
export default function useSourceClickWave() {
  const waves = useRef(new Map<HTMLButtonElement, Wave>());
  useEffect(() => () => {
    for (const wave of waves.current.values()) { if (wave.timer) clearTimeout(wave.timer); if (wave.frame) cancelAnimationFrame(wave.frame); wave.reset(); }
    waves.current.clear();
  }, []);
  return {
    'data-source-click-wave': true,
    onClickCapture(event: MouseEvent<HTMLButtonElement>) {
      const button = event.currentTarget;
      if (button.disabled) return;
      let wave = waves.current.get(button);
      if (!wave) {
        const created: Wave = {
          animationStart: false,
          reset() {
            button.dataset.sourceWave = 'false';
            for (const type of ['animation', 'transition']) { button.removeEventListener(`${type}start`, created.start); button.removeEventListener(`${type}end`, created.end); }
          },
          start(e) { if (e.target === button && !created.animationStart) created.reset(); },
          end(e) { if ((e as AnimationEvent).animationName === 'source-button-wave-fade') created.reset(); },
        };
        wave = created; waves.current.set(button, wave);
      }
      wave.reset();
      const color = getComputedStyle(button).borderTopColor, rgb = color.match(/\d+/g);
      button.style.setProperty('--source-wave-color', rgb && (rgb[0] !== rgb[1] || rgb[1] !== rgb[2]) ? color : '#3b82f6');
      if (wave.timer) clearTimeout(wave.timer);
      if (wave.frame) cancelAnimationFrame(wave.frame);
      const active = wave;
      active.animationStart = true;
      let remaining = 10;
      const nextFrame = () => { if (--remaining === 0) { active.animationStart = false; active.frame = undefined; } else active.frame = requestAnimationFrame(nextFrame); };
      active.frame = requestAnimationFrame(nextFrame);
      active.timer = setTimeout(() => {
        active.timer = undefined; button.dataset.sourceWave = 'true';
        for (const type of ['animation', 'transition']) { button.addEventListener(`${type}start`, active.start); button.addEventListener(`${type}end`, active.end); }
      }, 0);
    },
  };
}
