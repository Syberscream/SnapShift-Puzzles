import { api } from '../lib/api';
import { dayChart, rankBars } from '../lib/charts';
import { me, requireSignIn, shell } from '../lib/shell';
import { bg, errorText, h, modal, mount, toast } from '../lib/ui';
import { applyTheme, type Banner, type Theme } from '../lib/theme';

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
  request?: { username: string; idea: string } | null;
  eventId?: string | null;
}
interface Cat {
  id: string;
  name: string;
  description: string;
  tile_url: string;
  sort: number;
  generate: number;
  prompt_hint: string;
  members_only: number;
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
  dailyPoolTarget: number;
  photoShare: number;
}

const main = await shell({ title: 'Admin' });
let cats: Cat[] = [];
const body = h('div');

const TABS: [string, string, () => Promise<void>][] = [
  ['overview', 'Overview', overview],
  ['analytics', 'Analytics', analytics],
  ['queue', 'Review queue', queue],
  ['generate', 'Generate (ElevenLabs)', generate],
  ['puzzles', 'Published', published],
  ['categories', 'Categories', categories],
  ['daily', 'Daily schedule', daily],
  ['players', 'Players', players],
  ['messages', 'Messages', messages],
  ['site', 'Site settings', site],
  ['membership', 'Membership', membership],
  ['events', 'Events', events],
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

// ---------- analytics ----------

interface GameStats {
  days: number;
  labels: string[];
  series: Record<'signups' | 'activePlayers' | 'finishes' | 'started' | 'dailyPlayers' | 'timeAttackRuns', number[]>;
  summary: Record<string, number | null>;
  topPuzzles: { slug: string; title: string; category: string | null; n: number; players: number; avg: number }[];
  categories: { name: string; n: number }[];
  difficulty: { k: string; n: number }[];
  modes: { k: string; n: number }[];
  medals: { k: string; n: number }[];
  helpers: { k: string; n: number }[];
}
type Ranked = { name: string; views: number; visits: number }[] | null;
interface Traffic {
  connected: boolean;
  tokenSet?: boolean;
  error?: string;
  errors?: string[];
  days: number;
  labels?: string[];
  total?: { pageViews: number; visits: number } | null;
  series?: { pageViews: number[]; visits: number[] } | null;
  pages?: Ranked;
  referrers?: Ranked;
  countries?: Ranked;
  devices?: Ranked;
}

let analyticsDays = 30;

async function analytics() {
  const days = analyticsDays;
  mount(body, h('section', { class: 'panel' }, h('p', { class: 'muted' }, 'Loading…')));
  const [g, t] = await Promise.all([
    api.get<GameStats>(`/admin/analytics/game?days=${days}`),
    api.get<Traffic>(`/admin/analytics/traffic?days=${days}`).catch((e) => ({ connected: true, error: errorText(e), days }) as Traffic),
  ]);
  const n = (v: number | null | undefined) => (v ?? 0).toLocaleString();
  const tile = (label: string, value: string, sub?: string) => h('div', { class: 'stat' }, h('span', { class: 'muted small' }, label), h('b', {}, value), sub ? h('small', {}, sub) : null);
  const S = g.summary;
  const range = h(
    'div',
    { class: 'row range-picker' },
    [7, 30, 90].map((d) =>
      h('button', { class: 'btn', 'aria-pressed': String(d === days), onclick: () => ((analyticsDays = d), void analytics()) }, `${d} days`),
    ),
  );
  const cap = (k: string) => k[0].toUpperCase() + k.slice(1);

  mount(
    body,
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'spread' }, h('div', {}, h('h2', {}, 'Players and games'), h('p', { class: 'muted small' }, 'Signed-in players only; guests play on their own device and aren’t counted here.')), range),
      h(
        'div',
        { class: 'analytics-tiles' },
        tile('New players', n(S.newPlayers), `${n(S.players)} in total`),
        tile('Active players', n(S.activePlayers), `${n(S.returningPlayers)} returning`),
        tile('Games finished', n(S.finished), S.finishRate != null ? `${S.finishRate}% of ${n(S.started)} started` : undefined),
        tile('Daily results', n(S.dailyResults)),
        tile('Time Attack runs', n(S.timeAttackRuns)),
        tile('Plus members', n(S.plusMembers), S.lifetime ? `${n(S.lifetime)} lifetime` : 'right now'),
        tile('Points earned', n(S.pointsEarned), `${n(S.pointsSpent)} spent`),
      ),
    ),
    h(
      'section',
      { class: 'panel chart-grid-2 days' },
      dayChart('Active players', g.labels, g.series.activePlayers, { total: n(S.activePlayers), note: 'Total is unique players in the period.' }),
      dayChart('Games finished', g.labels, g.series.finishes),
      dayChart('New players', g.labels, g.series.signups),
      dayChart('Daily challenge players', g.labels, g.series.dailyPlayers),
    ),
    h(
      'section',
      { class: 'panel chart-grid-2' },
      rankBars(
        'Most finished puzzles',
        g.topPuzzles.map((p) => ({ name: p.title, value: p.n, sub: `· ${p.category ?? ''} · ${p.players} ${p.players === 1 ? 'player' : 'players'} · avg ${p.avg}%`, href: `/play?p=${encodeURIComponent(p.slug)}` })),
      ),
      rankBars('Finishes by category', g.categories.map((c) => ({ name: c.name, value: c.n }))),
      rankBars('Difficulty', g.difficulty.map((d) => ({ name: cap(d.k), value: d.n }))),
      rankBars('Mode', g.modes.map((d) => ({ name: d.k === 'timeattack' ? 'Time Attack' : cap(d.k), value: d.n }))),
      rankBars('Medals', ['gold', 'silver', 'bronze'].map((m) => ({ name: cap(m), value: g.medals.find((x) => x.k === m)?.n ?? 0 }))),
      rankBars('Helpers used', [
        { name: 'Hints', value: g.helpers.find((x) => x.k === 'hint')?.n ?? 0 },
        { name: 'Placed tiles', value: g.helpers.find((x) => x.k === 'place')?.n ?? 0 },
      ]),
    ),
    await trafficSection(t),
  );
}

