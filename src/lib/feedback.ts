const HAPTICS_KEY = 'study-buddy-haptics';
const SOUNDS_KEY = 'study-buddy-sounds';

/** Short tap used for presses and for a correct answer. */
export const TAP_MS = 12;
/** Two pulses. Android Chrome and Brave honor this pattern. */
export const WRONG_PATTERN = [60, 40, 60] as const;

const IOS_SWITCH_ID = 'ios-haptic-switch';

type AudioContextCtor = typeof AudioContext;

let audio: AudioContext | null = null;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode can refuse storage. The choice still applies for this visit via the caller.
  }
}

export function readHaptics(): boolean {
  return storageGet(HAPTICS_KEY) !== 'off';
}

export function writeHaptics(on: boolean): void {
  storageSet(HAPTICS_KEY, on ? 'on' : 'off');
}

export function readSounds(): boolean {
  return storageGet(SOUNDS_KEY) === 'on';
}

export function writeSounds(on: boolean): void {
  storageSet(SOUNDS_KEY, on ? 'on' : 'off');
}

function vibrateApi(): ((pattern: number | number[]) => boolean) | null {
  try {
    const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') return nav.vibrate.bind(nav);
  } catch {
    // Missing or throwing getters must not break a tap.
  }
  return null;
}

/** iOS 18+ plays a system haptic when a switch checkbox is toggled inside a user gesture. */
export function ensureIosHapticSwitch(): HTMLInputElement | null {
  try {
    if (typeof document === 'undefined') return null;
    const existing = document.getElementById(IOS_SWITCH_ID);
    if (existing instanceof HTMLInputElement) return existing;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = IOS_SWITCH_ID;
    input.className = 'ios-haptic-switch';
    input.tabIndex = -1;
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    document.body.appendChild(input);
    return input;
  } catch {
    return null;
  }
}

function iosSwitchTap(): void {
  try {
    const input = ensureIosHapticSwitch();
    input?.click();
  } catch {
    // The switch is a best-effort extra. Animation still runs.
  }
}

export function vibrate(pattern: number | number[]): void {
  if (!readHaptics()) return;
  try {
    const api = vibrateApi();
    if (api) {
      api(pattern);
      return;
    }
    iosSwitchTap();
  } catch {
    // Vibration can throw on some WebViews. Never surface that.
  }
}

/** Light tap for a button press or a correct answer. */
export function pressFeedback(): void {
  vibrate(TAP_MS);
}

function audioCtor(): AudioContextCtor | null {
  try {
    const w = window as Window & { webkitAudioContext?: AudioContextCtor };
    return window.AudioContext ?? w.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

/** Create or resume the audio context. Call only from a click, key, or pointer handler. */
export function audioContext(): AudioContext | null {
  if (!readSounds()) return null;
  try {
    const Ctor = audioCtor();
    if (!Ctor) return null;
    if (!audio) audio = new Ctor();
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
    return audio;
  } catch {
    return null;
  }
}

function tone(frequency: number, duration: number, type: OscillatorType, level: number): void {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // A missing destination or a closed context should not block grading.
  }
}

export function playDing(): void {
  tone(880, 0.12, 'sine', 0.05);
}

export function playBuzz(): void {
  tone(120, 0.16, 'square', 0.04);
}

/** Haptic plus the optional sound for a graded answer. Call from the gesture that submitted it. */
export function gradeFeedback(correct: boolean): void {
  try {
    if (correct) {
      vibrate(TAP_MS);
      playDing();
      return;
    }
    vibrate([...WRONG_PATTERN]);
    playBuzz();
  } catch {
    // Feedback is optional.
  }
}

/** Drop the cached context so tests can install a fresh mock. */
export function resetFeedbackState(): void {
  try {
    void audio?.close();
  } catch {
    // ignore
  }
  audio = null;
}
