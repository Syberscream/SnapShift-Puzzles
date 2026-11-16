// Admin → Etsy prep: pick pictures, prepare them (upscale, five print files,
// listing photos, listing text) into one zip each, and track what's listed.
import { api } from '../lib/api';
import { bg, errorText, h, modal, mount, toast } from '../lib/ui';
import { ETSY, fullDescription, type EtsyStatus } from '@shared/etsy';
import {
  download, freeCanvas, onMockup, getEngine, listingPhotos, listingText, loadImage, makeZip, previewDataUrl, printFiles, upscale, hasGpu, type Mockup,
} from '../lib/etsy-prep';

interface Item {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  original: string;
  image: string;
  thumb: string;
  status: EtsyStatus;
  title: string;
  intro: string;
  tags: string[];
  written: boolean;
  focus: number;
  etsyUrl: string | null;
  preparedAt: number | null;
}
interface Data {
  puzzles: Item[];
  mockups: Mockup[];
  ai: boolean;
}

const STATUS_LABEL: Record<EtsyStatus, string> = { none: 'Not started', prepared: 'Prepared', listed: 'Listed on Etsy' };
const PER_PAGE = 24;
let filter: EtsyStatus | 'all' = 'all';
let search = '';
let page = 1;
const selected = new Set<number>();
let busy = false;

export async function etsyTab(body: HTMLElement): Promise<void> {
  const d = await api.get<Data>('/admin/etsy');
  render(body, d);
}

