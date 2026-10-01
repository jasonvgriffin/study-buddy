import { useEffect, useLayoutEffect } from 'react';
import { ensureIosHapticSwitch, pressFeedback } from './lib/feedback';

const PRESSABLE = 'button, a.btn, a.lesson-link, label.btn, .chip';

/** One listener for every button, plus the hidden switch iOS uses for a system tap. */
export function PressFeedback() {
  useLayoutEffect(() => {
    ensureIosHapticSwitch();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(PRESSABLE);
      if (!control || control.id === 'ios-haptic-switch') return;
      if (control instanceof HTMLButtonElement && control.disabled) return;
      pressFeedback();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  return null;
}
