// End-to-end test of SnapShift v2 against `wrangler dev` + a fake ElevenLabs API.
import pw from 'playwright';
const { chromium } = pw;
import * as E from './.engine/engine.js';

const BASE = 'http://127.0.0.1:8787';
const OUT = process.argv[2];
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const browser = await chromium.launch();
const errorsFor = (page, bucket) => {
  page.on('pageerror', (e) => bucket.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && bucket.push(m.text()));
};

async function newCtx(mobile = false) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 900 } });
  return ctx;
}

/** Solve the board on screen by clicking tiles, using the engine to plan moves. */
async function solveByClicking(page, seed, difficulty, existing = []) {
  const g = E.replay(seed, difficulty, existing).state;
  const box = await page.locator('#board').boundingBox();
  const at = (p) => [box.x + ((p % g.cols) + 0.5) * (box.width / g.cols), box.y + (Math.floor(p / g.cols) + 0.5) * (box.height / g.rows)];
  let n = 0;
  while (!E.isSolved(g)) {
    const [a, b] = E.suggestSwap(g);
    E.swap(g, a, b);
    if (n % 2 === 0) {
      await page.mouse.click(...at(a));
      await page.mouse.click(...at(b));
    } else {
      // drag
      await page.mouse.move(...at(a));
      await page.mouse.down();
      await page.mouse.move(...at(b), { steps: 4 });
      await page.mouse.up();
    }
    n++;
  }
  return n;
}

// ---------- admin: sign up, generate, publish ----------
const adminCtx = await newCtx();
const admin = await adminCtx.newPage();
const adminErrors = [];
errorsFor(admin, adminErrors);
await admin.goto(BASE + '/account?signup=1');
await admin.fill('#email', 'syberscream@gmail.com');
await admin.fill('#username', 'Syber');
await admin.fill('#password', 'adminpass123');
await admin.click('button[type=submit]');
await admin.waitForURL(BASE + '/', { timeout: 10000 });
check('admin signup redirects home', true);
check('admin sees Admin link', await admin.locator('a[href="/admin"]').isVisible());
await admin.screenshot({ path: `${OUT}/01-home-empty.png`, fullPage: true });

await admin.goto(BASE + '/admin#generate');
await admin.waitForSelector('text=Generate now');
// Generate 3 animals + 2 space from built-in ideas, and one custom prompt that the fake API rejects.
for (const [cat, count] of [['animals', 3], ['space', 2], ['fractals', 1], ['daily', 1]]) {
  const form = admin.locator('form', { hasText: 'Generate now' });
  await form.locator('select[name=categoryId]').selectOption(cat);
  await form.locator('input[name=count]').fill(String(count));
  await form.locator('textarea[name=prompt]').fill('');
  await form.locator('button[type=submit]').click();
  await admin.waitForSelector('pre:not([hidden])');
}
{
  const form = admin.locator('form', { hasText: 'Generate now' });
  await form.locator('select[name=categoryId]').selectOption('animals');
  await form.locator('input[name=count]').fill('1');
  await form.locator('textarea[name=prompt]').fill('FAILME a purple cow');
  await form.locator('button[type=submit]').click();
  await admin.waitForTimeout(800);
}
// Collect finished images (the fake API completes on the 2nd poll).
for (let i = 0; i < 3; i++) await admin.request.post(BASE + '/api/admin/generation/run');
const gen = await (await admin.request.get(BASE + '/api/admin/generation')).json();
const done = gen.jobs.filter((j) => j.status === 'done').length;
const failed = gen.jobs.filter((j) => j.status === 'failed');
check('7 generations completed', done === 7, `done=${done}`);
check('rejected prompt recorded as failed with the API error', failed.length === 1 && /prompt rejected/.test(failed[0].error || ''), failed[0]?.error);
await admin.goto(BASE + '/admin#generate');
await admin.waitForSelector('text=Recent generations');
await admin.screenshot({ path: `${OUT}/02-admin-generate.png`, fullPage: true });