async function trafficSection(t: Traffic): Promise<HTMLElement> {
  const head = h('div', {}, h('h2', {}, 'Site traffic'), h('p', { class: 'muted small' }, 'From Cloudflare Web Analytics: every visitor, guests included. Bots excluded. Up to 30 days.'));
  if (!t.connected) return h('section', { class: 'panel' }, head, await trafficSetup(t.tokenSet ?? false));
  if (t.error)
    return h(
      'section',
      { class: 'panel' },
      head,
      h('div', { class: 'notice warn' }, 'Cloudflare didn’t return traffic: ', t.error),
      h('details', {}, h('summary', {}, 'Connection settings'), await trafficSetup(true)),
    );
  const n = (v: number | undefined) => (v ?? 0).toLocaleString();
  const ranked = (title: string, rows: Ranked) => (rows ? rankBars(title, rows.map((r) => ({ name: r.name, value: r.views }))) : null);
  return h(
    'section',
    { class: 'panel stack' },
    head,
    t.errors?.length ? h('p', { class: 'small muted' }, 'Some parts didn’t load: ', t.errors.join('; ')) : null,
    h(
      'div',
      { class: 'chart-grid-2 days' },
      t.series ? dayChart('Visits', t.labels!, t.series.visits, { total: n(t.total?.visits) }) : null,
      t.series ? dayChart('Page views', t.labels!, t.series.pageViews, { total: n(t.total?.pageViews) }) : null,
    ),
    h(
      'div',
      { class: 'chart-grid-2' },
      ranked('Top pages (views)', t.pages ?? null),
      ranked('Where visitors came from', t.referrers ?? null),
      ranked('Countries', t.countries ?? null),
      ranked('Devices', t.devices ?? null),
    ),
    h('details', {}, h('summary', { class: 'small muted' }, 'Connection settings'), await trafficSetup(true)),
  );
}

async function trafficSetup(tokenSet: boolean): Promise<HTMLElement> {
  const cur = await api.get<{ accountId: string; siteTag: string; tokenSet: boolean }>('/admin/analytics/traffic/settings');
  const form = h(
    'form',
    { class: 'stack' },
    h('ol', { class: 'small' },
      h('li', {}, 'In Cloudflare, open My Profile → API Tokens → Create Token → Custom token. Give it the permission ', h('b', {}, 'Account → Account Analytics → Read'), ' for your account, then create it and copy the token.'),
      h('li', {}, 'In PowerShell, in your SnapShift folder: ', h('code', {}, 'npx wrangler secret put CF_ANALYTICS_TOKEN'), ' and paste the token.', tokenSet || cur.tokenSet ? h('span', { class: 'tag done' }, 'Token is set') : h('span', { class: 'tag failed' }, 'Not set yet')),
      h('li', {}, 'Paste your account ID and Web Analytics site tag below. Both are in the address bar on the Web Analytics page: the account ID is right after dash.cloudflare.com/, and the site tag comes after siteTag~in=.'),
    ),
    h('div', { class: 'field' }, h('label', {}, 'Account ID'), h('input', { name: 'accountId', value: cur.accountId, placeholder: '32 letters and numbers', autocomplete: 'off' })),
    h('div', { class: 'field' }, h('label', {}, 'Site tag'), h('input', { name: 'siteTag', value: cur.siteTag, placeholder: '32 letters and numbers', autocomplete: 'off' })),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save and load traffic')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/analytics/traffic/settings', Object.fromEntries(new FormData(form)));
      toast('Saved', '', 'good');
      void analytics();
    } catch (err) {
      toast('Couldn’t save', errorText(err), 'bad');
    }
  });
  return form;
}

async function overview() {
  const o = await api.get<Record<string, number | boolean>>('/admin/overview');
  const stat = (label: string, v: unknown) => h('div', { class: 'stat' }, h('span', { class: 'muted small' }, label), h('b', {}, String(v ?? 0)));
  mount(
    body,
    !o.elevenlabsConfigured ? h('div', { class: 'notice warn' }, 'ELEVENLABS_API_KEY is not set, so automatic puzzle generation is off. Add it with: npx wrangler secret put ELEVENLABS_API_KEY') : null,
    !o.emailConfigured ? h('div', { class: 'notice warn' }, 'RESEND_API_KEY is not set, so verification and password-reset emails are not sent.') : null,
    Number(o.dailyPoolLeft) < 7
      ? h('div', { class: 'notice warn' }, `Only ${o.dailyPoolLeft} unused puzzle(s) left in "Puzzles of the Day". Publish more to that category (or let automatic generation top it up), otherwise older puzzles get reused as dailies.`)
      : null,
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
        stat('Daily pool (unused)', o.dailyPoolLeft),
        stat('Unread messages', o.unreadMessages),
      ),
    ),
  );
}

/** Resize in the browser: a web-sized WebP for play and a thumbnail. */
async function makeWebCopies(src: string): Promise<{ image: Blob; thumb: Blob; small: Blob; width: number; height: number }> {
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
  return { image: await scaled(2400, 0.88), thumb: await scaled(640, 0.8), small: await scaled(1200, 0.85), width: img.naturalWidth, height: img.naturalHeight };
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
      f.set('small', copies.small, 'small.webp');
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
      p.request ? h('div', { class: 'notice small' }, h('b', {}, `Requested by ${p.request.username}: `), p.request.idea) : null,
      p.eventId && p.status !== 'published' ? h('div', { class: 'notice small' }, '🎉 For the event ', h('b', {}, p.eventId), '. Publishing adds it to the event.') : null,
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

/** What automatic generation is doing right now, and what its last run said. */
function genStatus(
  st: { started24h: number; manual24h: number; waiting: number; inflight: number; failed24h: number; openCategories: number },
  last: { at: number; source: 'schedule' | 'manual'; log: string[] } | null,
  s: GenSettings,
): HTMLElement {
  const ago = (t: number) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };
  const stale = !last || Date.now() - last.at > 30 * 60000;
  return h(
    'div',
    { class: `notice small${stale && s.enabled ? ' warn' : ''}` },
    h('div', {}, `Last 24 hours: ${st.started24h} automatic of ${s.perDay}${st.manual24h ? ` (+ ${st.manual24h} by hand)` : ''} · ${st.inflight} generating now · ${st.waiting} waiting for review (pauses at ${s.maxPending})${st.failed24h ? ` · ${st.failed24h} failed` : ''}`),
    last
      ? h('div', {}, h('b', {}, `Last scheduled run ${ago(last.at)}: `), last.log.length ? last.log.slice(0, 6).join(' · ') : 'nothing to do.')
      : h('div', {}, h('b', {}, 'No run recorded yet. '), 'The schedule records each run here; if this stays empty after deploying, the 10-minute schedule isn’t running.'),
    stale && last && s.enabled ? h('div', {}, 'The schedule normally runs every 10 minutes, so it looks like it hasn’t been running.') : null,
  );
}

