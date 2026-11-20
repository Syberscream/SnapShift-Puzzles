// Admin → Etsy prep: pick pictures, prepare them (upscale, five print files,
// listing photos, listing text) into one zip each, and track what's listed.
import { api } from '../lib/api';
import { bg, errorText, h, modal, mount, toast } from '../lib/ui';
import { ETSY, fullDescription, type EtsyStatus } from '@shared/etsy';
import {
  download, edgeColor, freeCanvas, mockupShape, onMockup, getEngine, listingPhotos, listingText, loadImage, makeZip, previewDataUrl, printFiles, upscale, hasGpu, type Mockup,
} from '../lib/etsy-prep';

interface Item {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  original: string;
  image: string;
  thumb: string;
  /** Your own picture (a poster, a blueprint…) rather than a puzzle. */
  upload: boolean;
  status: EtsyStatus;
  title: string;
  intro: string;
  tags: string[];
  written: boolean;
  focus: number;
  /** Show the whole picture with a matching border (true) or crop to fill each frame shape (false). */
  fit: boolean;
  etsyUrl: string | null;
  mockupIds: number[];
  preparedAt: number | null;
}
interface Data {
  puzzles: Item[];
  mockups: Mockup[];
  ai: boolean;
}

const STATUS_LABEL: Record<EtsyStatus, string> = { none: 'Not started', prepared: 'Prepared', listed: 'Listed on Etsy' };
const PER_PAGE = 24;
let filter: EtsyStatus | 'all' | 'uploads' = 'all';
let search = '';
let page = 1;
const selected = new Set<number>();
let busy = false;
const MAX_MOCKUPS = ETSY.photos - 3;
const isReady = (m: Mockup) => !!m.corners;
/**
 * The mockups a picture will use: its own picks, else every starred default
 * (the photos step keeps the ones whose frame is the picture's shape, up to 7).
 */
function chosenMockups(d: Data, p: Item): { list: Mockup[]; own: boolean } {
  const own = p.mockupIds.map((id) => d.mockups.find((m) => m.id === id)).filter((m): m is Mockup => !!m && isReady(m));
  return own.length ? { list: own, own: true } : { list: d.mockups.filter((m) => m.active && isReady(m)), own: false };
}

/** Thumbnails to tick, up to 7, in the order ticked. */
function mockupPicker(d: Data, chosen: number[], onChange: (ids: number[]) => void): HTMLElement {
  const ready = d.mockups.filter(isReady);
  const count = h('span', { class: 'small muted' });
  const grid = h('div', { class: 'etsy-pick-grid' });
  const draw = () => {
    count.textContent = chosen.length ? `${chosen.length} of ${MAX_MOCKUPS} picked (in this order)` : `None picked: uses your starred defaults for its shape (portrait or landscape). Pick up to ${MAX_MOCKUPS}.`;
    grid.replaceChildren(
      ...ready.map((m) => {
        const i = chosen.indexOf(m.id);
        return h(
          'button',
          {
            type: 'button',
            class: `etsy-pick ${i >= 0 ? 'on' : ''}`,
            title: m.name,
            style: bg(m.image),
            onclick: () => {
              if (i >= 0) chosen.splice(i, 1);
              else if (chosen.length >= MAX_MOCKUPS) return toast(`At most ${MAX_MOCKUPS} mockups`, 'Etsy allows 10 photos; 3 are the sizes chart, close-up and download card.', 'bad');
              else chosen.push(m.id);
              onChange(chosen);
              draw();
            },
          },
          i >= 0 ? h('span', { class: 'etsy-pick-n' }, String(i + 1)) : null,
          h('span', { class: 'etsy-pick-name' }, `${mockupShape(m) === 'portrait' ? '▯ ' : mockupShape(m) === 'landscape' ? '▭ ' : ''}${m.name}`),
        );
      }),
    );
  };
  draw();
  return h(
    'div',
    { class: 'etsy-picker' },
    h('div', { class: 'row spread' }, count, chosen.length ? h('button', { type: 'button', class: 'btn small', onclick: () => ((chosen.length = 0), onChange(chosen), draw()) }, 'Clear (use defaults)') : null),
    ready.length ? grid : h('p', { class: 'small muted' }, 'No mockups with corners set yet. Upload some in Room mockups above.'),
  );
}

