let audioContext;
let lastClickAt = 0;
let userActivatedAudio = false;
//
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) {
    try { audioContext = new AudioContextClass(); }
    catch { return null; }
  }
  return audioContext;
}

export function unlockUiSounds() {
  userActivatedAudio = true;
  const context = getAudioContext();
  if (!context || context.state === 'running') return Promise.resolve();
  return context.resume().catch(() => {});
}

function note(context, {
  frequency,
  endFrequency = frequency,
  delay = 0,
  duration = 0.16,
  volume = 0.012,
  wave = 'sine',
  partial = 0,
  filterFrequency = 4200
}) {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.012, duration * 0.22));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(filter);
  filter.connect(envelope);
  envelope.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);

  if (partial > 0) {
    note(context, {
      frequency: frequency * 2.01,
      endFrequency: endFrequency * 2.01,
      delay,
      duration: duration * 0.62,
      volume: volume * partial,
      wave: 'sine',
      filterFrequency: 7000
    });
  }
}

function playSound(context, kind) {
  if (kind === 'cut') {
    const now = performance.now();
    if (now - lastClickAt < 25) return;
    lastClickAt = now;
    note(context, { frequency: 880, endFrequency: 360, duration: 0.038, volume: 0.02, wave: 'triangle', filterFrequency: 3400 });
    note(context, { frequency: 1600, endFrequency: 680, duration: 0.016, volume: 0.003, wave: 'sine', filterFrequency: 5600 });
    return;
  }

  if (kind === 'click') {
    const now = performance.now();
    if (now - lastClickAt < 42) return;
    lastClickAt = now;
    note(context, { frequency: 540, endFrequency: 330, duration: 0.052, volume: 0.018, wave: 'triangle', filterFrequency: 2400 });
    note(context, { frequency: 1460, endFrequency: 930, duration: 0.018, volume: 0.0028, wave: 'sine', filterFrequency: 5500 });
    return;
  }

  if (kind === 'success') {
    note(context, { frequency: 392, duration: 0.19, volume: 0.012, partial: 0.16 });
    note(context, { frequency: 587.33, delay: 0.085, duration: 0.24, volume: 0.014, partial: 0.2 });
    return;
  }

  if (kind === 'error') {
    note(context, { frequency: 311.13, endFrequency: 277.18, duration: 0.15, volume: 0.014, wave: 'triangle', filterFrequency: 1800 });
    note(context, { frequency: 233.08, delay: 0.12, endFrequency: 207.65, duration: 0.2, volume: 0.012, wave: 'triangle', filterFrequency: 1600 });
    return;
  }

  if (kind === 'warning') {
    note(context, { frequency: 440, endFrequency: 415.3, duration: 0.12, volume: 0.011, wave: 'triangle', filterFrequency: 2200 });
    note(context, { frequency: 369.99, delay: 0.14, duration: 0.16, volume: 0.009, wave: 'triangle', filterFrequency: 1900 });
    return;
  }

  // neutral
  note(context, { frequency: 493.88, duration: 0.13, volume: 0.009, partial: 0.12, filterFrequency: 3200 });
  note(context, { frequency: 440, delay: 0.075, duration: 0.16, volume: 0.008, partial: 0.1, filterFrequency: 3000 });
}
//
export function playUiSound(kind = 'click') {
  if (!userActivatedAudio) return;
  const context = getAudioContext();
  if (!context) return;
  const play = () => playSound(context, kind);
  if (context.state === 'suspended') context.resume().then(play).catch(() => {});
  else play();
}
