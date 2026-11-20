// Etsy prep, done in the admin's browser: AI upscaling (Real-ESRGAN with ONNX
// Runtime: the graphics card when there is WebGPU, otherwise every CPU core),
// the five frame-shape print files at 300 DPI, the listing photos, and a zip.
import { zipSync } from 'fflate';
import { ETSY, PRINT_SIZES, fullDescription, type PrintSize } from '@shared/etsy';

// ---------- the upscaler ----------

type Ort = typeof import('onnxruntime-web');
interface Engine {
  ort: Ort;
  session: import('onnxruntime-web').InferenceSession;
  gpu: boolean;
  tile: number;
}
let engine: Promise<Engine> | null = null;

/** Graphics card (WebGPU + JSPI) if this browser has it; else the CPU build. */
export function upscalerKind(): 'gpu' | 'cpu' {
  return 'gpu' in navigator && typeof (WebAssembly as unknown as { Suspending?: unknown }).Suspending === 'function' ? 'gpu' : 'cpu';
}

/** Does the graphics card actually answer? (Some browsers have WebGPU but no usable card.) */
export async function hasGpu(): Promise<boolean> {
  if (upscalerKind() !== 'gpu') return false;
  try {
    return !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadEngine(): Promise<Engine> {
  const tryLoad = async (gpu: boolean): Promise<Engine> => {
    const url = gpu ? '/ort/ort.jspi.min.mjs' : '/ort/ort.wasm.min.mjs';
    const ort = (await import(/* @vite-ignore */ new URL(url, location.href).href)) as Ort;
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)) : 1;
    const session = await ort.InferenceSession.create('/models/upscale-x4.onnx', {
      executionProviders: gpu ? ['webgpu'] : ['wasm'],
      graphOptimizationLevel: 'all',
    });
    return { ort, session, gpu, tile: gpu ? 256 : 128 };
  };
  if (await hasGpu()) {
    try {
      return await tryLoad(true);
    } catch (e) {
      console.warn('WebGPU upscaler failed, using the CPU', e);
    }
  }
  return tryLoad(false);
}
export const getEngine = () => (engine ??= loadEngine().catch((e) => ((engine = null), Promise.reject(e))));

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: false })!;
const free = (...cs: (HTMLCanvasElement | null | undefined)[]) => cs.forEach((c) => c && ((c.width = 0), (c.height = 0)));

/** How much bigger the picture must get for the largest print (the 3:2 file). */
export function neededScale(w: number, h: number): number {
  const portrait = h > w;
  let s = 0;
  for (const p of PRINT_SIZES) {
    const [tw, th] = portrait ? [p.h, p.w] : [p.w, p.h];
    const ar = tw / th;
    const cw = w / h > ar ? h * ar : w;
    s = Math.max(s, tw / cw);
  }
  return s;
}

/**
 * Upscale 4×, tile by tile. Returns a canvas 4× the (possibly reduced) input.
 * A picture that is already big enough is only reduced so we don't upscale more
 * than the prints need.
 */