async function generate() {
  const g = await api.get<{
    settings: GenSettings;
    jobs: Job[];
    configured: boolean;
    puzzleSuffix: string;
    looks: { id: string; label: string }[];
    status: { started24h: number; manual24h: number; waiting: number; inflight: number; failed24h: number; openCategories: number };
    lastRun: { at: number; source: 'schedule' | 'manual'; log: string[] } | null;
  }>('/admin/generation');
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
    genStatus(g.status, g.lastRun, s),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'enabled', checked: s.enabled }), 'Generate automatically'),
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', {}, 'Automatic images per 24 hours'), h('input', { type: 'number', name: 'perDay', min: 0, max: 100, value: s.perDay })),
      h('div', { class: 'field' }, h('label', {}, 'Pause when this many are waiting'), h('input', { type: 'number', name: 'maxPending', min: 1, max: 500, value: s.maxPending })),
      h('div', { class: 'field' }, h('label', {}, 'Keep this many daily puzzles ready'), h('input', { type: 'number', name: 'dailyPoolTarget', min: 0, max: 365, value: s.dailyPoolTarget })),
    ),
    h('p', { class: 'muted small' }, 'Daily puzzles are generated first, into "Puzzles of the Day", whenever fewer than that many unused ones are published or waiting.'),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Photo-realistic pictures (%)'),
      h('input', { type: 'number', name: 'photoShare', min: 0, max: 100, step: 5, value: s.photoShare ?? 60, style: 'max-width:120px' }),
      h('span', { class: 'small muted' }, 'The rest get an artistic look: watercolour, oil painting, concept art, storybook illustration and more. 100 = photos only, 0 = art only. The Art category is always painted.'),
    ),
    h('div', { class: 'field' }, h('label', {}, 'Model'), h('input', { name: 'model', value: s.model, list: 'models' }), h('datalist', { id: 'models' }, ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gpt-image-2', 'gpt-image-1.5', 'bytedance-seedream-5-pro'].map((m) => h('option', { value: m })))),
    h('div', { class: 'field' }, h('label', {}, 'Extra model options (JSON)'), h('input', { name: 'options', value: JSON.stringify(s.options) }), h('span', { class: 'small muted' }, 'Sent with every request, e.g. {"aspect_ratio":"16:9","resolution":"2K"}. Each model accepts different fields.')),
    h('div', { class: 'field' }, h('label', {}, 'Only these categories (leave all unticked for every category)'), h('div', { class: 'row' }, cats.filter((c) => c.id !== 'daily').map((c) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'cat', value: c.id, checked: s.categories.includes(c.id) }), c.name)))),
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
      dailyPoolTarget: Number(f.get('dailyPoolTarget')),
      photoShare: Number(f.get('photoShare')),
    });
    toast('Saved', '', 'good');
  });

  const now = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'Generate now'),
    h('p', { class: 'muted small' }, 'Leave the prompt empty to use built-in ideas for the category. Puzzle-friendly guidance is added automatically: ', h('i', {}, g.puzzleSuffix)),
    h('div', { class: 'row' }, catSelect(null), h('input', { type: 'number', name: 'count', min: 1, max: 10, value: 1, style: 'max-width:90px', 'aria-label': 'How many' })),
    h(
      'div',
      { class: 'field', style: 'margin-top:8px' },
      h('label', {}, 'Look'),
      h('select', { name: 'look' }, g.looks.map((l) => h('option', { value: l.id }, l.label))),
      h('span', { class: 'small muted' }, `Automatic: ${s.photoShare ?? 60}% photo-realistic for built-in ideas (set under Automatic generation); your own prompt is sent as written. Any other choice is added to your prompt too.`),
    ),
    h('div', { class: 'field', style: 'margin-top:8px' }, h('label', {}, 'Prompt (optional)'), h('textarea', { name: 'prompt', placeholder: 'A red fox curled up in fresh snow at sunrise, photograph' })),
    h('div', { class: 'field' }, h('label', {}, 'Title (optional)'), h('input', { name: 'title' })),
    h('button', { class: 'btn primary', type: 'submit', disabled: !g.configured }, g.configured ? 'Generate' : 'Set ELEVENLABS_API_KEY first'),
    logBox,
  );
  now.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(now);
    try {
      const r = await api.post<{ log: string[] }>('/admin/generate', { categoryId: f.get('categoryId'), count: Number(f.get('count')), prompt: f.get('prompt'), title: f.get('title'), look: f.get('look') });
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
  const [{ puzzles }, needs] = await Promise.all([
    api.get<{ puzzles: AdminPuzzle[] }>('/admin/puzzles?status=published'),
    api.get<{ puzzles: { id: number; title: string; image: string }[] }>('/admin/puzzles/needs-small'),
  ]);
  mount(
    body,
    h('section', { class: 'panel' }, h('h2', {}, `Published (${puzzles.length})`), h('p', { class: 'muted' }, 'Edit titles and categories. Removing a puzzle that people have played hides it but keeps their results.')),
    needs.puzzles.length ? phoneCopiesPanel(needs.puzzles) : null,
    h('div', { class: 'grid wide' }, puzzles.map((p) => reviewCard(p, published))),
  );
}

/** Older puzzles have no phone-sized copy: make them here, in the browser, a few at a time. */
function phoneCopiesPanel(list: { id: number; title: string; image: string }[]): HTMLElement {
  const status = h('span', { class: 'muted small' }, '');
  const go = h('button', { class: 'btn primary' }, `Make phone copies (${list.length})`);
  go.addEventListener('click', async () => {
    go.setAttribute('disabled', '');
    let done = 0;
    let failed = 0;
    for (const p of list) {
      status.textContent = `${done + failed + 1} of ${list.length}: ${p.title}`;
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = p.image;
        await img.decode();
        const w = Math.min(1200, img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/webp', 0.85));
        const f = new FormData();
        f.set('small', blob, 'small.webp');
        await api.post(`/admin/puzzles/${p.id}/small`, f);
        done++;
      } catch {
        failed++;
      }
    }
    status.textContent = `Done: ${done} made${failed ? `, ${failed} failed (try again)` : ''}.`;
    toast('Phone copies made', `${done} pictures`, 'good');
  });
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Faster pictures on phones'),
    h('p', { class: 'muted' }, `${list.length} published ${list.length === 1 ? 'puzzle has' : 'puzzles have'} no phone-sized copy yet. Phones load a picture about a quarter of the size when there is one. New puzzles get one when you publish.`),
    h('div', { class: 'row' }, go, status),
  );
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
        h('label', { class: 'check', title: 'Only SnapShift Plus members can play this category' }, h('input', { type: 'checkbox', name: 'members_only', checked: !!c.members_only }), 'Members only'),
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
        await api.put(`/admin/categories/${encodeURIComponent(String(d.get('id')))}`, { ...Object.fromEntries(d), sort: Number(d.get('sort')), generate: d.get('generate') === 'on', members_only: d.get('members_only') === 'on' });
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
  const d = await api.get<{ today: string; poolLeft: number; days: { day: string; puzzle_id: number; title: string; players: number }[] }>('/admin/daily');
  const { puzzles } = await api.get<{ puzzles: AdminPuzzle[] }>('/admin/puzzles?status=published');
  const f = h('form', { class: 'row' }, h('input', { type: 'date', name: 'day', min: d.today, value: d.today, required: true, style: 'max-width:180px' }), h('select', { name: 'puzzleId' }, [...puzzles].sort((a, b) => Number(b.categoryId === 'daily') - Number(a.categoryId === 'daily')).map((p) => h('option', { value: p.id }, `${p.title} (${p.categoryId})`))), h('button', { class: 'btn', type: 'submit' }, 'Schedule'));
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
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Choose a daily'),
      h('p', { class: 'muted' }, `Days without a choice automatically use the next unused puzzle in "Puzzles of the Day" (${d.poolLeft} left; change their order with the sort number in Published). If that runs out, a puzzle from the other categories is reused.`),
      f,
    ),
    h('section', { class: 'panel' }, h('h2', {}, 'Recent dailies'), h('table', {}, h('tbody', {}, d.days.map((x) => h('tr', {}, h('td', {}, x.day), h('td', {}, x.title), h('td', { class: 'num' }, `${x.players} players`)))))),
  );
}