await admin.goto(BASE + '/admin#queue');
await admin.waitForSelector('.queue-card');
const queued = await admin.locator('.queue-card').count();
check('review queue shows generated images', queued === 7, `count=${queued}`);
await admin.screenshot({ path: `${OUT}/03-admin-queue.png`, fullPage: true });
// Rename the first one, then publish all.
await admin.locator('.queue-card').first().locator('input').first().fill('Renamed Test Puzzle');
for (let i = 0; i < queued; i++) {
  await admin.locator('.queue-card').first().locator('button', { hasText: 'Publish' }).click();
  await admin.waitForFunction((n) => document.querySelectorAll('.queue-card').length === n, queued - i - 1, { timeout: 20000 });
}
const pub = await (await admin.request.get(BASE + '/api/admin/puzzles?status=published')).json();
check('all 7 published', pub.puzzles.length === 7);
check('published puzzles have web copy + thumbnail', pub.puzzles.every((p) => p.image.endsWith('.webp') && p.thumb.endsWith('.webp')));
check('rename kept', pub.puzzles.some((p) => p.title === 'Renamed Test Puzzle'));
const img = await admin.request.get(BASE + pub.puzzles[0].image);
check('media served from R2 with long cache', img.ok() && /immutable/.test(img.headers()['cache-control'] || ''), `${img.headers()['content-type']} ${(await img.body()).length} bytes`);

// Manual upload into the queue
await admin.goto(BASE + '/admin#queue');
await admin.waitForSelector('input[type=file]');
await admin.setInputFiles('input[type=file]', process.argv[3]);
await admin.locator('form.row select').selectOption('nature');
await admin.locator('form.row button[type=submit]').click();
await admin.waitForSelector('.queue-card');
check('manual upload lands in queue', (await admin.locator('.queue-card').count()) === 1);
await admin.locator('.queue-card button', { hasText: 'Publish' }).click();
await admin.waitForFunction(() => document.querySelectorAll('.queue-card').length === 0, null, { timeout: 20000 });

// ---------- player ----------
const pCtx = await newCtx();
const player = await pCtx.newPage();
const playerErrors = [];
errorsFor(player, playerErrors);
await player.goto(BASE + '/account?signup=1');
await player.fill('#email', 'player@example.com');
await player.fill('#username', 'PuzzleFan');
await player.fill('#password', 'playerpass1');
await player.click('button[type=submit]');
await player.waitForURL(BASE + '/');
await player.waitForSelector('text=Daily Challenge');
check('home shows daily puzzle', await player.locator('a', { hasText: 'Play today’s puzzle' }).isVisible());
{
  const dailyPuzzle = pub.puzzles.find((p) => p.categoryId === 'daily');
  const t = await (await player.request.get(BASE + '/api/daily/today')).json();
  check('daily comes from the Puzzles of the Day category', t.puzzle && t.puzzle.slug === dailyPuzzle.slug, `${t.puzzle?.slug} vs ${dailyPuzzle?.slug}`);
  const cats = (await (await player.request.get(BASE + '/api/categories')).json()).categories.map((c) => c.id);
  check('daily category hidden from browsing', !cats.includes('daily'));
  check('daily puzzle not playable outside the daily', (await player.request.get(BASE + `/api/puzzles/${dailyPuzzle.slug}`)).status() === 404);
}
await player.screenshot({ path: `${OUT}/04-home.png`, fullPage: true });

await player.goto(BASE + '/category?c=animals');
await player.waitForSelector('.card');
const cards = await player.locator('.grid .card').count();
const locked = await player.locator('.grid .card .lock-badge').count();
check('category: first free, others locked', cards === 3 && locked === 2, `cards=${cards} locked=${locked}`);
await player.screenshot({ path: `${OUT}/05-category.png`, fullPage: true });