export async function upscale(img: HTMLImageElement | HTMLCanvasElement, onProgress: (f: number) => void, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const W0 = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const H0 = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const need = neededScale(W0, H0);
  // A big, sharp picture (your own poster or blueprint) only needs a gentle
  // resize: shrinking it so the AI can blow it back up would soften fine lines and text.
  if (need <= 2 && Math.min(W0, H0) >= 2000) {
    const s = Math.max(1, need);
    const out = canvas(Math.round(W0 * s), Math.round(H0 * s));
    const oc = ctx2d(out);
    oc.imageSmoothingEnabled = true;
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(img, 0, 0, out.width, out.height);
    onProgress(1);
    return out;
  }
  // Feed the model only as much as it needs: 4× of the input should just cover the prints.
  let f = Math.min(1, need / 4);
  // Tests: a cap on the input size keeps the run short.
  try {
    const cap = Number(localStorage.getItem('ss_etsy_test_max'));
    if (cap > 0) f = Math.min(f, cap / Math.max(W0, H0));
  } catch {
    /* storage blocked */
  }
  const W = Math.round(W0 * f);
  const H = Math.round(H0 * f);
  const src = canvas(W, H);
  const sc = ctx2d(src);
  sc.fillStyle = '#fff';
  sc.fillRect(0, 0, W, H);
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(img, 0, 0, W, H);
  const pix = sc.getImageData(0, 0, W, H).data;
  free();
  const { ort, session, tile } = await getEngine();
  const S = 4;
  const PAD = 12;
  const out = canvas(W * S, H * S);
  const oc = ctx2d(out);
  const tiles: [number, number][] = [];
  for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) tiles.push([x, y]);
  let n = 0;
  for (const [x, y] of tiles) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const x0 = Math.max(0, x - PAD);
    const y0 = Math.max(0, y - PAD);
    const x1 = Math.min(W, x + tile + PAD);
    const y1 = Math.min(H, y + tile + PAD);
    const tw = x1 - x0;
    const th = y1 - y0;
    const data = new Float32Array(3 * tw * th);
    const plane = tw * th;
    for (let j = 0; j < th; j++)
      for (let i = 0; i < tw; i++) {
        const s = ((y0 + j) * W + (x0 + i)) * 4;
        const d = j * tw + i;
        data[d] = pix[s] / 255;
        data[d + plane] = pix[s + 1] / 255;
        data[d + 2 * plane] = pix[s + 2] / 255;
      }
    const input = new ort.Tensor('float32', data, [1, 3, th, tw]);
    const res = await session.run({ [session.inputNames[0]]: input });
    const o = res[session.outputNames[0]];
    const od = (await o.getData()) as Float32Array;
    input.dispose?.();
    o.dispose?.();
    const OW = tw * S;
    const ox = (x - x0) * S;
    const oy = (y - y0) * S;
    const cw = (Math.min(W, x + tile) - x) * S;
    const ch = (Math.min(H, y + tile) - y) * S;
    const id = new ImageData(cw, ch);
    const OP = OW * th * S;
    for (let j = 0; j < ch; j++)
      for (let i = 0; i < cw; i++) {
        const s = (oy + j) * OW + (ox + i);
        const d = (j * cw + i) * 4;
        id.data[d] = od[s] * 255 + 0.5;
        id.data[d + 1] = od[s + OP] * 255 + 0.5;
        id.data[d + 2] = od[s + 2 * OP] * 255 + 0.5;
        id.data[d + 3] = 255;
      }
    oc.putImageData(id, x * S, y * S);
    onProgress(++n / tiles.length);
    // Let the page breathe between tiles.
    if (n % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  free(src);
  return out;
}

// ---------- print files ----------

/** Canvas JPEGs say 72 DPI or nothing; print shops read 300 from the JFIF header. */
async function jpegAt300(c: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('Couldn’t make the JPEG (out of memory?)'))), 'image/jpeg', quality));
  const u = new Uint8Array(await b.arrayBuffer());
  // FF D8 FF E0 len 'JFIF\0' ver(2) units(1) Xdensity(2) Ydensity(2)
  if (u[2] === 0xff && u[3] === 0xe0 && u[6] === 0x4a && u[7] === 0x46 && u[8] === 0x49 && u[9] === 0x46) {
    u[13] = 1;
    u[14] = 300 >> 8;
    u[15] = 300 & 255;
    u[16] = 300 >> 8;
    u[17] = 300 & 255;
    return u;
  }
  // No JFIF header: add one.
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 300 >> 8, 300 & 255, 300 >> 8, 300 & 255, 0, 0]);
  const r = new Uint8Array(u.length + app0.length);
  r.set(u.subarray(0, 2));
  r.set(app0, 2);
  r.set(u.subarray(2), 2 + app0.length);
  return r;
}

/** The crop box for a frame shape, centred across the picture at `focus` (0..1). */
export function cropBox(w: number, h: number, ar: number, focus: number): [number, number, number, number] {
  if (w / h > ar) {
    const cw = Math.round(h * ar);
    const x = Math.min(Math.max(0, Math.round(w * focus - cw / 2)), w - cw);
    return [x, 0, cw, h];
  }
  const ch = Math.round(w / ar);
  return [0, Math.round((h - ch) / 2), w, ch];
}

/**
 * How a picture goes into a frame shape: crop to fill it (centred at `focus`),
 * or show the whole picture with a border of `bg` where the shape differs.
 */