async function players() {
  const search = h('input', { placeholder: 'Search username or email', style: 'max-width:320px' }) as HTMLInputElement;
  const list = h('div');
  const load = async () => {
    const { users } = await api.get<{ users: { id: number; username: string; email: string; role: string; points: number; email_verified: number; created_at: number; supporter_until: number | null; lifetime: number; stripe_subscription_id: string | null }[] }>(`/admin/users?q=${encodeURIComponent(search.value)}`);
    mount(
      list,
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Email'), h('th', {}, 'Plus'), h('th', { class: 'num' }, 'Points'), h('th', {}, ''))),
        h(
          'tbody',
          {},
          users.map((u) =>
            h(
              'tr',
              {},
              h('td', {}, u.username, u.role === 'admin' ? ' (admin)' : ''),
              h('td', { class: 'small' }, u.email, u.email_verified ? '' : ' · unverified'),
              h(
                'td',
                { class: 'small' },
                u.lifetime
                  ? 'Lifetime'
                  : u.supporter_until && u.supporter_until > Date.now()
                    ? `${u.stripe_subscription_id ? 'Paying' : 'Given'} · until ${new Date(u.supporter_until).toLocaleDateString()}`
                    : '—',
              ),
              h('td', { class: 'num' }, u.points),
              h(
                'td',
                { class: 'row end' },
                h('button', { class: 'btn', onclick: () => pointsDialog(u, load) }, 'Points'),
                h('button', { class: 'btn', onclick: async () => { const v = prompt(`Give ${u.username} SnapShift Plus for how many days? (0 removes it)`, '30'); if (v !== null) { await api.post(`/admin/users/${u.id}/supporter`, { days: Number(v) }); toast('Updated', '', 'good'); await load(); } } }, 'Plus days'),
                h('button', { class: 'btn', onclick: async () => { if (confirm(u.lifetime ? `Remove lifetime Plus from ${u.username}?` : `Give ${u.username} lifetime Plus?`)) { await api.post(`/admin/users/${u.id}/supporter`, { lifetime: !u.lifetime }); toast('Updated', '', 'good'); await load(); } } }, u.lifetime ? 'Remove lifetime' : 'Lifetime'),
              ),
            ),
          ),
        ),
      ),
    );
  };
  search.addEventListener('change', load);
  const log = h('div');
  const loadLog = async () => {
    const { rows } = await api.get<{ rows: { delta: number; ref: string | null; created_at: number; username: string }[] }>('/admin/points/recent');
    mount(
      log,
      rows.length
        ? h('table', {}, h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.username), h('td', { class: 'small muted' }, r.ref ?? ''), h('td', { class: 'small muted' }, new Date(r.created_at).toLocaleString()), h('td', { class: 'num', style: `color:${r.delta > 0 ? 'var(--ok)' : 'var(--muted)'}` }, `${r.delta > 0 ? '+' : ''}${r.delta}`)))))
        : h('p', { class: 'muted' }, 'No points given yet.'),
    );
  };
  const reload = async () => {
    await load();
    await loadLog();
  };
  mount(
    body,
    h('section', { class: 'panel' }, h('h2', {}, 'Players'), search, list),
    h('div', { class: 'two-col' }, await groupGrantPanel(reload), h('section', { class: 'panel' }, h('h2', {}, 'Points given by admins'), log)),
  );
  await reload();
}

const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];

/** Give or take points from one player, with a note they see in their history. */
function pointsDialog(u: { id: number; username: string; points: number }, onDone: () => Promise<void>) {
  const amount = h('input', { type: 'number', step: '1', value: '100', style: 'max-width:160px' }) as HTMLInputElement;
  const take = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const note = h('input', { maxlength: 120, placeholder: 'e.g. Thanks for the bug report!' }) as HTMLInputElement;
  const err = h('p', { class: 'error' });
  const save = h('button', { class: 'btn primary' }, 'Give points') as HTMLButtonElement;
  const sync = () => (save.textContent = take.checked ? `Take ${amount.value || 0} points` : `Give ${amount.value || 0} points`);
  amount.addEventListener('input', sync);
  take.addEventListener('change', sync);
  const d = modal(
    h('h2', {}, `Points for ${u.username}`),
    h('p', { class: 'muted' }, `Balance: ${u.points.toLocaleString()} points.`),
    h('div', { class: 'row' }, QUICK_AMOUNTS.map((n) => h('button', { class: 'btn', onclick: () => ((amount.value = String(n)), sync()) }, `+${n}`))),
    h('div', { class: 'field', style: 'margin-top:10px' }, h('label', {}, 'Amount'), h('div', { class: 'row' }, amount, h('label', { class: 'check' }, take, 'Take points away instead'))),
    h('div', { class: 'field' }, h('label', {}, 'Note (the player sees this in their points history)'), note),
    h('p', { class: 'small muted' }, 'Given points can be spent like any others but don’t count toward the points leaderboard.'),
    err,
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => d.close() }, 'Cancel'), save),
  );
  save.addEventListener('click', async () => {
    const n = Math.abs(Math.round(Number(amount.value)));
    if (!n) return void (err.textContent = 'Enter an amount.');
    save.disabled = true;
    try {
      const r = await api.post<{ points: number }>(`/admin/users/${u.id}/points`, { delta: take.checked ? -n : n, note: note.value || (take.checked ? 'Adjustment' : 'Gift from SnapShift') });
      toast(take.checked ? 'Points taken' : 'Points given', `${u.username} now has ${r.points.toLocaleString()} points.`, 'good');
      d.close();
      await onDone();
    } catch (x) {
      err.textContent = errorText(x);
      save.disabled = false;
    }
  });
}

