// Small synthesized sound effects (no audio files to download).

let ctx: AudioContext | null = null;
let muted = localStorage.getItem('ss_muted') === '1';

export function isMuted() {
  return muted;
}
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem('ss_muted', v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

function ready(): boolean {
  if (muted) return false;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export const sfx = {
  swap() {
    if (ready()) tone(420, 0, 0.07, 'triangle', 0.05);
  },
  correct(n: number) {
    if (!ready()) return;
    tone(660, 0, 0.12, 'sine');
    if (n > 1) tone(880, 0.08, 0.14, 'sine');
  },
  win(medal: string) {
    if (!ready()) return;
    const notes = medal === 'gold' ? [523, 659, 784, 1047] : medal === 'silver' ? [523, 659, 784] : [523, 659];
    notes.forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.09));
  },
  denied() {
    if (ready()) tone(160, 0, 0.12, 'square', 0.03);
  },
};