export interface Place {
  focus: number;
  fit: boolean;
  bg: string;
}
const asPlace = (p: Place | number): Place => (typeof p === 'number' ? { focus: p, fit: false, bg: '#ffffff' } : p);

/** The colour around the picture's edge, for the border when it is shown whole. */
export function edgeColor(img: HTMLCanvasElement | HTMLImageElement): string {
  const N = 64;
  const c = canvas(N, N);
  const x = ctx2d(c);
  x.drawImage(img, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data;
  free(c);
  let r = 0, g = 0, b = 0, n = 0;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (i > 1 && i < N - 2 && j > 1 && j < N - 2) continue;
      const k = (j * N + i) * 4;
      r += d[k];
      g += d[k + 1];
      b += d[k + 2];
      n++;
    }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Draw the picture into a w×h area of `x` the way `place` says. */
function drawPlaced(x: CanvasRenderingContext2D, big: HTMLCanvasElement, w: number, h: number, place: Place) {
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  if (place.fit) {
    x.fillStyle = place.bg;
    x.fillRect(0, 0, w, h);
    const s = Math.min(w / big.width, h / big.height);
    const dw = Math.round(big.width * s);
    const dh = Math.round(big.height * s);
    x.drawImage(big, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    return;
  }
  const [sx, sy, sw, sh] = cropBox(big.width, big.height, w / h, place.focus);
  x.drawImage(big, sx, sy, sw, sh, 0, 0, w, h);
}

export interface PrintFile {
  name: string;
  size: PrintSize;
  bytes: Uint8Array;
  w: number;
  h: number;
}

export async function printFiles(big: HTMLCanvasElement, prefix: string, place: Place | number, onFile?: (i: number) => void): Promise<PrintFile[]> {
  const P = asPlace(place);
  const portrait = big.height > big.width;
  const files: PrintFile[] = [];
  for (const [i, p] of PRINT_SIZES.entries()) {
    const [tw, th] = portrait ? [p.h, p.w] : [p.w, p.h];
    const c = canvas(tw, th);
    drawPlaced(ctx2d(c), big, tw, th, P);
    let bytes: Uint8Array | null = null;
    for (const q of [0.92, 0.9, 0.88, 0.85, 0.82, 0.8, 0.75, 0.7]) {
      bytes = await jpegAt300(c, q);
      if (bytes.length <= ETSY.fileMaxBytes - 512 * 1024) break;
    }
    free(c);
    files.push({ name: `${prefix}_${portrait ? p.id.replace(/(\d+)x(\d+)/g, '$2x$1') : p.id}.jpg`, size: p, bytes: bytes!, w: tw, h: th });
    onFile?.(i);
  }
  return files;
}

// ---------- listing photos ----------

export interface Mockup {
  id: number;
  name: string;
  image: string;
  width: number;
  height: number;
  corners: [number, number][] | null;
  active: boolean;
}

const PW = 3000;
const PH = 2250;
const FONT = '"Plus Jakarta Sans Variable", "Segoe UI", system-ui, sans-serif';

function grad(x: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string, y0 = 0) {
  const g = x.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, y0, w, h);
}

function shadow(x: CanvasRenderingContext2D, blur: number, oy: number, alpha: number) {
  x.shadowColor = `rgba(0,0,0,${alpha})`;
  x.shadowBlur = blur;
  x.shadowOffsetX = blur * 0.3;
  x.shadowOffsetY = oy;
}
const noShadow = (x: CanvasRenderingContext2D) => {
  x.shadowColor = 'transparent';
  x.shadowBlur = 0;
  x.shadowOffsetX = 0;
  x.shadowOffsetY = 0;
};

/** The art in shape `ar` (cropped or shown whole), `w` wide (for photos). */
function artAt(big: HTMLCanvasElement, ar: number, w: number, place: Place): HTMLCanvasElement {
  const c = canvas(w, Math.round(w / ar));
  drawPlaced(ctx2d(c), big, c.width, c.height, place);
  return c;
}

const frameHeight = (w: number, art: HTMLCanvasElement, matPct = 0.09, fpx = 30) => {
  const m = Math.round(w * matPct);
  return Math.round((w - 2 * (m + fpx)) * (art.height / art.width)) + 2 * (m + fpx);
};

/** A framed print: frame, white mat, the art. Drawn at (cx, top), `w` wide. Returns its height. */
function framed(x: CanvasRenderingContext2D, art: HTMLCanvasElement, cx: number, top: number, w: number, frame: string, matPct = 0.09, fpx = 30): number {
  const m = Math.round(w * matPct);
  const iw = w - 2 * (m + fpx);
  const ih = Math.round(iw * (art.height / art.width));
  const h = ih + 2 * (m + fpx);
  const l = cx - w / 2;
  shadow(x, 50, 30, 0.35);
  x.fillStyle = frame;
  x.fillRect(l, top, w, h);
  noShadow(x);
  x.fillStyle = '#f6f4ef';
  x.fillRect(l + fpx, top + fpx, w - 2 * fpx, h - 2 * fpx);
  x.fillStyle = '#e1ded6';
  x.fillRect(l + fpx + m - 4, top + fpx + m - 4, iw + 8, ih + 8);
  x.drawImage(art, l + fpx + m, top + fpx + m, iw, ih);
  return h;
}

function photoCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = canvas(PW, PH);
  return [c, ctx2d(c)];
}

