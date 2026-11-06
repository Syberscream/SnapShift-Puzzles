<?php
/**
 * Snapshift Puzzles SEO page generator
 *
 * Usage (browser):
 *   /build_puzzle_pages.php?catalog=puzzles/index.json&out=.
 *
 * Usage (CLI):
 *   php build_puzzle_pages.php --catalog=puzzles/index.json --out=.
 *
 * Generates:
 *   - /puzzle/<category>/<slug>.html
 *   - /sitemap.xml
 *
 * Delete this file after running on production.
 */

declare(strict_types=1);

const SITE_URL = 'https://snapshiftpuzzles.com';
const CATEGORY_NAMES = [
    'animals' => 'Animal',
    'landscapes' => 'Landscape',
    'nature' => 'Nature',
    'food' => 'Food',
    'earth' => 'Earth',
    'cities' => 'City',
    'space' => 'Space',
    'marine' => 'Marine',
    'scifi' => 'Sci-Fi',
    'architecture' => 'Architecture',
    'vehicles' => 'Vehicle',
];

function h(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function slugify(string $value): string {
    $value = preg_replace('~\.[^.]+$~', '', $value) ?? $value;
    $value = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
    $value = strtolower($value);
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? $value;
    $value = preg_replace('/-+/', '-', $value) ?? $value;
    $value = trim($value, '-');
    return $value !== '' ? $value : 'puzzle';
}

function jsString(string $value): string {
    $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return is_string($json) ? $json : '""';
}

function canonicalPuzzleUrl(string $catId, string $name): string {
    return SITE_URL . '/puzzle/' . rawurlencode($catId) . '/' . rawurlencode(slugify($name)) . '.html';
}

function categoryUrl(string $catId): string {
    return SITE_URL . '/category.html?cat=' . rawurlencode($catId);
}

function categoryDisplayName(string $catId): string {
    return CATEGORY_NAMES[$catId] ?? ucwords(str_replace(['-', '_'], ' ', $catId));
}

function relativeGameUrl(string $catId, string $src, string $name): string {
    return '../../game.html?' . http_build_query([
        'cat' => $catId,
        'src' => $src,
        'puzzle' => $name,
    ]);
}

function relativeSharedAccessScript(): string {
    return '../../js/puzzle_access.js';
}

function pageTemplate(array $vars): string {
    return <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>{$vars['title']}</title>
  <meta name="description" content="{$vars['meta_description']}" />
  <link rel="canonical" href="{$vars['canonical']}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="{$vars['title']}" />
  <meta property="og:description" content="{$vars['meta_description']}" />
  <meta property="og:url" content="{$vars['canonical']}" />
  <meta property="og:image" content="{$vars['image_abs']}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{$vars['title']}" />
  <meta name="twitter:description" content="{$vars['meta_description']}" />
  <meta name="twitter:image" content="{$vars['image_abs']}" />
  <style>
    :root {
      color-scheme: dark;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      --bg:#05080d; --panel:rgba(15,23,42,.72); --line:rgba(42,57,82,.7);
      --text:#e8eef7; --muted:#b5c0d4; --accent:#7cc4ff; --accent2:#7cffb2;
    }
    * { box-sizing: border-box; }
    body {
      margin:0;
      color:var(--text);
      background: var(--bg);
    }
    a { color:inherit; }
    .shell { width:min(1200px,100%); margin:0 auto; padding:18px; }
    .topbar {
      display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;
      margin-bottom:18px;
    }
    .brand { display:flex; align-items:center; gap:12px; }
    .logoImg { height:72px; width:auto; object-fit:contain; }
    .btn {
      display:inline-flex; align-items:center; gap:8px; text-decoration:none;
      border-radius:999px;
      border:1px solid rgba(42,57,82,.7);
      background:rgba(0,0,0,.18);
      color:var(--text);
      font-weight:800;
      font-size:12px;
      letter-spacing:.2px;
      padding:7px 10px;
    }
    .hero {
      display:grid; grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr); gap:18px;
      background:var(--panel); border:1px solid rgba(36,48,69,0.85); border-radius:18px;
      overflow:hidden; box-shadow:0 28px 80px rgba(0,0,0,.35);
    }
    .copy { padding:18px; }
    .crumbs { font-size:12px; color:var(--muted); font-weight:800; letter-spacing:.02em; }
    .crumbs a { color:var(--muted); text-decoration:none; }
    h1 { margin:0; font-size:30px; line-height:1.08; letter-spacing:.2px; font-weight:950; }
    .lede { margin:6px 0 0; color:var(--muted); font-size:14px; line-height:1.5; font-weight:700; }
    .meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .pill {
      display:inline-flex; align-items:center; gap:8px; padding:7px 10px; border-radius:999px;
      border:1px solid rgba(42,57,82,.7); background:rgba(0,0,0,.18); font-size:12px; font-weight:800;
      white-space:nowrap; color:var(--text);
    }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
    .play {
      background:rgba(0,0,0,.18);
      border-color:rgba(42,57,82,.7);
    }
    .play.isLocked{
      border-color: rgba(255,211,124,.42);
      background: rgba(66,50,16,.28);
      color: #ffe9b8;
    }
    .playStatus{
      margin:10px 0 0;
      color:var(--muted);
      font-size:13px;
      line-height:1.45;
      font-weight:700;
    }
    .playStatus.isLocked{
      color:#ffe9b8;
    }
    .relatedCard{
      position:relative;
    }
    .relatedCard.isLocked{
      opacity:.96;
    }
    .relatedCard.isLocked .relatedThumb::after{
      content:"";
      position:absolute;
      inset:0;
      background:linear-gradient(180deg, rgba(6,10,18,0.02), rgba(6,10,18,0.16));
      pointer-events:none;
    }
    .relatedLock{
      position:absolute;
      top:8px;
      right:8px;
      z-index:3;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:32px;
      min-height:32px;
      padding:6px 8px;
      border-radius:999px;
      border:1px solid rgba(206,228,255,.72);
      background:#1A2740;
      color:#ffffff;
      font-size:14px;
      font-weight:950;
      line-height:1;
      letter-spacing:0;
      box-shadow:0 8px 18px rgba(0,0,0,.24);
      pointer-events:none;
    }
.relatedLock[hidden]{ display:none !important; }
    .relatedCard.isLocked .relatedName{
      color:#ffe9b8;
    }
    .preview { min-height:320px; background:#09111d; }
    .preview img { width:100%; height:100%; object-fit:cover; display:block; }
    .section {
      margin-top:12px; background:var(--panel); border:1px solid rgba(36,48,69,0.85);
      border-radius:18px; padding:16px;
    }
    .section h2 { margin:0 0 8px; font-size:14px; font-weight:950; }
    .section p { margin:0; color:var(--muted); font-size:13px; line-height:1.5; font-weight:700; }
    .related {
      display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;
    }
    @media (min-width:780px){ .related{ grid-template-columns:repeat(4,minmax(0,1fr)); } }
    .related a {
      text-decoration:none; border:1px solid rgba(42,57,82,.75); border-radius:16px;
      overflow:hidden; background:rgba(11,18,32,.55); display:block;
    }
    .relatedThumb { position:relative; }
    .related img { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; }
    .related .name { padding:10px; font-size:13px; font-weight:950; }
    @media (max-width:860px){ .hero{ grid-template-columns:1fr; } }
  </style>
  <script type="application/ld+json">
  {$vars['breadcrumb_json']}
  </script>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div class="brand">
        <img class="logoImg" src="{$vars['root_prefix']}Snapshift_Puzzles_Logo.png" alt="Snapshift Puzzles" onerror="this.onerror=null;this.src=this.getAttribute('data-fallback');" data-fallback="{$vars['root_prefix']}PuzzleQuest_Logo.png" />
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="btn" href="{$vars['root_prefix']}index.html">Home</a>
        <a class="btn" href="{$vars['category_rel']}">Back to {$vars['category_name']}</a>
      </div>
    </div>

    <main class="hero">
      <section class="copy">
        <div class="crumbs">
          <a href="{$vars['root_prefix']}index.html">Home</a> ›
          <a href="{$vars['category_rel']}">{$vars['category_name']}</a> ›
          <span>{$vars['puzzle_name']}</span>
        </div>
        <h1>{$vars['puzzle_name']} Jigsaw Puzzle</h1>
        <p class="lede">{$vars['meta_description']}</p>
        <div class="meta">
          <span class="pill">Category: {$vars['category_name']}</span>
          <span class="pill">Difficulties: Easy • Medium • Hard</span>
          <span class="pill">Play online</span>
        </div>
        <div class="actions">
          <a class="btn play{$vars['play_default_locked_class']}" id="playPuzzleBtn" href="{$vars['play_default_href']}"{$vars['play_default_aria']}>{$vars['play_default_text']}</a>
          <a class="btn" href="{$vars['category_rel']}">See more {$vars['category_name']} puzzles</a>
        </div>
        <p class="playStatus" id="playStatus"{$vars['play_status_hidden_attr']}>{$vars['play_status_text']}</p>
      </section>
      <div class="preview">
        <img src="{$vars['image_rel']}" alt="{$vars['puzzle_name']} puzzle preview" />
      </div>
    </main>

    <section class="section">
      <h2>About this puzzle</h2>
      <p>{$vars['about_text']}</p>
    </section>

    <section class="section">
      <h2>More from {$vars['category_name']}</h2>
      <div class="related">
        {$vars['related_cards']}
      </div>
    </section>
  </div>
  <script src="{$vars['shared_access_rel']}"></script>
  <script>
    (() => {
      const CATEGORY_ID = {$vars['category_id_json']};
      const CATEGORY_REL = {$vars['category_rel_json']};
      const PLAY_REL = {$vars['play_rel_json']};
      const CURRENT_SRC = {$vars['current_src_json']};
      const CURRENT_NAME = {$vars['current_name_json']};
      const CURRENT_INDEX = {$vars['current_index_json']};
      const CATEGORY_SRCS = {$vars['category_srcs_json']};
      const CATEGORY_SRCS_NORMALIZED = (Array.isArray(CATEGORY_SRCS) ? CATEGORY_SRCS : []).map((src) => window.SnapshiftPuzzleAccess.normalizeSrc(src));

      function buildState(unlockedMap){
        return window.SnapshiftPuzzleAccess.buildState(unlockedMap, CATEGORY_ID, CATEGORY_SRCS);
      }

      function applyPlayButtonState(state){
        const btn = document.getElementById('playPuzzleBtn');
        const status = document.getElementById('playStatus');
        if (!btn) return;

        const unlockedByIndex = Number.isFinite(Number(CURRENT_INDEX)) && Number(CURRENT_INDEX) >= 0 && Number(CURRENT_INDEX) < Number(state.nextLockedIdx);
        const unlockedBySrc = window.SnapshiftPuzzleAccess.isUnlockedSrc(state.set, CURRENT_SRC);
        const unlocked = !!(unlockedByIndex || unlockedBySrc);
        if (unlocked){
          btn.href = PLAY_REL;
          btn.textContent = 'Play this puzzle';
          btn.classList.remove('isLocked');
          btn.removeAttribute('aria-disabled');
          if (status){
            status.hidden = true;
            status.classList.remove('isLocked');
            status.textContent = '';
          }
          return;
        }

        btn.href = CATEGORY_REL;
        btn.textContent = 'Locked — unlock from category';
        btn.classList.add('isLocked');
        btn.setAttribute('aria-disabled', 'true');
        if (status){
          status.hidden = false;
          status.classList.add('isLocked');
          status.textContent = `\${CURRENT_NAME} is still locked. Unlock it from the category page first.`;
        }
      }
      function isDetailCardUnlocked(card, state){
        const src = card.getAttribute('data-related-src') || '';
        const idxRaw = card.getAttribute('data-related-index');
        const idx = Number(idxRaw);
        const unlockedBySrc = window.SnapshiftPuzzleAccess.isUnlockedSrc(state.set, src);
        const unlockedByIndex = Number.isFinite(idx) && idx >= 0 && idx < Number(state.nextLockedIdx);
        return !!(unlockedBySrc || unlockedByIndex);
      }

      function applyRelatedCardLocks(state){
        const cards = Array.from(document.querySelectorAll('[data-related-card="1"]'));
        cards.forEach((card) => {
          const realHref = card.getAttribute('data-related-href') || CATEGORY_REL;
          const locked = !isDetailCardUnlocked(card, state);

          card.classList.toggle('isLocked', locked);

          const badge = card.querySelector('.relatedLock');
          if (badge) {
            badge.hidden = !locked;
            badge.setAttribute('aria-hidden', locked ? 'false' : 'true');
          }

          if (locked){
            card.href = CATEGORY_REL;
            card.setAttribute('aria-disabled', 'true');
            card.setAttribute('title', 'Unlock this puzzle from the category page first');
          } else {
            card.href = realHref;
            card.removeAttribute('aria-disabled');
            card.removeAttribute('title');
          }
        });
      }

      window.SnapshiftPuzzleAccess.fetchUnlockedMap('/api/unlocked_get.php').then((unlockedMap) => {
        const state = buildState(unlockedMap || {});
        applyPlayButtonState(state);
        applyRelatedCardLocks(state);
      }).catch(() => {
        const state = buildState({});
        applyPlayButtonState(state);
        applyRelatedCardLocks(state);
      });
    })();
  </script>
</body>
</html>
HTML;
}

function buildRelatedCards(array $items, string $currentName, string $categoryRel): string {
    $cards = [];
    foreach ($items as $itemIndex => $item) {
        if (!is_array($item)) continue;
        $name = (string)($item['name'] ?? '');
        $src = (string)($item['src'] ?? '');
        if ($name === '' || $src === '' || $name === $currentName) continue;
        $thumb = (string)($item['thumb'] ?? $src);
        $slug = slugify($name) . '.html';
        $cards[] = '<a class="relatedCard"'
            . ' data-related-card="1"'
            . ' data-related-src="' . h($src) . '"'
            . ' data-related-name="' . h($name) . '"'
            . ' data-related-href="' . h($slug) . '"'
            . ' data-related-index="' . h((string)$itemIndex) . '"'
            . ' href="' . h($categoryRel) . '">'
            . '<div class="relatedThumb"><img src="' . h('../../' . ltrim($thumb, '/')) . '" alt="' . h($name . ' puzzle preview') . '" loading="lazy" decoding="async"></div>'
            . '<div class="name relatedName">' . h($name) . '</div>'
            . '<div class="relatedLock" hidden aria-hidden="true" title="Locked">🔒</div>'
            . '</a>';
        if (count($cards) >= 4) break;
    }
    return implode("
        ", $cards);
}

function getOptionValue(string $name, string $default = ''): string {
    if (PHP_SAPI === 'cli') {
        global $argv;
        foreach ($argv as $arg) {
            if (str_starts_with($arg, '--' . $name . '=')) {
                return substr($arg, strlen($name) + 3);
            }
        }
        return $default;
    }
    return isset($_GET[$name]) ? (string)$_GET[$name] : $default;
}


function resolveInputPath(string $path): string|false {
    $trimmed = trim($path);
    if ($trimmed === '') return false;
    if ($trimmed === '.') {
        return realpath(__DIR__);
    }
    if ($trimmed[0] === '/' || preg_match('~^[A-Za-z]:[\\/]~', $trimmed)) {
        return realpath($trimmed);
    }
    return realpath(__DIR__ . DIRECTORY_SEPARATOR . $trimmed);
}

function fail(string $message, int $httpCode = 400): never {
    if (PHP_SAPI !== 'cli' && !headers_sent()) {
        http_response_code($httpCode);
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo $message;
    exit(1);
}

$catalogArg = getOptionValue('catalog', 'puzzles/index.json');
$outArg = getOptionValue('out', '.');

$root = resolveInputPath($outArg);
if ($root === false || !is_dir($root)) {
    fail("Output directory not found: {$outArg}");
}

$catalogPath = resolveInputPath($catalogArg);
if ($catalogPath === false || !is_file($catalogPath)) {
    fail("Catalog not found: {$catalogArg}");
}

$json = file_get_contents($catalogPath);
if ($json === false) {
    fail("Could not read catalog: {$catalogArg}");
}

$data = json_decode($json, true);
if (!is_array($data)) {
    fail('Catalog JSON is invalid.');
}

$categories = $data['categories'] ?? null;
if (!is_array($categories)) {
    fail('Catalog does not contain a valid categories object.');
}

$generatedUrls = [SITE_URL . '/index.html'];
$publicRoot = rtrim(str_replace('\\', '/', $root), '/');

$sortedCategoryIds = array_keys($categories);
sort($sortedCategoryIds, SORT_NATURAL | SORT_FLAG_CASE);
foreach ($sortedCategoryIds as $catId) {
    if (str_starts_with((string)$catId, '_')) {
        continue;
    }
    $generatedUrls[] = categoryUrl((string)$catId);
}

$totalPages = 0;
foreach ($categories as $catId => $items) {
    $catId = (string)$catId;
    if (str_starts_with($catId, '_') || !is_array($items)) {
        continue;
    }

    $catName = categoryDisplayName($catId);
    $outDir = $publicRoot . '/puzzle/' . $catId;
    if (!is_dir($outDir) && !mkdir($outDir, 0775, true) && !is_dir($outDir)) {
        fail("Could not create output directory: {$outDir}");
    }

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $name = (string)($item['name'] ?? '');
        $src = (string)($item['src'] ?? '');
        if ($name === '' || $src === '') {
            continue;
        }

        $thumb = (string)($item['thumb'] ?? $src);
        $slug = slugify($name);
        $canonical = canonicalPuzzleUrl($catId, $name);
        $title = $name . ' Jigsaw Puzzle | Snapshift Puzzles';
        $metaDescription = 'Play the ' . $name . ' online jigsaw puzzle from the ' . $catName . ' collection in Easy, Medium, or Hard mode on Snapshift Puzzles.';
        $aboutText = 'Solve ' . $name . ' from the ' . $catName . ' collection on Snapshift Puzzles. Choose Easy, Medium, or Hard and enjoy a clean browser-based puzzle with saved progress and challenge features.';
        $imageAbs = SITE_URL . '/' . ltrim($thumb, '/');
        $categoryRel = '../../category.html?cat=' . rawurlencode($catId);
        $playRel = relativeGameUrl($catId, $src, $name);
        $imageRel = '../../' . ltrim($thumb, '/');
        $currentIndex = -1;
        foreach ($items as $itemIndex => $row) {
            if (is_array($row) && (string)($row['name'] ?? '') === $name) {
                $currentIndex = (int)$itemIndex;
                break;
            }
        }
        $defaultUnlocked = ($currentIndex === 0);
        $playDefaultText = $defaultUnlocked ? 'Play this puzzle' : 'Locked — unlock from category';
        $playDefaultHref = $defaultUnlocked ? $playRel : $categoryRel;
        $playDefaultLockedClass = $defaultUnlocked ? '' : ' isLocked';
        $playDefaultAria = $defaultUnlocked ? '' : ' aria-disabled="true"';
        $playStatusText = $defaultUnlocked ? '' : ($name . ' is still locked. Unlock it from the category page first.');
        $playStatusHiddenAttr = $defaultUnlocked ? ' hidden' : '';

        $breadcrumbJson = json_encode([
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => SITE_URL . '/index.html'],
                ['@type' => 'ListItem', 'position' => 2, 'name' => $catName, 'item' => categoryUrl($catId)],
                ['@type' => 'ListItem', 'position' => 3, 'name' => $name, 'item' => $canonical],
            ],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $htmlOut = pageTemplate([
            'title' => h($title),
            'meta_description' => h($metaDescription),
            'canonical' => h($canonical),
            'image_abs' => h($imageAbs),
            'root_prefix' => '../../',
            'category_rel' => h($categoryRel),
            'category_name' => h($catName),
            'puzzle_name' => h($name),
            'play_rel' => h($playRel),
            'image_rel' => h($imageRel),
            'about_text' => h($aboutText),
            'related_cards' => buildRelatedCards($items, $name, $categoryRel),
            'breadcrumb_json' => $breadcrumbJson ?: '{}',
            'shared_access_rel' => h(relativeSharedAccessScript()),
            'play_default_text' => h($playDefaultText),
            'play_default_href' => h($playDefaultHref),
            'play_default_locked_class' => $playDefaultLockedClass,
            'play_default_aria' => $playDefaultAria,
            'play_status_text' => h($playStatusText),
            'play_status_hidden_attr' => $playStatusHiddenAttr,
            'category_id_json' => jsString($catId),
            'category_rel_json' => jsString($categoryRel),
            'play_rel_json' => jsString($playRel),
            'current_src_json' => jsString($src),
            'current_name_json' => jsString($name),
            'current_index_json' => (string)$currentIndex,
            'category_srcs_json' => json_encode(array_values(array_map(
                static fn(array $row): string => (string)($row['src'] ?? ''),
                array_values(array_filter($items, 'is_array'))
            )), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '[]',
        ]);

        $outputFile = $outDir . '/' . $slug . '.html';
        if (file_put_contents($outputFile, $htmlOut) === false) {
            fail("Could not write page: {$outputFile}");
        }

        $generatedUrls[] = $canonical;
        $totalPages++;
    }
}

$sitemapLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
];
foreach ($generatedUrls as $url) {
    $escaped = htmlspecialchars($url, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $sitemapLines[] = '  <url>';
    $sitemapLines[] = '    <loc>' . $escaped . '</loc>';
    $sitemapLines[] = '  </url>';
}
$sitemapLines[] = '</urlset>';

$sitemapPath = $publicRoot . '/sitemap.xml';
if (file_put_contents($sitemapPath, implode("\n", $sitemapLines)) === false) {
    fail("Could not write sitemap: {$sitemapPath}");
}

$messageLines = [
    "Generated {$totalPages} puzzle pages and sitemap.xml",
    "Catalog: {$catalogPath}",
    "Output root: {$publicRoot}",
];
if (PHP_SAPI !== 'cli' && !headers_sent()) {
    header('Content-Type: text/plain; charset=utf-8');
}
echo implode(PHP_EOL, $messageLines);
