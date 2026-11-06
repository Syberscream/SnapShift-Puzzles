import { api } from '../lib/api';
import { me, requireSignIn, shell } from '../lib/shell';
import { bg, errorText, h, mount, toast } from '../lib/ui';

interface AdminPuzzle {
  id: number;
  slug: string;
  title: string;
  description: string;
  categoryId: string | null;
  status: string;
  source: string;
  original: string;
  image: string;
  thumb: string;
  prompt: string | null;
  model: string | null;
  sort: number;
  createdAt: number;
}
interface Cat {
  id: string;
  name: string;
  description: string;
  tile_url: string;
  sort: number;
  generate: number;
  prompt_hint: string;
  published: number;
  pending: number;
}
interface Job {
  id: string;
  status: string;
  category_id: string | null;
  title: string;
  prompt: string;
  model: string;
  error: string | null;
  puzzle_id: number | null;
  created_at: number;
}
interface GenSettings {
  enabled: boolean;
  perDay: number;
  maxPending: number;
  model: string;
  options: Record<string, unknown>;
  categories: string[];
}

const main = await shell({ title: 'Admin' });
let cats: Cat[] = [];
const body = h('div');

const TABS: [string, string, () => Promise<void>][] = [
  ['overview', 'Overview', overview],
  ['queue', 'Review queue', queue],
  ['generate', 'Generate (ElevenLabs)', generate],
  ['puzzles', 'Published', published],
  ['categories', 'Categories', categories],
  ['daily', 'Daily schedule', daily],
  ['players', 'Players', players],
  ['messages', 'Messages', messages],
  ['site', 'Site settings', site],
];

async function show(key: string, fn: () => Promise<void>) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.tab === key)));
  mount(body, h('p', { class: 'muted' }, 'Loading…'));
  try {
    await fn();
  } catch (e) {
    mount(body, h('section', { class: 'panel' }, h('p', { class: 'error' }, errorText(e))));
  }
}

const catSelect = (value: string | null, name = 'categoryId') =>
  h('select', { name }, h('option', { value: '' }, '— category —'), cats.map((c) => h('option', { value: c.id, selected: c.id === value }, c.name)));

async function overview() {
  const o = await api.get<Record<string, number | boolean>>('/admin/overview');
  const stat = (label: string, v: unknown) => h('div', { class: 'stat' }, h('span', { class: 'muted small' }, label), h('b', {}, String(v ?? 0)));
  mount(
    body,
    !o.elevenlabsConfigured ? h('div', { class: 'notice warn' }, 'ELEVENLABS_API_KEY is not set, so automatic puzzle generation is off. Add it with: npx wrangler secret put ELEVENLABS_API_KEY') : null,
    !o.emailConfigured ? h('div', { class: 'notice warn' }, 'RESEND_API_KEY is not set, so verification and password-reset emails are not sent.') : null,
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'grid' },
        stat('Players', o.users),
        stat('New this week', o.newUsers7d),
        stat('Finishes (24h)', o.completions24h),
        stat('Daily players today', o.dailyPlayers),
        stat('Published puzzles', o.published),
        stat('Waiting for review', o.pending),
        stat('Generations running', o.jobsInFlight),
        stat('Failed generations (24h)', o.jobsFailed24h),
        stat('Unread messages', o.unreadMessages),
      ),
    ),
  );
}

/** Resize in the browser: a web-sized WebP for play and a thumbnail. */
async function makeWebCopies(src: string): Promise<{ image: Blob; thumb: Blob; width: number; height: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scaled = async (maxW: number, quality: number) => {
    const w = Math.min(maxW, img.naturalWidth);
    const hgt = Math.round((img.naturalHeight / img.naturalWidth) * w);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, hgt);
    return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/webp', quality));
  };
  return { image: await scaled(2400, 0.88), thumb: await scaled(640, 0.8), width: img.naturalWidth, height: img.naturalHeight };
}