/** Choose mockups for every selected picture at once. */
function bulkMockups(d: Data, rerender: () => void) {
  const ids = [...selected];
  const chosen: number[] = [];
  const dlg = modal(
    h(
      'div',
      { class: 'etsy-editor' },
      h('h2', {}, `Mockups for ${ids.length} selected ${ids.length === 1 ? 'picture' : 'pictures'}`),
      h('p', { class: 'small muted' }, 'This replaces their current mockup picks. Pick none to put them back on your defaults.'),
      mockupPicker(d, chosen, () => null),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              try {
                await api.put('/admin/etsy/items-mockups', { ids, mockupIds: chosen });
                for (const p of d.puzzles) if (ids.includes(p.id)) p.mockupIds = [...chosen];
                toast('Mockups set', `${ids.length} ${ids.length === 1 ? 'picture' : 'pictures'}.`, 'good');
                dlg.close();
                rerender();
              } catch (e) {
                toast('Couldn’t save', errorText(e), 'bad');
              }
            },
          },
          'Apply',
        ),
      ),
    ),
  );
  dlg.classList.add('etsy-modal', 'wide');
}

export async function etsyTab(body: HTMLElement): Promise<void> {
  const d = await api.get<Data>('/admin/etsy');
  render(body, d);
}

function render(body: HTMLElement, d: Data) {
  const counts = { all: d.puzzles.length, none: 0, prepared: 0, listed: 0, uploads: 0 } as Record<string, number>;
  for (const p of d.puzzles) {
    counts[p.status]++;
    if (p.upload) counts.uploads++;
  }
  const q = search.trim().toLowerCase();
  const inFilter = (p: Item) => filter === 'all' || (filter === 'uploads' ? p.upload : p.status === filter);
  const shown = d.puzzles.filter((p) => inFilter(p) && (!q || `${p.name} ${p.category ?? ''}`.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  page = Math.min(page, pages);
  const rerender = () => render(body, d);

  const speedNote = h('p', { class: 'small muted' }, 'Checking for a graphics card…');
  void hasGpu().then((gpu) => {
    speedNote.textContent = gpu
      ? '⚡ This browser can use your graphics card: about 10–30 seconds a picture. Keep this tab open while it works.'
      : '🐢 No graphics card available to this browser, so it will use the CPU: about 1–3 minutes a picture. Keep this tab open while it works. (Chrome or Edge on a desktop computer is fastest.)';
  });
  const prepBtn = h('button', { class: 'btn primary', disabled: !selected.size || busy }, `Prepare selected (${selected.size})`) as HTMLButtonElement;
  const queueBox = h('div', { class: 'etsy-queue' });
  prepBtn.addEventListener('click', () => void runQueue(d, [...selected].map((id) => d.puzzles.find((p) => p.id === id)!).filter(Boolean), queueBox, rerender));

  const chip = (k: EtsyStatus | 'all' | 'uploads', label: string) =>
    h('button', { class: 'btn small', 'aria-pressed': String(filter === k), onclick: () => ((filter = k), (page = 1), rerender()) }, `${label} (${counts[k]})`);
  const searchBox = h('input', { type: 'search', placeholder: 'Search pictures…', value: search }) as HTMLInputElement;
  searchBox.addEventListener('input', () => {
    search = searchBox.value;
    page = 1;
    const pos = searchBox.selectionStart;
    rerender();
    const again = body.querySelector<HTMLInputElement>('.etsy-tools input[type=search]');
    again?.focus();
    if (pos !== null) again?.setSelectionRange(pos, pos);
  });

  const slice = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  mount(
    body,
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Etsy prep'),
      h(
        'p',
        { class: 'muted' },
        'Pick pictures and press Prepare. For each one, your browser upscales it with AI, makes the five frame-size print files (300 DPI, each under Etsy’s 20 MB limit), the listing photos and the listing text, then downloads one zip ready to upload to Etsy.',
      ),
      speedNote,
      uploadRow(d, rerender),
      queueBox,
    ),
    mockupsPanel(d, rerender),
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'row etsy-tools' },
        chip('all', 'All'),
        chip('none', 'Not started'),
        chip('prepared', 'Prepared'),
        chip('listed', 'Listed'),
        chip('uploads', 'My uploads'),
        searchBox,
      ),
      h(
        'div',
        { class: 'row etsy-tools' },
        h('button', { class: 'btn small', onclick: () => (slice.forEach((p) => selected.add(p.id)), rerender()) }, 'Select this page'),
        h('button', { class: 'btn small', onclick: () => (selected.clear(), rerender()) }, 'Clear selection'),
        h('button', { class: 'btn small', disabled: !selected.size || busy, onclick: () => bulkMockups(d, rerender) }, `Mockups for selected (${selected.size})`),
        prepBtn,
      ),
    ),
    shown.length
      ? h('div', { class: 'grid etsy-grid' }, slice.map((p) => card(d, p, rerender)))
      : h('section', { class: 'panel' }, h('p', { class: 'muted' }, 'No pictures here.')),
    pages > 1
      ? h(
          'div',
          { class: 'row center' },
          h('button', { class: 'btn small', disabled: page <= 1, onclick: () => (page--, rerender()) }, '‹ Prev'),
          h('span', { class: 'muted small' }, ` Page ${page} of ${pages} `),
          h('button', { class: 'btn small', disabled: page >= pages, onclick: () => (page++, rerender()) }, 'Next ›'),
        )
      : null,
  );
}