/** Give the same points to a whole group of players. */
async function groupGrantPanel(onDone: () => Promise<void>): Promise<HTMLElement> {
  const { groups } = await api.get<{ groups: { id: string; label: string; count: number }[] }>('/admin/points/groups');
  const group = h('select', {}, groups.map((g) => h('option', { value: g.id }, `${g.label} (${g.count})`))) as HTMLSelectElement;
  const amount = h('input', { type: 'number', min: '1', max: '10000', value: '100', style: 'max-width:140px' }) as HTMLInputElement;
  const note = h('input', { maxlength: 120, placeholder: 'e.g. Happy holidays from SnapShift!' }) as HTMLInputElement;
  const go = h('button', { class: 'btn primary' }, 'Give points') as HTMLButtonElement;
  go.addEventListener('click', async () => {
    const g = groups.find((x) => x.id === group.value)!;
    const n = Math.round(Number(amount.value));
    if (!(n >= 1)) return toast('Enter an amount', '', 'bad');
    if (!confirm(`Give ${n.toLocaleString()} points to ${g.count} players (${g.label})?`)) return;
    go.disabled = true;
    try {
      const r = await api.post<{ players: number }>('/admin/points/grant', { group: g.id, amount: n, note: note.value || 'Gift from SnapShift' });
      toast('Points given', `${n} points to ${r.players} players.`, 'good');
      await onDone();
    } catch (x) {
      toast('Could not give points', errorText(x), 'bad', 6000);
    } finally {
      go.disabled = false;
    }
  });
  return h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Give points to a group'),
    h('p', { class: 'muted small' }, 'Everyone in the group gets the same amount, with your note in their points history.'),
    h('div', { class: 'field' }, h('label', {}, 'Who'), group),
    h('div', { class: 'field' }, h('label', {}, 'Points each'), amount),
    h('div', { class: 'field' }, h('label', {}, 'Note'), note),
    go,
  );
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

async function uploadSiteImage(file: File): Promise<string> {
  const f = new FormData();
  f.set('file', file);
  return (await api.post<{ url: string }>('/admin/site/image', f)).url;
}

const BANNER_PAGES: [string, string][] = [
  ['all', 'Every page'],
  ['home', 'Home'],
  ['categories', 'Browse categories'],
  ['category', 'Category pages'],
  ['play', 'Game (below the board)'],
  ['daily', 'Daily & archive'],
  ['leaderboard', 'Leaderboard'],
  ['account', 'Account'],
  ['info', 'Info pages (about, FAQ, …)'],
];