async function toJpeg(c: HTMLCanvasElement, q = 0.9): Promise<Uint8Array> {
  const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('encode'))), 'image/jpeg', q));
  free(c);
  return new Uint8Array(await b.arrayBuffer());
}

/** Built-in room 1: warm wall, oak sideboard, vase and books. */
function livingRoom(big: HTMLCanvasElement, focus: Place): HTMLCanvasElement {
  const portrait = big.height > big.width;
  const [c, x] = photoCanvas();
  grad(x, PW, PH, '#ece6dc', '#d6cec1');
  const floor = 1880;
  grad(x, PW, PH - floor, '#b08c66', '#8c6a4a', floor);
  x.fillStyle = '#f2eee6';
  x.fillRect(0, floor - 40, PW, 40);
  // sideboard
  const g = x.createLinearGradient(0, 1480, 0, 1830);
  g.addColorStop(0, '#a87c52');
  g.addColorStop(1, '#845e3c');
  shadow(x, 40, 30, 0.3);
  x.fillStyle = g;
  x.fillRect(600, 1480, 1800, 350);
  noShadow(x);
  x.fillStyle = '#ba8e62';
  x.fillRect(600, 1480, 1800, 26);
  x.fillStyle = '#6e4e32';
  for (const lx of [1200, 1800]) x.fillRect(lx - 2, 1520, 5, 290);
  for (const lx of [900, 1500, 2100]) x.fillRect(lx - 60, 1630, 120, 16);
  x.fillStyle = '#3c2c1e';
  for (const lx of [680, 2320]) x.fillRect(lx - 14, 1830, 28, 50);
  // vase with branches
  x.fillStyle = '#e2dcd0';
  x.beginPath();
  x.ellipse(2270, 1410, 90, 80, 0, 0, Math.PI * 2);
  x.fill();
  x.fillRect(2240, 1250, 60, 110);
  x.strokeStyle = '#5c4a38';
  x.lineWidth = 7;
  for (const [a, len] of [[-0.5, 380], [-0.2, 460], [0.25, 400], [0.55, 300]]) {
    x.beginPath();
    x.moveTo(2270, 1260);
    x.lineTo(2270 + Math.sin(a) * len, 1260 - Math.cos(a) * len);
    x.stroke();
    x.fillStyle = '#7a8a60';
    for (let k = 0; k < 4; k++) {
      x.beginPath();
      x.ellipse(2270 + Math.sin(a) * len * (0.45 + k * 0.17), 1260 - Math.cos(a) * len * (0.45 + k * 0.17), 22, 12, a, 0, Math.PI * 2);
      x.fill();
    }
  }
  // books
  ['#3c485c', '#b09670', '#783c34'].forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect(640, 1480 - 46 * (i + 1), 260 - i * 30, 46);
  });
  const art = artAt(big, portrait ? 3 / 4 : 4 / 3, 1400, focus);
  const fw = portrait ? 820 : 1240;
  framed(x, art, 1500, Math.max(90, 1330 - frameHeight(fw, art)), fw, '#1c1a18');
  free(art);
  return c;
}

