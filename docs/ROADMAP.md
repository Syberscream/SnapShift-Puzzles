# SnapShift roadmap

## Phase 1 (this branch): rebuild at parity

- New stack on Cloudflare (Workers, D1, R2, cron), deploys from GitHub
- New game engine shared by browser and server; server-validated scores
- Categories, unlocks, daily challenge + archive, streak rewards, leaderboards
- Accounts with email verification and password reset; guest play
- ElevenLabs image pipeline with an admin review queue, manual uploads
- Admin: queue, generation settings, categories, daily scheduling, players, messages, site settings
- Phone, tablet and keyboard play; installable (PWA)

## Phase 2: ideas to pick from

### Play
- **Challenge a friend** – share a link with a fixed seed; both players get the same board, results side by side.
- **Weekly event** – a themed 5-puzzle set each week with its own leaderboard and badge.
- **New modes** – Zen (no timer), Blitz (beat the clock), Rotation (tiles also need rotating), Mystery (no preview).
- **Achievements** – badges for gold streaks, finishing a category, 100 dailies, hard-mode clears.
- **Player profiles** – public page with medals, streak, favourite categories.
- **Accessibility** – colour-blind tile outlines, reduced motion, larger hit targets option.

### ElevenLabs beyond images
- **Themed calendar** – the generator follows holidays and seasons automatically (e.g. autumn landscapes in October).
- **Players vote on themes** – each week players vote on next week's AI puzzle theme.
- **Make your own puzzle** (supporter perk) – players write a prompt; it goes through the same review queue.
- **Sound** – ElevenLabs sound effects and short music beds per category; a voiced "Gold medal!" celebration.
- **Puzzle stories** – a short narrated caption about each picture, played when you finish.

### Growth
- **Daily reminder** via web push (opt-in), "your streak is about to break" nudge.
- **Shareable result cards** – image of your solved board with medal and time.
- **SEO pages** – server-rendered page per puzzle and category (the old site had these).

### Business
- **Supporter plans with automatic activation** – Stripe webhook sets the supporter badge.
- **Supporter perks** – exclusive puzzle packs, extra hint allowance, custom puzzle credits.
- **Optional ads** for non-supporters (the old site had AdSense set up).

### Operations
- Admin analytics charts (daily players, completions, retention).
- Bulk import of the old puzzle library from the server.
- Automated moderation check on generated images before they reach the queue.