function card(d: Data, p: Item, rerender: () => void): HTMLElement {
  const box = h('input', { type: 'checkbox', checked: selected.has(p.id), 'aria-label': `Select ${p.name}` }) as HTMLInputElement;
  box.addEventListener('click', (e) => e.stopPropagation());
  box.addEventListener('change', () => {
    if (box.checked) selected.add(p.id);
    else selected.delete(p.id);
    rerender();
  });
  return h(
    'div',
    { class: `card etsy-card ${selected.has(p.id) ? 'selected' : ''}`, 'data-id': String(p.id) },
    h('label', { class: 'etsy-check' }, box),
    h('div', { class: 'thumb wide', style: bg(p.thumb), onclick: () => editor(d, p, rerender) }),
    h(
      'div',
      { class: 'meta', onclick: () => editor(d, p, rerender) },
      h('b', {}, p.name),
      h('span', { class: 'small muted' }, p.category ?? ''),
      h('span', { class: `pill small etsy-${p.status}` }, STATUS_LABEL[p.status]),
      p.mockupIds.length ? h('span', { class: 'small muted' }, `🖼 ${p.mockupIds.length} mockup${p.mockupIds.length === 1 ? '' : 's'} picked`) : null,
    ),
  );
}

// ---------- one picture: listing text, status, Etsy link ----------