/** Built-in room 2: dark accent wall, bench, the wide 3:2 print in a gold frame. */
function accentWall(big: HTMLCanvasElement, focus: Place): HTMLCanvasElement {
  const portrait = big.height > big.width;
  const [c, x] = photoCanvas();
  grad(x, PW, PH, '#343c42', '#262c32');
  const floor = 1950;
  grad(x, PW, PH - floor, '#604e3e', '#46382c', floor);
  x.fillStyle = '#2c3238';
  x.fillRect(0, floor - 34, PW, 34);
  const art = artAt(big, portrait ? 2 / 3 : 3 / 2, 1600, focus);
  framed(x, art, 1500, portrait ? 120 : 190, portrait ? 860 : 1700, '#c4a062', 0.06);
  free(art);
  x.fillStyle = '#beac96';
  x.beginPath();
  x.roundRect(700, 1640, 1600, 120, 18);
  x.fill();
  x.fillStyle = '#3c2e24';
  for (const lx of [760, 2240]) x.fillRect(lx - 16, 1760, 32, 180);
  x.fillStyle = '#d47850';
  x.beginPath();
  x.roundRect(780, 1500, 380, 150, 50);
  x.fill();
  x.fillStyle = '#e8dcc4';
  x.beginPath();
  x.roundRect(1120, 1520, 340, 130, 50);
  x.fill();
  return c;
}

function sizesChart(big: HTMLCanvasElement, focus: Place): HTMLCanvasElement {
  const portrait = big.height > big.width;
  const [c, x] = photoCanvas();
  grad(x, PW, PH, '#faf7f1', '#eee9e0');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#28241f';
  x.font = `800 118px ${FONT}`;
  x.fillText('5 High-Resolution Files Included', PW / 2, 160);
  x.fillStyle = '#6e645a';
  x.font = `500 62px ${FONT}`;
  x.fillText(`300 DPI JPG  ·  ${portrait ? 'portrait' : 'landscape'}  ·  print at any size below`, PW / 2, 280);
  const pos = [[560, 720], [1500, 720], [2440, 720], [1030, 1560], [1970, 1560]];
  PRINT_SIZES.forEach((p, i) => {
    const [cx, cy] = pos[i];
    const ar = portrait ? p.h / p.w : p.w / p.h;
    const bw = portrait ? 380 : 520;
    const bh = Math.round(bw / ar);
    const art = artAt(big, ar, bw * 2, focus);
    const top = cy - bh / 2;
    shadow(x, 20, 14, 0.3);
    x.drawImage(art, cx - bw / 2, top, bw, bh);
    noShadow(x);
    free(art);
    x.fillStyle = '#28241f';
    x.beginPath();
    x.roundRect(cx - 95, top - 52, 190, 62, 31);
    x.fill();
    x.fillStyle = '#fff';
    x.font = `800 50px ${FONT}`;
    x.fillText(portrait && p.label.includes(':') ? p.label.split(':').reverse().join(':') : p.label, cx, top - 21);
    x.fillStyle = '#3c3630';
    x.font = `500 44px ${FONT}`;
    p.sizes.forEach((t, k) => x.fillText(portrait ? t.replace(/(\d+)x(\d+)/g, '$2x$1') : t, cx, top + bh + 52 + k * 56));
  });
  x.fillStyle = '#82786e';
  x.font = `500 50px ${FONT}`;
  x.fillText('Digital download  ·  no physical item is shipped  ·  frame not included', PW / 2, 2160);
  return c;
}

function detail(big: HTMLCanvasElement, place: Place): HTMLCanvasElement {
  const focus = place.focus;
  const [c, x] = photoCanvas();
  const cw = Math.round(big.width * 0.25);
  const ch = Math.round(cw * 0.75);
  const fx = Math.min(Math.max(0, Math.round(big.width * focus - cw / 2)), big.width - cw);
  const fy = Math.round(big.height / 2 - ch / 2);
  x.imageSmoothingQuality = 'high';
  x.drawImage(big, fx, fy, cw, ch, 0, 0, PW, PH);
  x.fillStyle = 'rgba(20,20,22,0.92)';
  x.beginPath();
  x.roundRect(90, PH - 300, 1120, 220, 40);
  x.fill();
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  x.font = `800 68px ${FONT}`;
  x.fillText('Close-up of the print file', 150, PH - 195);
  x.fillStyle = '#d2cdc4';
  x.font = `500 54px ${FONT}`;
  x.fillText('upscaled for sharp, large prints', 150, PH - 120);
  return c;
}

