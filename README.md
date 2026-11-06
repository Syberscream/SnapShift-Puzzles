# SnapShift Puzzles

Source for [snapshiftpuzzles.com](https://snapshiftpuzzles.com) — a tile-swap picture puzzle game
with daily puzzles, accounts, points, streaks, leaderboards and a shop.

Plain PHP 8.3 + vanilla JavaScript, served by Apache. No build step: the repository mirrors the
web root (`public_html`) file-for-file, so a file at `api/login.php` here lives at
`/api/login.php` on the server.

## Layout

| Path | What it is |
|---|---|
| `*.html` | Site pages (home, game, category, daily archive, shop, FAQ, legal…) |
| `game.html` + `js/game_*.js` | The puzzle game itself |
| `js/site_*.js`, `css/` | Shared header/footer, theme switching and layout |
| `api/` | JSON endpoints called by the pages (auth, state sync, points, rewards, leaderboards) |
| `lib/` | Shared PHP: config loading, auth, game state, rewards, puzzle manifest |
| `config/` | Database connection (`db.php`) and app settings (`app.php`) |
| `config.php` | Legacy DB helper (`pq_pdo()`) still used by several endpoints |
| `admin$playeR$981255/admin.php` | Admin panel (rebuild indexes, theme, stats) |
| `puzzles/`, `daily_puzzles/` | Puzzle manifests (`index.json`, `history.json`) and index builders |
| `build_puzzle_pages.php`, `build_daily_archive.php` | Generate the SEO pages in `/puzzle/` and the daily archive |
| `contact_send.php`, `smtp_config.php` | Contact form mailer |
| `docs/` | Layout baseline notes |

### Not in the repository

These stay on the server only (see `.gitignore`):

- **Puzzle images** in `puzzles/<category>/` and `daily_puzzles/` (~900 MB), plus their `_thumbs/`
- **Generated pages** in `/puzzle/` (rebuilt by `build_puzzle_pages.php`)
- **`analytics/`**: the Matomo install
- **`config.local.php`**: passwords and other secrets
- `error_log` files, `cgi-bin/`, `98bannerads12/`

## Configuration

All secrets are read from **`config.local.php`** in the web root, or from environment variables.
Copy `config.example.php` to `config.local.php` and fill it in:

```php
return [
    'DB_HOST' => 'localhost',
    'DB_NAME' => '...',
    'DB_USER' => '...',
    'DB_PASS' => '...',
    'SMTP_PASSWORD'   => '...',   // contact form mailbox
    'ADMIN_USER'      => 'admin',
    'ADMIN_PASS_HASH' => '...',   // php -r "echo password_hash('pw', PASSWORD_DEFAULT);"
    'ADMIN_ALLOW_IPS' => '',
];
```

`lib/site_config.php` checks, in order: environment variables, `../public_html_work.local.php`,
`../snapshift.local.php`, then `config.local.php`. If the database values are missing, API calls
return a clear "Database settings missing" error.

## Running locally

```bash
cp config.example.php config.local.php   # fill in a local MySQL database
php -S localhost:8000
```

Then open <http://localhost:8000/index.html>. Puzzle images aren't in the repo, so copy a
category folder from the server into `puzzles/` and run `puzzles/build_index.php` to get playable
puzzles.

## Deploying

Upload changed files to `public_html` over FTP or the host's file manager, keeping the same paths.
Never upload `config.local.php` from another machine over the server's copy.

## Cleanup history

The first commit imports the live site with the following removed:

- Backup and alternate copies: `admin22–30.php`, `adminOR.php`, `adminLATEST.php`, `*OR.php/.css/.json`,
  `build_index{2,bck,BESTWORKING,BESTWORKING2,OR}.php`, `*REWARDS.html`, `shopLayout.html`,
  `site-layout2.css`, old manifest snapshots (`index1000/indexback/indexBESR.json`, `history2–4.json`,
  `1212history.json`)
- One-off/test files: `test_14day_effect.php`, `PassHash*.php`, `puzzles/password_verify.php`,
  `build_puzzle_pages.py` (old puzzlequest.ca version), `layout-styles.css` (host template)
- Unused code: `js/game_daily_mode.js`, `api/admin_points_grant.php`, `api/admin_user_lookup.php`,
  `api/site_visits_diag.php`, unused logo/background images
- Hard-coded database, SMTP and admin credentials, which moved to `config.local.php`