function editor(d: Data, p: Item, rerender: () => void) {
  const title = h('input', { value: p.title, maxlength: String(ETSY.titleMax) }) as HTMLInputElement;
  const titleCount = h('span', { class: 'small muted' });
  const intro = h('textarea', { rows: '6' }, p.intro) as HTMLTextAreaElement;
  const tags = h('textarea', { rows: '3' }, p.tags.join(', ')) as HTMLTextAreaElement;
  const tagNote = h('span', { class: 'small muted' });
  const status = h('select', {}, (['none', 'prepared', 'listed'] as EtsyStatus[]).map((s) => h('option', { value: s, selected: s === p.status }, STATUS_LABEL[s]))) as HTMLSelectElement;
  const url = h('input', { type: 'url', placeholder: 'https://www.etsy.com/listing/…', value: p.etsyUrl ?? '' }) as HTMLInputElement;
  const fit = h(
    'select',
    {},
    h('option', { value: '1', selected: p.fit }, 'Show the whole picture (adds a matching border where a frame shape differs)'),
    h('option', { value: '0', selected: !p.fit }, 'Fill each frame shape (crops the edges)'),
  ) as HTMLSelectElement;
  const name = h('input', { value: p.name, maxlength: '80' }) as HTMLInputElement;
  const count = () => {
    titleCount.textContent = `${title.value.length}/${ETSY.titleMax}`;
    const list = tags.value.split(',').map((t) => t.trim()).filter(Boolean);
    const long = list.filter((t) => t.length > ETSY.tagMax);
    tagNote.textContent = `${list.length}/${ETSY.tags} tags${long.length ? ` · too long (max ${ETSY.tagMax}): ${long.join(', ')}` : ''}`;
    tagNote.classList.toggle('error', list.length > ETSY.tags || long.length > 0);
  };
  title.addEventListener('input', count);
  tags.addEventListener('input', count);
  count();

  const picks = [...p.mockupIds];
  const save = async (extra: Record<string, unknown> = {}) => {
    if (p.upload && name.value.trim() && name.value.trim() !== p.name) {
      await api.put(`/admin/etsy/uploads/${-p.id}`, { name: name.value.trim() });
      p.name = name.value.trim();
    }
    const r = await api.put<{ status: EtsyStatus; title: string; intro: string; tags: string[]; etsy_url: string | null; mockupIds: number[]; fit: boolean }>(`/admin/etsy/items/${p.id}`, {
      title: title.value,
      intro: intro.value,
      tags: tags.value,
      status: status.value,
      etsyUrl: url.value.trim(),
      mockupIds: picks,
      fit: fit.value === '1',
      ...extra,
    });
    Object.assign(p, { title: r.title ?? p.title, intro: r.intro ?? p.intro, tags: r.tags ?? p.tags, status: r.status, etsyUrl: r.etsy_url, written: true, mockupIds: r.mockupIds ?? picks, fit: r.fit });
    tags.value = p.tags.join(', ');
    count();
  };

  const aiBtn = h('button', { class: 'btn', disabled: !d.ai }, '✨ Write with AI') as HTMLButtonElement;
  aiBtn.addEventListener('click', async () => {
    aiBtn.disabled = true;
    aiBtn.textContent = 'Writing…';
    try {
      const r = await writeWithAI(p);
      title.value = r.title;
      intro.value = r.intro;
      tags.value = r.tags.join(', ');
      count();
      toast('Listing text written', 'Check it over, then Save.', 'good');
    } catch (e) {
      toast('The AI couldn’t write it', errorText(e), 'bad');
    } finally {
      aiBtn.disabled = !d.ai;
      aiBtn.textContent = '✨ Write with AI';
    }
  });
  const copy = (label: string, get: () => string) =>
    h('button', { class: 'btn small', onclick: () => void navigator.clipboard.writeText(get()).then(() => toast(`${label} copied`, '', 'good')) }, `Copy ${label.toLowerCase()}`);

  const dlg = modal(
    h(
      'div',
      { class: 'etsy-editor' },
      h('div', { class: 'etsy-editor-pic', style: bg(p.image) }),
      p.upload ? h('label', {}, 'Picture name', name) : h('h2', {}, p.name),
      h('label', {}, 'Frame shapes', fit),
      h('label', {}, h('span', { class: 'row spread' }, 'Etsy title ', titleCount), title),
      h('label', {}, 'Description (the sizes, how it works and the AI note are added below it automatically)', intro),
      h('label', {}, h('span', { class: 'row spread' }, 'Tags, comma-separated ', tagNote), tags),
      h('div', { class: 'row' }, aiBtn, copy('Title', () => title.value), copy('Description', () => fullDescription(intro.value)), copy('Tags', () => tags.value)),
      !d.ai ? h('p', { class: 'small muted' }, 'AI writing turns on after the next deploy (it uses Cloudflare’s built-in AI).') : null,
      h('b', {}, 'Mockups for this picture'),
      mockupPicker(d, picks, () => null),
      h('div', { class: 'row' }, h('label', {}, 'Status', status), h('label', { class: 'grow' }, 'Etsy listing link (shows “Get this as wall art” to players)', url)),
      h(
        'div',
        { class: 'row end' },
        p.upload
          ? h(
              'button',
              {
                class: 'btn danger',
                onclick: async () => {
                  if (!confirm(`Delete “${p.name}” from Etsy prep? Its listing text goes too.`)) return;
                  try {
                    await api.del(`/admin/etsy/uploads/${-p.id}`);
                    d.puzzles = d.puzzles.filter((x) => x.id !== p.id);
                    selected.delete(p.id);
                    dlg.close();
                    rerender();
                    toast('Picture deleted', '', 'good');
                  } catch (e) {
                    toast('Couldn’t delete', errorText(e), 'bad');
                  }
                },
              },
              '🗑 Delete',
            )
          : null,
        h('button', { class: 'btn', onclick: () => dlg.close() }, 'Close'),
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              try {
                await save();
                dlg.close();
                await runQueue(d, [p], document.querySelector('.etsy-queue') as HTMLElement, rerender);
              } catch (e) {
                toast('Couldn’t save', errorText(e), 'bad');
              }
            },
          },
          '⬇ Prepare & download',
        ),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              try {
                if (url.value.trim() && status.value !== 'listed') status.value = 'listed';
                await save();
                toast('Saved', '', 'good');
                dlg.close();
                rerender();
              } catch (e) {
                toast('Couldn’t save', errorText(e), 'bad');
              }
            },
          },
          'Save',
        ),
      ),
    ),
  );
  dlg.classList.add('etsy-modal');
}