function downloadCard(big: HTMLCanvasElement, name: string, focus: Place): HTMLCanvasElement {
  const portrait = big.height > big.width;
  const [c, x] = photoCanvas();
  grad(x, PW, PH, '#22262e', '#16181e');
  const art = artAt(big, portrait ? 3 / 4 : 3 / 2, 1900, focus);
  const aw = portrait ? 1000 : 1900;
  const ah = aw * (art.height / art.width);
  shadow(x, 40, 24, 0.5);
  x.drawImage(art, 1500 - aw / 2, 160, aw, Math.min(ah, 1330));
  noShadow(x);
  free(art);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.font = `800 124px ${FONT}`;
  x.fillText(name, PW / 2, 1610, 2800);
  x.fillStyle = '#e8c478';
  x.font = `800 68px ${FONT}`;
  x.fillText('PRINTABLE WALL ART  ·  INSTANT DOWNLOAD', PW / 2, 1745);
  ['1  Buy', '2  Download', '3  Print', '4  Frame'].forEach((t, i) => {
    const cx = 600 + i * 600;
    x.strokeStyle = '#e8c478';
    x.lineWidth = 5;
    x.beginPath();
    x.roundRect(cx - 240, 1880, 480, 140, 70);
    x.stroke();
    x.fillStyle = '#fff';
    x.font = `800 60px ${FONT}`;
    x.fillText(t, cx, 1952);
  });
  return c;
}

/** Projective transform taking the unit square to the quad (TL, TR, BR, BL). */
function squareToQuad(q: [number, number][]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const hh = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh, 1];
}
function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** The art warped into the frame area the admin marked on a room photo. */
export async function onMockup(big: HTMLCanvasElement, m: Mockup, place: Place | number): Promise<HTMLCanvasElement> {
  const focus = asPlace(place);
  const room = await loadImage(m.image);
  const scale = Math.min(1, PW / room.naturalWidth, PW / room.naturalHeight) || 1;
  const W = Math.round(room.naturalWidth * scale);
  const H = Math.round(room.naturalHeight * scale);
  const c = canvas(W, H);
  const x = ctx2d(c);
  x.drawImage(room, 0, 0, W, H);
  const q = m.corners!.map(([u, v]) => [u * W, v * H]) as [number, number][];
  const side = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const qw = (side(q[0], q[1]) + side(q[3], q[2])) / 2;
  const qh = (side(q[0], q[3]) + side(q[1], q[2])) / 2;
  const art = artAt(big, qw / qh, Math.min(big.width, Math.round(qw * 1.5)), focus);
  const ad = ctx2d(art).getImageData(0, 0, art.width, art.height).data;
  const inv = invert3(squareToQuad(q));
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  const bx = Math.max(0, Math.floor(Math.min(...xs)));
  const by = Math.max(0, Math.floor(Math.min(...ys)));
  const bw = Math.min(W, Math.ceil(Math.max(...xs))) - bx;
  const bh = Math.min(H, Math.ceil(Math.max(...ys))) - by;
  const id = x.getImageData(bx, by, bw, bh);
  const d = id.data;
  const AW = art.width;
  const AH = art.height;
  // 2×2 samples per pixel: smooth edges where the art meets the frame.
  const offs = [0.25, 0.75];
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      let r = 0, g = 0, b = 0, hit = 0;
      for (const oy of offs)
        for (const ox of offs) {
          const px = bx + i + ox;
          const py = by + j + oy;
          const w = inv[6] * px + inv[7] * py + inv[8];
          const u = (inv[0] * px + inv[1] * py + inv[2]) / w;
          const v = (inv[3] * px + inv[4] * py + inv[5]) / w;
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          // bilinear sample
          const fx = u * (AW - 1);
          const fy = v * (AH - 1);
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const x1 = Math.min(AW - 1, x0 + 1), y1 = Math.min(AH - 1, y0 + 1);
          const tx = fx - x0, ty = fy - y0;
          const p00 = (y0 * AW + x0) * 4, p10 = (y0 * AW + x1) * 4, p01 = (y1 * AW + x0) * 4, p11 = (y1 * AW + x1) * 4;
          for (let k = 0; k < 3; k++) {
            const val = (ad[p00 + k] * (1 - tx) + ad[p10 + k] * tx) * (1 - ty) + (ad[p01 + k] * (1 - tx) + ad[p11 + k] * tx) * ty;
            if (k === 0) r += val;
            else if (k === 1) g += val;
            else b += val;
          }
          hit++;
        }
      if (!hit) continue;
      const p = (j * bw + i) * 4;
      const a = hit / 4;
      d[p] = d[p] * (1 - a) + (r / hit) * a;
      d[p + 1] = d[p + 1] * (1 - a) + (g / hit) * a;
      d[p + 2] = d[p + 2] * (1 - a) + (b / hit) * a;
    }
  x.putImageData(id, bx, by);
  free(art);
  return c;
}