async function site() {
  const s = await api.get<{
    announcement: string;
    supporterMonthlyUrl: string;
    supporterYearlyUrl: string;
    contactEmail: string;
    analyticsToken: string;
    theme: Theme;
    banners: Banner[];
  }>('/admin/site');

  // ---- general ----
  const general = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'General'),
    h('div', { class: 'field' }, h('label', {}, 'Announcement (a notice at the top of every page; empty to hide)'), h('input', { name: 'announcement', value: s.announcement })),
    h('div', { class: 'field' }, h('label', {}, 'Contact email shown to players'), h('input', { name: 'contactEmail', value: s.contactEmail })),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Cloudflare Web Analytics token (empty = off)'),
      h('input', { name: 'analyticsToken', value: s.analyticsToken, placeholder: 'e.g. 0123456789abcdef…', autocomplete: 'off' }),
      h('span', { class: 'small muted' }, 'Cloudflare dashboard → Analytics & Logs → Web Analytics → Add a site → copy the token from the snippet. Cookie-free visitor counts.'),
    ),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  );
  general.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.put('/admin/site', Object.fromEntries(new FormData(general)));
    toast('Saved', '', 'good');
  });

  // ---- look & feel (live preview on the whole admin page while editing) ----
  const theme: Theme = { ...s.theme };
  const DEFAULTS: Theme = {
    backgroundImage: '/img/background.jpg', backgroundOpacity: 0.16, backgroundFit: 'cover', backgroundBlur: 0, panelOpacity: 0.86,
    baseColor: '#05080f', panelColor: '#0f172a', pillColor: '#01461e', buttonColor: '#092c4e', accentColor: '#7cc4ff',
  };
  const preview = h(
    'div',
    { class: 'theme-preview' },
    h('div', { class: 'pv-bg' }),
    h('div', { class: 'pv-panel' }, h('b', {}, 'Preview panel'), h('div', { class: 'row' }, h('span', { class: 'pill' }, 'Next daily 04:12:00'), h('span', { class: 'btn' }, 'Button'), h('a', { href: '#' }, 'A link'))),
  );
  const apply = () => {
    applyTheme(theme, preview);
    applyTheme(theme); // whole page, so you see it in context
  };
  const range = (key: 'backgroundOpacity' | 'panelOpacity' | 'backgroundBlur', label: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
    const out = h('span', { class: 'muted small' }, fmt(theme[key]));
    const input = h('input', { type: 'range', min, max, step, value: theme[key] }) as HTMLInputElement;
    input.addEventListener('input', () => {
      theme[key] = Number(input.value);
      out.textContent = fmt(theme[key]);
      apply();
    });
    return h('div', { class: 'field' }, h('label', {}, label, ' ', out), input);
  };
  const colour = (key: 'baseColor' | 'panelColor' | 'pillColor' | 'buttonColor' | 'accentColor', label: string) => {
    const input = h('input', { type: 'color', value: theme[key] }) as HTMLInputElement;
    input.addEventListener('input', () => {
      theme[key] = input.value;
      apply();
    });
    return h('div', { class: 'field', style: 'min-width:120px' }, h('label', {}, label), input);
  };
  const bgUrl = h('input', { value: theme.backgroundImage, placeholder: '/img/background.jpg or an uploaded image' }) as HTMLInputElement;
  bgUrl.addEventListener('change', () => {
    theme.backgroundImage = bgUrl.value.trim();
    apply();
  });
  const bgFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'max-width:260px' }) as HTMLInputElement;
  bgFile.addEventListener('change', async () => {
    if (!bgFile.files?.[0]) return;
    try {
      theme.backgroundImage = await uploadSiteImage(bgFile.files[0]);
      bgUrl.value = theme.backgroundImage;
      apply();
      toast('Uploaded', 'Press Save to use it on the site.', 'good');
    } catch (x) {
      toast('Upload failed', errorText(x), 'bad');
    }
  });
  const fit = h('select', {}, [['cover', 'Fill the screen (crop)'], ['contain', 'Fit whole picture'], ['repeat', 'Tile / repeat']].map(([v, l]) => h('option', { value: v, selected: theme.backgroundFit === v }, l))) as HTMLSelectElement;
  fit.addEventListener('change', () => {
    theme.backgroundFit = fit.value as Theme['backgroundFit'];
    apply();
  });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const look = h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Look & feel'),
    h('p', { class: 'muted small' }, 'Changes preview on this page straight away. Players see them after you press Save.'),
    preview,
    h('div', { class: 'field', style: 'margin-top:12px' }, h('label', {}, 'Background image'), bgUrl, h('div', { class: 'row', style: 'margin-top:6px' }, bgFile, h('button', { class: 'btn', type: 'button', onclick: () => { theme.backgroundImage = ''; bgUrl.value = ''; apply(); } }, 'No image'))),
    h('div', { class: 'field' }, h('label', {}, 'Background fit'), fit),
    range('backgroundOpacity', 'Background visibility', 0, 1, 0.01, pct),
    range('backgroundBlur', 'Background blur', 0, 20, 1, (v) => `${v}px`),
    range('panelOpacity', 'Panel solidity (lower = more see-through)', 0.3, 1, 0.01, pct),
    h('div', { class: 'row' }, colour('baseColor', 'Page colour'), colour('panelColor', 'Panel colour'), colour('pillColor', 'Pill colour'), colour('buttonColor', 'Button colour'), colour('accentColor', 'Link colour')),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => { await api.put('/admin/site', { theme }); toast('Saved', 'The new look is live.', 'good'); } }, 'Save'),
      h('button', { class: 'btn', onclick: async () => { if (!confirm('Put the original background, transparency and colours back?')) return; await api.put('/admin/site', { theme: DEFAULTS }); applyTheme(DEFAULTS); toast('Reset', 'The original look is back.', 'good'); await site(); } }, 'Reset to defaults'),
    ),
  );

  // ---- banners ----
  const banners: Banner[] = s.banners.map((b) => ({ ...b }));
  const list = h('div', { class: 'stack' });
  const drawBanners = () => {
    mount(
      list,
      banners.length
        ? banners.map((b, i) => {
            const field = (key: 'href' | 'alt', placeholder: string) => {
              const input = h('input', { value: b[key], placeholder }) as HTMLInputElement;
              input.addEventListener('input', () => (b[key] = input.value));
              return input;
            };
            const date = (key: 'start' | 'end') => {
              const input = h('input', { type: 'date', value: b[key], style: 'max-width:170px' }) as HTMLInputElement;
              input.addEventListener('change', () => (b[key] = input.value));
              return input;
            };
            const pos = h('select', { style: 'max-width:200px' }, h('option', { value: 'top', selected: b.position === 'top' }, 'Above the content'), h('option', { value: 'bottom', selected: b.position === 'bottom' }, 'Below the content')) as HTMLSelectElement;
            pos.addEventListener('change', () => (b.position = pos.value as Banner['position']));
            const on = h('input', { type: 'checkbox', checked: b.enabled }) as HTMLInputElement;
            on.addEventListener('change', () => (b.enabled = on.checked));
            const ad = h('input', { type: 'checkbox', checked: b.audience === 'free' }) as HTMLInputElement;
            ad.addEventListener('change', () => (b.audience = ad.checked ? 'free' : 'all'));
            return h(
              'div',
              { class: 'panel soft' },
              h('img', { src: b.image, alt: '', style: 'max-height:120px;width:auto;border-radius:10px;margin-bottom:10px' }),
              h('div', { class: 'field' }, h('label', {}, 'Link when clicked (optional)'), field('href', 'https://… or /plus')),
              h('div', { class: 'field' }, h('label', {}, 'Description for screen readers'), field('alt', 'e.g. SnapShift t-shirts are here')),
              h('div', { class: 'field' }, h('label', {}, 'Show on'), h('div', { class: 'row' }, BANNER_PAGES.map(([key, label]) => {
                const cb = h('input', { type: 'checkbox', checked: b.pages.includes(key) }) as HTMLInputElement;
                cb.addEventListener('change', () => {
                  b.pages = cb.checked ? [...b.pages, key] : b.pages.filter((p) => p !== key);
                });
                return h('label', { class: 'check' }, cb, label);
              }))),
              h('div', { class: 'row' }, pos, h('span', { class: 'muted small' }, 'From'), date('start'), h('span', { class: 'muted small' }, 'to'), date('end'), h('label', { class: 'check' }, on, 'Show'), h('label', { class: 'check', title: 'An ad: SnapShift Plus members don’t see it' }, ad, 'Ad (hide for Plus members)')),
              h(
                'div',
                { class: 'row', style: 'margin-top:8px' },
                h('button', { class: 'btn', disabled: i === 0, onclick: () => { [banners[i - 1], banners[i]] = [banners[i], banners[i - 1]]; drawBanners(); } }, '↑'),
                h('button', { class: 'btn', disabled: i === banners.length - 1, onclick: () => { [banners[i + 1], banners[i]] = [banners[i], banners[i + 1]]; drawBanners(); } }, '↓'),
                h('button', { class: 'btn danger', onclick: () => { if (confirm('Remove this banner?')) { banners.splice(i, 1); drawBanners(); } } }, 'Remove'),
              ),
            );
          })
        : h('p', { class: 'muted' }, 'No banners yet.'),
    );
  };
  const addFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'max-width:260px' }) as HTMLInputElement;
  addFile.addEventListener('change', async () => {
    if (!addFile.files?.[0]) return;
    try {
      const url = await uploadSiteImage(addFile.files[0]);
      banners.push({ id: Math.random().toString(36).slice(2, 10), image: url, href: '', alt: '', pages: ['home'], position: 'top', enabled: true, start: '', end: '' });
      addFile.value = '';
      drawBanners();
      toast('Banner added', 'Set where it shows, then press Save banners.', 'good');
    } catch (x) {
      toast('Upload failed', errorText(x), 'bad');
    }
  });
  const bannerSection = h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Banners'),
    h('p', { class: 'muted small' }, 'Images shown above or below the page content (wide images work best, e.g. 1200×200). If several banners match the same page and position, one is picked at random on each visit. On the game page only "below the content" banners show.'),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, h('b', {}, 'Add a banner:'), addFile),
    list,
    h('button', { class: 'btn primary', style: 'margin-top:12px', onclick: async () => {
      try {
        const r = await api.put<{ banners: Banner[] }>('/admin/site', { banners });
        banners.splice(0, banners.length, ...r.banners);
        drawBanners();
        toast('Banners saved', '', 'good');
      } catch (x) {
        toast('Could not save', errorText(x), 'bad');
      }
    } }, 'Save banners'),
  );
  drawBanners();

  mount(body, h('div', { class: 'two-col' }, look, general), bannerSection);
  apply();
}

interface BillingInfo {
  settings: Record<'monthlyPriceId' | 'yearlyPriceId' | 'lifetimePriceId' | 'monthlyLabel' | 'yearlyLabel' | 'lifetimeLabel' | 'promoEnabled' | 'promoTitle' | 'promoText', string>;
  stripeKey: boolean;
  stripeTestMode: boolean;
  webhookSecret: boolean;
  webhookUrl: string;
  members: { lifetime: number; subscribers: number; granted: number };
}