async function writeWithAI(p: Item): Promise<{ title: string; intro: string; tags: string[] }> {
  const img = await loadImage(p.image);
  const r = await api.post<{ title: string; intro: string; tags: string[] }>(`/admin/etsy/items/${p.id}/write`, { image: previewDataUrl(img), name: p.name, category: p.upload ? '' : (p.category ?? '') });
  Object.assign(p, { title: r.title, intro: r.intro, tags: r.tags, written: true });
  return r;
}

// ---------- the queue ----------

async function runQueue(d: Data, list: Item[], box: HTMLElement, rerender: () => void) {
  if (busy || !list.length) return;
  busy = true;
  const stop = new AbortController();
  const rows = list.map((p) => {
    const step = h('span', { class: 'small muted' }, 'Waiting');
    const bar = h('i');
    return { p, step, bar, el: h('div', { class: 'etsy-job' }, h('b', {}, p.name), ' ', step, h('div', { class: 'progress-bar' }, bar)) };
  });
  const stopBtn = h('button', { class: 'btn small', onclick: () => stop.abort() }, 'Stop after this one');
  mount(box, h('div', { class: 'row spread' }, h('b', {}, `Preparing ${list.length} ${list.length === 1 ? 'picture' : 'pictures'}`), stopBtn), rows.map((r) => r.el));
  const before = () => (busy ? 'Etsy files are still being prepared. Leave anyway?' : undefined);
  const guard = (e: BeforeUnloadEvent) => {
    if (before()) e.preventDefault();
  };
  addEventListener('beforeunload', guard);
  let ok = 0;
  try {
    const step = (r: (typeof rows)[number], text: string, f?: number) => {
      r.step.textContent = text;
      if (f !== undefined) r.bar.style.width = `${Math.round(f * 100)}%`;
    };
    rows[0] && step(rows[0], 'Loading the upscaler…');
    await getEngine();
    for (const r of rows) {
      if (stop.signal.aborted) {
        step(r, 'Skipped');
        continue;
      }
      const p = r.p;
      let big: HTMLCanvasElement | null = null;
      try {
        if (!p.written && d.ai) {
          step(r, 'Writing the listing text…', 0.02);
          await writeWithAI(p).catch(() => null);
        }
        step(r, 'Loading the full-size picture…', 0.04);
        const img = await loadImage(p.original || p.image);
        const place = { focus: p.focus, fit: p.fit, bg: edgeColor(img) };
        step(r, 'Upscaling with AI…', 0.05);
        big = await upscale(img, (f) => step(r, `Upscaling with AI… ${Math.round(f * 100)}%`, 0.05 + f * 0.65));
        const prefix = p.name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || `picture-${p.id}`;
        step(r, 'Making the print files…', 0.72);
        const files = await printFiles(big, prefix, place, (i) => step(r, `Making the print files… ${i + 1}/5`, 0.72 + (i + 1) * 0.04));
        step(r, 'Making the listing photos…', 0.92);
        let skipped = 0;
        const use = chosenMockups(d, p);
        // Only tell you about picks that didn't fit; the other shape's defaults are skipped quietly.
        const photos = await listingPhotos(big, p.name, place, use.list, (n) => (skipped = use.own ? n : 0));
        const text = listingText(p, big.height > big.width);
        step(r, 'Zipping…', 0.97);
        const zip = makeZip(p.name.replace(/[\\/:*?"<>|]+/g, ''), files, photos, text);
        download(zip, `Etsy - ${p.name.replace(/[\\/:*?"<>|]+/g, '')}.zip`);
        if (p.status === 'none') {
          await api.put(`/admin/etsy/items/${p.id}`, { status: 'prepared', title: p.title, intro: p.intro, tags: p.tags }).catch(() => null);
          p.status = 'prepared';
        }
        const way = big.height > big.width ? 'portrait' : 'landscape';
        step(r, `✓ Downloaded (${(zip.size / 1048576).toFixed(0)} MB)${skipped ? ` · ${skipped} mockup${skipped === 1 ? '' : 's'} left out: frame isn’t ${way}` : ''}`, 1);
        r.el.classList.add('done');
        ok++;
      } catch (e) {
        step(r, `✗ ${errorText(e)}`);
        r.el.classList.add('failed');
      } finally {
        freeCanvas(big);
      }
    }
  } catch (e) {
    toast('Couldn’t start the upscaler', errorText(e), 'bad');
  } finally {
    busy = false;
    removeEventListener('beforeunload', guard);
    stopBtn.remove();
    selected.clear();
    if (ok) toast('Etsy files ready', `${ok} zip${ok === 1 ? '' : 's'} downloaded.`, 'good');
    // Refresh the grid underneath but keep the progress list.
    const keep = [...box.childNodes];
    rerender();
    const nb = document.querySelector('.etsy-queue');
    nb?.append(...keep);
  }
}

// ---------- your own pictures ----------

/** A JPEG of the picture at most `max` pixels on its long side. */
async function jpegOf(img: HTMLImageElement, max: number, q: number): Promise<Blob> {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise<Blob>((res, rej) => c.toBlob((v) => (v ? res(v) : rej(new Error('Couldn’t read the picture'))), 'image/jpeg', q));
  freeCanvas(c);
  return b;
}

function uploadRow(d: Data, rerender: () => void): HTMLElement {
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true, class: 'etsy-upload-input' }) as HTMLInputElement;
  const progress = h('span', { class: 'small muted' });
  file.addEventListener('change', async () => {
    const files = [...(file.files ?? [])];
    file.value = '';
    let done = 0;
    for (const [i, f] of files.entries()) {
      progress.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name}…`;
      try {
        const url = URL.createObjectURL(f);
        const img = await loadImage(url);
        const form = new FormData();
        form.set('file', f);
        form.set('preview', new File([await jpegOf(img, 2000, 0.88)], 'preview.jpg', { type: 'image/jpeg' }));
        form.set('thumb', new File([await jpegOf(img, 600, 0.82)], 'thumb.jpg', { type: 'image/jpeg' }));
        form.set('name', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim());
        form.set('width', String(img.naturalWidth));
        form.set('height', String(img.naturalHeight));
        URL.revokeObjectURL(url);
        d.puzzles.unshift(await api.post<Item>('/admin/etsy/uploads', form));
        done++;
      } catch (e) {
        toast(`Couldn’t upload ${f.name}`, errorText(e), 'bad');
      }
    }
    progress.textContent = '';
    if (done) {
      filter = 'uploads';
      page = 1;
      toast(`${done} picture${done === 1 ? '' : 's'} added`, 'They keep their whole picture in every frame shape. Tick them and press Prepare.', 'good');
      rerender();
    }
  });
  return h(
    'div',
    { class: 'row' },
    h('button', { class: 'btn', onclick: () => file.click() }, '+ Upload your own pictures'),
    h('span', { class: 'small muted' }, 'Posters, blueprints, any art that isn’t a puzzle. Portrait pictures get portrait print files.'),
    progress,
    file,
  );
}

// ---------- mockups ----------

let mockupsOpen: boolean | null = null;

function mockupsPanel(d: Data, rerender: () => void): HTMLElement {
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true }) as HTMLInputElement;
  const progress = h('span', { class: 'small muted' });
  file.addEventListener('change', async () => {
    const files = [...(file.files ?? [])];
    file.value = '';
    let done = 0;
    let failed = 0;
    const added: Mockup[] = [];
    for (const f of files) {
      progress.textContent = `Uploading ${done + failed + 1} of ${files.length}…`;
      try {
        const url = URL.createObjectURL(f);
        const img = await loadImage(url);
        URL.revokeObjectURL(url);
        const form = new FormData();
        form.set('file', f);
        form.set('name', f.name.replace(/\.[^.]+$/, ''));
        form.set('width', String(img.naturalWidth));
        form.set('height', String(img.naturalHeight));
        const m = await api.post<Mockup>('/admin/etsy/mockups', form);
        d.mockups.push(m);
        added.push(m);
        done++;
      } catch (e) {
        failed++;
        toast(`Couldn’t upload ${f.name}`, errorText(e), 'bad');
      }
    }
    mockupsOpen = true;
    rerender();
    if (added.length) {
      toast(`${done} mockup${done === 1 ? '' : 's'} uploaded`, 'Now mark the frame corners on each one.', 'good');
      cornerEditor(added[0], d, rerender);
    }
  });
  const ready = d.mockups.filter(isReady);
  const todo = d.mockups.filter((m) => !isReady(m));
  const starred = (shape: string) => ready.filter((m) => m.active && mockupShape(m) === shape).length;
  const sets = [`★ ${starred('landscape')}/${MAX_MOCKUPS} landscape`, `★ ${starred('portrait')}/${MAX_MOCKUPS} portrait`, starred('square') ? `★ ${starred('square')} square` : ''].filter(Boolean).join(' · ');
  const open = mockupsOpen ?? (todo.length > 0 || d.mockups.length === 0);
  const details = h(
    'details',
    { class: 'panel etsy-mockups-panel', open },
    h('summary', {}, h('h2', {}, `Room mockups (${d.mockups.length})`), h('span', { class: 'small muted' }, ` ${ready.length} ready · ${sets}${todo.length ? ` · ${todo.length} need corners` : ''}`)),
    h(
      'p',
      { class: 'muted' },
      `Upload photos of an empty frame on a wall, then mark the four corners of the picture area. Upload some with upright (portrait) frames too: portrait pictures only go in portrait frames, landscape ones in landscape frames. Each listing uses the mockups you pick for that picture (up to ${MAX_MOCKUPS}). Pictures with no picks use your ★ starred defaults for their shape: up to ${MAX_MOCKUPS} landscape and ${MAX_MOCKUPS} portrait. A mockup is starred when you mark its corners, if its set has room. With no defaults for a picture's shape, two simple built-in rooms are used.`,
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => file.click() }, '+ Upload mockups'),
      todo.length ? h('button', { class: 'btn', onclick: () => cornerEditor(todo[0], d, rerender) }, `Mark corners (${todo.length} to do)`) : null,
      progress,
      file,
    ),
    h(
      'div',
      { class: 'etsy-mockups' },
      d.mockups.map((m) =>
        h(
          'div',
          { class: `etsy-mockup ${isReady(m) ? '' : 'todo'}` },
          h('div', { class: 'thumb wide', style: bg(m.image), title: 'Mark corners', onclick: () => cornerEditor(m, d, rerender) }),
          h('b', { class: 'small' }, m.name),
          h(
            'span',
            { class: 'small muted' },
            `${!isReady(m) ? '⚠ Corners not set' : m.active ? '★ Default' : 'Ready (pick per picture)'}${mockupShape(m) ? ` · ${mockupShape(m) === 'portrait' ? '▯ portrait' : mockupShape(m) === 'landscape' ? '▭ landscape' : '◻ square'} frame` : ''}`,
          ),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn small', onclick: () => cornerEditor(m, d, rerender) }, 'Corners'),
            isReady(m)
              ? h(
                  'button',
                  {
                    class: 'btn small',
                    title: 'Defaults are used for pictures without their own mockup picks',
                    onclick: async () => {
                      try {
                        Object.assign(m, await api.put<Mockup>(`/admin/etsy/mockups/${m.id}`, { active: !m.active }));
                        mockupsOpen = true;
                        rerender();
                      } catch (e) {
                        toast('Couldn’t star it', errorText(e), 'bad');
                      }
                    },
                  },
                  m.active ? 'Unstar' : '★ Star',
                )
              : null,
            h(
              'button',
              {
                class: 'btn small danger',
                onclick: async () => {
                  if (!confirm(`Delete the mockup “${m.name}”?`)) return;
                  await api.del(`/admin/etsy/mockups/${m.id}`);
                  d.mockups = d.mockups.filter((x) => x.id !== m.id);
                  for (const p of d.puzzles) p.mockupIds = p.mockupIds.filter((id) => id !== m.id);
                  mockupsOpen = true;
                  rerender();
                },
                title: 'Delete',
              },
              '🗑',
            ),
          ),
        ),
      ),
    ),
  );
  details.addEventListener('toggle', () => (mockupsOpen = details.open));
  return details;
}