function reviewCard(p: AdminPuzzle, onDone: () => void) {
  const title = h('input', { value: p.title, 'aria-label': 'Title' }) as HTMLInputElement;
  const desc = h('input', { value: p.description, placeholder: 'Short description (optional)', 'aria-label': 'Description' }) as HTMLInputElement;
  const cat = catSelect(p.categoryId) as HTMLSelectElement;
  const publish = h('button', { class: 'btn green' }, p.status === 'published' ? 'Save' : 'Publish');
  const reject = h('button', { class: 'btn danger' }, p.status === 'published' ? 'Remove' : 'Reject');
  publish.addEventListener('click', async () => {
    if (!cat.value) return toast('Pick a category first', '', 'bad');
    publish.setAttribute('disabled', '');
    publish.textContent = 'Publishing…';
    try {
      const copies = await makeWebCopies(p.original);
      const f = new FormData();
      f.set('image', copies.image, 'image.webp');
      f.set('thumb', copies.thumb, 'thumb.webp');
      f.set('width', String(copies.width));
      f.set('height', String(copies.height));
      f.set('title', title.value);
      f.set('description', desc.value);
      f.set('categoryId', cat.value);
      await api.post(`/admin/puzzles/${p.id}/publish`, f);
      toast('Published', title.value, 'good');
      onDone();
    } catch (e) {
      toast('Publish failed', errorText(e), 'bad');
      publish.removeAttribute('disabled');
      publish.textContent = 'Publish';
    }
  });
  reject.addEventListener('click', async () => {
    if (!confirm(`${p.status === 'published' ? 'Remove' : 'Reject'} “${p.title}”?`)) return;
    await api.post(`/admin/puzzles/${p.id}/reject`);
    onDone();
  });
  return h(
    'div',
    { class: 'card queue-card' },
    h('a', { href: p.original, target: '_blank', title: 'Open full size' }, h('div', { class: 'thumb', style: bg(p.thumb) })),
    h(
      'div',
      { class: 'meta' },
      title,
      desc,
      cat,
      h('span', { class: 'muted small' }, `${p.source}${p.model ? ' · ' + p.model : ''} · ${new Date(p.createdAt).toLocaleDateString()}`),
      p.prompt ? h('details', { class: 'small muted' }, h('summary', {}, 'Prompt'), p.prompt) : null,
      h('div', { class: 'row', style: 'margin-top:6px' }, publish, reject),
    ),
  );
}

async function queue() {
  const { puzzles } = await api.get<{ puzzles: AdminPuzzle[] }>('/admin/puzzles?status=pending');
  const upload = h('form', { class: 'row' }, h('input', { type: 'file', name: 'file', accept: 'image/png,image/jpeg,image/webp', required: true, style: 'max-width:280px' }), h('input', { name: 'title', placeholder: 'Title (optional)', style: 'max-width:220px' }), catSelect(null), h('button', { class: 'btn', type: 'submit' }, 'Upload to queue'));
  upload.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/upload', new FormData(upload));
      toast('Uploaded', 'Added to the review queue.', 'good');
      await queue();
    } catch (x) {
      toast('Upload failed', errorText(x), 'bad');
    }
  });
  mount(
    body,
    h('section', { class: 'panel' }, h('h2', {}, `Review queue (${puzzles.length})`), h('p', { class: 'muted' }, 'Generated and uploaded images wait here. Check the picture, fix the title and category, then publish. Publishing makes a web-sized copy and thumbnail in your browser.'), upload),
    puzzles.length ? h('div', { class: 'grid wide' }, puzzles.map((p) => reviewCard(p, queue))) : h('section', { class: 'panel' }, h('p', { class: 'muted' }, 'Nothing waiting. Generate some puzzles or upload an image.')),
  );
}