async function membership() {
  const b = await api.get<BillingInfo>('/admin/billing');
  const ok = (v: boolean, yes: string, no: string) => h('span', { class: `tag ${v ? 'done' : 'failed'}` }, v ? yes : no);
  const field = (name: keyof BillingInfo['settings'], label: string, placeholder: string) =>
    h('div', { class: 'field' }, h('label', {}, label), h('input', { name, value: b.settings[name], placeholder }));
  const f = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'Plans'),
    h('p', { class: 'muted small' }, 'Create the products and prices in your Stripe dashboard, then paste each price id here (it starts with price_). The labels are what players see on the Plus page. Leave a price empty to hide that plan.'),
    h('div', { class: 'two-col' },
      h('div', {}, field('monthlyPriceId', 'Monthly price id (recurring, monthly)', 'price_…'), field('yearlyPriceId', 'Yearly price id (recurring, yearly)', 'price_…'), field('lifetimePriceId', 'Lifetime price id (one-time)', 'price_…')),
      h('div', {}, field('monthlyLabel', 'Monthly label', '$2.99 / month'), field('yearlyLabel', 'Yearly label', '$24.99 / year'), field('lifetimeLabel', 'Lifetime label', '$49 once')),
    ),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save plans'),
  );
  const promoOn = h('input', { type: 'checkbox', checked: b.settings.promoEnabled !== '0' }) as HTMLInputElement;
  const promo = h(
    'form',
    { class: 'panel' },
    h('h2', {}, 'Plus section on the site'),
    h('p', { class: 'muted small' }, 'A section about Plus on the home page, plus a short line on category and daily archive pages. Only guests and free players see it.'),
    h('label', { class: 'check' }, promoOn, 'Show it'),
    h('div', { class: 'field' }, h('label', {}, 'Heading'), h('input', { name: 'promoTitle', value: b.settings.promoTitle, maxlength: 120 })),
    h('div', { class: 'field' }, h('label', {}, 'Text'), h('textarea', { name: 'promoText', rows: 2, maxlength: 300 }, b.settings.promoText)),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save section'), h('a', { class: 'btn', href: '/', target: '_blank' }, 'View home page')),
  );
  promo.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/billing', { ...Object.fromEntries(new FormData(promo)), promoEnabled: promoOn.checked ? '1' : '0' });
      toast('Saved', '', 'good');
    } catch (x) {
      toast('Could not save', errorText(x), 'bad', 6000);
    }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/billing', Object.fromEntries(new FormData(f)));
      toast('Saved', '', 'good');
    } catch (x) {
      toast('Could not save', errorText(x), 'bad', 6000);
    }
  });
  mount(
    body,
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'SnapShift Plus'),
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Paying members'), h('b', {}, b.members.subscribers)),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Lifetime'), h('b', {}, b.members.lifetime)),
        h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'Given by admin'), h('b', {}, b.members.granted)),
      ),
      h(
        'p',
        { style: 'margin-top:12px' },
        'Stripe secret key: ',
        ok(b.stripeKey, b.stripeTestMode ? 'set (test mode)' : 'set', 'missing'),
        ' · Webhook secret: ',
        ok(b.webhookSecret, 'set', 'missing'),
      ),
      h('p', { class: 'muted small' }, 'Webhook URL for Stripe: ', h('code', {}, b.webhookUrl)),
      h('p', { class: 'muted small' }, 'Events to send: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, charge.refunded.'),
    ),
    f,
    promo,
  );
}

interface AdminEvent {
  id: string;
  title: string;
  description: string;
  image_url: string;
  starts: string;
  ends: string;
  bonus: number;
  puzzles: number;
  players: number;
  puzzleIds: number[];
}

/** Generate pictures only for one event: one per idea line, from a theme pack or your own. */
function eventGenerator(e: AdminEvent): HTMLElement {
  const ideas = h('textarea', { rows: 8, placeholder: 'One picture per line, like:\nSnowy Log Cabin: a log cabin in deep snow at blue hour, warm glowing windows' }) as HTMLTextAreaElement;
  const theme = h('select', { 'aria-label': 'Theme pack' }, h('option', { value: '' }, 'Fill from a theme pack…')) as HTMLSelectElement;
  const look = h('select', { 'aria-label': 'Look' }) as HTMLSelectElement;
  const count = h('span', { class: 'pill dark' }, '0 pictures');
  const go = h('button', { class: 'btn primary', type: 'button' }, 'Generate pictures');
  const out = h('pre', { class: 'log', hidden: true });
  const lines = () => ideas.value.split('\n').map((x) => x.trim()).filter(Boolean);
  const recount = () => {
    const n = lines().length;
    count.textContent = `${n} ${n === 1 ? 'picture' : 'pictures'}`;
    go.toggleAttribute('disabled', n === 0 || n > 30);
  };
  ideas.addEventListener('input', recount);
  let packs: { id: string; label: string; ideas: string[] }[] = [];
  void api.get<{ themes: typeof packs; looks: { id: string; label: string }[] }>('/admin/events/themes').then((d) => {
    packs = d.themes;
    theme.append(...packs.map((p) => h('option', { value: p.id }, `${p.label} (${p.ideas.length} ideas)`)));
    look.append(...d.looks.map((l) => h('option', { value: l.id, selected: l.id === 'photo' }, l.id === 'auto' ? 'Automatic (the photo-realistic % mix)' : l.label)));
  });
  theme.addEventListener('change', () => {
    const p = packs.find((x) => x.id === theme.value);
    if (p) ideas.value = p.ideas.join('\n');
    recount();
  });
  go.addEventListener('click', async () => {
    const n = lines().length;
    if (!n || !confirm(`Generate ${n} ${n === 1 ? 'picture' : 'pictures'} for “${e.title}”? This uses ElevenLabs credits.`)) return;
    go.setAttribute('disabled', '');
    go.textContent = 'Starting…';
    try {
      const r = await api.post<{ jobs: string[]; log: string[] }>(`/admin/events/${encodeURIComponent(e.id)}/generate`, { ideas: lines(), look: look.value });
      out.hidden = false;
      out.textContent = r.log.join('\n') || 'Queued.';
      toast(`${r.jobs.length} pictures generating`, 'They’ll appear in Review in a few minutes. Publishing adds them to this event.', 'good', 8000);
    } catch (x) {
      toast('Couldn’t start', errorText(x), 'bad', 6000);
    } finally {
      go.textContent = 'Generate pictures';
      recount();
    }
  });
  recount();
  return h(
    'div',
    { class: 'section-box', style: 'margin-top:14px' },
    h('h3', {}, 'Generate pictures just for this event'),
    h('p', { class: 'muted small' }, 'These go to “Event pictures”: never shown in the categories, Time Attack or the slider, and playable only while an event they’re in is on. They wait in Review like any other picture; publishing one adds it to this event.'),
    h('div', { class: 'row' }, theme, look, count),
    ideas,
    h('p', { class: 'muted small' }, 'One picture per line. “Title: what to picture” sets the title; up to 30 at a time.'),
    h('div', { class: 'row' }, go),
    out,
  );
}