/**
 * Where the picture itself is drawn inside its <img> box. If the photo is shrunk
 * to fit the screen, the box can be wider than the picture; measuring against the
 * box would squeeze the corners toward the middle.
 */
function picRect(img: HTMLImageElement): { left: number; top: number; width: number; height: number } {
  const b = img.getBoundingClientRect();
  const ar = img.naturalWidth / img.naturalHeight || b.width / b.height;
  let width = b.width;
  let height = width / ar;
  if (height > b.height) {
    height = b.height;
    width = height * ar;
  }
  return { left: b.left + (b.width - width) / 2, top: b.top + (b.height - height) / 2, width, height };
}

/** Click (or drag) the four corners of the frame's picture area. */
function cornerEditor(m: Mockup, d: Data, rerender: () => void) {
  const pts: [number, number][] = m.corners ? m.corners.map((p) => [...p] as [number, number]) : [];
  const names = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  const help = h('p', { class: 'small muted' });
  const wrap = h('div', { class: 'etsy-corners' });
  const img = h('img', { src: m.image, alt: m.name, draggable: false }) as HTMLImageElement;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('preserveAspectRatio', 'none');
  wrap.append(img, svg);
  const draw = () => {
    svg.innerHTML = '';
    if (pts.length > 1) {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' '));
      poly.setAttribute('class', 'etsy-quad');
      svg.append(poly);
    }
    wrap.querySelectorAll('.etsy-dot').forEach((n) => n.remove());
    pts.forEach(([x, y], i) => {
      const dot = h('span', { class: 'etsy-dot', style: `left:${x * 100}%;top:${y * 100}%`, title: names[i] }, String(i + 1));
      dot.addEventListener('click', (e) => e.stopPropagation());
      dot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dot.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const r = picRect(img);
          pts[i] = [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
          dot.style.left = `${pts[i][0] * 100}%`;
          dot.style.top = `${pts[i][1] * 100}%`;
          const poly = svg.querySelector('polygon');
          poly?.setAttribute('points', pts.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' '));
        };
        dot.addEventListener('pointermove', move);
        dot.addEventListener('pointerup', () => dot.removeEventListener('pointermove', move), { once: true });
      });
      wrap.append(dot);
    });
    help.textContent =
      pts.length < 4 ? `Click the ${names[pts.length]} corner of the picture area inside the frame (${pts.length + 1} of 4).` : 'All four set. Drag a dot to fine-tune, then Save.';
  };
  wrap.addEventListener('click', (e) => {
    if (pts.length >= 4) return;
    const r = picRect(img);
    pts.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
    draw();
  });
  // Try the corners with a real picture before saving.
  const previewBox = h('div', { class: 'etsy-preview' });
  const previewBtn = h('button', { class: 'btn' }, '👁 Preview') as HTMLButtonElement;
  previewBtn.addEventListener('click', async () => {
    if (pts.length !== 4) return toast('Mark all four corners first', '', 'bad');
    const pic = d.puzzles.find((p) => p.status === 'listed') ?? d.puzzles[0];
    if (!pic) return toast('No pictures to preview with', '', 'bad');
    previewBtn.disabled = true;
    try {
      const img = await loadImage(pic.image);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const out = await onMockup(c, { ...m, corners: pts.map((p) => [...p] as [number, number]) }, 0.5);
      freeCanvas(c);
      out.className = 'etsy-preview-img';
      previewBox.replaceChildren(h('p', { class: 'small muted' }, 'Preview: the art should fill the frame’s picture area exactly. Drag the dots to adjust, then Save.'), out);
      out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) {
      toast('Couldn’t make the preview', errorText(e), 'bad');
    } finally {
      previewBtn.disabled = false;
    }
  });
  const name = h('input', { value: m.name }) as HTMLInputElement;
  const dlg = modal(
    h(
      'div',
      { class: 'etsy-corner-editor' },
      h('h2', {}, 'Mark the frame'),
      help,
      wrap,
      previewBox,
      h(
        'div',
        { class: 'row spread' },
        h('label', {}, 'Name ', name),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => ((pts.length = 0), draw()) }, 'Start over'),
          previewBtn,
          h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: async () => {
                if (pts.length !== 4) return toast('Mark all four corners first', '', 'bad');
                try {
                  Object.assign(m, await api.put<Mockup>(`/admin/etsy/mockups/${m.id}`, { corners: pts, name: name.value }));
                  dlg.close();
                  mockupsOpen = true;
                  rerender();
                  // Straight on to the next mockup that still needs corners.
                  const next = d.mockups.find((x) => !x.corners && x.id !== m.id);
                  if (next) cornerEditor(next, d, rerender);
                } catch (e) {
                  toast('Couldn’t save', errorText(e), 'bad');
                }
              },
            },
            d.mockups.some((x) => !x.corners && x.id !== m.id) ? 'Save & next' : 'Save',
          ),
        ),
      ),
    ),
  );
  dlg.classList.add('etsy-modal', 'wide');
  draw();
}