// Play the free animal puzzle by clicking/dragging tiles.
await player.locator('.grid a.card').first().click();
await player.waitForSelector('#board');
await player.waitForTimeout(800);
await player.screenshot({ path: `${OUT}/06-play-start.png` });
const playRow = (await (await player.request.get(BASE + '/api/home')).json()).continue;
// The play was created on load; read its seed from the API.
const slug = new URL(player.url()).searchParams.get('p');
const started = await (await player.request.post(BASE + '/api/plays', { data: { puzzle: slug, difficulty: 'easy' } })).json();
check('reopening resumes the same game', started.resumed === true);
const swaps = await solveByClicking(player, started.play.seed, 'easy', started.play.actions);
await player.waitForSelector('dialog.modal', { timeout: 10000 });
const resultText = await player.locator('dialog.modal').innerText();
check('completion dialog shows medal and points', /medal/i.test(resultText) && /\+\d+ points/.test(resultText), resultText.replace(/\s+/g, ' ').slice(0, 160));
await player.screenshot({ path: `${OUT}/07-play-complete.png` });
const me1 = (await (await player.request.get(BASE + '/api/auth/me')).json()).user;
check('points credited', me1.points > 0, `points=${me1.points} after ${swaps} swaps`);

// Unlock: not enough points yet -> error; admin grants points -> unlock works.
const animals = (await (await player.request.get(BASE + '/api/categories/animals')).json()).puzzles;
const lockedP = [...animals].reverse().find((p) => !p.unlocked); // most expensive
const r1 = await player.request.post(BASE + `/api/puzzles/${lockedP.slug}/unlock`);
check('unlock refused without enough points', r1.status() === 402, (await r1.json()).error);
const users = (await (await admin.request.get(BASE + '/api/admin/users?q=PuzzleFan')).json()).users;
await admin.request.post(BASE + `/api/admin/users/${users[0].id}/points`, { data: { delta: 1000, note: 'test' } });
await player.goto(BASE + '/category?c=animals');
await player.locator('.grid button.card').last().click();
await player.locator('dialog.modal button', { hasText: 'Unlock for' }).click();
await player.waitForFunction(() => document.querySelectorAll('.grid .lock-badge').length === 1, null, { timeout: 10000 });
check('unlock via UI', true);

// Anti-cheat: an unsolved log can't complete; unpaid helpers rejected; bogus moves rejected.
const fresh = await (await player.request.post(BASE + '/api/plays', { data: { puzzle: lockedP.slug, difficulty: 'medium' } })).json();
const pid = fresh.play.id;
const c1 = await player.request.post(BASE + `/api/plays/${pid}/complete`, { data: { actions: [], elapsedMs: 1000 } });
check('cannot complete an unsolved board', c1.status() === 422);
const c2 = await player.request.put(BASE + `/api/plays/${pid}`, { data: { actions: [['place']], elapsedMs: 1000 } });
check('cannot use unpaid helper', c2.status() === 422);
const c3 = await player.request.put(BASE + `/api/plays/${pid}`, { data: { actions: [[0, 0]], elapsedMs: 1000 } });
check('illegal move rejected', c3.status() === 422);
// Paid place, then hint, then solve via API with a fast claimed time.
const before = (await (await player.request.get(BASE + '/api/auth/me')).json()).user.points;
const pl = await (await player.request.post(BASE + `/api/plays/${pid}/place`, { data: { actions: [] } })).json();
const hi = await (await player.request.post(BASE + `/api/plays/${pid}/hint`, { data: { actions: [['place']] } })).json();
check('place charges 45 on medium; hint free', before - pl.points === 45 && hi.points === pl.points, `before=${before} afterPlace=${pl.points} afterHint=${hi.points}`);
const hint2 = await player.request.post(BASE + `/api/plays/${pid}/hint`, { data: { actions: [['place'], ['hint']] } });
check('hint cooldown enforced', hint2.status() === 429);
{
  const acts = [['place'], ['hint']];
  const g = E.replay(fresh.play.seed, 'medium', acts).state;
  while (!E.isSolved(g)) {
    const p = E.suggestSwap(g);
    E.swap(g, p[0], p[1]);
    acts.push(p);
  }
  const fin = await (await player.request.post(BASE + `/api/plays/${pid}/complete`, { data: { actions: acts, elapsedMs: 10 } })).json();
  check('impossibly fast time is clamped', fin.elapsedMs >= g.moves * 250, `elapsed=${fin.elapsedMs} moves=${g.moves}`);
  const again = await player.request.post(BASE + `/api/plays/${pid}/complete`, { data: { actions: acts, elapsedMs: 10 } });
  check('cannot complete twice', again.status() === 409);
}

