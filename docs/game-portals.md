# SnapShift on game portals (CrazyGames, Poki, itch.io …)

Game portals have millions of players looking for quick browser games, and they
host the game themselves. The **portal edition** is a stand-alone version of
SnapShift made for them:

- One screen that fits any game frame, desktop or phone.
- No sign-in, no points, no Plus, no ads of our own (portals forbid them).
- A bundled pack of pictures, so it runs entirely from the portal's servers.
- Easy, Medium and Hard; Classic and Rotation; hints, peek and a puzzle of the day.
- Medals are kept on the player's device.
- CrazyGames and Poki SDK hooks built in (loading, gameplay start/stop, ads between
  puzzles, "happy time" on a win). These only switch on when the game runs on their sites.

## Build it

After deploying the site (the build reads the picture pack from it):

```
npm run build:portal
```

You get two ZIP files in `dist-portal/`:

| File | Use it for |
|---|---|
| `snapshift-crazygames-poki.zip` | CrazyGames and Poki: no links to other sites (their rules) |
| `snapshift-web.zip` | itch.io, Newgrounds, Armor Games, your own pages: adds a small "more at snapshiftpuzzles.com" link |

Want more pictures? `npm run build:portal -- --per 6` puts 6 per category in the
pack instead of 4. Keep the ZIP under about 20 MB so it loads fast.

Try it locally first:

```
npm run preview:portal
```

## Where to submit

**CrazyGames** (the easiest big portal to get into)
1. Sign up at <https://developer.crazygames.com>.
2. **Submit a game**, choose **HTML5** and upload `snapshift-crazygames-poki.zip`.
3. Use the store pictures in `store-listing/` (cover: `feature-graphic.jpg`;
   screenshots: `phone-*.jpg` or your own desktop screenshots).
4. Category: Puzzle. Tags: jigsaw, picture puzzle, relaxing, brain.
5. Their QA team tests it ("Basic launch"), then it goes to a test audience.
   Revenue comes from their ads; the game calls their mid-game ad between puzzles.

**Poki** (selective: they invite games after a look)
1. Apply at <https://developers.poki.com> with a link to a playable version. The
   itch.io page below works well for this.
2. If they accept, upload `snapshift-crazygames-poki.zip` in their Poki for
   Developers dashboard. The Poki SDK hooks are already built in.

**itch.io** (instant, good for a public test link)
1. <https://itch.io/game/new>. Kind of project: **HTML**.
2. Upload `snapshift-web.zip` and tick **This file will be played in the browser**.
3. Embed options: viewport **960 × 600**, tick **Mobile friendly** and **Fullscreen button**.
4. Genre: Puzzle. Publish.

**Newgrounds, Armor Games**: upload `snapshift-web.zip` as an HTML5 game in the same way.
(GameDistribution pays through its own ad SDK, which this build doesn't include yet.)

## Updating

Run `npm run build:portal` again when you want fresh pictures in the pack, and
upload the new ZIP as an update on each portal.