function render(body: HTMLElement, d: Data) {
  const counts = { all: d.puzzles.length, none: 0, prepared: 0, listed: 0 } as Record<string, number>;
  for (const p of d.puzzles) counts[p.status]++;
  const q = search.trim().toLowerCase();
  const shown = d.puzzles.filter((p) => (filter === 'all' || p.status === filter) && (!q || `${p.name} ${p.category ?? ''}`.toLowerCase().includes(q)));
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

  const chip = (k: EtsyStatus | 'all', label: string) =>
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
        searchBox,
      ),
      h(
        'div',
        { class: 'row etsy-tools' },
        h('button', { class: 'btn small', onclick: () => (slice.forEach((p) => selected.add(p.id)), rerender()) }, 'Select this page'),
        h('button', { class: 'btn small', onclick: () => (selected.clear(), rerender()) }, 'Clear selection'),
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

  const save = async (extra: Record<string, unknown> = {}) => {
    const r = await api.put<{ status: EtsyStatus; title: string; intro: string; tags: string[]; etsy_url: string | null }>(`/admin/etsy/items/${p.id}`, {
      title: title.value,
      intro: intro.value,
      tags: tags.value,
      status: status.value,
      etsyUrl: url.value.trim(),
      ...extra,
    });
    Object.assign(p, { title: r.title ?? p.title, intro: r.intro ?? p.intro, tags: r.tags ?? p.tags, status: r.status, etsyUrl: r.etsy_url, written: true });
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
      h('h2', {}, p.name),
      h('label', {}, h('span', { class: 'row spread' }, 'Etsy title ', titleCount), title),
      h('label', {}, 'Description (the sizes, how it works and the AI note are added below it automatically)', intro),
      h('label', {}, h('span', { class: 'row spread' }, 'Tags, comma-separated ', tagNote), tags),
      h('div', { class: 'row' }, aiBtn, copy('Title', () => title.value), copy('Description', () => fullDescription(intro.value)), copy('Tags', () => tags.value)),
      !d.ai ? h('p', { class: 'small muted' }, 'AI writing turns on after the next deploy (it uses Cloudflare’s built-in AI).') : null,
      h('div', { class: 'row' }, h('label', {}, 'Status', status), h('label', { class: 'grow' }, 'Etsy listing link (shows “Get this as wall art” to players)', url)),
      h(
        'div',
        { class: 'row end' },
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
  const r = await api.post<{ title: string; intro: string; tags: string[] }>(`/admin/etsy/items/${p.id}/write`, { image: previewDataUrl(img), name: p.name, category: p.category ?? '' });
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
        step(r, 'Upscaling with AI…', 0.05);
        big = await upscale(img, (f) => step(r, `Upscaling with AI… ${Math.round(f * 100)}%`, 0.05 + f * 0.65));
        const prefix = p.name.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-') || `picture-${p.id}`;
        step(r, 'Making the print files…', 0.72);
        const files = await printFiles(big, prefix, p.focus, (i) => step(r, `Making the print files… ${i + 1}/5`, 0.72 + (i + 1) * 0.04));
        step(r, 'Making the listing photos…', 0.92);
        const photos = await listingPhotos(big, p.name, p.focus, d.mockups);
        const text = listingText(p, big.height > big.width);
        step(r, 'Zipping…', 0.97);
        const zip = makeZip(p.name.replace(/[\\/:*?"<>|]+/g, ''), files, photos, text);
        download(zip, `Etsy - ${p.name.replace(/[\\/:*?"<>|]+/g, '')}.zip`);
        if (p.status === 'none') {
          await api.put(`/admin/etsy/items/${p.id}`, { status: 'prepared', title: p.title, intro: p.intro, tags: p.tags }).catch(() => null);
          p.status = 'prepared';
        }
        step(r, `✓ Downloaded (${(zip.size / 1048576).toFixed(0)} MB)`, 1);
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

// ---------- mockups ----------

function mockupsPanel(d: Data, rerender: () => void): HTMLElement {
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true }) as HTMLInputElement;
  file.addEventListener('change', async () => {
    for (const f of file.files ?? []) {
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
        rerender();
        cornerEditor(m, d, rerender);
      } catch (e) {
        toast('Couldn’t upload the mockup', errorText(e), 'bad');
      }
    }
    file.value = '';
  });
  const ready = d.mockups.filter((m) => m.active && m.corners).length;
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, `Room mockups (${d.mockups.length})`),
    h(
      'p',
      { class: 'muted' },
      'Upload photos of an empty frame on a wall (landscape frames suit these pictures best), then click the four corners of the picture area. Every prepared listing gets one photo per mockup, up to 7. With no mockups, two simple built-in rooms are used.',
    ),
    h('p', { class: 'small muted' }, `${ready} ready to use.`),
    h(
      'div',
      { class: 'etsy-mockups' },
      d.mockups.map((m) =>
        h(
          'div',
          { class: `etsy-mockup ${m.active ? '' : 'off'}` },
          h('div', { class: 'thumb wide', style: bg(m.image), onclick: () => cornerEditor(m, d, rerender) }),
          h('b', { class: 'small' }, m.name),
          h('span', { class: 'small muted' }, m.corners ? (m.active ? 'In use' : 'Turned off') : '⚠ Corners not set'),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn small', onclick: () => cornerEditor(m, d, rerender) }, 'Corners'),
            h(
              'button',
              {
                class: 'btn small',
                onclick: async () => {
                  Object.assign(m, await api.put<Mockup>(`/admin/etsy/mockups/${m.id}`, { active: !m.active }));
                  rerender();
                },
              },
              m.active ? 'Turn off' : 'Turn on',
            ),
            h(
              'button',
              {
                class: 'btn small danger',
                onclick: async () => {
                  if (!confirm(`Delete the mockup “${m.name}”?`)) return;
                  await api.del(`/admin/etsy/mockups/${m.id}`);
                  d.mockups = d.mockups.filter((x) => x.id !== m.id);
                  rerender();
                },
              },
              'Delete',
            ),
          ),
        ),
      ),
      h('button', { class: 'btn etsy-mockup-add', onclick: () => file.click() }, '+ Upload mockups'),
      file,
    ),
  );
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
    ),
  );
  dlg.classList.add('etsy-modal', 'wide');
  draw();
}