async function events() {
  const [{ events: list }, { puzzles }] = await Promise.all([
    api.get<{ events: AdminEvent[] }>('/admin/events'),
    api.get<{ puzzles: AdminPuzzle[] }>('/admin/puzzles?status=published'),
  ]);
  const today = new Date().toLocaleDateString('en-CA');
  const plusDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA');
  };
  const editor = h('div');
  const edit = (e: AdminEvent | null) => {
    const chosen = new Set(e?.puzzleIds ?? []);
    const img = h('input', { name: 'image_url', value: e?.image_url ?? '', placeholder: '/media/site/… or https://…' }) as HTMLInputElement;
    const upload = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
    upload.addEventListener('change', async () => {
      const f = upload.files?.[0];
      if (!f) return;
      try {
        img.value = await uploadSiteImage(f);
        toast('Image uploaded', '', 'good');
      } catch (x) {
        toast('Upload failed', errorText(x), 'bad');
      }
    });
    const search = h('input', { placeholder: 'Filter puzzles', style: 'max-width:260px' }) as HTMLInputElement;
    const count = h('span', { class: 'pill dark' }, '');
    const grid = h('div', { class: 'event-picker' });
    const drawPicker = () => {
      const q = search.value.trim().toLowerCase();
      count.textContent = `${chosen.size} chosen`;
      mount(
        grid,
        puzzles
          .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.categoryId ?? '').includes(q) || chosen.has(p.id))
          .map((p) => {
            const box = h('input', { type: 'checkbox', checked: chosen.has(p.id) }) as HTMLInputElement;
            box.addEventListener('change', () => {
              if (box.checked) chosen.add(p.id);
              else chosen.delete(p.id);
              count.textContent = `${chosen.size} chosen`;
            });
            return h('label', { class: 'pick' }, box, h('span', { class: 'thumb', style: bg(p.thumb) }), h('span', { class: 'small' }, p.title, h('br'), h('span', { class: 'muted' }, p.categoryId === 'events' ? `event picture${p.eventId ? ` · ${p.eventId}` : ''}` : (p.categoryId ?? ''))));
          }),
      );
    };
    search.addEventListener('input', drawPicker);
    const f = h(
      'form',
      { class: 'panel' },
      h('h2', {}, e ? `Edit “${e.title}”` : 'New event'),
      h('div', { class: 'two-col' },
        h('div', {},
          h('div', { class: 'field' }, h('label', {}, 'Short id (used in the link)'), h('input', { name: 'id', value: e?.id ?? '', placeholder: 'ocean-week', required: true, readOnly: !!e })),
          h('div', { class: 'field' }, h('label', {}, 'Title'), h('input', { name: 'title', value: e?.title ?? '', placeholder: 'Ocean Week', required: true })),
          h('div', { class: 'field' }, h('label', {}, 'Description'), h('textarea', { name: 'description', rows: 2 }, e?.description ?? '')),
        ),
        h('div', {},
          h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', {}, 'First day'), h('input', { type: 'date', name: 'starts', value: e?.starts ?? today, required: true })),
            h('div', { class: 'field' }, h('label', {}, 'Last day'), h('input', { type: 'date', name: 'ends', value: e?.ends ?? plusDays(6), required: true })),
          ),
          h('div', { class: 'field' }, h('label', {}, 'Bonus for finishing every puzzle (points)'), h('input', { type: 'number', name: 'bonus', min: 0, max: 5000, value: e?.bonus ?? 300 })),
          h('div', { class: 'field' }, h('label', {}, 'Picture (optional)'), img, upload),
        ),
      ),
      h('div', { class: 'row', style: 'margin:8px 0' }, h('b', {}, 'Puzzles'), count, search),
      h('p', { class: 'muted small' }, 'Pick published puzzles. While the event is on they’re free for everyone. Pictures generated for this event (below) join it automatically when you publish them.'),
      grid,
      e ? eventGenerator(e) : h('p', { class: 'notice small' }, 'Save the event first, then you can generate pictures just for it.'),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save event'), h('button', { class: 'btn ghost', type: 'button', onclick: () => mount(editor) }, 'Cancel')),
    );
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = new FormData(f);
      try {
        await api.put(`/admin/events/${encodeURIComponent(String(d.get('id')))}`, {
          title: d.get('title'),
          description: d.get('description'),
          image_url: img.value,
          starts: d.get('starts'),
          ends: d.get('ends'),
          bonus: Number(d.get('bonus')),
          puzzleIds: [...chosen],
        });
        toast('Event saved', '', 'good');
        await events();
      } catch (x) {
        toast('Could not save', errorText(x), 'bad', 6000);
      }
    });
    mount(editor, f);
    drawPicker();
    f.scrollIntoView({ behavior: 'smooth' });
  };
  mount(
    body,
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'spread' }, h('h2', {}, 'Events'), h('button', { class: 'btn primary', onclick: () => edit(null) }, '+ New event')),
      h('p', { class: 'muted small' }, 'A themed set of puzzles with dates, a leaderboard and an optional bonus. While it runs it shows on the home page and its puzzles are free for everyone.'),
      list.length
        ? h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Event'), h('th', {}, 'Dates'), h('th', { class: 'num' }, 'Puzzles'), h('th', { class: 'num' }, 'Players'), h('th', {}, ''))),
            h(
              'tbody',
              {},
              list.map((e) =>
                h(
                  'tr',
                  {},
                  h('td', {}, h('a', { href: `/event?e=${encodeURIComponent(e.id)}`, target: '_blank' }, e.title)),
                  h('td', { class: 'small' }, `${e.starts} → ${e.ends}`, e.starts <= today && e.ends >= today ? h('span', { class: 'tag done', style: 'margin-left:6px' }, 'live') : null),
                  h('td', { class: 'num' }, e.puzzles),
                  h('td', { class: 'num' }, e.players),
                  h(
                    'td',
                    { class: 'row end' },
                    h('button', { class: 'btn', onclick: () => edit(e) }, 'Edit'),
                    h('button', { class: 'btn danger', onclick: async () => { if (confirm(`Delete “${e.title}” and its leaderboard?`)) { await api.del(`/admin/events/${e.id}`); await events(); } } }, 'Delete'),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No events yet.'),
    ),
    editor,
  );
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
