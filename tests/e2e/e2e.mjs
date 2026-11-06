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
const setup = (difficulty, mode = 'classic', daily = false) => ({ version: 2, difficulty, mode, daily, hardMode: false });
/** Wait until the start-of-game "memorize" preview is over. */
const ready = (page) => page.waitForFunction(() => document.querySelector('.memorize-note')?.hidden !== false, null, { timeout: 8000 });

/** Solve the board on screen with real input, using the engine to plan moves. */
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
  await player.waitForSelector('dialog.modal', { timeout: 10000 });
  check('rotation puzzle completes with a medal', /medal/i.test(await player.locator('dialog.modal').innerText()));
  await player.screenshot({ path: `${OUT}/09b-rotation-done.png` });
  await player.locator('dialog.modal button', { hasText: 'Play again' }).click();
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
  await player.waitForSelector('dialog.modal', { timeout: 10000 });
  const zt = await player.locator('dialog.modal').innerText();
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
  await guest.waitForSelector('dialog.modal', { timeout: 10000 });
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
  await gp.waitForSelector('dialog.modal');
  const res = await gp.locator('dialog.modal').innerText();
  check('time attack: guest result', /Solved\s*1/.test(res) && /150/.test(res) && /Create a free account/.test(res), res.replace(/\s+/g, ' '));
  check('no JS errors (time attack)', gErr.length === 0, gErr.join(' | '));
  await gp.close();
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

check('no JS errors (admin)', adminErrors.length === 0, adminErrors.join(' | '));
check('no JS errors (player)', playerErrors.length === 0, playerErrors.join(' | '));
check('no JS errors (guest)', guestErrors.length === 0, guestErrors.join(' | '));
await browser.close();
const failedN = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failedN}/${results.length} passed`);
process.exit(failedN ? 1 : 0);
