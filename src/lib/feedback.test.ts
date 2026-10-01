// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TAP_MS,
  WRONG_PATTERN,
  ensureIosHapticSwitch,
  gradeFeedback,
  playBuzz,
  playDing,
  pressFeedback,
  readHaptics,
  readSounds,
  resetFeedbackState,
  writeHaptics,
  writeSounds,
} from './feedback';

class FakeOsc {
  type = 'sine';
  frequency = { value: 0 };
  connect() {}
  start() {}
  stop() {}
}

class FakeGain {
  gain = {
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  connect() {}
}

class FakeAudio {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => undefined);
  createOscillator() {
    return new FakeOsc();
  }
  createGain() {
    return new FakeGain();
  }
}

beforeEach(() => {
  localStorage.clear();
  resetFeedbackState();
  document.getElementById('ios-haptic-switch')?.remove();
  vi.unstubAllGlobals();
});

describe('feedback settings', () => {
  it('turns haptics on and sounds off until the learner changes them', () => {
    expect(readHaptics()).toBe(true);
    expect(readSounds()).toBe(false);
    writeHaptics(false);
    writeSounds(true);
    expect(readHaptics()).toBe(false);
    expect(readSounds()).toBe(true);
    writeHaptics(true);
    writeSounds(false);
    expect(readHaptics()).toBe(true);
    expect(readSounds()).toBe(false);
  });
});

describe('haptics', () => {
  it('uses a short tap for a press and the two-pulse pattern for a wrong answer', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    pressFeedback();
    gradeFeedback(false);
    gradeFeedback(true);
    expect(vibrate).toHaveBeenNthCalledWith(1, TAP_MS);
    expect(vibrate).toHaveBeenNthCalledWith(2, [...WRONG_PATTERN]);
    expect(vibrate).toHaveBeenNthCalledWith(3, TAP_MS);
  });

  it('does not vibrate when haptics are off, and never throws when the API is missing or throws', () => {
    writeHaptics(false);
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    pressFeedback();
    gradeFeedback(false);
    expect(vibrate).not.toHaveBeenCalled();

    writeHaptics(true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/130.0', maxTouchPoints: 0, vibrate: undefined });
    expect(() => {
      pressFeedback();
      gradeFeedback(false);
    }).not.toThrow();
    expect(document.getElementById('ios-haptic-switch')).toBeNull();

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', maxTouchPoints: 0 });
    expect(() => gradeFeedback(true)).not.toThrow();
    expect(document.getElementById('ios-haptic-switch')).toBeNull();

    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => pressFeedback()).not.toThrow();
  });

  it('toggles the iOS switch when vibration is unavailable', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      maxTouchPoints: 5,
    });
    const input = ensureIosHapticSwitch();
    expect(input?.checked).toBe(false);
    pressFeedback();
    expect(input?.checked).toBe(true);
    gradeFeedback(false);
    expect(input?.checked).toBe(false);
  });
});

describe('sounds', () => {
  it('stays silent until sounds are on, then builds a context from the call', () => {
    const created: FakeAudio[] = [];
    class TrackingAudio extends FakeAudio {
      constructor() {
        super();
        created.push(this);
      }
    }
    vi.stubGlobal('AudioContext', TrackingAudio);
    playDing();
    playBuzz();
    expect(created).toHaveLength(0);

    writeSounds(true);
    const tones: number[] = [];
    const proto = TrackingAudio.prototype.createOscillator;
    TrackingAudio.prototype.createOscillator = function createOscillator(this: FakeAudio) {
      const osc = proto.call(this);
      const set = (value: number) => {
        tones.push(value);
      };
      Object.defineProperty(osc.frequency, 'value', { set, get: () => 0 });
      return osc;
    };
    gradeFeedback(true);
    gradeFeedback(false);
    expect(created).toHaveLength(1);
    expect(created[0]?.resume).toHaveBeenCalled();
    expect(tones[0]).toBeGreaterThan(400);
    expect(tones[1]).toBeLessThan(200);
  });
});