async function generate() {
  const g = await api.get<{ settings: GenSettings; jobs: Job[]; configured: boolean; puzzleSuffix: string }>('/admin/generation');
  const s = g.settings;
  const logBox = h('pre', { hidden: true });
  const showLog = (log: string[]) => {
    logBox.hidden = false;
    logBox.textContent = log.join('\n') || 'Nothing to do.';
  };

  const settingsForm = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'Automatic generation'),
    h('p', { class: 'muted small' }, 'Every 10 minutes the site tops up the review queue with new images from ElevenLabs, then collects finished ones. Nothing is published until you approve it.'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'enabled', checked: s.enabled }), 'Generate automatically'),
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', {}, 'Images per 24 hours'), h('input', { type: 'number', name: 'perDay', min: 0, max: 100, value: s.perDay })),
      h('div', { class: 'field' }, h('label', {}, 'Pause when this many are waiting'), h('input', { type: 'number', name: 'maxPending', min: 1, max: 500, value: s.maxPending })),
    ),
    h('div', { class: 'field' }, h('label', {}, 'Model'), h('input', { name: 'model', value: s.model, list: 'models' }), h('datalist', { id: 'models' }, ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gpt-image-2', 'gpt-image-1.5', 'bytedance-seedream-5-pro'].map((m) => h('option', { value: m })))),
    h('div', { class: 'field' }, h('label', {}, 'Extra model options (JSON)'), h('input', { name: 'options', value: JSON.stringify(s.options) }), h('span', { class: 'small muted' }, 'Sent with every request, e.g. {"aspect_ratio":"16:9","resolution":"2K"}. Each model accepts different fields.')),
    h('div', { class: 'field' }, h('label', {}, 'Only these categories (leave all unticked for every category)'), h('div', { class: 'row' }, cats.map((c) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'cat', value: c.id, checked: s.categories.includes(c.id) }), c.name)))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save settings'), h('button', { class: 'btn', type: 'button', onclick: async () => showLog((await api.post<{ log: string[] }>('/admin/generation/run')).log) }, 'Run now')),
  );
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(settingsForm);
    let options: Record<string, unknown>;
    try {
      options = JSON.parse(String(f.get('options') || '{}'));
    } catch {
      return toast('Options must be valid JSON', '', 'bad');
    }
    await api.put('/admin/generation', {
      enabled: f.get('enabled') === 'on',
      perDay: Number(f.get('perDay')),
      maxPending: Number(f.get('maxPending')),
      model: f.get('model'),
      options,
      categories: f.getAll('cat'),
    });
    toast('Saved', '', 'good');
  });

  const now = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'Generate now'),
    h('p', { class: 'muted small' }, 'Leave the prompt empty to use built-in ideas for the category. Puzzle-friendly guidance is added automatically: ', h('i', {}, g.puzzleSuffix)),
    h('div', { class: 'row' }, catSelect(null), h('input', { type: 'number', name: 'count', min: 1, max: 10, value: 1, style: 'max-width:90px', 'aria-label': 'How many' })),
    h('div', { class: 'field', style: 'margin-top:8px' }, h('label', {}, 'Prompt (optional)'), h('textarea', { name: 'prompt', placeholder: 'A red fox curled up in fresh snow at sunrise, photograph' })),
    h('div', { class: 'field' }, h('label', {}, 'Title (optional)'), h('input', { name: 'title' })),
    h('button', { class: 'btn primary', type: 'submit', disabled: !g.configured }, g.configured ? 'Generate' : 'Set ELEVENLABS_API_KEY first'),
    logBox,
  );
  now.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(now);
    try {
      const r = await api.post<{ log: string[] }>('/admin/generate', { categoryId: f.get('categoryId'), count: Number(f.get('count')), prompt: f.get('prompt'), title: f.get('title') });
      showLog(r.log);
      toast('Started', 'Images usually take a minute or two. They appear in the review queue.', 'good');
    } catch (x) {
      toast('Could not start', errorText(x), 'bad');
    }
  });

  const jobs = h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', {}, 'Recent generations'), h('button', { class: 'btn', onclick: () => generate() }, 'Refresh')),
    g.jobs.length
      ? g.jobs.map((j) =>
          h(
            'div',
            { class: 'job spread' },
            h('div', {}, h('span', { class: `tag ${j.status}` }, j.status), ` ${j.title} `, h('span', { class: 'muted' }, `· ${j.category_id ?? 'no category'} · ${j.model} · ${new Date(j.created_at).toLocaleString()}`), j.error ? h('div', { class: 'error small' }, j.error) : null),
            j.status === 'failed' ? h('button', { class: 'btn', onclick: async () => (showLog((await api.post<{ log: string[] }>(`/admin/generation/jobs/${j.id}/retry`)).log), generate()) }, 'Retry') : null,
          ),
        )
      : h('p', { class: 'muted' }, 'No generations yet.'),
  );
  mount(body, !g.configured ? h('div', { class: 'notice warn' }, 'Add your ElevenLabs API key (Pro plan or higher, with Image access): npx wrangler secret put ELEVENLABS_API_KEY') : null, h('div', { class: 'two-col' }, now, settingsForm), jobs);
}