export async function listingPhotos(big: HTMLCanvasElement, name: string, place: Place | number, mockups: Mockup[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  await document.fonts.load(`800 60px "Plus Jakarta Sans Variable"`).catch(() => null);
  const focus = asPlace(place);
  // The caller picks which mockups (the picture's own choice, or the defaults).
  const ready = mockups.filter((m) => m.corners);
  const rooms: HTMLCanvasElement[] = [];
  for (const m of ready.slice(0, ETSY.photos - 3)) rooms.push(await onMockup(big, m, focus));
  if (!rooms.length) rooms.push(livingRoom(big, focus), accentWall(big, focus));
  const all: [string, HTMLCanvasElement][] = [
    ...rooms.map((c, i) => [`room-${i + 1}`, c] as [string, HTMLCanvasElement]),
    ['sizes', sizesChart(big, focus)],
    ['detail', detail(big, focus)],
    ['instant-download', downloadCard(big, name, focus)],
  ];
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const [i, [label, c]] of all.entries()) out.push({ name: `${String(i + 1).padStart(2, '0')}-${label}.jpg`, bytes: await toJpeg(c) });
  return out;
}

// ---------- listing text + zip ----------

export function listingText(l: { title: string; intro: string; tags: string[] }, portrait: boolean): string {
  return [
    `TITLE (${l.title.length}/${ETSY.titleMax} characters)`,
    l.title,
    '',
    `TAGS (${l.tags.length}/${ETSY.tags}: paste them into Etsy's tag box, comma-separated)`,
    l.tags.join(', '),
    '',
    'DESCRIPTION',
    fullDescription(l.intro, portrait),
    '',
    'SETTINGS',
    'Type: Digital files  ·  What is it: A finished product  ·  Who made it: I did',
    'Category: Art & Collectibles > Prints > Digital Prints',
    'If the listing form asks whether AI was used, say yes (the description already says so).',
    "Upload the 5 files from '1 - Digital files' under Digital files, and the photos from '2 - Listing photos' in order (01 first).",
    '',
  ].join('\n');
}

export function makeZip(folder: string, files: PrintFile[], photos: { name: string; bytes: Uint8Array }[], text: string): Blob {
  const tree: Record<string, [Uint8Array, { level: 0 }]> = {};
  const add = (path: string, bytes: Uint8Array) => (tree[`${folder}/${path}`] = [bytes, { level: 0 }]);
  for (const f of files) add(`1 - Digital files (upload these)/${f.name}`, f.bytes);
  for (const p of photos) add(`2 - Listing photos/${p.name}`, p.bytes);
  add('3 - Listing text.txt', new TextEncoder().encode(text.replace(/\n/g, '\r\n')));
  const z = zipSync(tree);
  return new Blob([z], { type: 'application/zip' });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/** A small JPEG of the picture for the AI to look at. */
export function previewDataUrl(img: HTMLImageElement, max = 768): string {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvas(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
  const x = ctx2d(c);
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  free(c);
  return url;
}

export { free as freeCanvas };
