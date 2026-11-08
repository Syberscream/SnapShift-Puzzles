// Sound for the portal edition: background music (two looping tracks) and
// small synthesized effects. Music and sound can be switched off separately;
// the portal can also mute everything (CrazyGames setting, during ads).

const store = {
  get(k: string, d: boolean) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v === '1';
    } catch {
      return d;
    }
  },
  set(k: string, v: boolean) {
    try {
      localStorage.setItem(k, v ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  },
};

let musicOn = store.get('ssp_music', true);
let soundOn = store.get('ssp_sound', true);
let forcedMute = false; // portal says so (ad playing, CrazyGames mute setting)

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// ---------- music ----------

type Track = 'menu' | 'game';
const tracks: Partial<Record<Track, HTMLAudioElement>> = {};
let current: Track | null = null;
let wanted: Track | null = null;
const MUSIC_VOL = 0.38;

function el(t: Track): HTMLAudioElement {
  let a = tracks[t];
  if (!a) {
    a = new Audio(`./music/${t}.mp3`);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    tracks[t] = a;
  }
  return a;
}

function fade(a: HTMLAudioElement, to: number, ms = 600, then?: () => void) {
  const from = a.volume;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

function apply() {
  const play = musicOn && !forcedMute && !document.hidden ? wanted : null;
  for (const [t, a] of Object.entries(tracks) as [Track, HTMLAudioElement][]) {
    if (t !== play && !a.paused) fade(a, 0, 500, () => a.pause());
  }
  if (play) {
    const a = el(play);
    if (a.paused) {
      a.play().then(
        () => fade(a, MUSIC_VOL, 900),
        () => {
          /* not allowed until the player taps; unlock() retries */
        },
      );
    } else fade(a, MUSIC_VOL, 400);
  }
  current = play;
}

export const music = {
  play(t: Track) {
    wanted = t;
    apply();
  },
  get on() {
    return musicOn;
  },
  set on(v: boolean) {
    musicOn = v;
    store.set('ssp_music', v);
    apply();
  },
};

/** Browsers only start audio after a tap: call on the first interaction. */
export function unlockAudio() {
  ac();
  if (wanted && current !== null) {
    const a = tracks[wanted];
    if (a?.paused) apply();
  } else apply();
}

export function setForcedMute(v: boolean) {
  forcedMute = v;
  apply();
}

document.addEventListener('visibilitychange', apply);

// ---------- effects ----------

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(at: number, dur: number, gain = 0.05, freq = 2000) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const can = () => soundOn && !forcedMute;
// C major pentatonic, rising with the combo.
const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];

export const sfx = {
  get on() {
    return soundOn;
  },
  set on(v: boolean) {
    soundOn = v;
    store.set('ssp_sound', v);
  },
  click() {
    if (can()) tone(880, 0, 0.06, 'triangle', 0.05, 1200);
  },
  pick() {
    if (can()) tone(520, 0, 0.07, 'sine', 0.06, 760);
  },
  swap() {
    if (!can()) return;
    tone(330, 0, 0.09, 'triangle', 0.07, 520);
    noise(0, 0.05, 0.03, 3000);
  },
  rotate() {
    if (!can()) return;
    tone(440, 0, 0.07, 'triangle', 0.05, 620);
  },
  correct(combo: number, n = 1) {
    if (!can()) return;
    const f = SCALE[Math.min(SCALE.length - 1, combo)];
    tone(f, 0, 0.22, 'sine', 0.09);
    tone(f * 2, 0.02, 0.18, 'sine', 0.03);
    if (n > 1) tone(f * 1.25, 0.07, 0.22, 'sine', 0.07);
  },
  combo() {
    if (!can()) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.05, 0.16, 'triangle', 0.05));
  },
  denied() {
    if (can()) tone(200, 0, 0.14, 'square', 0.035, 140);
  },
  hint() {
    if (!can()) return;
    [1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.25, 'sine', 0.06));
  },
  star(i: number) {
    if (!can()) return;
    const base = [784, 988, 1175][i] ?? 1175;
    tone(base, 0, 0.35, 'triangle', 0.09);
    tone(base * 1.5, 0.04, 0.3, 'sine', 0.05);
    noise(0, 0.12, 0.025, 6000);
  },
  win() {
    if (!can()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.4, 'triangle', 0.08));
    tone(262, 0, 0.6, 'sine', 0.06);
  },
  unlock() {
    if (!can()) return;
    [659, 880, 1319].forEach((f, i) => tone(f, i * 0.07, 0.3, 'sine', 0.07));
  },
  whoosh() {
    if (can()) noise(0, 0.18, 0.04, 1200);
  },
};