// Daily via the API (96 tiles), then the leaderboard page.
const today = (await (await player.request.get(BASE + '/api/daily/today')).json()).day;
const daily = await (await player.request.post(BASE + '/api/plays', { data: { daily: today } })).json();
check('daily is hard with the shared seed', daily.play.difficulty === 'hard' && daily.play.seed === E.seedFromString('daily:' + today));
{
  const acts = [];
  const g = E.newGame(daily.play.seed, 'hard');
  while (!E.isSolved(g)) {
    const p = E.suggestSwap(g);
    E.swap(g, p[0], p[1]);
    acts.push(p);
  }
  await new Promise((r) => setTimeout(r, 1200));
  const fin = await (await player.request.post(BASE + `/api/plays/${daily.play.id}/complete`, { data: { actions: acts, elapsedMs: 60000 } })).json();
  check('daily completion gives bonus and rank 1', fin.dailyBonus === 50 && fin.rank === 1 && fin.streak.current === 1, JSON.stringify({ b: fin.dailyBonus, r: fin.rank, s: fin.streak }));
}
await player.goto(BASE + '/leaderboard');
await player.waitForSelector('table');
check('leaderboard lists the player', (await player.locator('tr.me').count()) === 1);
await player.screenshot({ path: `${OUT}/08-leaderboard.png`, fullPage: true });
await player.goto(BASE + '/daily');
await player.waitForSelector('.card');
await player.screenshot({ path: `${OUT}/09-daily.png`, fullPage: true });
await player.goto(BASE + '/account');
await player.waitForSelector('text=Points history');
await player.screenshot({ path: `${OUT}/10-account.png`, fullPage: true });

// ---------- guest on a phone ----------
const gCtx = await newCtx(true);
const guest = await gCtx.newPage();
const guestErrors = [];
errorsFor(guest, guestErrors);
await guest.goto(BASE + '/');
await guest.waitForSelector('text=Daily Challenge');
await guest.screenshot({ path: `${OUT}/11-mobile-home.png`, fullPage: true });
const firstSpace = (await (await guest.request.get(BASE + '/api/categories/space')).json()).puzzles[0];
await guest.goto(BASE + `/play?p=${firstSpace.slug}`);
await guest.waitForSelector('#board');
await guest.waitForTimeout(600);
const box = await guest.locator('#board').boundingBox();
await guest.touchscreen.tap(box.x + box.width * 0.08, box.y + box.height * 0.12);
await guest.touchscreen.tap(box.x + box.width * 0.92, box.y + box.height * 0.88);
await guest.waitForTimeout(1800);
const movesText = await guest.locator('.pill', { hasText: 'Moves' }).innerText();
check('guest can play (tap to swap)', /Moves: 1/.test(movesText), movesText);
await guest.reload();
await guest.waitForSelector('#board');
await guest.waitForTimeout(600);
check('guest game restored after reload', /Moves: 1/.test(await guest.locator('.pill', { hasText: 'Moves' }).innerText()));
await guest.screenshot({ path: `${OUT}/12-mobile-play.png`, fullPage: true });

// Static pages render
for (const p of ['about', 'how-to-play', 'faq', 'privacy', 'terms', 'contact', 'supporter', 'categories', 'nope-404']) {
  const r = await guest.goto(BASE + `/${p}`);
  await guest.waitForSelector('footer');
  check(`page ${p}`, p === 'nope-404' ? r.status() === 404 : r.ok());
}
// Contact form
await guest.goto(BASE + '/contact');
await guest.fill('input[name=name]', 'Tester');
await guest.fill('input[name=email]', 't@example.com');
await guest.fill('textarea[name=message]', 'Hello from the test');
await guest.click('button[type=submit]');
await guest.waitForSelector('text=Thanks!');
const msgs = (await (await admin.request.get(BASE + '/api/admin/messages')).json()).messages;
check('contact message reaches admin', msgs.length === 1);

check('no JS errors (admin)', adminErrors.length === 0, adminErrors.join(' | '));
check('no JS errors (player)', playerErrors.length === 0, playerErrors.join(' | '));
check('no JS errors (guest)', guestErrors.length === 0, guestErrors.join(' | '));
await browser.close();
const failedN = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failedN}/${results.length} passed`);
process.exit(failedN ? 1 : 0);