async function published() {
  const { puzzles } = await api.get<{ puzzles: AdminPuzzle[] }>('/admin/puzzles?status=published');
  mount(body, h('section', { class: 'panel' }, h('h2', {}, `Published (${puzzles.length})`), h('p', { class: 'muted' }, 'Edit titles and categories. Removing a puzzle that people have played hides it but keeps their results.')), h('div', { class: 'grid wide' }, puzzles.map((p) => reviewCard(p, published))));
}

async function categories() {
  cats = (await api.get<{ categories: Cat[] }>('/admin/categories')).categories;
  const row = (c: Partial<Cat>) => {
    const f = h(
      'form',
      { class: 'panel soft' },
      h('div', { class: 'row' },
        h('input', { name: 'id', value: c.id ?? '', placeholder: 'id (slug)', readonly: !!c.id, style: 'max-width:150px' }),
        h('input', { name: 'name', value: c.name ?? '', placeholder: 'Name', style: 'max-width:180px' }),
        h('input', { name: 'sort', type: 'number', value: c.sort ?? 0, style: 'max-width:80px', title: 'Order' }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'generate', checked: c.generate !== 0 }), 'Auto-generate'),
        c.id ? h('span', { class: 'muted small' }, `${c.published} published · ${c.pending} waiting`) : null,
      ),
      h('input', { name: 'description', value: c.description ?? '', placeholder: 'Description', style: 'margin-top:8px' }),
      h('input', { name: 'tile_url', value: c.tile_url ?? '', placeholder: 'Tile image URL', style: 'margin-top:8px' }),
      h('input', { name: 'prompt_hint', value: c.prompt_hint ?? '', placeholder: 'Generator hint, e.g. "a wild animal in its natural setting"', style: 'margin-top:8px' }),
      h('button', { class: 'btn', type: 'submit', style: 'margin-top:8px' }, c.id ? 'Save' : 'Add category'),
    );
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = new FormData(f);
      try {
        await api.put(`/admin/categories/${encodeURIComponent(String(d.get('id')))}`, { ...Object.fromEntries(d), sort: Number(d.get('sort')), generate: d.get('generate') === 'on' });
        toast('Saved', '', 'good');
        await categories();
      } catch (x) {
        toast('Could not save', errorText(x), 'bad');
      }
    });
    return f;
  };
  mount(body, cats.map(row), h('h2', {}, 'New category'), row({}));
}

async function daily() {
  const d = await api.get<{ today: string; days: { day: string; puzzle_id: number; title: string; players: number }[] }>('/admin/daily');
  const { puzzles } = await api.get<{ puzzles: AdminPuzzle[] }>('/admin/puzzles?status=published');
  const f = h('form', { class: 'row' }, h('input', { type: 'date', name: 'day', min: d.today, value: d.today, required: true, style: 'max-width:180px' }), h('select', { name: 'puzzleId' }, puzzles.map((p) => h('option', { value: p.id }, `${p.title} (${p.categoryId})`))), h('button', { class: 'btn', type: 'submit' }, 'Schedule'));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = new FormData(f);
    try {
      await api.put(`/admin/daily/${v.get('day')}`, { puzzleId: Number(v.get('puzzleId')) });
      toast('Scheduled', '', 'good');
      await daily();
    } catch (x) {
      toast('Could not schedule', errorText(x), 'bad');
    }
  });
  mount(
    body,
    h('section', { class: 'panel' }, h('h2', {}, 'Choose a daily'), h('p', { class: 'muted' }, 'Days without a choice get a published puzzle automatically (one that has not been a daily in the last 60 days).'), f),
    h('section', { class: 'panel' }, h('h2', {}, 'Recent dailies'), h('table', {}, h('tbody', {}, d.days.map((x) => h('tr', {}, h('td', {}, x.day), h('td', {}, x.title), h('td', { class: 'num' }, `${x.players} players`)))))),
  );
}

