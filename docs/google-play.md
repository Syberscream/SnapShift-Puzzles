# Putting SnapShift Puzzles on Google Play

The Android app is the website in a full-screen Chrome window (a "Trusted Web
Activity"). It needs no separate code: every update you deploy to the site is
in the app straight away. You only rebuild the app to change its name, icon or
package details.

Everything the app needs on the site side is already done:

- `manifest.webmanifest` has the app name, icons, screenshots and start page.
- `/.well-known/assetlinks.json` is served from **Admin → Site settings → Android app**.
- Inside the app, Plus can't be bought (Google's rules require Google Play billing
  for in-app purchases). Members who already have Plus still get all their perks
  once they sign in. Purchase buttons stay as they are on the website.
- The store pictures are in the `store-listing/` folder.

## 1. Google Play developer account (one time)

1. Go to <https://play.google.com/console/signup> and sign in with the Google
   account you want to own the app.
2. Choose **Yourself** (personal) or **An organization** (needs a D-U-N-S number).
3. Pay the one-time US$25 fee and complete identity verification. This can take
   a few days.

> **New personal accounts must run a closed test first:** at least 12 testers
> opted in for 14 days in a row before Google lets you publish to everyone. Plan
> for this: friends, family and keen players with Android phones are fine.
> Organization accounts don't need it.

## 2. Build the app with PWABuilder

1. Open <https://www.pwabuilder.com>, enter `https://snapshiftpuzzles.com` and press **Start**.
2. Press **Package for stores**, then **Android → Generate Package**.
3. Click **Options** (all options) and set:
   - **Package ID:** `com.snapshiftpuzzles.app`
   - **App name:** `SnapShift Puzzles`, **Launcher name:** `SnapShift`
   - **App version:** `1.0.0`, **App version code:** `1`
   - **Start URL:** `/?app=android`
   - **Display mode:** Standalone, **Notification delegation:** on
   - **Signing key:** **Create new**. Fill in your name and organization.
4. Press **Download**. You get a ZIP with:
   - `app-release-bundle.aab`: the file you upload to Google Play
   - `signing.keystore` and `signing-key-info.txt`: **keep these safe and private**
     (cloud backup plus a USB stick). You need them for every future update.
   - `assetlinks.json`: contains your key's SHA-256 fingerprint

## 3. Connect the app to the site

1. Open `assetlinks.json` from the ZIP and copy the long `AB:CD:…` value from
   `sha256_cert_fingerprints`.
2. On the site, go to **Admin → Site settings → Android app**. Paste it into
   **SHA-256 signing fingerprints**, check the package name is
   `com.snapshiftpuzzles.app` and press **Save**.
3. Open <https://snapshiftpuzzles.com/.well-known/assetlinks.json>: it should show
   your package name and fingerprint.

## 4. Create the app in Play Console

1. **Create app**. Name: SnapShift Puzzles. Type: **Game**. Free. Accept the declarations.
2. **Testing → Closed testing** (or Internal testing for your own quick check) →
   create a release, upload `app-release-bundle.aab` and follow the steps. Add
   your testers' Gmail addresses.
3. When Google asks about app signing, keep **Let Google manage and protect your app signing key**.
4. Go to **Test and release → Setup → App integrity → App signing**. Copy the
   **SHA-256 certificate fingerprint** under *App signing key certificate* and add
   it as a **second line** in Admin → Site settings → Android app. Save.
   (Without this the store version shows a browser bar at the top.)

## 5. Store listing

**Grow → Store presence → Main store listing**. Use the text below and upload:

| Field | File |
|---|---|
| App icon (512×512) | `store-listing/icon-512.png` |
| Feature graphic (1024×500) | `store-listing/feature-graphic.jpg` |
| Phone screenshots (2–8) | `store-listing/phone-1.jpg` … `phone-6.jpg` |

**Short description** (80 characters max):

> Free picture tile puzzles. Swap tiles, rebuild the photo, beat the daily.

**Full description:**

> Rebuild beautiful pictures one tile at a time. SnapShift Puzzles is a relaxing
> but addictive picture puzzle: the photo is cut into tiles and shuffled, and you
> swap them back into place. Tiles lock and glow when they land in the right spot.
>
> 🧩 DAILY CHALLENGE: one new picture every day, the same board for everyone. Keep
> your streak going and climb the daily leaderboard.
>
> 🔄 GAME MODES: Classic, relaxing Zen with no clock, Rotation (turn every tile
> upright too), a classic Slider Puzzle and three-minute Time Attack.
>
> 🏅 MEDALS AND ACHIEVEMENTS: earn gold, silver or bronze for every finish, unlock
> more than 40 achievements and collect whole categories.
>
> 🖼️ HUNDREDS OF PICTURES: animals, nature, food, art, space, cities, vehicles and
> more, with new puzzles every week.
>
> ⚔️ CHALLENGE FRIENDS: send a friend your exact board and see who's faster.
>
> 🔔 DAILY REMINDERS: an optional notification when the new puzzle is out.
>
> Easy, Medium and Hard boards, hints when you're stuck, and it saves your progress
> on every device with a free account. Play as a guest straight away, no sign-up needed.

**Category:** Puzzle. **Tags:** Jigsaw, Puzzle, Casual. **Contact email:** your contact address.
**Privacy policy:** `https://snapshiftpuzzles.com/privacy`

## 6. App content forms (Policy → App content)

- **Privacy policy:** the link above.
- **Ads:** *Yes, my app contains ads* if site banners are on for free players; otherwise No.
- **App access:** *All functionality is available without special access* (guests can play).
- **Content rating:** fill in the questionnaire. Puzzle game, no violence, no
  user chat, no gambling, so it's usually rated *Everyone*.
- **Target audience:** choose **13 and over** (choosing younger ages brings in the
  extra Families policy rules).
- **Data safety:** collected: *Email address*, *User IDs* (username), *App
  interactions* (gameplay), *Crash logs/diagnostics* (server logs). Encrypted in
  transit: Yes. Users can request deletion: Yes (through the contact page). Not
  shared with third parties for advertising. Payment info is handled by Stripe on
  the website, not in the app.
- **Government apps / Financial features / Health:** No.

## 7. Go live

1. Run the closed test for 14 days with 12+ testers (personal accounts).
2. **Production → Create new release**, promote the tested release and send it
   for review (usually 1–7 days).
3. Once it's live, copy the Play Store link
   (`https://play.google.com/store/apps/details?id=com.snapshiftpuzzles.app`) into
   **Admin → Site settings → Android app → Play Store link**. Android visitors
   then see "Get it on Google Play" instead of the "Add to home screen" offer.

## Updating the app later

Site changes need nothing. To change the app's icon or name, run PWABuilder again
with **Use existing key** (your `signing.keystore` and the passwords in
`signing-key-info.txt`), raise the version code by 1 and upload the new `.aab`.
