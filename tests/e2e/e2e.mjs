// End-to-end test of SnapShift v2 against `wrangler dev` + a fake ElevenLabs API.
import pw from 'playwright';
const { chromium } = pw;
import * as E from './.engine/engine.js';
import * as SL from './.engine/slider.js';

const BASE = 'http://127.0.0.1:8787';
import { execSync } from 'node:child_process';
/** Run SQL against the local D1 database (to fake the passage of time). */
const REPO = process.env.REPO || process.cwd();
const sql = (q) => execSync(`npx wrangler d1 execute snapshift --local --command "${q.replace(/"/g, '\\"')}"`, { cwd: REPO, stdio: 'ignore' });
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
  // "Achievement unlocked!" popups would sit on top of the screens under test: note
  // each one in localStorage.__ach (so tests can check them) and close it straight away.
  await ctx.addInitScript(() => {
    // The phone tests play upright, so skip the "turn your phone sideways" suggestion (tested separately).
    try { localStorage.setItem('ss_rotate_never', 'true'); } catch {}
    new MutationObserver(() => {
      for (const d of document.querySelectorAll('dialog.ach-modal[open]:not([data-seen])')) {
        d.setAttribute('data-seen', '1');
        const seen = JSON.parse(localStorage.getItem('__ach') || '[]');
        seen.push({ title: d.querySelector('h2')?.textContent, reward: d.querySelector('.ach-reward')?.textContent || '' });
        localStorage.setItem('__ach', JSON.stringify(seen));
        setTimeout(() => d.close(), 30);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return ctx;
}

/** Solve the board on screen by clicking tiles, using the engine to plan moves. */
const setup = (difficulty, mode = 'classic', daily = false) => ({ version: 2, difficulty, mode, daily, hardMode: false });
/** Wait until the start-of-game "memorize" preview is over. */
const ready = (page) => page.waitForFunction(() => document.querySelector('.memorize-note')?.hidden !== false, null, { timeout: 8000 });

/** Solve the board on screen with real input, using the engine to plan moves. */
/** Finished puzzles wait on the picture until a tap: tap (via a key) until the results open. */
async function openResults(page, sel = 'dialog.modal:not(.ach-modal)', timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return;
    if (await page.locator('.admire-tip').count()) await page.keyboard.press('Shift');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector(sel, { timeout: 1 });
}

async function solveByClicking(page, seed, difficulty, existing = [], mode = 'classic') {
  await ready(page);
  const g = E.replay(seed, setup(difficulty, mode), existing).state;
  const box = await page.locator('#board').boundingBox();
  const at = (p) => [box.x + ((p % g.cols) + 0.5) * (box.width / g.cols), box.y + (Math.floor(p / g.cols) + 0.5) * (box.height / g.rows)];
  let n = 0;
  while (!E.isSolved(g)) {
    const m = E.suggest(g);
    E.applySuggestion(g, m);
    if (m.kind === 'rotate') {
      await page.mouse.click(...at(m.p)); // tap = rotate
      n++;
      continue;
    }
    const [a, b] = [m.a, m.b];
    if (n % 2 === 0 && mode !== 'rotation') {
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
check('admin sees Admin link', !!(await admin.waitForSelector('a[href="/admin"]', { timeout: 8000 }).catch(() => null)));
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
// New puzzles are in members' early access for 48 hours; age these so the free-player checks see normal puzzles.
sql('UPDATE puzzles SET published_at = published_at - 259200000');
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
await openResults(player, 'dialog.modal:not(.ach-modal)', 10000);
await player.waitForTimeout(1200); // points count up
const resultText = await player.locator('dialog.modal:not(.ach-modal)').innerText();
check('completion dialog shows medal and points', /medal/i.test(resultText) && /\+\d+ points/.test(resultText), resultText.replace(/\s+/g, ' ').slice(0, 160));
await player.screenshot({ path: `${OUT}/07-play-complete.png` });
// Reopening a finished puzzle shows it finished, not a new board.
await player.reload();
await player.waitForSelector('.done-bar:not([hidden])', { timeout: 10000 });
const doneText = await player.locator('.done-bar').innerText();
check('finished puzzle reopens as completed', /Completed/.test(doneText) && /Moves: [1-9]/.test(await player.locator('.pill', { hasText: 'Moves' }).innerText()), doneText.replace(/\s+/g, ' '));
await player.screenshot({ path: `${OUT}/07b-reopen-completed.png` });
await player.locator('.done-bar button', { hasText: 'Play again' }).click();
await player.waitForFunction(() => document.querySelector('.done-bar').hidden, null, { timeout: 10000 });
check('Play again starts a fresh board', /Moves: 0/.test(await player.locator('.pill', { hasText: 'Moves' }).innerText()));
await player.reload();
await player.waitForSelector('.done-bar:not([hidden])', { timeout: 10000 });
check('untouched replay still shows the finish', true);
const me1 = (await (await player.request.get(BASE + '/api/auth/me')).json()).user;
check('points credited', me1.points > 0, `points=${me1.points} after ${swaps} swaps`);

// Unlock: not enough points yet -> error; admin grants points -> unlock works.
const animals = (await (await player.request.get(BASE + '/api/categories/animals')).json()).puzzles;
const lockedP = [...animals].reverse().find((p) => !p.unlocked); // most expensive
// Bring the balance below the unlock cost first (fast bot solves earn a lot).
const pf = (await (await admin.request.get(BASE + '/api/admin/users?q=PuzzleFan')).json()).users[0];
if (pf.points >= lockedP.unlockCost) await admin.request.post(BASE + `/api/admin/users/${pf.id}/points`, { data: { delta: -(pf.points - 10), note: 'test' } });
const r1 = await player.request.post(BASE + `/api/puzzles/${lockedP.slug}/unlock`);
check('unlock refused without enough points', r1.status() === 402, (await r1.json()).error);
const users = (await (await admin.request.get(BASE + '/api/admin/users?q=PuzzleFan')).json()).users;
await admin.request.post(BASE + `/api/admin/users/${users[0].id}/points`, { data: { delta: 1000, note: 'test' } });
await player.goto(BASE + '/category?c=animals');
await player.locator('.grid button.card').last().click();
await player.locator('dialog.modal:not(.ach-modal) button', { hasText: 'Unlock for' }).click();
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
check('medium: place costs 45, hint costs 25', before - pl.points === 45 && pl.points - hi.points === 25, `before=${before} afterPlace=${pl.points} afterHint=${hi.points}`);
const hint2 = await player.request.post(BASE + `/api/plays/${pid}/hint`, { data: { actions: [['place'], ['hint']] } });
check('hint cooldown enforced', hint2.status() === 429);
{
  const acts = [['place'], ['hint']];
  const g = E.replay(fresh.play.seed, setup('medium'), acts).state;
  while (!E.isSolved(g)) {
    const m = E.suggest(g);
    E.applySuggestion(g, m);
    acts.push([m.a, m.b]);
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
  const g = E.newGame(daily.play.seed, setup('hard', 'classic', true));
  while (!E.isSolved(g)) {
    const m = E.suggest(g);
    E.applySuggestion(g, m);
    acts.push([m.a, m.b]);
  }
  await new Promise((r) => setTimeout(r, 1200));
  const fin = await (await player.request.post(BASE + `/api/plays/${daily.play.id}/complete`, { data: { actions: acts, elapsedMs: 60000 } })).json();
  check('daily completion gives bonus and rank 1', fin.dailyBonus === 50 && fin.rank === 1 && fin.streak.current === 1, JSON.stringify({ b: fin.dailyBonus, r: fin.rank, s: fin.streak }));
}
// ---------- modes ----------
{
  const animalsNow = (await (await player.request.get(BASE + '/api/categories/animals')).json()).puzzles;
  const free = animalsNow[0];
  // Rotation: real taps and drags on the board.
  await player.goto(BASE + `/play?p=${free.slug}&d=easy&m=rotation`);
  await player.waitForSelector('#board');
  const rot = await (await player.request.post(BASE + '/api/plays', { data: { puzzle: free.slug, difficulty: 'easy', mode: 'rotation' } })).json();
  check('rotation play uses the square grid', rot.play.mode === 'rotation' && rot.play.engine === 2);
  const box = await player.locator('#board').boundingBox();
  check('rotation board is square-tiled (7:4)', Math.abs(box.width / box.height - 7 / 4) < 0.03, `${box.width}x${box.height}`);
  await solveByClicking(player, rot.play.seed, 'easy', rot.play.actions, 'rotation');
  await openResults(player, 'dialog.modal:not(.ach-modal)', 10000);
  check('rotation puzzle completes with a medal', /medal/i.test(await player.locator('dialog.modal:not(.ach-modal)').innerText()));
  await player.screenshot({ path: `${OUT}/09b-rotation-done.png` });
  await player.locator('dialog.modal:not(.ach-modal) button', { hasText: 'Play again' }).click();
  await ready(player);
  await player.screenshot({ path: `${OUT}/09c-rotation-start.png` });

  // Zen: no timer, no medal, 10 points the first time.
  const before = (await (await player.request.get(BASE + '/api/auth/me')).json()).user.points;
  await player.goto(BASE + `/play?p=${free.slug}&d=easy&m=zen`);
  await player.waitForSelector('#board');
  await player.waitForSelector('.pill:has-text("Zen")');
  check('zen hides the timer', !(await player.locator('.pill', { hasText: 'Time:' }).isVisible()));
  const zen = await (await player.request.post(BASE + '/api/plays', { data: { puzzle: free.slug, difficulty: 'easy', mode: 'zen' } })).json();
  await solveByClicking(player, zen.play.seed, 'easy', zen.play.actions, 'zen');
  await openResults(player, 'dialog.modal:not(.ach-modal)', 10000);
  const zt = await player.locator('dialog.modal:not(.ach-modal)').innerText();
  const after = (await (await player.request.get(BASE + '/api/auth/me')).json()).user.points;
  check('zen finish: no medal, +10 points', /Puzzle complete/.test(zt) && after - before === 10, `${after - before} pts`);

  // Hard: tiles don't lock.
  const hard = await (await player.request.post(BASE + '/api/plays', { data: { puzzle: free.slug, difficulty: 'hard' } })).json();
  const hg = E.newGame(hard.play.seed, setup('hard'));
  const m = E.suggest(hg);
  E.applySuggestion(hg, m);
  const correct = hg.tiles.findIndex((t, i) => t === i);
  const other = hg.tiles.findIndex((t, i) => t !== i);
  const r = await player.request.put(BASE + `/api/plays/${hard.play.id}`, { data: { actions: [[m.a, m.b], [correct, other]], elapsedMs: 5000 } });
  check('hard: a correct tile can be moved again', r.ok());
  const easyPlay = await (await player.request.post(BASE + '/api/plays', { data: { puzzle: free.slug, difficulty: 'easy', fresh: true } })).json();
  const eg = E.newGame(easyPlay.play.seed, setup('easy'));
  const em = E.suggest(eg);
  E.applySuggestion(eg, em);
  const ec = eg.tiles.findIndex((t, i) => t === i);
  const eo = eg.tiles.findIndex((t, i) => t !== i);
  const er = await player.request.put(BASE + `/api/plays/${easyPlay.play.id}`, { data: { actions: [[em.a, em.b], [ec, eo]], elapsedMs: 5000 } });
  check('easy: a locked tile can not be moved', er.status() === 422);
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
await ready(guest);
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
{
  // Finish the guest game, reload, and it should stay finished.
  const save = await guest.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ss_guest_games')))[0]);
  await solveByClicking(guest, save.seed, 'easy', save.actions);
  await openResults(guest, 'dialog.modal:not(.ach-modal)', 10000);
  await guest.reload();
  await guest.waitForSelector('.done-bar:not([hidden])', { timeout: 10000 });
  check('guest finished puzzle stays completed', /Completed/.test(await guest.locator('.done-bar').innerText()));
}
await guest.screenshot({ path: `${OUT}/12-mobile-play.png`, fullPage: true });

// ---------- Time Attack ----------
{
  const TA = { version: 2, difficulty: 'easy', mode: 'timeattack', daily: false, hardMode: false };
  const solveLog = (seed) => {
    const g = E.newGame(seed, TA);
    const log = [];
    for (let m = E.suggest(g); m && !E.isSolved(g); m = E.suggest(g)) {
      log.push([m.a, m.b]);
      E.applySuggestion(g, m);
    }
    return log;
  };
  const dailySlug = pub.puzzles.find((p) => p.categoryId === 'daily')?.slug;
  const st = await (await player.request.post(BASE + '/api/time-attack/start')).json();
  check('time attack: run handed out', !!st.runId && st.puzzles.length === 40 && st.rows === 3 && st.cols === 4, `${st.puzzles?.length} ${st.rows}x${st.cols}`);
  check('time attack: no daily-category puzzles', !st.puzzles.some((p) => p.slug === dailySlug));
  const logs = st.puzzles.slice(0, 3).map((p) => solveLog(p.seed));
  logs.push([]); // 4th puzzle opened, no moves
  const nMoves = logs.reduce((n, l) => n + l.length, 0);
  const tooFast = await player.request.post(BASE + `/api/time-attack/${st.runId}/finish`, { data: { results: logs } });
  check('time attack: inhumanly fast run rejected', tooFast.status() === 422, (await tooFast.json()).error);
  await player.waitForTimeout(nMoves * 150 + 200);
  const bad = await player.request.post(BASE + `/api/time-attack/${st.runId}/finish`, { data: { results: [[[0, 0]]] } });
  check('time attack: illegal move rejected', bad.status() === 422);
  const before = (await (await player.request.get(BASE + '/api/auth/me')).json()).user.points;
  const fin = await (await player.request.post(BASE + `/api/time-attack/${st.runId}/finish`, { data: { results: logs } })).json();
  check('time attack: 3 solved, perfect score 450, +15 points', fin.solved === 3 && fin.score === 450 && fin.points === 15 && fin.balance === before + 15, JSON.stringify(fin));
  const again = await player.request.post(BASE + `/api/time-attack/${st.runId}/finish`, { data: { results: logs } });
  check('time attack: cannot finish twice', again.status() === 409);
  const lb = await (await player.request.get(BASE + '/api/time-attack/leaderboard')).json();
  check('time attack: weekly leaderboard shows the run', lb.rows[0]?.score === 450 && lb.rows[0].isMe && lb.me?.rank === 1, JSON.stringify(lb.rows[0]));
  await player.goto(BASE + '/leaderboard?tab=timeattack');
  await player.waitForSelector('text=Time Attack · week of');
  check('time attack: leaderboard tab', (await player.locator('tbody tr').count()) === 1);
  // Played today: the Time Attack page and home say so.
  check('time attack: today’s runs and best', lb.today?.runs === 1 && lb.today.best === 450 && lb.today.solved === 3, JSON.stringify(lb.today));
  const homeTa = (await (await player.request.get(BASE + '/api/home')).json()).timeAttackToday;
  check('time attack: home knows you played today', homeTa?.runs === 1 && homeTa.best === 450, JSON.stringify(homeTa));
  await player.goto(BASE + '/time-attack');
  await player.waitForSelector('.ta-today');
  const taCard = await player.locator('.ta-today').innerText();
  check('time attack: “Played today” with your best', /Played today/.test(taCard) && /450/.test(taCard), taCard.replace(/\s+/g, ' '));
  await player.goto(BASE + '/');
  await player.waitForSelector('text=Time Attack');
  check('home: Time Attack shows “Played today”', /Played today/.test(await player.locator('section.panel', { hasText: 'Time Attack' }).first().innerText()));
  // Guest plays through the UI.
  const gp = await gCtx.newPage();
  const gErr = [];
  gp.on('pageerror', (e) => gErr.push(String(e)));
  await gp.goto(BASE + '/time-attack');
  const startResp = gp.waitForResponse((r) => r.url().endsWith('/api/time-attack/start'));
  await gp.click('#ta-start');
  const run = await (await startResp).json();
  check('time attack: guest run has no id', run.runId === null && run.puzzles.length === 40);
  // Wait for the 3-2-1 countdown to finish.
  await gp.waitForFunction(() => document.querySelector('.memorize-note')?.textContent === 'Go!', null, { timeout: 10000 });
  await gp.waitForFunction(() => document.querySelector('.memorize-note')?.hidden === true, null, { timeout: 10000 });
  const box = await gp.locator('#board').boundingBox();
  const at = (p) => [box.x + ((p % 4) + 0.5) * (box.width / 4), box.y + (Math.floor(p / 4) + 0.5) * (box.height / 3)];
  for (const [a, b] of solveLog(run.puzzles[0].seed)) {
    await gp.mouse.click(...at(a));
    await gp.mouse.click(...at(b));
  }
  await gp.waitForFunction(() => /#2 ·/.test(document.querySelector('.hud')?.textContent || ''), null, { timeout: 5000 });
  check('time attack: solving moves to the next puzzle', /Solved: 1/.test(await gp.locator('.hud').innerText()) && /Score: 150/.test(await gp.locator('.hud').innerText()));
  await gp.click('text=Skip puzzle');
  await gp.waitForFunction(() => /#3 ·/.test(document.querySelector('.hud')?.textContent || ''), null, { timeout: 5000 });
  check('time attack: skip', true);
  await gp.waitForTimeout(1500);
  const clock1 = await gp.locator('.pill.gold').innerText();
  check('time attack: clock counting down', /^2:[0-5]\d$/.test(clock1), clock1);
  await gp.screenshot({ path: `${OUT}/13-time-attack.png` });
  await gp.click('text=Finish now');
  await openResults(gp, 'dialog.modal:not(.ach-modal)');
  const res = await gp.locator('dialog.modal:not(.ach-modal)').innerText();
  check('time attack: guest result', /Solved\s*1/.test(res) && /150/.test(res) && /Create a free account/.test(res), res.replace(/\s+/g, ' '));
  await gp.keyboard.press('Escape');
  await gp.goto(BASE + '/time-attack');
  await gp.waitForSelector('.ta-today');
  check('time attack: guests see “Played today” too', /Played today/.test(await gp.locator('.ta-today').innerText()) && /150/.test(await gp.locator('.ta-today').innerText()));
  // Out of free runs: “Done for today”, and no Start button.
  await gp.evaluate(() => localStorage.setItem('ss_ta_guest_runs', JSON.stringify({ day: new Date().toLocaleDateString('en-CA'), n: 3 })));
  await gp.reload();
  await gp.waitForSelector('.ta-today');
  const doneCard = await gp.locator('.ta-today').innerText();
  check('time attack: “Done for today” when the free runs are used', /Done for today/.test(doneCard) && /New runs in \d\d:\d\d:\d\d/.test(doneCard) && (await gp.locator('#ta-start').count()) === 0, doneCard.replace(/\s+/g, ' '));
  await gp.screenshot({ path: `${OUT}/13b-time-attack-done.png` });
  check('no JS errors (time attack)', gErr.length === 0, gErr.join(' | '));
  await gp.close();
}

// ---------- SnapShift Plus ----------
{
  const j = async (r) => (await r).json();
  const meOf = async (ctx) => (await j(ctx.request.get(BASE + '/api/auth/me'))).user;
  const addDays = (d, n) => {
    const t = new Date(d + 'T12:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  await admin.request.put(BASE + '/api/admin/billing', { data: { monthlyPriceId: 'price_testmonthly', yearlyPriceId: 'price_testyearly', lifetimePriceId: 'price_testlifetime' } });
  const plans = await j(player.request.get(BASE + '/api/billing/plans'));
  check('plus: plans available', plans.enabled && plans.plans.every((p) => p.available), JSON.stringify(plans));
  const badPrice = await admin.request.put(BASE + '/api/admin/billing', { data: { monthlyPriceId: 'https://buy.stripe.com/x' } });
  check('plus: admin rejects a payment link as a price id', badPrice.status() === 422);

  // ---- free player limits ----
  const taStarts = [];
  for (let i = 0; i < 3; i++) taStarts.push((await player.request.post(BASE + '/api/time-attack/start')).status());
  check('plus: free players get 3 Time Attack runs a day', taStarts.join() === '200,200,429', taStarts.join()); // one run was used earlier
  const oldDay = addDays(today, -10);
  check('plus: old dailies locked for free players', (await player.request.get(BASE + `/api/daily/day/${oldDay}`)).status() === 403);
  check('plus: recent dailies open', (await player.request.get(BASE + `/api/daily/day/${addDays(today, -3)}`)).ok());
  const lockedPlay = await player.request.post(BASE + '/api/plays', { data: { daily: oldDay } });
  check('plus: cannot start an old daily without Plus', lockedPlay.status() === 403);

  // A puzzle moved into the Members' Gallery, and a brand-new one in early access.
  const nonDaily = pub.puzzles.filter((p) => p.categoryId !== 'daily');
  const memberPuzzle = nonDaily[nonDaily.length - 1];
  await admin.request.patch(BASE + `/api/admin/puzzles/${memberPuzzle.id}`, { data: { categoryId: 'members' } });
  const mcat = await j(player.request.get(BASE + '/api/categories/members'));
  check('plus: members gallery locked for free players', mcat.category.membersOnly && mcat.puzzles[0]?.lock === 'members', JSON.stringify(mcat.puzzles[0]));
  check('plus: members puzzle not playable', (await player.request.post(BASE + '/api/plays', { data: { puzzle: memberPuzzle.slug } })).status() === 403);
  const animals = (await j(player.request.get(BASE + '/api/categories/animals'))).puzzles;
  const earlyP = animals.find((p) => p.index > 0);
  sql(`UPDATE puzzles SET published_at = ${Date.now()} WHERE slug = '${earlyP.slug}'`);
  const earlyView = (await j(player.request.get(BASE + `/api/puzzles/${earlyP.slug}`))).puzzle;
  check('plus: new puzzles are early access', earlyView.lock === 'early' && !earlyView.unlocked && earlyView.publicAt > Date.now(), JSON.stringify({ lock: earlyView.lock, unlocked: earlyView.unlocked }));
  check('plus: early puzzles cannot be bought with points', (await player.request.post(BASE + `/api/puzzles/${earlyP.slug}/unlock`)).status() === 403);
  const freeFirst = animals.find((p) => p.index === 0);
  check('plus: free first puzzle stays free', freeFirst.unlocked);

  // An ad banner, hidden from members.
  await admin.request.put(BASE + '/api/admin/site', { data: { banners: [{ image: '/img/logo.png', pages: ['all'], position: 'bottom', enabled: true, audience: 'free', alt: 'Ad' }] } });
  check('plus: free players see ads', (await j(player.request.get(BASE + '/api/site'))).banners.length === 1);

  // ---- buy Plus through the page ----
  await player.goto(BASE + '/plus');
  await player.waitForSelector('text=Choose a plan');
  await player.screenshot({ path: `${OUT}/14-plus.png`, fullPage: true });
  await player.click('text=Choose Yearly');
  await player.waitForURL(/\/plus\?welcome=1/, { timeout: 15000 });
  await player.waitForSelector('text=You’re a Plus member', { timeout: 30000 });
  const m = await meOf(player);
  check('plus: checkout makes you a member for a year', m.member && m.billing && m.memberUntil > Date.now() + 360 * 86400_000, JSON.stringify(m));
  check('plus: members see no ads', (await j(player.request.get(BASE + '/api/site'))).banners.length === 0);
  check('plus: members gallery playable', (await player.request.post(BASE + '/api/plays', { data: { puzzle: memberPuzzle.slug } })).ok());
  check('plus: early access playable', (await player.request.post(BASE + '/api/plays', { data: { puzzle: earlyP.slug } })).ok());
  check('plus: every puzzle unlocked', (await j(player.request.get(BASE + '/api/categories/animals'))).puzzles.every((p) => p.unlocked));
  check('plus: full daily archive', (await player.request.get(BASE + `/api/daily/day/${oldDay}`)).ok());
  const ta = await player.request.post(BASE + '/api/time-attack/start');
  check('plus: unlimited Time Attack', ta.ok() && (await ta.json()).runsLeft === null);
  const again = await player.request.post(BASE + '/api/billing/checkout', { data: { plan: 'monthly' } });
  check('plus: no second subscription', again.status() === 409);
  const portal = await j(player.request.post(BASE + '/api/billing/portal'));
  check('plus: billing portal link', /portal=1/.test(portal.url || ''), portal.url);

  // Frame, requests, medals, downloads, badge.
  await player.request.put(BASE + '/api/plus/frame', { data: { frame: 'gold' } });
  check('plus: frame saved', (await meOf(player)).frame === 'gold');
  const r1 = await player.request.post(BASE + '/api/plus/requests', { data: { idea: 'A lighthouse on a stormy cliff at sunset', categoryId: 'members' } });
  const r2 = await player.request.post(BASE + '/api/plus/requests', { data: { idea: 'A red panda asleep in a maple tree', categoryId: 'animals' } });
  const r3 = await player.request.post(BASE + '/api/plus/requests', { data: { idea: 'A third idea this month', categoryId: 'members' } });
  check('plus: 2 picture requests a month', r1.ok() && r2.ok() && r3.status() === 429, `${r1.status()} ${r2.status()} ${r3.status()}`);
  let reqPuzzle = null;
  for (let i = 0; i < 15 && !reqPuzzle; i++) {
    await admin.request.post(BASE + '/api/admin/generation/run');
    reqPuzzle = (await j(admin.request.get(BASE + '/api/admin/puzzles?status=pending'))).puzzles.find((p) => p.request);
    if (!reqPuzzle) await player.waitForTimeout(1000);
  }
  check('plus: request reaches the review queue with its member', reqPuzzle?.request?.username === 'PuzzleFan', JSON.stringify(reqPuzzle?.request));
  const reqs = await j(player.request.get(BASE + '/api/plus/requests'));
  check('plus: member sees request status', reqs.left === 0 && reqs.requests.some((r) => r.status === 'review'), JSON.stringify(reqs.requests.map((r) => r.status)));
  const medals = await j(player.request.get(BASE + '/api/plus/medals'));
  check('plus: medal collection', medals.puzzles.length >= 1 && medals.puzzles[0].results.length >= 1);
  const dl = await player.request.get(BASE + `/api/plus/download/${medals.puzzles.find((p) => !p.daily)?.slug ?? medals.puzzles[0].slug}`);
  check('plus: download finished picture', dl.ok() && /attachment/.test(dl.headers()['content-disposition'] || ''), dl.headers()['content-disposition']);
  const lb = await j(player.request.get(BASE + '/api/leaderboard/points'));
  check('plus: badge on leaderboard', lb.rows.find((r) => r.username === 'PuzzleFan')?.plus === true);
  await player.goto(BASE + '/account');
  await player.waitForSelector('text=Medal collection', { timeout: 10000 });
  check('plus: account shows membership, frame and requests', (await player.locator('text=Board frame').count()) === 1 && (await player.locator('text=Request a picture').count()) === 1);
  await player.screenshot({ path: `${OUT}/15-account-plus.png`, fullPage: true });
  await player.goto(BASE + `/play?p=${earlyP.slug}`);
  await player.waitForSelector('#board');
  check('plus: frame around the board', (await player.locator('.board-wrap.frame-gold').count()) === 1);
  await player.screenshot({ path: `${OUT}/16-frame.png` });

  // ---- webhooks: bad signature, cancellation, lifetime ----
  const bad = await j(fetch('http://127.0.0.1:8791/test/raw-event', { method: 'POST' }));
  check('plus: webhook rejects bad signatures', bad.status === 400);
  const subs = await j(fetch('http://127.0.0.1:8791/test/subs'));
  await j(fetch(`http://127.0.0.1:8791/test/cancel/${subs[0].id}`, { method: 'POST' }));
  const after = await meOf(player);
  check('plus: cancelled subscription ends membership', !after.member, JSON.stringify(after));
  check('plus: locked again after cancelling', (await player.request.post(BASE + '/api/plays', { data: { puzzle: memberPuzzle.slug } })).status() === 403);
  const pf = (await j(admin.request.get(BASE + '/api/admin/users?q=PuzzleFan'))).users[0];
  await admin.request.post(BASE + `/api/admin/users/${pf.id}/supporter`, { data: { lifetime: true } });
  const life = await meOf(player);
  check('plus: admin can give lifetime Plus', life.member && life.lifetime);
  const bill = await j(admin.request.get(BASE + '/api/admin/billing'));
  check('plus: admin membership counts', bill.members.lifetime === 1 && bill.stripeKey && bill.webhookSecret, JSON.stringify(bill.members));
  // Admin pages render.
  await admin.goto(BASE + '/admin#membership');
  await admin.waitForSelector('text=Paying members');
  await admin.screenshot({ path: `${OUT}/17-admin-membership.png`, fullPage: true });
}

// ---------- Admin: give points ----------
{
  const bal = async () => (await (await player.request.get(BASE + '/api/auth/me')).json()).user.points;
  const before = await bal();
  await admin.goto(BASE + '/admin#players');
  await admin.waitForSelector('text=Give points to a group');
  await admin.locator('tr', { hasText: 'PuzzleFan' }).locator('button', { hasText: 'Points' }).click();
  await admin.click('dialog button:has-text("+250")');
  await admin.fill('dialog input[maxlength="120"]', 'Thanks for testing!');
  await admin.click('dialog button:has-text("Give 250 points")');
  await admin.waitForSelector('dialog', { state: 'detached' });
  check('points: admin gives a player points', (await bal()) === before + 250);
  const pf = (await (await admin.request.get(BASE + '/api/admin/users?q=PuzzleFan')).json()).users[0];
  const tooMuch = await admin.request.post(BASE + `/api/admin/users/${pf.id}/points`, { data: { delta: -(pf.points + 1) } });
  check('points: cannot take more than a player has', tooMuch.status() === 422, (await tooMuch.json()).error);
  const groups = (await (await admin.request.get(BASE + '/api/admin/points/groups')).json()).groups;
  const everyone = groups.find((g) => g.id === 'all');
  const g = await (await admin.request.post(BASE + '/api/admin/points/grant', { data: { group: 'all', amount: 100, note: 'Holiday gift' } })).json();
  check('points: group gift reaches everyone', g.players === everyone.count && (await bal()) === before + 350, `${g.players} of ${everyone.count}`);
  const badGroup = await admin.request.post(BASE + '/api/admin/points/grant', { data: { group: 'all', amount: 0 } });
  check('points: group gift needs an amount', badGroup.status() === 422);
  await admin.reload();
  await admin.waitForSelector('text=Holiday gift');
  check('points: admin log shows gifts', (await admin.locator('text=Thanks for testing!').count()) >= 1);
  await admin.screenshot({ path: `${OUT}/18-admin-points.png`, fullPage: true });
  await player.goto(BASE + '/account');
  await player.waitForSelector('text=Holiday gift');
  check('points: player sees the note in their history', (await player.locator('text=Thanks for testing!').count()) === 1);
  const lbAfter = (await (await player.request.get(BASE + '/api/leaderboard/points')).json()).rows.find((r) => r.username === 'PuzzleFan');
  check('points: gifts don’t count on the points leaderboard', lbAfter && lbAfter.earned < before + 350);
}

// ---------- Plus section for free players ----------
{
  const gp = await gCtx.newPage();
  await gp.goto(BASE + '/');
  await gp.waitForSelector('.plus-promo', { timeout: 10000 });
  check('promo: guests see the Plus section on the home page', (await gp.locator('.plus-promo .promo-price').count()) === 3);
  await gp.screenshot({ path: `${OUT}/19-promo-phone.png`, fullPage: true });
  await gp.close();
  await player.goto(BASE + '/');
  await player.waitForSelector('text=Categories');
  check('promo: members do not see it', (await player.locator('.plus-promo').count()) === 0);
  await admin.request.put(BASE + '/api/admin/billing', { data: { promoEnabled: '0' } });
  const gp2 = await gCtx.newPage();
  await gp2.goto(BASE + '/');
  await gp2.waitForSelector('text=Categories');
  check('promo: admin can turn it off', (await gp2.locator('.plus-promo').count()) === 0);
  await gp2.close();
  await admin.request.put(BASE + '/api/admin/billing', { data: { promoEnabled: '1', promoTitle: 'Get more out of SnapShift' } });
}

// ---------- Collections, challenges, events, achievements, reminders ----------
{
  const j = async (r) => (await r).json();
  const setupOf = (p) => ({ version: p.engine, difficulty: p.difficulty, mode: p.mode, daily: !!p.daily, hardMode: false });
  /** Start (or resume) a game through the API and solve it with the engine. */
  async function apiSolve(ctx, startBody) {
    const { play } = await j(ctx.request.post(BASE + '/api/plays', { data: startBody }));
    const g = E.replay(play.seed, setupOf(play), play.actions).state;
    const actions = [...play.actions];
    for (let m = E.suggest(g); m && !E.isSolved(g); m = E.suggest(g)) {
      actions.push(m.kind === 'swap' ? [m.a, m.b] : ['r', m.p]);
      E.applySuggestion(g, m);
    }
    return j(ctx.request.post(BASE + `/api/plays/${play.id}/complete`, { data: { actions, elapsedMs: actions.length * 300 } }));
  }

  // Achievements already earned by playing.
  const ach = await j(player.request.get(BASE + '/api/me/achievements'));
  const got = new Set(ach.achievements.filter((a) => a.earnedAt).map((a) => a.id));
  check('achievements: earned while playing', got.has('first-finish') && got.has('gold-1'), [...got].join(','));
  check('achievements: 42 to unlock', ach.achievements.length === 42);
  const popped = await player.evaluate(() => JSON.parse(localStorage.getItem('__ach') || '[]'));
  check('achievements: “Achievement unlocked!” popup shown', popped.length > 0 && popped.every((a) => a.title && /^\+\d+ points$/.test(a.reward)), JSON.stringify(popped));
  const ledger = await j(player.request.get(BASE + '/api/me/ledger'));
  check('achievements: reward points paid once each', ledger.rows.filter((r) => r.reason === 'achievement' && r.ref === 'first-finish').length === 1);

  // Collections: a 3-puzzle category, finished by the player.
  await admin.request.put(BASE + '/api/admin/categories/tiny', { data: { name: 'Tiny', description: 'Three puzzles', tile_url: '/img/categories/art.png', sort: 50, generate: false } });
  const three = pub.puzzles.filter((p) => p.categoryId !== 'daily' && p.categoryId !== 'members').slice(0, 3);
  for (const p of three) await admin.request.patch(BASE + `/api/admin/puzzles/${p.id}`, { data: { categoryId: 'tiny' } });
  const cats = await j(player.request.get(BASE + '/api/categories'));
  check('collections: progress on category cards', cats.categories.find((c) => c.id === 'tiny')?.count === 3);
  const solves = [];
  for (const p of three) solves.push(await apiSolve(player, { puzzle: p.slug, difficulty: 'easy', mode: 'zen', fresh: true }));
  const paid = solves.filter((r) => r.collection);
  check('collections: finishing a whole category pays the bonus once', paid.length === 1 && paid[0].collection.points === 160 && paid[0].achievements.some((a) => a.id === 'collection'), JSON.stringify(solves.map((r) => r.collection)));
  const tiny = await j(player.request.get(BASE + '/api/categories/tiny'));
  check('collections: category shows it collected', tiny.finishedCount === 3 && tiny.collection?.points === 160);
  const again = await apiSolve(player, { puzzle: three[0].slug, difficulty: 'easy', mode: 'zen', fresh: true });
  check('collections: bonus only once', again.collection === null);

  // Challenges: the player challenges; the admin plays the same board.
  const done = await apiSolve(player, { puzzle: three[1].slug, difficulty: 'easy', mode: 'classic', fresh: true });
  const playId = (await j(player.request.post(BASE + '/api/plays', { data: { puzzle: three[1].slug, difficulty: 'easy', mode: 'classic' } }))).play.id;
  const ch = await j(player.request.post(BASE + '/api/challenges', { data: { playId } }));
  check('challenge: link made', !!ch.id && done.rating);
  const same = await j(player.request.post(BASE + '/api/challenges', { data: { playId } }));
  check('challenge: same game gives the same link', same.id === ch.id);
  const info = await j(gCtx.request.get(BASE + `/api/challenges/${ch.id}`));
  check('challenge: public details', info.by === 'PuzzleFan' && info.puzzle.slug === three[1].slug && info.seed > 0);
  const adminStart = await j(admin.request.post(BASE + '/api/plays', { data: { challenge: ch.id } }));
  check('challenge: same board for the friend', adminStart.play.seed === info.seed && adminStart.play.challenge === ch.id);
  const res = await apiSolve(admin, { challenge: ch.id });
  check('challenge: result compared and recorded', res.challenge && res.challenge.by === 'PuzzleFan' && res.challenge.recorded === true, JSON.stringify(res.challenge));
  const info2 = await j(gCtx.request.get(BASE + `/api/challenges/${ch.id}`));
  check('challenge: board lists the friend', info2.results.some((r) => r.username === 'Syber'));
  const dailyPlay = (await j(player.request.get(BASE + '/api/me/summary')));
  void dailyPlay;
  // Guest plays the challenge in the browser.
  const gp = await gCtx.newPage();
  await gp.goto(BASE + `/play?challenge=${ch.id}`);
  await gp.waitForSelector('.challenge-bar:not([hidden])');
  check('challenge: banner for the guest', /PuzzleFan challenges you/.test(await gp.locator('.challenge-bar').innerText()));
  await gp.waitForTimeout(3000); // memorize
  await solveByClicking(gp, info.seed, 'easy');
  await openResults(gp, 'dialog.modal:not(.ach-modal) .challenge-result', 15000);
  check('challenge: guest sees who won', /PuzzleFan/.test(await gp.locator('.challenge-result').innerText()));
  await gp.screenshot({ path: `${OUT}/20-challenge-result.png` });
  await gp.close();

  // Events.
  const today = (await j(player.request.get(BASE + '/api/daily/today'))).day;
  const evPuzzles = pub.puzzles.filter((p) => p.categoryId !== 'daily' && p.categoryId !== 'members' && !three.some((t) => t.id === p.id)).slice(0, 2);
  const bad = await admin.request.put(BASE + '/api/admin/events/x', { data: { title: 'Bad', starts: today, ends: '2000-01-01' } });
  check('events: end must be after start', bad.status() === 422);
  await admin.request.put(BASE + '/api/admin/events/test-week', { data: { title: 'Test Week', description: 'Two puzzles', starts: today, ends: today, bonus: 300, puzzleIds: evPuzzles.map((p) => p.id) } });
  const home = await j(gCtx.request.get(BASE + '/api/home'));
  check('events: shown on the home page', home.events.some((e) => e.id === 'test-week'));
  const gev = await j(gCtx.request.get(BASE + '/api/events/test-week'));
  check('events: puzzles open to everyone while live', gev.puzzles.length === 2 && gev.puzzles.every((p) => p.unlocked && p.inEvent));
  check('events: rules shown (Medium, Classic, prizes)', gev.event.difficulty === 'medium' && gev.event.mode === 'classic' && gev.event.prizes.join() === '500,300,150');
  // A normal game of an event puzzle doesn't count; only games started from the event do.
  const normal = await apiSolve(admin, { puzzle: evPuzzles[0].slug, difficulty: 'easy', mode: 'classic', fresh: true });
  check('events: normal games don’t count', !normal.events?.length, JSON.stringify(normal.events));
  // Event games: the event's difficulty and mode, the same shuffle for everyone, no helpers.
  const a1 = (await j(admin.request.post(BASE + '/api/plays', { data: { puzzle: evPuzzles[0].slug, event: 'test-week', difficulty: 'easy', mode: 'zen', fresh: true } }))).play;
  const b1 = (await j(player.request.post(BASE + '/api/plays', { data: { puzzle: evPuzzles[0].slug, event: 'test-week', fresh: true } }))).play;
  check('events: the event sets difficulty and mode', a1.difficulty === 'medium' && a1.mode === 'classic' && a1.event === 'test-week', JSON.stringify([a1.difficulty, a1.mode]));
  check('events: same shuffle for everyone', a1.seed === b1.seed);
  const hintTry = await admin.request.post(BASE + `/api/plays/${a1.id}/hint`, { data: { actions: [] } });
  const placeTry = await admin.request.post(BASE + `/api/plays/${a1.id}/place`, { data: { actions: [] } });
  check('events: hints and placed tiles are off', hintTry.status() === 403 && placeTry.status() === 403);
  const off = await admin.request.post(BASE + '/api/plays', { data: { puzzle: pub.puzzles.find((p) => !evPuzzles.some((e) => e.id === p.id) && p.categoryId !== 'daily').slug, event: 'test-week' } });
  check('events: only the event’s puzzles', off.status() === 404);
  let evRes = null;
  for (const p of evPuzzles) evRes = await apiSolve(admin, { puzzle: p.slug, event: 'test-week', fresh: true });
  check('events: finishing all pays the bonus', evRes.events?.[0]?.done === 2 && evRes.events[0].bonus === 300, JSON.stringify(evRes.events));
  await apiSolve(player, { puzzle: evPuzzles[0].slug, event: 'test-week', fresh: true });
  const ev = await j(admin.request.get(BASE + '/api/events/test-week'));
  check('events: leaderboard', ev.leaderboard[0]?.username === 'Syber' && ev.leaderboard[0].done === 2 && ev.leaderboard[1]?.username === 'PuzzleFan');
  check('events: your standing (done, rank, bonus)', ev.me?.completed === true && ev.me.rank === 1 && ev.me.bonus === 300 && ev.me.players === 2, JSON.stringify(ev.me));
  // Finished it: the home page says so, and the event page celebrates once.
  await admin.goto(BASE + '/');
  await admin.waitForSelector('.event-complete', { timeout: 10000 });
  await admin.locator('.event-complete').screenshot({ path: `${OUT}/21b-event-complete-home.png` });
  check('events: home page shows the event completed', /Event complete/.test(await admin.locator('.event-complete').innerText()) && /#1/.test(await admin.locator('.event-complete').innerText()));
  await admin.goto(BASE + '/event?e=test-week');
  await admin.waitForSelector('dialog.event-done-modal', { timeout: 10000 });
  await admin.waitForTimeout(900);
  await admin.screenshot({ path: `${OUT}/21c-event-complete-popup.png` });
  check('events: completion pop-up with bonus and rank', /\+300/.test(await admin.locator('dialog.event-done-modal').innerText()) && /#1/.test(await admin.locator('dialog.event-done-modal').innerText()));
  await admin.locator('dialog.event-done-modal .btn.primary').click();
  await admin.reload();
  await admin.waitForSelector('text=Leaderboard');
  await admin.waitForTimeout(1500);
  check('events: completion pop-up shows only once', (await admin.locator('dialog.event-done-modal').count()) === 0);
  const playerHome = await j(player.request.get(BASE + '/api/home'));
  const pe = playerHome.events.find((x) => x.id === 'test-week');
  check('events: home shows progress for players part-way', pe?.me?.done === 1 && pe.me.completed === false, JSON.stringify(pe?.me));
  // The event page links to event games.
  await player.goto(BASE + '/event?e=test-week');
  await player.waitForSelector('text=Leaderboard');
  check('events: event page links to event games', ((await player.getAttribute('.grid a.card', 'href')) || '').includes('&event=test-week'));
  // A picture from a normal category keeps its normal games outside the event page.
  check('events: category pictures keep normal links', (await j(player.request.get(BASE + `/api/puzzles/${encodeURIComponent(evPuzzles[1].slug)}`))).puzzle?.eventId == null);
  check('events: event page shows rules and prizes', (await player.locator('text=same shuffle for everyone').count()) > 0 && (await player.locator('text=Top 3 win').count()) > 0);
  await player.click('.grid a.card');
  await player.waitForSelector('#board');
  await player.waitForTimeout(600);
  check('events: event game hides hints and fixes the difficulty', !(await player.locator('.side button', { hasText: 'Hint' }).isVisible()) && (await player.locator('.side select').first().isDisabled()));
  check('events: game bar names the event', (await player.locator('.hud').innerText()).includes('Test Week'));
  // Coming soon on the home page.
  const in2 = new Date(Date.parse(today + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
  await admin.request.put(BASE + '/api/admin/events/soon-week', { data: { title: 'Soon Week', starts: in2, ends: in2, bonus: 0, teaserDays: 3, puzzleIds: [evPuzzles[1].id] } });
  const home2 = await j(gCtx.request.get(BASE + '/api/home'));
  const soon = (home2.upcoming || []).find((e) => e.id === 'soon-week');
  check('events: “Coming soon” with a countdown', !!soon && soon.startsInMs > 86400000 && soon.startsInMs <= 2 * 86400000, JSON.stringify(soon));
  const early = await player.request.post(BASE + '/api/plays', { data: { puzzle: evPuzzles[1].slug, event: 'soon-week' } });
  check('events: can’t play an event before it starts', early.status() === 403);
  await admin.request.delete(BASE + '/api/admin/events/soon-week');
  // When it ends: prizes for the top 3 (once), and badges on profiles.
  const yday = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const balBefore = (await j(admin.request.get(BASE + '/api/auth/me'))).user.points;
  sql(`UPDATE events SET starts = '${yday}', ends = '${yday}' WHERE id = 'test-week'`);
  const ended = await j(guest.request.get(BASE + '/api/events/test-week'));
  await j(guest.request.get(BASE + '/api/events/test-week'));
  const balAfter = (await j(admin.request.get(BASE + '/api/auth/me'))).user.points;
  check('events: winners paid when it ends', ended.winners.length === 2 && ended.winners[0].username === 'Syber' && ended.winners[0].points === 500 && ended.winners[1].points === 300, JSON.stringify(ended.winners));
  check('events: prizes paid once', balAfter - balBefore === 500, `${balBefore} -> ${balAfter}`);
  const prof = await j(guest.request.get(BASE + '/api/profile/Syber'));
  check('events: badge on the winner’s profile', prof.eventBadges?.some((b) => b.id === 'test-week' && b.place === 1 && b.completed), JSON.stringify(prof.eventBadges));
  sql(`UPDATE events SET starts = '${today}', ends = '${today}', prizes_paid_at = NULL WHERE id = 'test-week'`);
  sql(`DELETE FROM event_prizes WHERE event_id = 'test-week'`);
  await player.goto(BASE + '/event?e=test-week');
  await player.waitForSelector('text=Leaderboard');
  await player.screenshot({ path: `${OUT}/21-event.png`, fullPage: true });
  await admin.goto(BASE + '/admin#events');
  await admin.waitForSelector('text=Test Week');
  check('events: admin list', true);

  // Streak reminders.
  const yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const before = new Date(Date.parse(today + 'T12:00:00Z') - 2 * 86400000).toISOString().slice(0, 10);
  const pf = (await j(admin.request.get(BASE + '/api/admin/users?q=Syber'))).users.find((u) => u.username === 'Syber');
  sql(`UPDATE users SET email_verified = 1 WHERE id = ${pf.id}`);
  sql(`DELETE FROM daily_results WHERE user_id = ${pf.id}`);
  sql(`INSERT INTO daily_results (day, user_id, play_id, score_pct, elapsed_ms, moves, medal, created_at) VALUES ('${yesterday}', ${pf.id}, 'x1', 80, 1000, 10, 'gold', 1), ('${before}', ${pf.id}, 'x2', 80, 1000, 10, 'gold', 1)`);
  await admin.request.put(BASE + '/api/auth/preferences', { data: { remindStreak: true } });
  const run1 = await j(admin.request.post(BASE + '/api/admin/reminders/run'));
  check('reminders: sent to a player with a streak at risk', run1.log.some((l) => l.includes(`user ${pf.id}`) && l.includes('2 days')), run1.log.join(' | '));
  const run2 = await j(admin.request.post(BASE + '/api/admin/reminders/run'));
  check('reminders: only once a day', !run2.log.some((l) => l.includes(`user ${pf.id}`)));
  // The designed emails: admins can preview them; players can't.
  const prev = await admin.request.get(BASE + '/api/admin/email-preview/streak');
  const prevHtml = await prev.text();
  check('emails: streak reminder preview', prev.ok() && /day streak/.test(prevHtml) && /Play today’s puzzle/.test(prevHtml) && /email-logo\.png/.test(prevHtml) && /\/daily/.test(prevHtml));
  const pv = await (await admin.request.get(BASE + '/api/admin/email-preview/verify')).text();
  const pr = await (await admin.request.get(BASE + '/api/admin/email-preview/reset')).text();
  check('emails: verify and reset previews', /Confirm my email/.test(pv) && /Choose a new password/.test(pr));
  check('emails: previews are admin-only', (await player.request.get(BASE + '/api/admin/email-preview/streak')).status() === 403);
  check('emails: logo for emails is served', (await admin.request.get(BASE + '/img/email-logo.png')).ok());
  const me1 = (await j(admin.request.get(BASE + '/api/auth/me'))).user;
  check('reminders: preference saved', me1.remindStreak === true);
  const tok = (await j(admin.request.get(BASE + '/api/admin/users?q=Syber'))).users;
  void tok;
}

// ---- install offer, phone controls, tutorial, profiles, phone pictures, analytics ----
{
  const j = async (r) => (await r).json();
  // Tutorial: guided first game for new visitors.
  const tCtx = await newCtx(true);
  const t = await tCtx.newPage();
  const tErr = [];
  errorsFor(t, tErr);
  await t.goto(BASE + '/');
  await t.waitForSelector('.first-visit');
  check('home: first-visit panel for new guests', await t.locator('.first-visit a[href="/tutorial"]').isVisible());
  await t.click('.first-visit a');
  await t.waitForSelector('#board');
  await t.waitForTimeout(400);
  check('tutorial: shows the first tip', (await t.textContent('.tutorial-tip')).includes('jumbled'));
  // Solve it with the same engine and the seed the page made: read the state off the board by swapping until solved.
  const solvedOk = await t.evaluate(async () => {
    const c = document.querySelector('#board');
    const r = c.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check('tutorial: board has a size', solvedOk.w > 200 && solvedOk.h > 100);
  await t.evaluate(() => localStorage.setItem('ss_tutorial_done', 'true'));
  await t.goto(BASE + '/');
  await t.waitForSelector('.hero');
  check('home: first-visit panel hidden after the tutorial', (await t.locator('.first-visit').count()) === 0);
  check('no JS errors (tutorial)', tErr.length === 0, tErr.join(' | '));

  // Phone play screen: bottom bar with More sheet.
  const cats = await j(t.request.get(BASE + '/api/categories'));
  const cat = cats.categories.find((c) => c.count > 0 && !c.membersOnly);
  const first = (await j(t.request.get(BASE + `/api/categories/${cat.id}`))).puzzles[0];
  await t.goto(BASE + `/play?p=${first.slug}&d=easy`);
  await t.waitForSelector('#board');
  const bar = await t.locator('.game .side').boundingBox();
  check('phone: controls are a bar at the bottom', bar && bar.y + bar.height >= 840 && bar.height < 120, JSON.stringify(bar));
  check('phone: Hint, Pause and More in the bar', (await t.locator('.game .side > .key:visible').count()) >= 2 && (await t.locator('.more-btn').isVisible()));
  await t.click('.more-btn');
  check('phone: More opens the rest of the controls', await t.locator('.game .side select').first().isVisible());
  await t.click('.more-btn');
  check('phone: More closes again', !(await t.locator('.game .side select').first().isVisible()));
  await tCtx.close();

  // Install offer appears after two finished games (simulated count).
  // (Headless Chrome never offers its install prompt, so act as an iPhone, which gets instructions.)
  const iCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const ip = await iCtx.newPage();
  await ip.goto(BASE + '/about');
  await ip.waitForTimeout(4500);
  check('install: no offer before any finished games', (await ip.locator('.install-card').count()) === 0);
  await ip.evaluate(() => localStorage.setItem('ss_finishes', '2'));
  await ip.goto(BASE + '/categories');
  const shown = await ip.waitForSelector('.install-card', { timeout: 8000 }).then(() => true, () => false);
  check('install: offer shown after a couple of finished games', shown);
  if (shown) {
    await ip.click('.install-card >> text=Not now');
    await ip.goto(BASE + '/about');
    await ip.waitForTimeout(4500);
    check('install: "Not now" keeps it away', (await ip.locator('.install-card').count()) === 0);
  }
  await iCtx.close();

  // Public profile.
  const meU = (await j(player.request.get(BASE + '/api/auth/me'))).user;
  const prof = await j(guest.request.get(BASE + `/api/profile/${encodeURIComponent(meU.username)}`));
  check('profile: public by default with medals', prof.username === meU.username && prof.completed >= 1 && typeof prof.medals.gold === 'number', JSON.stringify(prof).slice(0, 200));
  check('profile: no email in the public profile', !JSON.stringify(prof).includes('@'));
  await guest.goto(BASE + `/u?name=${encodeURIComponent(meU.username)}`);
  await guest.waitForSelector('.profile-head');
  check('profile page renders', (await guest.textContent('.profile-head h1')).includes(meU.username));
  await player.request.put(BASE + '/api/auth/preferences', { data: { profilePublic: false } });
  const hidden = await guest.request.get(BASE + `/api/profile/${encodeURIComponent(meU.username)}`);
  check('profile: private hides it from others', hidden.status() === 404);
  const own = await player.request.get(BASE + `/api/profile/${encodeURIComponent(meU.username)}`);
  check('profile: owner still sees a private profile', own.ok());
  await player.request.put(BASE + '/api/auth/preferences', { data: { profilePublic: true } });
  await guest.goto(BASE + '/leaderboard?tab=points');
  await guest.waitForSelector('a.user-link');
  check('leaderboard names link to profiles', ((await guest.getAttribute('a.user-link', 'href')) || '').startsWith('/u?name='));

  // Phone-sized pictures: backfill from the admin, then served to phones.
  const pubNow = await j(admin.request.get(BASE + '/api/admin/puzzles/needs-small'));
  check('phone copies and link previews: made when publishing', pubNow.puzzles.length === 0, `${pubNow.puzzles.length} without`);
  sql('UPDATE puzzles SET small_key = NULL, share_key = NULL'); // as for puzzles published before these features
  await admin.goto(BASE + '/admin#puzzles');
  await admin.waitForSelector('text=Phone pictures and link previews');
  await admin.click('text=Make the copies');
  await admin.waitForSelector('text=Done:', { timeout: 60000 });
  const left = await j(admin.request.get(BASE + '/api/admin/puzzles/needs-small'));
  check('phone copies: all published puzzles have one', left.puzzles.length === 0, `${left.puzzles.length} left`);
  check('link previews: backfill made the 1200×630 copies too', !left.puzzles.some((p) => p.needsShare));
  const pv = (await j(guest.request.get(BASE + `/api/puzzles/${first.slug}`))).puzzle;
  check('phone copies: API gives imageSmall', !!pv.imageSmall && pv.imageSmall !== pv.image);
  const smallRes = await guest.request.get(BASE + pv.imageSmall);
  const bigRes = await guest.request.get(BASE + pv.image);
  check('phone copies: smaller than the full picture', smallRes.ok() && (await smallRes.body()).length < (await bigRes.body()).length);
  const pCtx2 = await newCtx(true);
  const ph = await pCtx2.newPage();
  const loaded = [];
  ph.on('request', (r) => r.url().includes('/media/') && loaded.push(r.url()));
  await ph.goto(BASE + `/play?p=${first.slug}&d=easy`);
  await ph.waitForSelector('#board');
  await ph.waitForTimeout(800);
  check('phone copies: phones load the small picture', loaded.some((u) => u.includes('/media/small/')) && !loaded.some((u) => u.endsWith(pv.image)), loaded.join(' '));

  // Cloudflare Web Analytics beacon only when a token is set.
  check('analytics: no beacon by default', (await ph.locator('script[data-cf-beacon]').count()) === 0);
  await admin.request.put(BASE + '/api/admin/site', { data: { analyticsToken: 'abc123def456' } });
  await ph.goto(BASE + '/about');
  await ph.waitForSelector('footer');
  const beacon = await ph.getAttribute('script[data-cf-beacon]', 'data-cf-beacon');
  check('analytics: beacon added with the token', !!beacon && beacon.includes('abc123def456'));
  await admin.request.put(BASE + '/api/admin/site', { data: { analyticsToken: '' } });
  await pCtx2.close();
}

// ---- admin analytics ----
{
  const j = async (r) => (await r).json();
  const denied = await guest.request.get(BASE + '/api/admin/analytics/game');
  check('analytics: admins only', denied.status() === 401 || denied.status() === 403, String(denied.status()));
  const g = await j(admin.request.get(BASE + '/api/admin/analytics/game?days=7'));
  check('analytics: game stats per day', g.labels.length === 7 && g.series.finishes.length === 7 && g.series.finishes.reduce((a, b) => a + b, 0) === g.summary.finished && g.summary.finished > 0, JSON.stringify(g.summary));
  check('analytics: top puzzles listed', g.topPuzzles.length > 0 && g.topPuzzles[0].n >= 1);
  await admin.goto(BASE + '/admin#analytics');
  await admin.waitForSelector('text=Players and games');
  check('analytics tab: charts drawn', (await admin.locator('.chart-svg').count()) >= 4);
  await admin.waitForSelector('text=Site traffic');
  check('analytics tab: traffic setup shown until connected', await admin.locator('input[name=siteTag]').isVisible());
  check('analytics tab: knows the token is set', await admin.locator('text=Token is set').isVisible());
  // Hover a column for its tooltip.
  const box = await admin.locator('.chart-svg').first().boundingBox();
  await admin.mouse.move(box.x + box.width - 12, box.y + box.height / 2);
  check('analytics tab: hover shows the day and value', await admin.locator('.chart-tip:visible').count() === 1);
  // Bad IDs are refused.
  const bad = await admin.request.put(BASE + '/api/admin/analytics/traffic/settings', { data: { accountId: 'nope', siteTag: 'b'.repeat(32) } });
  check('analytics: bad account ID refused', bad.status() === 422);
  // Wrong account: a clear error, not a crash.
  await admin.request.put(BASE + '/api/admin/analytics/traffic/settings', { data: { accountId: 'c'.repeat(32), siteTag: 'b'.repeat(32) } });
  const wrong = await j(admin.request.get(BASE + '/api/admin/analytics/traffic?days=7'));
  check('analytics: Cloudflare errors are shown', wrong.connected && /not authorized/.test(wrong.error || ''), JSON.stringify(wrong));
  // Through the form, with the right IDs.
  await admin.goto(BASE + '/admin#overview');
  await admin.goto(BASE + '/admin#analytics');
  await admin.waitForSelector('text=Connection settings');
  await admin.click('text=Connection settings');
  await admin.fill('input[name=accountId]', 'a'.repeat(32));
  await admin.fill('input[name=siteTag]', 'b'.repeat(32));
  await admin.click('text=Save and load traffic');
  await admin.waitForSelector('text=Where visitors came from');
  const t = await j(admin.request.get(BASE + '/api/admin/analytics/traffic?days=30'));
  check('analytics: traffic totals and days', t.total?.pageViews === 274 && t.series.visits.length === 30 && t.labels.length === 30, JSON.stringify(t).slice(0, 200));
  check('analytics: top pages, referrers, countries, devices', t.pages[0].name === '/' && t.referrers[0].name === 'Direct / unknown' && t.countries.length === 2 && t.devices.length === 2);
  check('analytics tab: traffic charts drawn', (await admin.locator('.chart-svg').count()) >= 6);
}

// ---- Slider Puzzle ----
{
  const j = async (r) => (await r).json();
  /** A quick (not shortest) solve for any size: weighted A* on the tile distances. */
  const solveSlider = (seed, n) => {
    const start = SL.sliderNew(seed, n);
    const key = (t) => t.join(',');
    const h = (t) => SL.distance({ n, tiles: t, blank: 0, moves: 0 });
    const open = [{ t: [...start.tiles], b: start.blank, path: [], f: 0 }];
    const seen = new Set([key(start.tiles)]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (h(cur.t) === 0) return cur.path;
      for (const q of SL.sliderNeighbors(n, cur.b)) {
        const t = [...cur.t];
        t[cur.b] = t[q];
        t[q] = n * n - 1;
        const k = key(t);
        if (seen.has(k)) continue;
        seen.add(k);
        open.push({ t, b: q, path: [...cur.path, q], f: cur.path.length + 1 + 4 * h(t) });
      }
      if (seen.size > 400000) return null;
    }
    return null;
  };
  const d = await j(guest.request.get(BASE + '/api/slider/daily'));
  check('slider: today’s slider is 4×4 with a picture', d.size === 4 && !!d.puzzle.slug && !!d.puzzle.image);
  const again = await j(guest.request.get(BASE + '/api/slider/daily'));
  check('slider: same picture all day', again.puzzle.slug === d.puzzle.slug);
  const gs = await j(guest.request.post(BASE + '/api/slider/start', { data: { daily: true } }));
  check('slider: guests get the shuffle, nothing recorded', gs.gameId === null && gs.size === 4 && gs.seed > 0);
  const big = await guest.request.post(BASE + '/api/slider/start', { data: { slug: d.puzzle.slug, size: 5 } });
  check('slider: 5×5 is for Plus members', big.status() === 403);
  const locked = (await j(guest.request.get(BASE + '/api/home'))).latest.find((p) => !p.unlocked);
  if (locked) {
    const lr = await guest.request.post(BASE + '/api/slider/start', { data: { slug: locked.slug, size: 3 } });
    check('slider: locked pictures can’t be slid', lr.status() === 403);
  }
  // Signed-in player: a 3×3 on any picture.
  const bal0 = (await j(player.request.get(BASE + '/api/auth/me'))).user.points;
  const g3 = await j(player.request.post(BASE + '/api/slider/start', { data: { slug: d.puzzle.slug, size: 3 } }));
  const bad = await player.request.post(BASE + `/api/slider/${g3.gameId}/finish`, { data: { actions: [99] } });
  check('slider: illegal moves are refused', bad.status() === 422);
  const half = await player.request.post(BASE + `/api/slider/${g3.gameId}/finish`, { data: { actions: [] } });
  check('slider: unfinished boards are refused', half.status() === 422);
  const m3 = SL.sliderSolve(SL.sliderNew(g3.seed, 3));
  await player.waitForTimeout(Math.max(1200, m3.length * 40));
  const f3 = await j(player.request.post(BASE + `/api/slider/${g3.gameId}/finish`, { data: { actions: m3 } }));
  check('slider: 3×3 solve counts, with a medal and points', f3.moves === m3.length && f3.medal === 'gold' && f3.points === 5, JSON.stringify(f3).slice(0, 200));
  check('slider: achievement for the first slider', (f3.achievements || []).some((a) => a.title === 'Smooth Operator'));
  const twice = await player.request.post(BASE + `/api/slider/${g3.gameId}/finish`, { data: { actions: m3 } });
  check('slider: a game counts once', twice.status() === 409);
  // Today's slider, solved for real, goes on the leaderboard with the daily bonus.
  const gd = await j(player.request.post(BASE + '/api/slider/start', { data: { daily: true } }));
  const md = solveSlider(gd.seed, 4);
  check('slider: test solver found a 4×4 solution', !!md, md ? `${md.length} moves` : '');
  await player.waitForTimeout(Math.max(1500, md.length * 40));
  const fd = await j(player.request.post(BASE + `/api/slider/${gd.gameId}/finish`, { data: { actions: md } }));
  check('slider: today’s slider pays the bonus', fd.firstDaily === true && fd.points === 35 && fd.daily?.rank === 1, JSON.stringify(fd).slice(0, 200));
  // Solved today's slider: home says so, and going back shows the result instead of a new shuffle.
  const hs = await j(player.request.get(BASE + '/api/home'));
  check('slider: home knows today’s slider is done', hs.sliderToday?.medal && hs.sliderToday.moves === md.length, JSON.stringify(hs.sliderToday));
  await player.goto(BASE + '/slider?daily=1');
  await player.waitForSelector('.slider-complete', { timeout: 10000 });
  check('slider: going back shows “Completed today”', /Completed today/.test(await player.locator('.slider-complete').innerText()) && (await player.locator('.slider-tile').count()) === 0);
  await player.screenshot({ path: `${OUT}/slider-completed-today.png` });
  await player.click('text=Try to beat your time');
  await player.waitForSelector('.slider-tile');
  check('slider: “Try to beat your time” starts a new game', player.url().includes('again=1'));
  await player.goto(BASE + '/');
  await player.waitForSelector('.slider-done');
  check('home: slider panel shows “Done today”', /Done today/.test(await player.locator('.slider-done').innerText()));
  const bal1 = (await j(player.request.get(BASE + '/api/auth/me'))).user.points;
  const achPts = [...(f3.achievements || []), ...(fd.achievements || [])].reduce((n, a) => n + (a.reward || 0), 0);
  check('slider: points reach the balance (solves + achievement rewards)', bal1 - bal0 === 40 + achPts, `${bal0} -> ${bal1}, achievements ${achPts}`);
  const lb = await j(guest.request.get(BASE + '/api/slider/leaderboard'));
  check('slider: leaderboard shows the player', lb.rows.length === 1 && lb.rows[0].moves === md.length);
  // Too fast is refused.
  const gf = await j(player.request.post(BASE + '/api/slider/start', { data: { slug: d.puzzle.slug, size: 3 } }));
  const mf = SL.sliderSolve(SL.sliderNew(gf.seed, 3));
  const fast = await player.request.post(BASE + `/api/slider/${gf.gameId}/finish`, { data: { actions: mf } });
  check('slider: impossibly fast games are refused', mf.length * 35 > 1000 ? fast.status() === 422 : true, String(fast.status()));

  // In the browser on a phone: play a 3×3 by tapping.
  const sCtx = await newCtx(true);
  const sp = await sCtx.newPage();
  const sErr = [];
  errorsFor(sp, sErr);
  await sp.goto(BASE + '/slider');
  await sp.waitForSelector('text=Slide any picture');
  check('slider page: today’s slider and sizes', (await sp.locator('h1', { hasText: 'Today’s Slider' }).count()) === 1 && (await sp.locator('button[data-size]').count()) === 3);
  const startResp = sp.waitForResponse((r) => r.url().includes('/api/slider/start'));
  // A picture guests can play (today's slider picture may be a locked one).
  const freePic = (await j(sCtx.request.get(BASE + '/api/home'))).latest.find((p) => p.unlocked)?.slug ?? d.puzzle.slug;
  await sp.goto(BASE + `/slider?p=${encodeURIComponent(freePic)}&size=3`);
  const st = await (await startResp).json();
  await sp.waitForSelector('.slider-tile');
  await sp.waitForTimeout(300);
  const ms = SL.sliderSolve(SL.sliderNew(st.seed, 3));
  for (const pos of ms) {
    const box = await sp.locator('.slider-board').boundingBox();
    await sp.mouse.click(box.x + ((pos % 3) + 0.5) * (box.width / 3), box.y + (Math.floor(pos / 3) + 0.5) * (box.height / 3));
    await sp.waitForTimeout(40);
  }
  await openResults(sp, 'dialog.modal:not(.ach-modal)', 8000);
  const txt = await sp.locator('dialog.modal:not(.ach-modal)').innerText();
  check('slider page: solving by tapping shows the result', /Solved!|New best!/.test(txt) && /medal/i.test(txt), txt.slice(0, 120));
  await sp.screenshot({ path: `${OUT}/slider-done.png` });
  check('slider page: phone controls in the bottom bar', await sp.locator('.game .side > .key', { hasText: 'Peek' }).isVisible());
  check('no JS errors (slider)', sErr.length === 0, sErr.join(' | '));
  await sCtx.close();
  // Entry points.
  await guest.goto(BASE + '/');
  await guest.waitForSelector('text=Slider Puzzle');
  check('home: slider panel', await guest.locator('a[href="/slider?daily=1"]').first().isVisible());
  await guest.goto(BASE + `/play?p=${encodeURIComponent(freePic)}&d=easy`);
  await guest.waitForSelector('#board');
  check('play page: “Play as slider” link', (await guest.locator('a', { hasText: 'Play as slider' }).count()) === 1);
}

// ---- turn the phone sideways ----
{
  const rCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const rp = await rCtx.newPage();
  const slug = (await (await rp.request.get(BASE + '/api/home')).json()).latest.find((x) => x.unlocked).slug;
  await rp.goto(BASE + `/play?p=${slug}&d=easy`);
  await rp.waitForSelector('#board');
  check('rotate: upright phone is asked to turn sideways', await rp.locator('.rotate-hint').isVisible());
  await rp.setViewportSize({ width: 844, height: 390 });
  await rp.waitForTimeout(800);
  check('rotate: the suggestion goes when the phone is turned', (await rp.locator('.rotate-hint').count()) === 0);
  const fit = await rp.evaluate(() => { const r = document.querySelector('#board').getBoundingClientRect(); return r.bottom <= innerHeight && r.top < 80; });
  check('rotate: sideways, the board fits the screen with no header', fit && !(await rp.locator('.topbar').isVisible()));
  await rp.setViewportSize({ width: 390, height: 844 });
  await rp.reload();
  await rp.waitForSelector('.rotate-hint');
  await rp.check('.rotate-hint input[type=checkbox]');
  await rp.click('text=Keep playing upright');
  await rp.reload();
  await rp.waitForSelector('#board');
  await rp.waitForTimeout(500);
  check('rotate: “Don’t ask again” is remembered', (await rp.locator('.rotate-hint').count()) === 0);
  await rCtx.close();
}

// ---- pictures made only for events ----
{
  const j = async (r) => (await r).json();
  const today = (await j(guest.request.get(BASE + '/api/daily/today'))).day;
  const themes = await j(admin.request.get(BASE + '/api/admin/events/themes'));
  const winter = themes.themes.find((t) => t.id === 'winter');
  check('event pictures: winter idea pack', winter && winter.ideas.length >= 20);
  const early = await admin.request.post(BASE + '/api/admin/events/not-saved/generate', { data: { ideas: ['x'] } });
  check('event pictures: the event must be saved first', early.status() === 404);
  await admin.request.put(BASE + '/api/admin/events/winter-test', { data: { title: 'Winter Wonderland', description: 'Snowy pictures', starts: today, ends: today, bonus: 100, puzzleIds: [] } });
  // Through the admin page: pick the pack, keep two ideas, generate.
  await admin.goto(BASE + '/admin#events');
  await admin.waitForSelector('text=Winter Wonderland');
  await admin.locator('tr', { hasText: 'Winter Wonderland' }).locator('button', { hasText: 'Edit' }).click();
  await admin.waitForSelector('text=Generate pictures just for this event');
  await admin.waitForFunction(() => document.querySelectorAll('.section-box select option').length > 3);
  await admin.selectOption('.section-box select >> nth=0', 'winter');
  check('event pictures: pack fills the ideas', (await admin.inputValue('.section-box textarea')).split('\n').length === winter.ideas.length);
  await admin.fill('.section-box textarea', winter.ideas.slice(0, 2).join('\n'));
  admin.once('dialog', (d) => d.accept());
  await admin.click('.section-box button:has-text("Generate pictures")');
  await admin.waitForSelector('text=pictures generating', { timeout: 15000 });
  for (let i = 0; i < 4; i++) await admin.request.post(BASE + '/api/admin/generation/run');
  const pending = (await j(admin.request.get(BASE + '/api/admin/puzzles?status=pending'))).puzzles.filter((p) => p.eventId === 'winter-test');
  check('event pictures: generated into the review queue for the event', pending.length === 2 && pending.every((p) => p.categoryId === 'events') && pending.some((p) => p.title === 'Snowy Log Cabin'), JSON.stringify(pending.map((p) => [p.title, p.categoryId])));
  check('event pictures: the winter prompt is used', /log cabin in deep fresh snow/.test(pending.find((p) => p.title === 'Snowy Log Cabin')?.prompt || ''));
  await admin.goto(BASE + '/admin#queue');
  await admin.waitForSelector('.queue-card');
  for (let i = 0; i < 2; i++) {
    const n = await admin.locator('.queue-card').count();
    await admin.locator('.queue-card', { hasText: 'For the event' }).first().locator('button', { hasText: 'Publish' }).click();
    await admin.waitForFunction((k) => document.querySelectorAll('.queue-card').length === k, n - 1, { timeout: 20000 });
  }
  const ev = await j(guest.request.get(BASE + '/api/events/winter-test'));
  check('event pictures: publishing adds them to the event', ev.puzzles.length === 2 && ev.puzzles.every((p) => p.unlocked), JSON.stringify(ev.puzzles.map((p) => p.title)));
  const slug = ev.puzzles[0].slug;
  check('event pictures: with no picture of its own, the event uses its first puzzle’s', /^\/media\//.test((ev.event || ev).image || ''), (ev.event || ev).image);
  const cats = await j(guest.request.get(BASE + '/api/categories'));
  const home = await j(guest.request.get(BASE + '/api/home'));
  check('event pictures: never in categories or latest', !cats.categories.some((c) => c.id === 'events') && !home.latest.some((p) => p.slug === slug));
  check('event pictures: category page hidden', (await guest.request.get(BASE + '/api/categories/events')).status() === 404);
  check('event pictures: playable while the event is on', (await guest.request.get(BASE + `/api/puzzles/${slug}`)).ok());
  // Any plain link to an event picture plays the event game, so it always counts.
  check('event pictures: carry their live event', (await j(guest.request.get(BASE + `/api/puzzles/${slug}`))).puzzle?.eventId === 'winter-test');
  await player.goto(BASE + `/play?p=${encodeURIComponent(slug)}`);
  await player.waitForSelector('#board');
  await player.waitForTimeout(600);
  check('event pictures: a plain link plays the event game', player.url().includes('event=winter-test'), player.url());
  // Event over: no longer playable, even for members.
  await admin.request.put(BASE + '/api/admin/events/winter-test', { data: { title: 'Winter Wonderland', starts: '2020-01-01', ends: '2020-01-07', bonus: 100, puzzleIds: ev.puzzles.map((p) => p.id) } });
  check('event pictures: hidden once the event is over', (await guest.request.get(BASE + `/api/puzzles/${slug}`)).status() === 404);
  const late = await player.request.post(BASE + '/api/plays', { data: { puzzle: slug, difficulty: 'easy', mode: 'classic', fresh: true } });
  check('event pictures: can’t be played after the event', late.status() === 403 || late.status() === 404, String(late.status()));
  const sl = await guest.request.post(BASE + '/api/slider/start', { data: { slug, size: 3 } });
  check('event pictures: not slidable outside the event', sl.status() === 403);
}

// ---- search engines and link previews ----
{
  const sm = await guest.request.get(BASE + '/sitemap.xml');
  const xml = await sm.text();
  const anyPub = pub.puzzles.find((p) => p.categoryId !== 'daily' && p.categoryId !== 'members');
  check('seo: sitemap lists pages and puzzles', sm.ok() && xml.includes('<urlset') && xml.includes('/daily') && xml.includes(`/play?p=${anyPub.slug}`));
  check('seo: sitemap skips hidden pictures', !pub.puzzles.filter((p) => p.categoryId === 'daily').some((p) => xml.includes(`?p=${p.slug}<`)));
  const html = await (await guest.request.get(BASE + `/play?p=${anyPub.slug}`)).text();
  const title = (html.match(/<title>([^<]*)/) || [])[1] || '';
  const ogImage = (html.match(/og:image" content="([^"]*)/) || [])[1] || '';
  check('seo: puzzle page has its own title', title.includes('Free Picture Tile Puzzle'), title);
  check('seo: link preview uses the puzzle’s 1200×630 picture', /\/media\/share\/.+\.jpg$/.test(ogImage) && html.includes('og:image:width" content="1200"'), ogImage);
  const imgRes = await guest.request.get(ogImage.replace(/^https?:\/\/[^/]+/, BASE));
  check('seo: preview picture is a JPEG', imgRes.ok() && (imgRes.headers()['content-type'] || '').includes('image/jpeg'));
  const dailyHtml = await (await guest.request.get(BASE + '/daily')).text();
  check('seo: daily page title', /Daily Picture Puzzle for/.test(dailyHtml));
  const home = await (await guest.request.get(BASE + '/')).text();
  check('seo: site-wide preview picture and large cards', home.includes('/img/share.jpg') && home.includes('summary_large_image'));
  const robots = await (await guest.request.get(BASE + '/robots.txt')).text();
  check('seo: robots.txt keeps admin out', robots.includes('Disallow: /admin') && robots.includes('sitemap.xml'));
  const adminHtml = await (await guest.request.get(BASE + '/admin')).text();
  check('seo: admin page is noindex', adminHtml.includes('name="robots" content="noindex"'));
}

// ---- invite friends, daily push reminders, Android app, portal pack ----
{
  const j = async (r) => (await r).json();
  const setupOf = (p) => ({ version: p.engine, difficulty: p.difficulty, mode: p.mode, daily: !!p.daily, hardMode: false });
  async function solveVia(ctx, startBody) {
    const { play } = await j(ctx.request.post(BASE + '/api/plays', { data: startBody }));
    const g = E.replay(play.seed, setupOf(play), play.actions).state;
    const actions = [...play.actions];
    for (let m = E.suggest(g); m && !E.isSolved(g); m = E.suggest(g)) {
      actions.push(m.kind === 'swap' ? [m.a, m.b] : ['r', m.p]);
      E.applySuggestion(g, m);
    }
    return j(ctx.request.post(BASE + `/api/plays/${play.id}/complete`, { data: { actions, elapsedMs: actions.length * 300 } }));
  }

  // Invites: a friend opens the link, signs up, verifies and finishes 3 puzzles.
  const mine = await j(player.request.get(BASE + '/api/invites'));
  check('invites: personal link', mine.link.endsWith('/?ref=PuzzleFan') && mine.friends.length === 0, mine.link);
  const fCtx = await newCtx(true);
  const friend = await fCtx.newPage();
  const friendErrors = [];
  errorsFor(friend, friendErrors);
  await friend.goto(BASE + '/?ref=PuzzleFan');
  await friend.waitForSelector('text=PuzzleFan invited you to SnapShift!', { timeout: 8000 });
  check('invites: welcome note for the invited guest', true);
  check('invites: link tidied from the address bar', !friend.url().includes('ref='), friend.url());
  await friend.goto(BASE + '/account?signup=1');
  check('invites: sign-up form says who invited you', !!(await friend.waitForSelector('text=Invited by PuzzleFan', { timeout: 8000 }).catch(() => null)));
  await friend.fill('#email', 'friend@example.com');
  await friend.fill('#username', 'NewFriend');
  await friend.fill('#password', 'friendpass1');
  await friend.click('button[type=submit]');
  await friend.waitForURL(BASE + '/', { timeout: 10000 });
  let inv = await j(player.request.get(BASE + '/api/invites'));
  check('invites: friend shows up as joined', inv.friends.length === 1 && inv.friends[0].username === 'NewFriend' && !inv.friends[0].rewarded, JSON.stringify(inv.friends));
  // Three finishes (the free puzzle on three difficulties), before verifying the email.
  const free = pub.puzzles.find((p) => p.categoryId === 'animals');
  let last = null;
  for (const d of ['easy', 'medium', 'hard']) last = await solveVia(fCtx, { puzzle: free.slug, difficulty: d });
  check('invites: no bonus before the email is verified', last.rating && !last.invite, JSON.stringify(last.invite));
  inv = await j(player.request.get(BASE + '/api/invites'));
  check('invites: progress shows “needs to verify”', inv.friends[0].finished === 3 && !inv.friends[0].verified);
  const { devLink } = await j(fCtx.request.post(BASE + '/api/auth/resend-verification'));
  await friend.goto(devLink);
  await friend.waitForSelector('text=Invite bonus!', { timeout: 8000 });
  check('invites: bonus paid when the email is verified', true);
  inv = await j(player.request.get(BASE + '/api/invites'));
  check('invites: inviter sees the bonus', inv.friends[0].rewarded && inv.earned === inv.points);
  const pLedger = await j(player.request.get(BASE + '/api/me/ledger'));
  const fLedger = await j(fCtx.request.get(BASE + '/api/me/ledger'));
  check('invites: both players got the points', pLedger.rows.some((r) => r.reason === 'invite' && r.delta === 100) && fLedger.rows.some((r) => r.reason === 'invited' && r.delta === 100));
  const again = await solveVia(fCtx, { puzzle: free.slug, difficulty: 'easy', fresh: true });
  check('invites: paid only once', !again.invite && (await j(player.request.get(BASE + '/api/me/ledger'))).rows.filter((r) => r.reason === 'invite').length === 1);
  const pAch = await j(player.request.get(BASE + '/api/me/achievements'));
  check('invites: “Bring a Friend” achievement', pAch.achievements.some((a) => a.id === 'invite-1' && a.earnedAt));
  await player.goto(BASE + '/account');
  await player.waitForSelector('#invite');
  check('invites: account panel lists the friend', (await player.locator('#invite').innerText()).includes('NewFriend'));
  const selfRef = await j(fCtx.request.get(BASE + '/api/invites/from/nobody_here'));
  check('invites: unknown names are ignored', selfRef.username === null);

  // Daily reminders by push: a fake push service checks the VAPID signature and decrypts the message.
  const http = await import('node:http');
  const wc = globalThis.crypto.subtle;
  const b64u = (b) => Buffer.from(b).toString('base64url');
  const received = [];
  const keysFor = new Map();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = new Uint8Array(Buffer.concat(chunks));
    const id = req.url.split('/').pop();
    if (id === 'gone') return res.writeHead(410).end();
    const auth = req.headers.authorization || '';
    const [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/) || [];
    let sigOk = false;
    let msg = null;
    try {
      const [hd, cl, sg] = jwt.split('.');
      const pub = await wc.importKey('raw', Buffer.from(k, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      sigOk = await wc.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(sg, 'base64url'), new TextEncoder().encode(`${hd}.${cl}`));
      const claims = JSON.parse(Buffer.from(cl, 'base64url').toString());
      sigOk = sigOk && claims.aud === 'http://127.0.0.1:8793' && claims.exp > Date.now() / 1000;
      const { priv, pubRaw, authSecret } = keysFor.get(id);
      const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
      const asKey = await wc.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const shared = new Uint8Array(await wc.deriveBits({ name: 'ECDH', public: asKey }, priv, 256));
      const hk = async (s, ikm, info, n) => new Uint8Array(await wc.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await wc.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
      const te = new TextEncoder();
      const ikm = await hk(authSecret, shared, Buffer.concat([te.encode('WebPush: info\0'), pubRaw, asPub]), 32);
      const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
      const nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
      const plain = new Uint8Array(await wc.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
      msg = JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
    } catch (e) {
      msg = { error: String(e) };
    }
    received.push({ id, sigOk, msg, encoding: req.headers['content-encoding'], ttl: req.headers.ttl, k });
    res.writeHead(201).end();
  });
  await new Promise((ok) => server.listen(8793, '127.0.0.1', ok));
  const device = async (id) => {
    const pair = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const pubRaw = new Uint8Array(await wc.exportKey('raw', pair.publicKey));
    const authSecret = globalThis.crypto.getRandomValues(new Uint8Array(16));
    keysFor.set(id, { priv: pair.privateKey, pubRaw, authSecret });
    return { endpoint: `http://127.0.0.1:8793/push/${id}`, keys: { p256dh: b64u(pubRaw), auth: b64u(authSecret) } };
  };
  const { publicKey } = await j(guest.request.get(BASE + '/api/push/key'));
  check('push: site has a VAPID key', publicKey && Buffer.from(publicKey, 'base64url').length === 65);
  const fanDevice = await device('fan');
  const sub1 = await j(player.request.post(BASE + '/api/push/subscribe', { data: { subscription: fanDevice, tz: 'UTC', hour: 0 } }));
  check('push: device signed up', sub1.ok && sub1.hour === 0);
  const st = await j(player.request.post(BASE + '/api/push/status', { data: { endpoint: fanDevice.endpoint } }));
  check('push: status shows it’s on', st.subscribed && st.hour === 0);
  const test = await player.request.post(BASE + '/api/push/test', { data: { endpoint: fanDevice.endpoint } });
  const got = received.find((r) => r.id === 'fan');
  check('push: test notification sent', test.ok() && !!got, await test.text());
  check('push: VAPID signature verifies with the site key', got?.sigOk && got.k === publicKey);
  check('push: message is encrypted (aes128gcm) and readable', got?.encoding === 'aes128gcm' && /puzzle|streak/i.test(got.msg?.title || '') && got.msg.url.endsWith('/daily'), JSON.stringify(got?.msg));
  const guestDevice = await device('guest1');
  await guest.request.post(BASE + '/api/push/subscribe', { data: { subscription: guestDevice, tz: 'Pacific/Kiritimati', hour: 0 } });
  const before = received.length;
  const run1 = await j(admin.request.post(BASE + '/api/admin/push/run'));
  const guestMsg = received.slice(before).find((r) => r.id === 'guest1');
  check('push: daily run reaches guests too', !!guestMsg && guestMsg.msg.title.includes('Today’s puzzle'), JSON.stringify(run1.log));
  check('push: skipped for players who already played today', !received.slice(before).some((r) => r.id === 'fan'), JSON.stringify(run1.log));
  const n2 = received.length;
  await j(admin.request.post(BASE + '/api/admin/push/run'));
  check('push: once a day only', received.length === n2);
  const goneDevice = await device('gone');
  await guest.request.post(BASE + '/api/push/subscribe', { data: { subscription: goneDevice, tz: 'UTC', hour: 0 } });
  const goneTest = await guest.request.post(BASE + '/api/push/test', { data: { endpoint: goneDevice.endpoint } });
  const goneSt = await j(guest.request.post(BASE + '/api/push/status', { data: { endpoint: goneDevice.endpoint } }));
  check('push: dropped subscriptions are removed', goneTest.status() === 502 && !goneSt.subscribed);
  await guest.request.post(BASE + '/api/push/unsubscribe', { data: { endpoint: guestDevice.endpoint } });
  check('push: turning off works', !(await j(guest.request.post(BASE + '/api/push/status', { data: { endpoint: guestDevice.endpoint } }))).subscribed);
  check('push: bad addresses refused', (await guest.request.post(BASE + '/api/push/subscribe', { data: { subscription: { endpoint: 'javascript:alert(1)', keys: { p256dh: 'x', auth: 'y' } } } })).status() === 422);
  server.close();
  const ov = await j(admin.request.get(BASE + '/api/admin/overview'));
  check('push: admin overview counts devices and invites', ov.pushSubscribers === 1 && ov.invitedPlayers === 1, JSON.stringify({ p: ov.pushSubscribers, i: ov.invitedPlayers }));
  await player.goto(BASE + '/account');
  await player.waitForSelector('#notifications');
  check('push: account page has the reminder panel', /Daily reminder on this device/.test(await player.locator('#notifications').innerText()));
  const g2Ctx = await newCtx();
  // Headless browsers always report notifications as blocked; act like a normal first visit.
  await g2Ctx.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }));
  const g2 = await g2Ctx.newPage();
  await g2.goto(BASE + '/daily');
  await g2.waitForSelector('.push-offer', { timeout: 8000 });
  check('push: daily page offers reminders', await g2.locator('.push-offer button', { hasText: 'Notify me' }).isVisible());
  await g2.locator('.push-offer button', { hasText: 'No thanks' }).click();
  await g2.reload();
  await g2.waitForSelector('text=Daily Challenge');
  check('push: “No thanks” hides the offer', (await g2.locator('.push-offer').count()) === 0);
  const sw = await (await guest.request.get(BASE + '/sw.js')).text();
  check('push: service worker shows the notification and opens the daily', sw.includes("addEventListener('push'") && sw.includes('notificationclick'));

  // Android app: Digital Asset Links from the admin settings; no Plus checkout inside the app.
  check('android: assetlinks empty until set up', JSON.stringify(await j(guest.request.get(BASE + '/.well-known/assetlinks.json'))) === '[]');
  const fp = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0').slice(-2)).join(':');
  const saved = await j(admin.request.put(BASE + '/api/admin/site', { data: { androidPackage: 'com.snapshiftpuzzles.twa', androidFingerprints: `${fp.toLowerCase()}\nnot-a-fingerprint`, androidPlayUrl: 'https://play.google.com/store/apps/details?id=com.snapshiftpuzzles.twa' } }));
  check('android: fingerprints cleaned on save', saved.androidFingerprints === fp, saved.androidFingerprints);
  const al = await j(guest.request.get(BASE + '/.well-known/assetlinks.json'));
  check('android: assetlinks.json links the app', al[0]?.target?.package_name === 'com.snapshiftpuzzles.twa' && al[0].target.sha256_cert_fingerprints[0] === fp && al[0].relation[0] === 'delegate_permission/common.handle_all_urls');
  check('android: Play link public for the install offer', (await j(guest.request.get(BASE + '/api/site'))).androidPlayUrl.includes('play.google.com'));
  const appPage = await (await newCtx(true)).newPage();
  await appPage.goto(BASE + '/plus?app=android');
  await appPage.waitForSelector('text=can’t be bought inside the Android app');
  check('android: no checkout buttons in the app', (await appPage.locator('.plans button').count()) === 0);
  await appPage.goto(BASE + '/');
  await appPage.waitForSelector('.topbar');
  check('android: no “Get Plus” in the app menu', (await appPage.locator('a.plus-btn').count()) === 0);
  const mf = await j(guest.request.get(BASE + '/manifest.webmanifest'));
  check('android: manifest has an id and screenshots', mf.id === '/' && mf.screenshots.length >= 3 && (await guest.request.get(BASE + mf.screenshots[0].src)).ok());
  await admin.request.put(BASE + '/api/admin/site', { data: { androidFingerprints: '', androidPlayUrl: '' } });

  // Portal pack: picture list for the game-portal build.
  const packRes = await guest.request.get(BASE + '/api/portal/pack?per=2');
  const pack = await packRes.json();
  check('portal: pack open to other sites (CORS)', packRes.headers()['access-control-allow-origin'] === '*');
  const cats = new Map();
  for (const p of pack.puzzles) cats.set(p.category, (cats.get(p.category) || 0) + 1);
  check('portal: pack has pictures, at most 2 per category', pack.puzzles.length > 0 && [...cats.values()].every((n) => n <= 2), JSON.stringify([...cats]));
  const hiddenSlugs = pub.puzzles.filter((p) => ['daily', 'members', 'events'].includes(p.categoryId)).map((p) => p.slug);
  check('portal: no daily, members or event pictures', !pack.puzzles.some((p) => hiddenSlugs.includes(p.slug)));
  check('portal: pictures load', (await guest.request.get(BASE + pack.puzzles[0].image)).ok() && (await guest.request.get(BASE + pack.puzzles[0].thumb)).ok());
  check('invites/push: no page errors for the invited friend', friendErrors.length === 0, friendErrors.join(' | '));
}

// ---- delete your account ----
{
  const j = async (r) => (await r).json();
  const dCtx = await newCtx(true);
  const d = await dCtx.newPage();
  const dErrors = [];
  errorsFor(d, dErrors);
  await d.goto(BASE + '/delete-account');
  await d.waitForSelector('text=Delete your SnapShift Puzzles account');
  check('delete account: public page explains steps and data', (await d.locator('main').innerText()).includes('What is deleted') && (await d.locator('text=to delete your account').count()) > 0);
  await dCtx.request.post(BASE + '/api/auth/signup', { data: { email: 'leaving@example.com', username: 'LeavingSoon', password: 'leavingpass1' } });
  const free = pub.puzzles.find((p) => p.categoryId === 'animals');
  const { play } = await j(dCtx.request.post(BASE + '/api/plays', { data: { puzzle: free.slug, difficulty: 'easy' } }));
  const g = E.replay(play.seed, { version: play.engine, difficulty: 'easy', mode: 'classic', daily: false, hardMode: false }, []).state;
  const acts = [];
  for (let m = E.suggest(g); m && !E.isSolved(g); m = E.suggest(g)) { acts.push([m.a, m.b]); E.applySuggestion(g, m); }
  await dCtx.request.post(BASE + `/api/plays/${play.id}/complete`, { data: { actions: acts, elapsedMs: acts.length * 300 } });
  check('delete account: profile exists before', (await guest.request.get(BASE + '/api/profile/LeavingSoon')).ok());
  await d.goto(BASE + '/account');
  await d.waitForSelector('a[href="/delete-account"]');
  await d.click('a[href="/delete-account"]');
  await d.waitForSelector('#delete-account');
  const btn = d.locator('#delete-account button[type=submit]');
  check('delete account: button locked until password and confirmation', await btn.isDisabled());
  await d.fill('#del-pw', 'wrongpassword');
  await d.check('#del-sure');
  await btn.click();
  await d.waitForSelector('#delete-account .error:has-text("password")');
  check('delete account: wrong password refused', true);
  await d.fill('#del-pw', 'leavingpass1');
  await btn.click();
  await d.waitForSelector('text=Your account has been deleted');
  check('delete account: deleted with the right password', true);
  check('delete account: signed out', (await j(dCtx.request.get(BASE + '/api/auth/me'))).user === null);
  check('delete account: can no longer sign in', (await dCtx.request.post(BASE + '/api/auth/login', { data: { email: 'LeavingSoon', password: 'leavingpass1' } })).status() === 401);
  check('delete account: profile and leaderboard entry gone', (await guest.request.get(BASE + '/api/profile/LeavingSoon')).status() === 404);
  const again = await dCtx.request.post(BASE + '/api/auth/signup', { data: { email: 'leaving@example.com', username: 'LeavingSoon', password: 'leavingpass1' } });
  check('delete account: email and username free again', again.ok());
  check('delete account: no page errors', dErrors.length === 0, dErrors.join(' | '));
}

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

// Long categories come in pages of 20.
{
  sql("INSERT INTO categories (id, name, description, sort) VALUES ('pagetest', 'Page Test', 'Lots of pictures', 99)");
  const vals = [...Array(45)].map((_, i) => `('pagetest-${i + 1}', 'pagetest', 'Paging ${i + 1}', 'published', 'x/p${i}.webp', 'x/p${i}.webp', 'x/p${i}.webp', ${i}, 1, 1)`).join(', ');
  sql(`INSERT INTO puzzles (slug, category_id, title, status, original_key, image_key, thumb_key, sort, created_at, published_at) VALUES ${vals}`);
  await guest.goto(BASE + '/category?c=pagetest');
  await guest.waitForSelector('.pager');
  check('categories: 20 per page', (await guest.locator('.grid a.card, .grid .card').count()) === 20 && /1–20 of 45/.test(await guest.locator('.pager').first().innerText()));
  await guest.locator('.pager').first().getByRole('button', { name: 'Next page' }).click();
  await guest.waitForFunction(() => /21–40 of 45/.test(document.querySelector('.pager')?.textContent || ''));
  check('categories: next page, and it’s in the address', guest.url().includes('page=2') && /Paging 21/.test(await guest.locator('.grid').innerText()));
  await guest.goto(BASE + '/category?c=pagetest&page=3');
  await guest.waitForSelector('.pager');
  check('categories: opening page 3 directly', (await guest.locator('.grid .card').count()) === 5 && /41–45 of 45/.test(await guest.locator('.pager').first().innerText()));
  await guest.screenshot({ path: `${OUT}/category-pages.png`, fullPage: false });
  sql("DELETE FROM puzzles WHERE category_id = 'pagetest'");
  sql("DELETE FROM categories WHERE id = 'pagetest'");
}

check('no JS errors (admin)', adminErrors.length === 0, adminErrors.join(' | '));
check('no JS errors (player)', playerErrors.length === 0, playerErrors.join(' | '));
check('no JS errors (guest)', guestErrors.length === 0, guestErrors.join(' | '));
await browser.close();
const failedN = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failedN}/${results.length} passed`);
process.exit(failedN ? 1 : 0);
