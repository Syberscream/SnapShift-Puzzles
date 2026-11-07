# SnapShift Puzzles v2

A ground-up rebuild of [snapshiftpuzzles.com](https://snapshiftpuzzles.com): a picture tile-swap puzzle game
with a daily challenge, categories, points, medals, streaks and leaderboards, plus an automated
puzzle pipeline powered by the ElevenLabs Image API.

It runs entirely on Cloudflare:

| Piece | Cloudflare product | What it holds |
|---|---|---|
| Website + API | **Workers** (with static assets) | `web/` pages built by Vite, `worker/` API |
| Database | **D1** (SQLite) | players, puzzles, games, points, dailies, generation jobs |
| Images | **R2** | original, web-sized and thumbnail images |
| Puzzle generation | **Cron Trigger** (every 10 min) | queues ElevenLabs jobs and collects finished images |

The old PHP site is preserved in this repository's history (the commits before the v2 merge).

## How it fits together

```
web/            Pages (Vite, TypeScript, no framework)
  *.html          one file per page
  src/pages/      page scripts (home, category, play, daily, leaderboard, account, admin…)
  src/game/       canvas board renderer and sounds
  src/lib/        API client, page shell (header/footer), DOM helpers
  src/styles/     the site look (dark navy panels, green pills)
shared/         Code used by both browser and server
  engine.ts       game engine: deal, swap, lock, score, hints, replay, medals
  rules.ts        all balance numbers (grid sizes, points, costs, medals)
worker/         Cloudflare Worker
  index.ts        routes + cron handler
  routes/         auth, catalog, plays, stats/leaderboards, admin
  pipeline/       ElevenLabs client, prompt ideas, generation pipeline
migrations/     D1 schema
tests/          engine unit tests (vitest) and an end-to-end browser test
public/         logo, icons, category tiles, background, manifest, service worker
```

### The game engine and fair play

`shared/engine.ts` is pure TypeScript with no DOM, so the same code runs in the browser and the Worker.
For signed-in players the **server deals the board** (it picks the shuffle seed) and stores the move log.
Every save and the final "complete" call are **replayed on the server**: illegal moves, unpaid hints and
unsolved boards are rejected, and the time used for medals is clamped between a human floor
(250 ms per move) and the real wall-clock time. Points only come from the server.

Guests can play the daily and the free puzzle in each category; their games are saved in the browser.

### Game rules

| | Easy | Medium | Hard |
|---|---|---|---|
| Grid (Rotation mode) | 4×6 (4×7) | 6×9 (6×10) | 8×12 (8×14) |
| Correct tiles | glow + lock | lock | don't lock |
| Picture | always shown | Peek button | only at the start |
| Shuffle | pairs | mixed | long chains |
| Hint | free | 25 pts | 60 pts |
| Points | ×1 | ×2 | ×4 |

- Modes: **Classic**; **Zen** (untimed, no medal, fully assisted, 10 pts once); **Rotation** (tiles also turned, tap to rotate, square tiles, ×1.25).
- **Time Attack** (`/time-attack`): 3 minutes, 3×4 boards that glow and lock, 100 per solve + up to 50 for few moves. The server picks the puzzles and seeds and replays every move list; weekly leaderboard (best run, Monday–Sunday); 5 pts per solve, max 100 a day.
- Every new board shows the picture for 2.5 s before the clock starts.
- Medal = 72% move efficiency (against the fewest moves that solve that board) + 28% speed → Gold ≥ 90%, Silver ≥ 76%.
- Win points = 40/60/80 × multiplier × medal (Gold ×1.5, Silver ×1.25, Bronze ×1). Replays pay 25%. (Engine v1 games keep the old base + 600 ÷ seconds speed bonus.)
- Daily: always Hard Classic, same seed for everyone, +50 bonus, streak rewards at 7/14/30 days, then 1,500 every 30 days.
- Unlocks: first puzzle in a category free, then 100 + 40 × position, capped at 500.
- Every game stores its engine version, so games started under older rules replay and score the same.

All of these numbers live in `shared/rules.ts`.

## Engagement features

- **Streak reminders** – opt-in on the account page (verified email needed). The cron sends one email from 6 PM site time to players who played yesterday, haven't today and have a streak of 2+; every email has a one-click unsubscribe. Admins can trigger due reminders with `POST /api/admin/reminders/run`.
- **Share** – the result dialog shares a Wordle-style text: medal, time, moves, score and a 10-square bar.
- **Challenge a Friend** – `POST /api/challenges {playId}` turns a finished game into a link (`/play?challenge=ID`) with the same seed; friends' first finishes go on that challenge's board. Faster wins; within 0.5 s fewer moves wins.
- **Collections** – finishing every published puzzle in a category (3+) pays `min(1000, 100 + 20 × puzzles)` once.
- **Events** – Admin → Events: dates, puzzles, optional bonus. Live events show on the home page, their puzzles are open to everyone, and `/event?e=id` has a leaderboard (most finished, then total best score).
- **Achievements** – defined in `shared/achievements.ts`, awarded in `worker/lib/rewards.ts`.

## SnapShift Plus (membership)

Free players get the daily, streaks, leaderboards, every difficulty and mode, the first puzzle in each category
(the rest unlock with points), the last 7 days of the daily archive and 3 Time Attack runs a day.
Plus members get every puzzle unlocked, no ad banners, the full archive, new puzzles 48 h early, the
Members' Gallery category, unlimited Time Attack, 2 streak freezes and 2 picture requests a month,
full-size downloads, a Plus badge, board frames and a medal collection. Plus never changes scores or points.
The limits live in `PLUS` in `shared/rules.ts`.

Billing is Stripe Checkout + the Stripe customer portal; a webhook (`/api/billing/webhook`) keeps
`users.supporter_until` in step with the subscription. To set it up:

1. In Stripe, create a product "SnapShift Plus" with three prices: monthly recurring, yearly recurring and a one-time (lifetime).
2. `npx wrangler secret put STRIPE_SECRET_KEY` (Developers → API keys → Secret key).
3. Stripe → Developers → Webhooks → Add endpoint: `https://snapshiftpuzzles.com/api/billing/webhook`, events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `charge.refunded`. Then `npx wrangler secret put STRIPE_WEBHOOK_SECRET` (the `whsec_…` signing secret).
4. Stripe → Settings → Billing → Customer portal: turn on cancelling and updating payment methods.
5. Admin → Membership: paste the three price ids and the labels shown to players.

Banners marked "Ad" in Admin → Site settings are hidden from members. Admins can also give Plus by hand (Admin → Players).

## Automated puzzles with ElevenLabs

1. **Plan** – if automatic generation is on, every 10 minutes the Worker tops up the review queue
   (up to *N images per 24 h*, pausing when too many are waiting). Categories with the fewest waiting
   puzzles go first. Prompts come from `worker/pipeline/prompts.ts` (subject × setting × style, plus
   guidance that makes images work as tile puzzles: detail everywhere, no text or borders).
2. **Submit** – `POST https://api.elevenlabs.io/v1/flows/image` with your model and options.
3. **Collect** – `GET /v1/flows/image/{id}` until `completed`, then the image is downloaded straight into
   R2 (ElevenLabs' link expires after about an hour) and added to the review queue.
4. **Review** – in **Admin → Review queue** you check each picture, fix the title/category and press
   **Publish**. Your browser makes the web-sized copy and thumbnail (WebP), so no paid image service is
   needed. Nothing goes live without your approval.

You can also **Generate now** from the admin (with your own prompt or the built-in ideas) and
**upload your own images** into the same queue.

Each step claims its job in the database first, so overlapping runs (cron + "Run now") never
duplicate work, and jobs stuck mid-step are recovered after 10 minutes.

> ElevenLabs' Image & Video API requires a **Pro plan or higher**. Model ids and model-specific
> options (like `aspect_ratio`, `resolution`) are set in Admin → Generate; each model accepts different
> fields and rejects unknown ones, so the admin shows ElevenLabs' error message if a setting is wrong.

## Set up and deploy

You need a Cloudflare account (the free plan is enough to start; Workers Paid is $5/month if you
outgrow it) and Node.js 20+.

```bash
npm install
npx wrangler login

# 1. Create the database and storage
npx wrangler d1 create snapshift          # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create snapshift-media

# 2. Secrets
npx wrangler secret put ELEVENLABS_API_KEY  # from elevenlabs.io → Developers → API keys
npx wrangler secret put RESEND_API_KEY      # optional: verification / password-reset email (resend.com)
npx wrangler secret put STRIPE_SECRET_KEY   # optional: SnapShift Plus (see below)
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# 3. Build, create the tables, deploy
npm run deploy
```

Then:

1. In the Cloudflare dashboard, add your domain to the Worker (**Workers → snapshift-puzzles → Settings → Domains & Routes**).
2. Sign up on the site with an email listed in `ADMIN_EMAILS` (in `wrangler.jsonc`). That account becomes an admin.
3. Open **Admin → Generate**, check the model settings, press **Generate** to try one, then turn on automatic generation.
4. Publish a few puzzles from the review queue. The first daily is picked automatically.
5. Optional: paste Stripe Payment Links into **Admin → Site settings** for the supporter page.

For email, verify your domain in Resend and set `MAIL_FROM` in `wrangler.jsonc` to an address on it.

### Automatic deploys from GitHub

`.github/workflows/ci.yml` type-checks, tests and builds every push and pull request.
`.github/workflows/deploy.yml` deploys when you push to the branch you choose (or run it by hand).
To turn it on, add two repository secrets, `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers",
plus D1 edit) and `CLOUDFLARE_ACCOUNT_ID`, and a repository variable `DEPLOY_ENABLED` = `true`.

## Local development

```bash
cp .dev.vars.example .dev.vars       # DEV_MODE=1 shows email links in the browser instead of sending them
npm run db:migrate:local
npm run build && npm start           # http://127.0.0.1:8787
```

`npm test` runs the engine unit tests. `bash tests/e2e/run.sh some-image.png` runs the full browser
test against a local Worker and a fake ElevenLabs API (needs `npm i -D playwright`).

## Not carried over from the old site

Player accounts and progress start fresh (by choice). The old puzzle images can be re-added through
**Admin → Review queue → Upload**.