async function players() {
  const search = h('input', { placeholder: 'Search username or email', style: 'max-width:320px' }) as HTMLInputElement;
  const list = h('div');
  const load = async () => {
    const { users } = await api.get<{ users: { id: number; username: string; email: string; role: string; points: number; email_verified: number; created_at: number }[] }>(`/admin/users?q=${encodeURIComponent(search.value)}`);
    mount(
      list,
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Email'), h('th', { class: 'num' }, 'Points'), h('th', {}, ''))),
        h(
          'tbody',
          {},
          users.map((u) =>
            h(
              'tr',
              {},
              h('td', {}, u.username, u.role === 'admin' ? ' (admin)' : ''),
              h('td', { class: 'small' }, u.email, u.email_verified ? '' : ' · unverified'),
              h('td', { class: 'num' }, u.points),
              h(
                'td',
                { class: 'row end' },
                h('button', { class: 'btn', onclick: async () => { const v = prompt(`Adjust points for ${u.username} (e.g. 100 or -50):`); if (v && Number(v)) { await api.post(`/admin/users/${u.id}/points`, { delta: Number(v), note: 'admin adjustment' }); await load(); } } }, 'Points'),
                h('button', { class: 'btn', onclick: async () => { const v = prompt(`Supporter days for ${u.username} (0 to remove):`, '30'); if (v !== null) { await api.post(`/admin/users/${u.id}/supporter`, { days: Number(v) }); toast('Updated', '', 'good'); } } }, 'Supporter'),
              ),
            ),
          ),
        ),
      ),
    );
  };
  search.addEventListener('change', load);
  mount(body, h('section', { class: 'panel' }, h('h2', {}, 'Players'), search, list));
  await load();
}

async function messages() {
  const { messages: ms } = await api.get<{ messages: { id: number; name: string; email: string; subject: string; message: string; handled: number; created_at: number }[] }>('/admin/messages');
  mount(
    body,
    h('section', { class: 'panel' }, h('h2', {}, 'Contact messages')),
    ms.length
      ? ms.map((m) =>
          h(
            'section',
            { class: 'panel soft' },
            h('div', { class: 'spread' }, h('b', {}, m.subject), h('span', { class: 'muted small' }, new Date(m.created_at).toLocaleString())),
            h('p', { class: 'small' }, `${m.name} · `, h('a', { href: `mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.subject)}` }, m.email)),
            h('p', { style: 'white-space:pre-wrap' }, m.message),
            m.handled ? h('span', { class: 'tag done' }, 'handled') : h('button', { class: 'btn', onclick: async () => (await api.post(`/admin/messages/${m.id}/handled`), messages()) }, 'Mark handled'),
          ),
        )
      : h('p', { class: 'muted' }, 'No messages.'),
  );
}

async function site() {
  const s = await api.get<Record<string, string>>('/admin/site');
  const f = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'Site settings'),
    h('div', { class: 'field' }, h('label', {}, 'Announcement banner (shown on every page; empty to hide)'), h('input', { name: 'announcement', value: s.announcement })),
    h('div', { class: 'field' }, h('label', {}, 'Supporter monthly payment link (Stripe Payment Link)'), h('input', { name: 'supporterMonthlyUrl', value: s.supporterMonthlyUrl, placeholder: 'https://buy.stripe.com/...' })),
    h('div', { class: 'field' }, h('label', {}, 'Supporter yearly payment link'), h('input', { name: 'supporterYearlyUrl', value: s.supporterYearlyUrl })),
    h('div', { class: 'field' }, h('label', {}, 'Contact email shown to players'), h('input', { name: 'contactEmail', value: s.contactEmail })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  );
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.put('/admin/site', Object.fromEntries(new FormData(f)));
    toast('Saved', '', 'good');
  });
  mount(body, f);
}

// Start after all helpers above are defined.
if (requireSignIn(main, 'use the admin panel')) {
  if (me()!.role !== 'admin') {
    mount(main, h('section', { class: 'panel' }, h('h1', {}, 'Admins only'), h('p', { class: 'muted' }, 'Your account is not an admin.')));
  } else {
    const tabs = h(
      'div',
      { class: 'tabs' },
      TABS.map(([key, label, fn]) =>
        h(
          'button',
          {
            class: 'btn',
            'data-tab': key,
            onclick: () => {
              if (location.hash.slice(1) === key) void show(key, fn);
              else location.hash = key; // hashchange shows the tab
            },
          },
          label,
        ),
      ),
    );
    mount(main, h('section', { class: 'panel' }, h('h1', {}, 'Admin'), tabs), body);
    cats = (await api.get<{ categories: Cat[] }>('/admin/categories')).categories;
    const fromHash = () => TABS.find(([k]) => k === location.hash.slice(1)) ?? TABS[0];
    window.addEventListener('hashchange', () => {
      const t = fromHash();
      void show(t[0], t[2]);
    });
    const start = fromHash();
    await show(start[0], start[2]);
  }
}
