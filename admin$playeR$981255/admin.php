<?php
declare(strict_types=1);

/**
 * admin.php — Simple Admin Panel (PHP 8.3+)
 * Features:
 * - Login + sessions
 * - Run puzzles/build_index.php
 * - Edit theme.json (background/frog + strength + enable)
 * - Show manifest stats (puzzles/index.json)
 *
 * IMPORTANT:
 * 1) Change ADMIN_USER
 * 2) Generate password hash:
 *    php -r "echo password_hash('YourPasswordHere', PASSWORD_DEFAULT), PHP_EOL;"
 * 3) Paste hash into ADMIN_PASS_HASH
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../lib/site_config.php';
require_once __DIR__ . '/../lib/daily_rewards.php';
require_once __DIR__ . '/../lib/daily_reward_state.php';

if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
  session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
}

session_start();

// -----------------------------
// CONFIG (EDIT THESE)
// -----------------------------
const ADMIN_USER = 'admin';

// Replace this with your own hash (see instructions above)
const ADMIN_PASS_HASH = ''; // set ADMIN_PASS_HASH in config.local.php

// Optional: restrict by IP (set to [] to disable)
$ALLOW_IPS = []; // e.g. ['1.2.3.4', '5.6.7.8'];

// -----------------------------
// Helpers
// -----------------------------
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function admin_config_value(string $key, $default = null) {
  return snapshift_config_value($key, $default);
}

function admin_client_ip(): string {
  $candidates = [
    $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
    $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
    $_SERVER['REMOTE_ADDR'] ?? null,
  ];

  foreach ($candidates as $candidate) {
    $value = trim((string)$candidate);
    if ($value === '') continue;
    if (str_contains($value, ',')) {
      $value = trim((string)explode(',', $value)[0]);
    }
    if ($value !== '') return $value;
  }

  return 'unknown';
}

function admin_is_local_request(): bool {
  $ip = admin_client_ip();
  return in_array($ip, ['127.0.0.1', '::1'], true);
}

function admin_panel_enabled(): bool {
  if (admin_is_local_request()) return true;
  $enabled = strtolower(trim((string)admin_config_value('ADMIN_ENABLED', '')));
  return in_array($enabled, ['1', 'true', 'yes', 'on'], true);
}

function admin_user_value(): string {
  return trim((string)admin_config_value('ADMIN_USER', ADMIN_USER));
}

function admin_password_hash_value(): string {
  return trim((string)admin_config_value('ADMIN_PASS_HASH', ADMIN_PASS_HASH));
}

function admin_allow_ips(array $fallback): array {
  $raw = admin_config_value('ADMIN_ALLOW_IPS', null);
  if (is_array($raw)) {
    $ips = array_map(fn($v) => trim((string)$v), $raw);
    return array_values(array_filter($ips, fn($v) => $v !== ''));
  }

  $value = trim((string)$raw);
  if ($value === '') {
    return $fallback;
  }

  $parts = array_map('trim', explode(',', $value));
  return array_values(array_filter($parts, fn($v) => $v !== ''));
}

function admin_login_is_locked(): bool {
  $until = (int)($_SESSION['admin_login_locked_until'] ?? 0);
  return $until > time();
}

function admin_login_lock_remaining(): int {
  $until = (int)($_SESSION['admin_login_locked_until'] ?? 0);
  return max(0, $until - time());
}

function admin_record_login_failure(): void {
  $attempts = (int)($_SESSION['admin_login_attempts'] ?? 0) + 1;
  $_SESSION['admin_login_attempts'] = $attempts;
  if ($attempts >= 5) {
    $_SESSION['admin_login_locked_until'] = time() + (15 * 60);
  }
}

function admin_clear_login_failures(): void {
  unset($_SESSION['admin_login_attempts'], $_SESSION['admin_login_locked_until']);
}

function normalize_fs_path(string $p): string {
  return rtrim(str_replace('\\', '/', $p), '/');
}

function detect_app_root_dir(): string {
  $candidates = [];
  $dir = __DIR__;
  for ($i = 0; $i <= 4; $i++) {
    $candidates[] = $dir;
    $parent = dirname($dir);
    if ($parent === $dir) break;
    $dir = $parent;
  }

  $probes = [
    'index.html',
    'category.html',
    'game.html',
    'theme.json',
    'config.php',
    'login.php',
    'signup.php',
    'logout.php',
    'me.php',
    'puzzles/index.json',
    'puzzles/build_index.php',
  ];

  $best = __DIR__;
  $bestScore = -1;

  foreach ($candidates as $cand) {
    $score = 0;
    foreach ($probes as $probe) {
      if (file_exists($cand . '/' . $probe)) $score++;
    }
    if ($score > $bestScore) {
      $bestScore = $score;
      $best = $cand;
    }
  }

  return $best;
}

function app_root_dir(): string {
  static $dir = null;
  if ($dir === null) $dir = detect_app_root_dir();
  return $dir;
}

function app_path(string $rel = ''): string {
  $base = rtrim(app_root_dir(), '/\\');
  $rel = ltrim($rel, '/\\');
  return $rel === '' ? $base : ($base . '/' . $rel);
}

function app_url_prefix(): string {
  static $prefix = null;
  if ($prefix !== null) return $prefix;

  $from = normalize_fs_path(realpath(__DIR__) ?: __DIR__);
  $to = normalize_fs_path(realpath(app_root_dir()) ?: app_root_dir());

  if ($from === $to) {
    $prefix = '';
    return $prefix;
  }

  if (str_starts_with($from . '/', $to . '/')) {
    $rel = trim(substr($from, strlen($to)), '/');
    $depth = $rel === '' ? 0 : (substr_count($rel, '/') + 1);
    $prefix = str_repeat('../', $depth);
    return $prefix;
  }

  $prefix = '';
  return $prefix;
}

function app_href(string $rel): string {
  return app_url_prefix() . ltrim($rel, '/');
}

define('THEME_JSON_PATH', app_path('theme.json'));
define('BUILD_INDEX_PATH', app_path('puzzles/build_index.php'));
define('MANIFEST_PATH', app_path('puzzles/index.json'));
define('DAILY_BUILD_INDEX_PATH', app_path('daily_puzzles/build_index.php'));
define('DAILY_MANIFEST_PATH', app_path('daily_puzzles/index.json'));
define('BUILD_DAILY_ARCHIVE_PATH', app_path('build_daily_archive.php'));

function client_ip(): string {
  return admin_client_ip();
}

function enforce_ip_allowlist(array $allow): void {
  if (!$allow) return;
  $ip = client_ip();
  if (!in_array($ip, $allow, true)) {
    http_response_code(403);
    echo "Forbidden";
    exit;
  }
}

function is_authed(): bool {
  return !empty($_SESSION['authed']) && $_SESSION['authed'] === true;
}

function ensure_csrf(): string {
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
  return $_SESSION['csrf'];
}

function require_post_csrf(): void {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
  $t = $_POST['csrf'] ?? '';
  if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $t)) {
    http_response_code(400);
    echo "Bad CSRF token";
    exit;
  }
}

function sanitize_hex_color(string $value, string $fallback): string {
  $value = trim($value);
  return preg_match('/^#[0-9a-fA-F]{6}$/', $value) ? strtoupper($value) : strtoupper($fallback);
}

function sanitize_font_stack(string $value, string $fallback): string {
  $value = trim($value);
  if ($value === '') return $fallback;
  $value = preg_replace('/[
	]+/', ' ', $value);
  $value = preg_replace('/\s{2,}/', ' ', $value);
  return trim((string)$value);
}

function sanitize_css_length(string $value, string $fallback): string {
  $value = trim($value);
  if ($value === '') return $fallback;
  if ($value === '0') return '0';
  return preg_match('/^\d+(?:\.\d+)?(?:px|rem|em|vw|vh|%)$/', $value) ? $value : $fallback;
}

function read_theme(): array {
  $default = [
    "themeEnabled" => true,
    "themeAlpha" => 0.85,
    "backgroundImage" => "jungle_background.png",
    "frogImage" => "red_eyed_frog.png",
    "siteBackgroundColor" => "#0B1220",
    "panelBackgroundColor" => "#0F172A",
    "sectionBackgroundColor" => "#111B2D",
    "cardBackgroundColor" => "#1A2740",
    "borderColor" => "#2A3952",
    "textColor" => "#E8EEF7",
    "mutedTextColor" => "#AFC2E0",
    "accentColor" => "#36CFC9",
    "accentSecondaryColor" => "#7CC4FF",
    "buttonBackgroundColor" => "#16335D",
    "buttonTextColor" => "#E8EEF7",
    "pillBackgroundColor" => "#142848",
    "pillTextColor" => "#E8EEF7",
    "fontFamily" => "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "headingFontFamily" => "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "contentMaxWidth" => "1180px",
    "shellPadding" => "18px",
    "panelRadius" => "18px",
    "cardRadius" => "16px",
    "buttonRadius" => "999px",
    "pillRadius" => "999px",
    "panelBlurPx" => "10px",
    "topbarHeight" => "64px",
    "sectionGap" => "12px",
    "shopBannerEnabled" => true,
    "shopBannerImage" => "/98bannerads12/Banner1.png",
    "shopBannerHref" => "/shop.html",
    "shopBannerAlt" => "Snapshift Swag Shop banner",
    "categoryShopBannerEnabled" => true,
    "categoryShopBannerImage" => "/98bannerads12/Banner1.png",
    "categoryShopBannerHref" => "/shop.html",
    "categoryShopBannerAlt" => "Snapshift category shop banner",
    "archiveEnabled" => true,
    "archiveIntroTitle" => "Daily Puzzle Archive",
    "archiveIntroText" => "Browse past daily challenges and replay your favorites.",
    "archiveCtaText" => "Play Today's Puzzle",
    "shareResultEnabled" => true,
    "shareResultTemplate" => "I solved today's Snapshift in {time} with {score} points.",
    "returnHookText" => "Return tomorrow to keep your streak alive.",
    "installPromptEnabled" => false,
    "installPromptText" => "Install Snapshift for faster daily play.",
    "reminderCtaEnabled" => false,
    "reminderCtaText" => "Want a daily reminder?",
    "featuredCategoryName" => "",
    "featuredCategoryHref" => "",
  ];
  if (!file_exists(THEME_JSON_PATH)) return $default;
  $raw = file_get_contents(THEME_JSON_PATH);
  if ($raw === false) return $default;
  $json = json_decode($raw, true);
  if (!is_array($json)) return $default;
  $theme = array_merge($default, $json);
  $theme["backgroundImage"] = normalize_theme_asset_path((string)($theme["backgroundImage"] ?? ""));
  $theme["frogImage"] = normalize_theme_asset_path((string)($theme["frogImage"] ?? ""));
  return $theme;
}

function normalize_theme_asset_path(string $value): string {
  $value = trim($value);
  if ($value === '') return '';
  if (preg_match('~^(?:https?:)?//~i', $value)) return $value;
  if (preg_match('~^(?:data:|blob:)~i', $value)) return $value;
  if ($value[0] === '/') return $value;
  return '/' . ltrim($value, '/');
}

function write_theme(array $theme): bool {
  $theme["themeEnabled"] = (bool)($theme["themeEnabled"] ?? true);
  $alpha = (float)($theme["themeAlpha"] ?? 0.85);
  $theme["themeAlpha"] = max(0.0, min(1.0, $alpha));
  $theme["backgroundImage"] = normalize_theme_asset_path((string)($theme["backgroundImage"] ?? "/jungle_background.png"));
  $theme["frogImage"] = normalize_theme_asset_path((string)($theme["frogImage"] ?? "/red_eyed_frog.png"));
  $theme["siteBackgroundColor"] = sanitize_hex_color((string)($theme["siteBackgroundColor"] ?? "#0B1220"), "#0B1220");
  $theme["panelBackgroundColor"] = sanitize_hex_color((string)($theme["panelBackgroundColor"] ?? "#0F172A"), "#0F172A");
  $theme["sectionBackgroundColor"] = sanitize_hex_color((string)($theme["sectionBackgroundColor"] ?? "#111B2D"), "#111B2D");
  $theme["cardBackgroundColor"] = sanitize_hex_color((string)($theme["cardBackgroundColor"] ?? "#1A2740"), "#1A2740");
  $theme["borderColor"] = sanitize_hex_color((string)($theme["borderColor"] ?? "#2A3952"), "#2A3952");
  $theme["textColor"] = sanitize_hex_color((string)($theme["textColor"] ?? "#E8EEF7"), "#E8EEF7");
  $theme["mutedTextColor"] = sanitize_hex_color((string)($theme["mutedTextColor"] ?? "#AFC2E0"), "#AFC2E0");
  $theme["accentColor"] = sanitize_hex_color((string)($theme["accentColor"] ?? "#36CFC9"), "#36CFC9");
  $theme["accentSecondaryColor"] = sanitize_hex_color((string)($theme["accentSecondaryColor"] ?? "#7CC4FF"), "#7CC4FF");
  $theme["buttonBackgroundColor"] = sanitize_hex_color((string)($theme["buttonBackgroundColor"] ?? "#16335D"), "#16335D");
  $theme["buttonTextColor"] = sanitize_hex_color((string)($theme["buttonTextColor"] ?? "#E8EEF7"), "#E8EEF7");
  $theme["pillBackgroundColor"] = sanitize_hex_color((string)($theme["pillBackgroundColor"] ?? "#142848"), "#142848");
  $theme["pillTextColor"] = sanitize_hex_color((string)($theme["pillTextColor"] ?? "#E8EEF7"), "#E8EEF7");
  $theme["fontFamily"] = sanitize_font_stack((string)($theme["fontFamily"] ?? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"), "system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
  $theme["headingFontFamily"] = sanitize_font_stack((string)($theme["headingFontFamily"] ?? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"), "system-ui, -apple-system, Segoe UI, Roboto, sans-serif");
  $theme["contentMaxWidth"] = sanitize_css_length((string)($theme["contentMaxWidth"] ?? "1180px"), "1180px");
  $theme["shellPadding"] = sanitize_css_length((string)($theme["shellPadding"] ?? "18px"), "18px");
  $theme["panelRadius"] = sanitize_css_length((string)($theme["panelRadius"] ?? "18px"), "18px");
  $theme["cardRadius"] = sanitize_css_length((string)($theme["cardRadius"] ?? "16px"), "16px");
  $theme["buttonRadius"] = sanitize_css_length((string)($theme["buttonRadius"] ?? "999px"), "999px");
  $theme["pillRadius"] = sanitize_css_length((string)($theme["pillRadius"] ?? "999px"), "999px");
  $theme["panelBlurPx"] = sanitize_css_length((string)($theme["panelBlurPx"] ?? "10px"), "10px");
  $theme["topbarHeight"] = sanitize_css_length((string)($theme["topbarHeight"] ?? "64px"), "64px");
  $theme["sectionGap"] = sanitize_css_length((string)($theme["sectionGap"] ?? "12px"), "12px");
  $theme["shopBannerEnabled"] = (bool)($theme["shopBannerEnabled"] ?? true);
  $theme["shopBannerImage"] = normalize_theme_asset_path((string)($theme["shopBannerImage"] ?? "/98bannerads12/Banner1.png"));
  $theme["shopBannerHref"] = trim((string)($theme["shopBannerHref"] ?? "/shop.html"));
  $theme["shopBannerAlt"] = trim((string)($theme["shopBannerAlt"] ?? "Snapshift Swag Shop banner"));
  $theme["categoryShopBannerEnabled"] = (bool)($theme["categoryShopBannerEnabled"] ?? true);
  $theme["categoryShopBannerImage"] = normalize_theme_asset_path((string)($theme["categoryShopBannerImage"] ?? "/98bannerads12/Banner1.png"));
  $theme["categoryShopBannerHref"] = trim((string)($theme["categoryShopBannerHref"] ?? "/shop.html"));
  $theme["categoryShopBannerAlt"] = trim((string)($theme["categoryShopBannerAlt"] ?? "Snapshift category shop banner"));
  $theme["archiveEnabled"] = (bool)($theme["archiveEnabled"] ?? true);
  $theme["archiveIntroTitle"] = trim((string)($theme["archiveIntroTitle"] ?? "Daily Puzzle Archive"));
  $theme["archiveIntroText"] = trim((string)($theme["archiveIntroText"] ?? "Browse past daily challenges and replay your favorites."));
  $theme["archiveCtaText"] = trim((string)($theme["archiveCtaText"] ?? "Play Today's Puzzle"));
  $theme["shareResultEnabled"] = (bool)($theme["shareResultEnabled"] ?? true);
  $theme["shareResultTemplate"] = trim((string)($theme["shareResultTemplate"] ?? "I solved today's Snapshift in {time} with {score} points."));
  $theme["returnHookText"] = trim((string)($theme["returnHookText"] ?? "Return tomorrow to keep your streak alive."));
  $theme["installPromptEnabled"] = (bool)($theme["installPromptEnabled"] ?? false);
  $theme["installPromptText"] = trim((string)($theme["installPromptText"] ?? "Install Snapshift for faster daily play."));
  $theme["reminderCtaEnabled"] = (bool)($theme["reminderCtaEnabled"] ?? false);
  $theme["reminderCtaText"] = trim((string)($theme["reminderCtaText"] ?? "Want a daily reminder?"));
  $theme["featuredCategoryName"] = trim((string)($theme["featuredCategoryName"] ?? ""));
  $theme["featuredCategoryHref"] = trim((string)($theme["featuredCategoryHref"] ?? ""));

  $json = json_encode($theme, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;
  return file_put_contents(THEME_JSON_PATH, $json) !== false;
}

function run_build_script(string $path, string $label = 'build_index.php'): array {
  if (!file_exists($path)) {
    return ["ok" => false, "out" => $label . " not found at: " . $path];
  }
  ob_start();
  try {
    include $path;
    $out = ob_get_clean();
    return ["ok" => true, "out" => $out ?: "OK (no output)"];
  } catch (Throwable $e) {
    $out = ob_get_clean();
    return ["ok" => false, "out" => "ERROR: " . $e->getMessage() . "\n\n" . $out];
  }
}

function run_build_index(): array {
  return run_build_script(BUILD_INDEX_PATH, 'puzzles/build_index.php');
}

function run_build_daily_index(): array {
  return run_build_script(DAILY_BUILD_INDEX_PATH, 'daily_puzzles/build_index.php');
}

function run_build_all_catalogs(): array {
  $main = run_build_index();
  $daily = run_build_daily_index();
  $ok = !empty($main['ok']) && !empty($daily['ok']);
  $out = "[Main Catalog]\n" . ($main['out'] ?? '') . "\n\n[Daily Catalog]\n" . ($daily['out'] ?? '');
  return ["ok" => $ok, "out" => trim($out)];
}

function manifest_stats(): array {
  if (!file_exists(MANIFEST_PATH)) return ["ok" => false, "msg" => "puzzles/index.json not found"];

  $raw = file_get_contents(MANIFEST_PATH);
  if ($raw === false) return ["ok" => false, "msg" => "Could not read manifest"];

  $j = json_decode($raw, true);
  if (!is_array($j)) return ["ok" => false, "msg" => "Manifest is not valid JSON"];

  $cats = $j["categories"] ?? $j["catalog"] ?? null;
  if (!is_array($cats)) return ["ok" => false, "msg" => "Manifest missing categories object"];

  $total = 0;
  $per = [];
  $latest = ["updated" => 0, "catId" => "", "name" => "", "src" => ""];
  foreach ($cats as $catId => $arr) {
    $list = is_array($arr) ? $arr : (is_array($arr["puzzles"] ?? null) ? $arr["puzzles"] : []);
    $count = 0;
    foreach ($list as $p) {
      if (!is_array($p)) continue;
      if (empty($p["src"])) continue;
      $count++;
      $t = (int)($p["updated"] ?? $p["mtime"] ?? $p["time"] ?? 0);
      if ($t > $latest["updated"]) {
        $latest = [
          "updated" => $t,
          "catId" => (string)$catId,
          "name" => (string)($p["name"] ?? "Puzzle"),
          "src" => (string)$p["src"],
        ];
      }
    }
    $per[] = ["catId" => (string)$catId, "count" => $count];
    $total += $count;
  }

  usort($per, fn($a,$b) => $b["count"] <=> $a["count"]);

  return [
    "ok" => true,
    "total" => $total,
    "cats" => $per,
    "latest" => $latest,
    "mtime" => filemtime(MANIFEST_PATH) ?: 0
  ];
}

// -----------------------------
$ALLOW_IPS = admin_allow_ips($ALLOW_IPS);
if (!admin_panel_enabled()) {
  http_response_code(404);
  echo 'Not found';
  exit;
}
enforce_ip_allowlist($ALLOW_IPS);


function app_resolve_existing(array $candidates): array {
  foreach ($candidates as $rel) {
    $path = app_path($rel);
    if (file_exists($path)) {
      return ['display' => $rel, 'path' => $path, 'exists' => true];
    }
  }
  $first = $candidates[0] ?? '';
  return ['display' => $first, 'path' => $first ? app_path($first) : app_root_dir(), 'exists' => false];
}


function app_href_existing(array $candidates): string {
  $found = app_resolve_existing($candidates);
  $display = (string)($found['display'] ?? ($candidates[0] ?? ''));
  return app_href($display);
}

function app_file_statuses(): array {
  $checks = [
    ['label' => 'config.php',            'candidates' => ['config.php']],
    ['label' => 'login.php',             'candidates' => ['login.php']],
    ['label' => 'signup.php',            'candidates' => ['signup.php']],
    ['label' => 'logout.php',            'candidates' => ['logout.php']],
    ['label' => 'me.php',                'candidates' => ['api/me.php', 'me.php']],
    ['label' => 'points_get.php',        'candidates' => ['api/points_get.php', 'points_get.php']],
    ['label' => 'unlocked_get.php',      'candidates' => ['api/unlocked_get.php', 'unlocked_get.php']],
    ['label' => 'reward_status.php',     'candidates' => ['api/reward_status.php', 'reward_status.php']],
    ['label' => 'reward_claim.php',      'candidates' => ['api/reward_claim.php', 'reward_claim.php']],
    ['label' => 'state_get.php',         'candidates' => ['api/state_get.php', 'state_get.php']],
    ['label' => 'state_set.php',         'candidates' => ['api/state_set.php', 'state_set.php']],
    ['label' => 'leaderboard_top.php',   'candidates' => ['api/leaderboard_top.php', 'leaderboard_top.php']],
    ['label' => 'leaderboard_rank.php',  'candidates' => ['api/leaderboard_rank.php', 'leaderboard_rank.php']],
    ['label' => 'streak_reward_claim.php','candidates' => ['api/streak_reward_claim.php', 'streak_reward_claim.php']],
    ['label' => 'build_puzzle_pages.php','candidates' => ['build_puzzle_pages.php']],
    ['label' => 'sitemap.xml',           'candidates' => ['sitemap.xml']],
    ['label' => 'theme.json',            'candidates' => ['theme.json']],
    ['label' => 'puzzles/index.json',    'candidates' => ['puzzles/index.json']],
    ['label' => 'daily_puzzles/build_index.php', 'candidates' => ['daily_puzzles/build_index.php']],
    ['label' => 'daily_puzzles/index.json', 'candidates' => ['daily_puzzles/index.json']],
    ['label' => 'index.html',            'candidates' => ['index.html']],
    ['label' => 'category.html',         'candidates' => ['category.html']],
    ['label' => 'game.html',             'candidates' => ['game.html']],
  ];

  $out = [];
  foreach ($checks as $row) {
    $found = app_resolve_existing($row['candidates']);
    $path = $found['path'];
    $out[] = [
      'file' => $row['label'],
      'resolved' => $found['display'],
      'exists' => $found['exists'],
      'size' => $found['exists'] && is_file($path) ? (filesize($path) ?: 0) : 0,
      'mtime' => $found['exists'] ? (filemtime($path) ?: 0) : 0,
    ];
  }
  return $out;
}

function admin_link_groups(): array {
  return [
    [
      'group' => 'Public pages',
      'links' => [
        ['label' => 'Homepage', 'candidates' => ['index.html']],
        ['label' => 'Category page', 'candidates' => ['category.html']],
        ['label' => 'Game page', 'candidates' => ['game.html']],
        ['label' => 'Daily archive', 'candidates' => ['daily-archive.html']],
      ],
    ],
    [
      'group' => 'Catalog and build',
      'links' => [
        ['label' => 'Theme config', 'candidates' => ['theme.json']],
        ['label' => 'Main catalog', 'candidates' => ['puzzles/index.json']],
        ['label' => 'Daily catalog', 'candidates' => ['daily_puzzles/index.json']],
        ['label' => 'Daily history', 'candidates' => ['daily_puzzles/history.json']],
        ['label' => 'Main catalog builder', 'candidates' => ['puzzles/build_index.php']],
        ['label' => 'Daily catalog builder', 'candidates' => ['daily_puzzles/build_index.php']],
        ['label' => 'Daily archive builder', 'candidates' => ['build_daily_archive.php']],
        ['label' => 'SEO page builder', 'candidates' => ['build_puzzle_pages.php']],
        ['label' => 'Sitemap', 'candidates' => ['sitemap.xml']],
        ['label' => 'Robots', 'candidates' => ['robots.txt']],
      ],
    ],
    [
      'group' => 'Core APIs',
      'links' => [
        ['label' => 'Profile', 'candidates' => ['api/me.php', 'me.php']],
        ['label' => 'Points', 'candidates' => ['api/points_get.php', 'points_get.php']],
        ['label' => 'Unlocks', 'candidates' => ['api/unlocked_get.php', 'unlocked_get.php']],
        ['label' => 'Reward status', 'candidates' => ['api/reward_status.php', 'reward_status.php']],
        ['label' => 'Reward claim', 'candidates' => ['api/reward_claim.php', 'reward_claim.php']],
        ['label' => 'State get', 'candidates' => ['api/state_get.php', 'state_get.php']],
        ['label' => 'State set', 'candidates' => ['api/state_set.php', 'state_set.php']],
        ['label' => 'Leaderboard top', 'candidates' => ['api/leaderboard_top.php', 'leaderboard_top.php']],
        ['label' => 'Leaderboard rank', 'candidates' => ['api/leaderboard_rank.php', 'leaderboard_rank.php']],
        ['label' => 'Streak reward claim', 'candidates' => ['api/streak_reward_claim.php', 'streak_reward_claim.php']],
      ],
    ],
  ];
}

function admin_is_external_url(string $value): bool {
  $scheme = strtolower((string)parse_url($value, PHP_URL_SCHEME));
  return in_array($scheme, ['http', 'https'], true);
}

function admin_theme_link_audit(array $theme): array {
  $checks = [
    ['label' => 'Background image', 'value' => (string)($theme['backgroundImage'] ?? '')],
    ['label' => 'Frog image', 'value' => (string)($theme['frogImage'] ?? '')],
    ['label' => 'Home banner image', 'value' => (string)($theme['shopBannerImage'] ?? '')],
    ['label' => 'Home banner target', 'value' => (string)($theme['shopBannerHref'] ?? '')],
    ['label' => 'Category banner image', 'value' => (string)($theme['categoryShopBannerImage'] ?? '')],
    ['label' => 'Category banner target', 'value' => (string)($theme['categoryShopBannerHref'] ?? '')],
    ['label' => 'Featured category target', 'value' => (string)($theme['featuredCategoryHref'] ?? '')],
  ];

  $out = [];
  foreach ($checks as $check) {
    $value = trim((string)$check['value']);
    if ($value === '') {
      $out[] = [
        'label' => $check['label'],
        'value' => '',
        'href' => '',
        'resolved' => '',
        'status' => 'empty',
        'note' => 'Not set',
      ];
      continue;
    }

    if (admin_is_external_url($value)) {
      $out[] = [
        'label' => $check['label'],
        'value' => $value,
        'href' => $value,
        'resolved' => $value,
        'status' => 'external',
        'note' => 'External URL',
      ];
      continue;
    }

    $pathPart = (string)(parse_url($value, PHP_URL_PATH) ?? '');
    $pathPart = ltrim($pathPart, '/\\');
    if ($pathPart === '') {
      $out[] = [
        'label' => $check['label'],
        'value' => $value,
        'href' => $value,
        'resolved' => '',
        'status' => 'invalid',
        'note' => 'Invalid internal path',
      ];
      continue;
    }

    $exists = file_exists(app_path($pathPart));
    $out[] = [
      'label' => $check['label'],
      'value' => $value,
      'href' => app_href(ltrim($value, '/')),
      'resolved' => $pathPart,
      'status' => $exists ? 'ok' : 'missing',
      'note' => $exists ? 'Internal path resolved' : 'Internal path missing',
    ];
  }

  return $out;
}

function admin_format_file_size(int $bytes): string {
  if ($bytes <= 0) return '0 B';
  $units = ['B', 'KB', 'MB', 'GB'];
  $size = (float)$bytes;
  $unit = 0;
  while ($size >= 1024 && $unit < count($units) - 1) {
    $size /= 1024;
    $unit++;
  }
  return ($unit === 0 ? (string)(int)$size : number_format($size, 1)) . ' ' . $units[$unit];
}

function reset_theme_defaults(): bool {
  return write_theme([
    "themeEnabled" => true,
    "themeAlpha" => 0.85,
    "backgroundImage" => "jungle_background.png",
    "frogImage" => "red_eyed_frog.png",
    "shopBannerEnabled" => true,
    "shopBannerImage" => "/98bannerads12/Banner1.png",
    "shopBannerHref" => "/shop.html",
    "shopBannerAlt" => "Snapshift Swag Shop banner",
    "categoryShopBannerEnabled" => true,
    "categoryShopBannerImage" => "/98bannerads12/Banner1.png",
    "categoryShopBannerHref" => "/shop.html",
    "categoryShopBannerAlt" => "Snapshift category shop banner",
    "archiveEnabled" => true,
    "archiveIntroTitle" => "Daily Puzzle Archive",
    "archiveIntroText" => "Browse past daily challenges and replay your favorites.",
    "archiveCtaText" => "Play Today's Puzzle",
    "shareResultEnabled" => true,
    "shareResultTemplate" => "I solved today's Snapshift in {time} with {score} points.",
    "returnHookText" => "Return tomorrow to keep your streak alive.",
    "installPromptEnabled" => false,
    "installPromptText" => "Install Snapshift for faster daily play.",
    "reminderCtaEnabled" => false,
    "reminderCtaText" => "Want a daily reminder?",
    "featuredCategoryName" => "",
    "featuredCategoryHref" => "",
  ]);
}

function run_build_daily_archive(): array {
  return run_build_script(BUILD_DAILY_ARCHIVE_PATH, 'build_daily_archive.php');
}


function admin_json(array $data, int $status = 200): never {
  while (ob_get_level() > 0) {
    ob_end_clean();
  }
  http_response_code($status);
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  echo $json === false ? '{"ok":false,"error":"JSON encode failed"}' : $json;
  exit;
}

function admin_backtick(string $name): string {
  return '`' . str_replace('`', '``', $name) . '`';
}

function admin_like(string $value): string {
  return '%' . strtr($value, ['=' => '==', '%' => '=%', '_' => '=_']) . '%';
}

function admin_pick_col(array $columns, array $candidates): ?string {
  $map = [];
  foreach ($columns as $col) {
    $map[strtolower($col)] = $col;
  }
  foreach ($candidates as $candidate) {
    $key = strtolower($candidate);
    if (isset($map[$key])) return $map[$key];
  }
  return null;
}

function admin_col_expr(string $alias, ?string $column): ?string {
  if ($column === null || $column === '') return null;
  return $alias . '.' . admin_backtick($column);
}

function admin_coalesce_expr(array $exprs, string $fallback = "''"): string {
  $exprs = array_values(array_filter($exprs, static fn($v) => is_string($v) && trim($v) !== ''));
  if (!$exprs) return $fallback;
  if (count($exprs) === 1) return $exprs[0];
  return 'COALESCE(' . implode(', ', $exprs) . ')';
}

function admin_format_datetime(mixed $value): string {
  if ($value === null || $value === '') return '';
  if (is_numeric($value)) {
    $n = (float)$value;
    if ($n > 20000000000) $n = $n / 1000;
    if ($n > 0) return date('Y-m-d H:i:s', (int)round($n));
  }
  $s = trim((string)$value);
  if ($s === '') return '';
  $ts = strtotime($s);
  return $ts ? date('Y-m-d H:i:s', $ts) : $s;
}

function admin_format_elapsed(mixed $value): string {
  if ($value === null || $value === '') return '';
  if (is_string($value) && preg_match('/[:a-z]/i', $value)) return trim($value);
  if (!is_numeric($value)) return trim((string)$value);

  $n = (float)$value;
  if ($n > 10000) $n = $n / 1000;
  $seconds = max(0, (int)round($n));
  $h = intdiv($seconds, 3600);
  $m = intdiv($seconds % 3600, 60);
  $s = $seconds % 60;
  return $h > 0 ? sprintf('%d:%02d:%02d', $h, $m, $s) : sprintf('%d:%02d', $m, $s);
}

function admin_normalize_stars(mixed $value): int {
  if ($value === null || $value === '') return 0;
  if (is_numeric($value)) return max(0, min(3, (int)round((float)$value)));

  $raw = trim((string)$value);
  if ($raw === '') return 0;
  if (preg_match_all('/★/u', $raw, $m)) return max(0, min(3, count($m[0])));

  $lower = strtolower($raw);
  if (str_contains($lower, 'gold')) return 3;
  if (str_contains($lower, 'silver')) return 2;
  if (str_contains($lower, 'bronze')) return 1;

  return 0;
}

function admin_normalize_medal(mixed $value, int $stars = 0, ?float $scorePct = null): string {
  $raw = strtolower(trim((string)$value));
  if ($raw !== '') {
    if (in_array($raw, ['-', '—', '--', 'none', 'null', 'n/a', 'na', '0'], true)) {
      $raw = '';
    } else {
      if (str_contains($raw, 'gold')) return 'Gold';
      if (str_contains($raw, 'silver')) return 'Silver';
      if (str_contains($raw, 'bronze')) return 'Bronze';
      if (is_numeric($raw)) {
        $n = (int)$raw;
        if ($n >= 3) return 'Gold';
        if ($n === 2) return 'Silver';
        if ($n === 1) return 'Bronze';
      }
    }
  }
  if ($stars >= 3) return 'Gold';
  if ($stars === 2) return 'Silver';
  if ($stars === 1) return 'Bronze';
  if ($scorePct !== null) {
    if ($scorePct >= 90) return 'Gold';
    if ($scorePct >= 75) return 'Silver';
    if ($scorePct > 0) return 'Bronze';
  }
  return '';
}

function admin_normalize_score_pct(mixed $value): float {
  if ($value === null || $value === '') return 0.0;
  if (!is_numeric($value)) return 0.0;
  $n = (float)$value;
  if ($n > 0 && $n <= 1.0) $n *= 100.0;
  return round($n, 1);
}

function admin_load_config_payload(): array {
  static $payload = null;
  if ($payload !== null) return $payload;

  $payload = ['constants' => [], 'vars' => [], 'text' => '', 'path' => app_path('config.php')];
  $path = $payload['path'];
  if (!is_file($path)) return $payload;

  $before = get_defined_constants(true);
  $beforeUser = $before['user'] ?? [];

  $includeScope = static function(string $__path): array {
    ob_start();
    include $__path;
    ob_end_clean();
    $vars = get_defined_vars();
    unset($vars['__path']);
    return $vars;
  };

  try {
    $payload['vars'] = $includeScope($path);
  } catch (Throwable $e) {
    throw new RuntimeException('config.php could not be loaded: ' . $e->getMessage());
  }

  $after = get_defined_constants(true);
  $afterUser = $after['user'] ?? [];
  $payload['constants'] = $afterUser + $beforeUser;
  $payload['text'] = file_get_contents($path) ?: '';
  return $payload;
}

function admin_find_config_value(array $needles): ?string {
  $payload = admin_load_config_payload();
  $constants = $payload['constants'];
  $vars = $payload['vars'];

  foreach ($needles as $needle) {
    if (array_key_exists($needle, $constants) && !is_array($constants[$needle])) {
      $value = trim((string)$constants[$needle]);
      if ($value !== '') return $value;
    }
  }

  foreach ($needles as $needle) {
    if (array_key_exists($needle, $vars) && !is_array($vars[$needle])) {
      $value = trim((string)$vars[$needle]);
      if ($value !== '') return $value;
    }
  }

  foreach ($vars as $var) {
    if (!is_array($var)) continue;
    foreach ($needles as $needle) {
      foreach ([$needle, strtolower($needle), strtoupper($needle)] as $key) {
        if (array_key_exists($key, $var) && !is_array($var[$key])) {
          $value = trim((string)$var[$key]);
          if ($value !== '') return $value;
        }
      }
    }
  }

  $text = (string)($payload['text'] ?? '');
  if ($text !== '') {
    foreach ($needles as $needle) {
      $quoted = preg_quote($needle, '/');
      $patterns = [
        '/define\s*\(\s*["\']' . $quoted . '["\']\s*,\s*["\']([^"\']+)["\']\s*\)/i',
        '/\$' . $quoted . '\s*=\s*["\']([^"\']+)["\']\s*;/i',
        '/["\']' . $quoted . '["\']\s*=>\s*["\']([^"\']+)["\']/i',
      ];
      foreach ($patterns as $pattern) {
        if (preg_match($pattern, $text, $m) && isset($m[1]) && trim($m[1]) !== '') {
          return trim((string)$m[1]);
        }
      }
    }

    if (in_array('DB_DSN', $needles, true) || in_array('PDO_DSN', $needles, true)) {
      if (preg_match('/new\s+PDO\s*\(\s*["\']([^"\']+)["\']/', $text, $m) && isset($m[1])) {
        $dsn = trim((string)$m[1]);
        if ($dsn !== '') return $dsn;
      }
    }
  }

  return null;
}

function admin_db_config(): array {
  $dsn = admin_find_config_value(['DB_DSN', 'DATABASE_DSN', 'PDO_DSN', 'db_dsn']);
  $host = admin_find_config_value(['DB_HOST', 'DATABASE_HOST', 'MYSQL_HOST', 'db_host']);
  $name = admin_find_config_value(['DB_NAME', 'DATABASE_NAME', 'MYSQL_DATABASE', 'db_name', 'dbname']);
  $user = admin_find_config_value(['DB_USER', 'DATABASE_USER', 'MYSQL_USER', 'db_user', 'db_username']);
  $pass = admin_find_config_value(['DB_PASS', 'DB_PASSWORD', 'DATABASE_PASS', 'MYSQL_PASSWORD', 'db_pass', 'db_password']);
  $port = admin_find_config_value(['DB_PORT', 'DATABASE_PORT', 'MYSQL_PORT', 'db_port']);

  return [
    'dsn' => $dsn,
    'host' => $host ?: 'localhost',
    'name' => $name,
    'user' => $user,
    'pass' => $pass ?? '',
    'port' => $port,
  ];
}

function admin_pdo(): PDO {
  static $pdo = null;
  if ($pdo instanceof PDO) return $pdo;

  $cfg = admin_db_config();
  $dsn = trim((string)($cfg['dsn'] ?? ''));
  if ($dsn === '') {
    $missing = [];
    foreach (['name', 'user'] as $key) {
      if (trim((string)($cfg[$key] ?? '')) === '') $missing[] = $key;
    }
    if ($missing) {
      throw new RuntimeException('Could not detect database ' . implode(' and ', $missing) . ' from config.php.');
    }
    $dsn = 'mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['name'] . ';charset=utf8mb4';
    if (!empty($cfg['port'])) $dsn .= ';port=' . $cfg['port'];
  }

  $pdo = new PDO($dsn, (string)($cfg['user'] ?? ''), (string)($cfg['pass'] ?? ''), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);

  return $pdo;
}

function admin_schema(PDO $pdo): array {
  static $schema = null;
  if ($schema !== null) return $schema;

  $schema = [];
  $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_NUM);
  foreach ($tables as $row) {
    $table = (string)($row[0] ?? '');
    if ($table === '') continue;
    $cols = $pdo->query('SHOW COLUMNS FROM ' . admin_backtick($table))->fetchAll(PDO::FETCH_ASSOC);
    $schema[$table] = array_map(static fn($c) => (string)($c['Field'] ?? ''), $cols);
  }
  return $schema;
}

function admin_pick_user_table(array $schema): ?array {
  $best = null;
  $bestScore = -9999;

  foreach ($schema as $table => $cols) {
    $score = 0;
    $lower = strtolower($table);
    $idCol = admin_pick_col($cols, ['id', 'user_id', 'uid']);
    $usernameCol = admin_pick_col($cols, ['username', 'user_name', 'display_name', 'name', 'handle', 'login']);
    $emailCol = admin_pick_col($cols, ['email', 'user_email']);

    if ($lower === 'users') $score += 120;
    if (str_contains($lower, 'user')) $score += 40;
    if ($idCol) $score += 20;
    if ($usernameCol) $score += 30;
    if ($emailCol) $score += 20;
    if (str_contains($lower, 'result') || str_contains($lower, 'history') || str_contains($lower, 'progress')) $score -= 30;

    if ($score > $bestScore) {
      $bestScore = $score;
      $best = [
        'table' => $table,
        'id' => $idCol,
        'username' => $usernameCol,
        'email' => $emailCol,
      ];
    }
  }

  return $bestScore >= 40 ? $best : null;
}


function admin_result_table_candidates(array $schema): array {
  $out = [];

  foreach ($schema as $table => $cols) {
    $lower = strtolower($table);
    if ($lower === 'users') continue;

    $userId = admin_pick_col($cols, ['user_id', 'uid', 'account_id', 'member_id', 'player_id', 'owner_id']);
    $username = admin_pick_col($cols, ['username', 'user_name', 'handle', 'login']);
    $email = admin_pick_col($cols, ['email', 'user_email']);
    $puzzleName = admin_pick_col($cols, ['puzzle_name', 'puzzle', 'title', 'name', 'slug', 'puzzle_slug', 'src', 'image_name']);
    $category = admin_pick_col($cols, ['category_id', 'category', 'cat_id', 'cat']);
    $diff = admin_pick_col($cols, ['diff_key', 'difficulty', 'diff', 'level', 'size_key']);
    $medal = admin_pick_col($cols, ['medal', 'medal_name', 'award', 'tier', 'rank']);
    $stars = admin_pick_col($cols, ['stars', 'star_count', 'rating']);
    $moves = admin_pick_col($cols, ['moves', 'move_count', 'move_total']);
    $elapsed = admin_pick_col($cols, ['elapsed_label', 'elapsed', 'elapsed_sec', 'elapsed_secs', 'elapsed_seconds', 'time_sec', 'time_secs', 'time_ms', 'elapsed_ms', 'duration', 'duration_sec', 'duration_ms', 'seconds']);
    $scoreCol = admin_pick_col($cols, ['score_pct', 'score_percent', 'percent', 'score', 'rating_pct', 'completion_pct']);
    $updated = admin_pick_col($cols, ['updated_at', 'completed_at', 'awarded_at', 'created_at', 'claimed_at', 'finished_at', 'ts', 'timestamp']);
    $completed = admin_pick_col($cols, ['completed', 'is_completed', 'solved', 'is_solved', 'done']);

    $score = 0;
    foreach (['result', 'history', 'progress', 'completion', 'attempt', 'score', 'medal', 'award', 'state'] as $needle) {
      if (str_contains($lower, $needle)) $score += 14;
    }
    foreach (['unlock', 'unlocked', 'inventory', 'owned', 'entitlement', 'catalog', 'reward', 'claim', 'point', 'purchase', 'order'] as $needle) {
      if (str_contains($lower, $needle)) $score -= 18;
    }

    if ($userId) $score += 28;
    if ($username || $email) $score += 10;
    if ($puzzleName) $score += 26;
    if ($category) $score += 10;
    if ($diff) $score += 10;
    if ($medal) $score += 28;
    if ($stars) $score += 16;
    if ($moves) $score += 8;
    if ($elapsed) $score += 8;
    if ($scoreCol) $score += 10;
    if ($updated) $score += 12;
    if ($completed) $score += 6;
    if (!$userId && !$username && !$email) $score -= 40;
    if (!$puzzleName) $score -= 30;

    if ($score >= 25) {
      $out[] = [
        'table' => $table,
        'user_id' => $userId,
        'username' => $username,
        'email' => $email,
        'puzzle_name' => $puzzleName,
        'category' => $category,
        'diff' => $diff,
        'medal' => $medal,
        'stars' => $stars,
        'moves' => $moves,
        'elapsed' => $elapsed,
        'score' => $scoreCol,
        'updated' => $updated,
        'completed' => $completed,
        '_schema_score' => $score,
      ];
    }
  }

  usort($out, static function(array $a, array $b): int {
    return (($b['_schema_score'] ?? 0) <=> ($a['_schema_score'] ?? 0))
      ?: strcmp((string)($a['table'] ?? ''), (string)($b['table'] ?? ''));
  });

  return $out;
}

function admin_pick_results_table(array $schema): ?array {
  $best = null;
  $bestScore = -9999;

  foreach ($schema as $table => $cols) {
    $lower = strtolower($table);
    if ($lower === 'users') continue;

    $userId = admin_pick_col($cols, ['user_id', 'uid', 'account_id', 'member_id', 'player_id', 'owner_id']);
    $username = admin_pick_col($cols, ['username', 'user_name', 'handle', 'login']);
    $email = admin_pick_col($cols, ['email', 'user_email']);
    $puzzleName = admin_pick_col($cols, ['puzzle_name', 'puzzle', 'title', 'name', 'slug', 'puzzle_slug', 'src', 'image_name']);
    $category = admin_pick_col($cols, ['category_id', 'category', 'cat_id', 'cat']);
    $diff = admin_pick_col($cols, ['diff_key', 'difficulty', 'diff', 'level', 'size_key']);
    $medal = admin_pick_col($cols, ['medal', 'medal_name', 'award', 'tier', 'rank']);
    $stars = admin_pick_col($cols, ['stars', 'star_count', 'rating']);
    $moves = admin_pick_col($cols, ['moves', 'move_count', 'move_total']);
    $elapsed = admin_pick_col($cols, ['elapsed_label', 'elapsed', 'elapsed_sec', 'elapsed_secs', 'elapsed_seconds', 'time_sec', 'time_secs', 'time_ms', 'elapsed_ms', 'duration', 'duration_sec', 'duration_ms', 'seconds']);
    $scoreCol = admin_pick_col($cols, ['score_pct', 'score_percent', 'percent', 'score', 'rating_pct', 'completion_pct']);
    $updated = admin_pick_col($cols, ['updated_at', 'completed_at', 'awarded_at', 'created_at', 'claimed_at', 'finished_at', 'ts', 'timestamp']);
    $completed = admin_pick_col($cols, ['completed', 'is_completed', 'solved', 'is_solved', 'done']);

    $score = 0;
    foreach (['result', 'history', 'progress', 'completion', 'attempt', 'score', 'medal', 'award', 'state'] as $needle) {
      if (str_contains($lower, $needle)) $score += 14;
    }
    if ($userId) $score += 28;
    if ($username || $email) $score += 10;
    if ($puzzleName) $score += 26;
    if ($category) $score += 10;
    if ($diff) $score += 10;
    if ($medal) $score += 28;
    if ($stars) $score += 16;
    if ($moves) $score += 8;
    if ($elapsed) $score += 8;
    if ($scoreCol) $score += 10;
    if ($updated) $score += 12;
    if ($completed) $score += 6;
    if (!$userId && !$username && !$email) $score -= 40;
    if (!$puzzleName) $score -= 30;

    if ($score > $bestScore) {
      $bestScore = $score;
      $best = [
        'table' => $table,
        'user_id' => $userId,
        'username' => $username,
        'email' => $email,
        'puzzle_name' => $puzzleName,
        'category' => $category,
        'diff' => $diff,
        'medal' => $medal,
        'stars' => $stars,
        'moves' => $moves,
        'elapsed' => $elapsed,
        'score' => $scoreCol,
        'updated' => $updated,
        'completed' => $completed,
      ];
    }
  }

  return $bestScore >= 35 ? $best : null;
}


function admin_medal_rows_for_candidate(PDO $pdo, array $results, ?array $users, string $userTerm, string $puzzleTerm, int $limit): array {
  $rTable = admin_backtick($results['table']);
  $join = '';
  $joinUsernameExpr = null;
  $joinEmailExpr = null;
  $joinIdExpr = null;

  if ($users && !empty($results['user_id']) && !empty($users['id'])) {
    $join = ' LEFT JOIN ' . admin_backtick($users['table']) . ' u ON r.' . admin_backtick($results['user_id']) . ' = u.' . admin_backtick($users['id']);
    $joinUsernameExpr = admin_col_expr('u', $users['username']);
    $joinEmailExpr = admin_col_expr('u', $users['email']);
    $joinIdExpr = admin_col_expr('u', $users['id']);
  }

  $rUserIdExpr = admin_col_expr('r', $results['user_id']);
  $rUsernameExpr = admin_col_expr('r', $results['username']);
  $rEmailExpr = admin_col_expr('r', $results['email']);
  $puzzleExpr = admin_col_expr('r', $results['puzzle_name']);
  $categoryExpr = admin_col_expr('r', $results['category']);
  $diffExpr = admin_col_expr('r', $results['diff']);
  $medalExpr = admin_col_expr('r', $results['medal']);
  $starsExpr = admin_col_expr('r', $results['stars']);
  $movesExpr = admin_col_expr('r', $results['moves']);
  $elapsedExpr = admin_col_expr('r', $results['elapsed']);
  $scoreExpr = admin_col_expr('r', $results['score']);
  $updatedExpr = admin_col_expr('r', $results['updated']);
  $completedExpr = admin_col_expr('r', $results['completed']);

  $selectUserId = admin_coalesce_expr([$joinIdExpr, $rUserIdExpr], 'NULL');
  $selectUsername = admin_coalesce_expr([$joinUsernameExpr, $rUsernameExpr], "''");
  $selectEmail = admin_coalesce_expr([$joinEmailExpr, $rEmailExpr], "''");
  $selectPuzzle = admin_coalesce_expr([$puzzleExpr], "''");
  $selectCategory = admin_coalesce_expr([$categoryExpr], "''");
  $selectDiff = admin_coalesce_expr([$diffExpr], "''");
  $selectMedal = admin_coalesce_expr([$medalExpr], "''");
  $selectStars = admin_coalesce_expr([$starsExpr], '0');
  $selectMoves = admin_coalesce_expr([$movesExpr], '0');
  $selectElapsed = admin_coalesce_expr([$elapsedExpr], "''");
  $selectScore = admin_coalesce_expr([$scoreExpr], '0');
  $selectUpdated = admin_coalesce_expr([$updatedExpr], "''");

  $where = [];
  $params = [];
  $userOr = [];
  $bindIndex = 0;

  if (is_numeric($userTerm)) {
    foreach (array_filter([$joinIdExpr, $rUserIdExpr]) as $expr) {
      $key = ':uid_exact_' . (++$bindIndex);
      $userOr[] = $expr . ' = ' . $key;
      $params[$key] = (int)$userTerm;
    }
  }

  $userLike = admin_like($userTerm);
  foreach (array_filter([$joinUsernameExpr, $rUsernameExpr, $joinEmailExpr, $rEmailExpr]) as $expr) {
    $key = ':user_like_' . (++$bindIndex);
    $userOr[] = $expr . " LIKE " . $key . " ESCAPE '='";
    $params[$key] = $userLike;
  }
  foreach (array_filter([$joinIdExpr, $rUserIdExpr]) as $expr) {
    $key = ':user_like_' . (++$bindIndex);
    $userOr[] = 'CAST(' . $expr . ' AS CHAR) LIKE ' . $key . " ESCAPE '='";
    $params[$key] = $userLike;
  }

  if (!$userOr) {
    return [];
  }
  $where[] = '(' . implode(' OR ', array_values(array_unique($userOr))) . ')';

  if ($puzzleTerm !== '') {
    $puzzleLike = admin_like($puzzleTerm);
    $puzzleOr = [];
    foreach (array_filter([$puzzleExpr, $categoryExpr, $diffExpr, $medalExpr]) as $expr) {
      $key = ':puzzle_like_' . (++$bindIndex);
      $puzzleOr[] = $expr . " LIKE " . $key . " ESCAPE '='";
      $params[$key] = $puzzleLike;
    }
    if ($puzzleOr) {
      $where[] = '(' . implode(' OR ', array_values(array_unique($puzzleOr))) . ')';
    }
  }

  $evidence = [];
  if ($medalExpr) {
    $evidence[] = '(' . $medalExpr . ' IS NOT NULL AND TRIM(CAST(' . $medalExpr . ' AS CHAR)) <> "" AND LOWER(TRIM(CAST(' . $medalExpr . ' AS CHAR))) NOT IN ("0", "none", "null", "-", "—", "--", "n/a", "na"))';
  }
  if ($starsExpr) {
    $evidence[] = '(COALESCE(' . $starsExpr . ', 0) > 0)';
  }
  if ($scoreExpr) {
    $evidence[] = '(COALESCE(' . $scoreExpr . ', 0) > 0)';
  }
  if ($completedExpr) {
    $evidence[] = '(CAST(' . $completedExpr . ' AS CHAR) IN ("1", "true", "yes", "done", "solved"))';
  }
  if ($evidence) {
    $where[] = '(' . implode(' OR ', $evidence) . ')';
  }

  $sql = 'SELECT '
    . $selectUpdated . ' AS updated_at, '
    . $selectUsername . ' AS username, '
    . $selectEmail . ' AS email, '
    . $selectUserId . ' AS user_id, '
    . $selectPuzzle . ' AS puzzle_name, '
    . $selectCategory . ' AS category_id, '
    . $selectDiff . ' AS diff_key, '
    . $selectMedal . ' AS medal, '
    . $selectStars . ' AS stars, '
    . $selectMoves . ' AS moves, '
    . $selectElapsed . ' AS elapsed_raw, '
    . $selectScore . ' AS score_raw '
    . 'FROM ' . $rTable . ' r'
    . $join
    . ' WHERE ' . implode(' AND ', $where)
    . ' ORDER BY ' . $selectUpdated . ' DESC'
    . ' LIMIT :limit_rows';

  $stmt = $pdo->prepare($sql);
  foreach ($params as $key => $value) {
    $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
  }
  $stmt->bindValue(':limit_rows', $limit, PDO::PARAM_INT);
  $stmt->execute();
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $userMap = [];
  foreach ($rows as &$row) {
    $scorePct = admin_normalize_score_pct($row['score_raw'] ?? 0);
    $stars = admin_normalize_stars($row['stars'] ?? 0);
    $row['updated_at'] = admin_format_datetime($row['updated_at'] ?? '');
    $row['username'] = trim((string)($row['username'] ?? ''));
    $row['email'] = trim((string)($row['email'] ?? ''));
    $row['user_id'] = (string)($row['user_id'] ?? '');
    $row['puzzle_name'] = trim((string)($row['puzzle_name'] ?? ''));
    $row['category_id'] = trim((string)($row['category_id'] ?? ''));
    $row['diff_key'] = trim((string)($row['diff_key'] ?? ''));
    $row['stars'] = max(0, min(3, $stars));
    $row['moves'] = is_numeric($row['moves'] ?? null) ? (int)$row['moves'] : 0;
    $row['elapsed_label'] = admin_format_elapsed($row['elapsed_raw'] ?? '');
    $row['score_pct'] = $scorePct;
    $row['medal'] = admin_normalize_medal($row['medal'] ?? '', $row['stars'], $scorePct);
    $row['medal_label'] = $row['medal'];
    unset($row['elapsed_raw'], $row['score_raw']);

    $userKey = $row['user_id'] !== '' ? $row['user_id'] : strtolower($row['username'] . '|' . $row['email']);
    if ($userKey !== '' && !isset($userMap[$userKey])) {
      $userMap[$userKey] = [
        'user_id' => $row['user_id'],
        'username' => $row['username'],
        'email' => $row['email'],
      ];
    }
  }
  unset($row);

  return [
    'users' => array_values($userMap),
    'rows' => $rows,
  ];
}

function admin_candidate_quality(array $candidate, array $rows): int {
  $score = (int)($candidate['_schema_score'] ?? 0) * 5;
  $table = strtolower((string)($candidate['table'] ?? ''));
  if (str_contains($table, 'result')) $score += 80;
  if (str_contains($table, 'history')) $score += 70;
  if (str_contains($table, 'progress')) $score += 50;
  if (str_contains($table, 'medal')) $score += 80;
  if (str_contains($table, 'score')) $score += 40;
  foreach (['unlock', 'unlocked', 'inventory', 'owned', 'reward', 'claim', 'point', 'purchase'] as $needle) {
    if (str_contains($table, $needle)) $score -= 120;
  }

  $positive = 0;
  foreach ($rows as $row) {
    $stars = (int)($row['stars'] ?? 0);
    $scorePct = (float)($row['score_pct'] ?? 0);
    $moves = (int)($row['moves'] ?? 0);
    $elapsed = trim((string)($row['elapsed_label'] ?? ''));
    $medal = strtolower(trim((string)($row['medal'] ?? '')));
    $hasMedal = $medal !== '' && !in_array($medal, ['-', '—', '--', 'none', 'null', 'n/a', 'na', '0'], true);

    if ($hasMedal) { $score += 80; $positive++; }
    if ($stars > 0) { $score += 70 + ($stars * 8); $positive++; }
    if ($scorePct > 0) { $score += 40; $positive++; }
    if ($moves > 0) { $score += 12; }
    if ($elapsed !== '') { $score += 10; }
  }

  if ($rows) $score += count($rows) * 2;
  if ($positive === 0) $score -= 500;
  return $score;
}

function admin_medal_report(PDO $pdo, string $userTerm, string $puzzleTerm = '', int $limit = 150): array {
  $userTerm = trim($userTerm);
  $puzzleTerm = trim($puzzleTerm);
  if ($userTerm === '') {
    throw new InvalidArgumentException('Enter a user search first.');
  }
  $limit = max(1, min(500, $limit));

  $schema = admin_schema($pdo);
  $users = admin_pick_user_table($schema);
  $candidates = admin_result_table_candidates($schema);
  if (!$candidates) {
    throw new RuntimeException('Could not find a puzzle results/history table with medal data.');
  }

  $best = null;
  $bestRows = null;
  $bestUsers = null;
  $bestQuality = -1000000;
  $tested = [];

  foreach (array_slice($candidates, 0, 12) as $candidate) {
    try {
      $sample = admin_medal_rows_for_candidate($pdo, $candidate, $users, $userTerm, $puzzleTerm, min($limit, 75));
      $quality = admin_candidate_quality($candidate, $sample['rows'] ?? []);
      $tested[] = ['table' => $candidate['table'], 'quality' => $quality, 'rows' => count($sample['rows'] ?? [])];
      if ($quality > $bestQuality && !empty($sample['rows'])) {
        $best = $candidate;
        $bestRows = $sample['rows'];
        $bestUsers = $sample['users'];
        $bestQuality = $quality;
      }
    } catch (Throwable $e) {
      $tested[] = ['table' => $candidate['table'], 'quality' => -999999, 'rows' => 0, 'error' => $e->getMessage()];
    }
  }

  if (!$best || !$bestRows) {
    throw new RuntimeException('Could not find a medal history table with non-empty medal/star/score records for that user.');
  }

  if (count($bestRows) < $limit) {
    $full = admin_medal_rows_for_candidate($pdo, $best, $users, $userTerm, $puzzleTerm, $limit);
    $bestRows = $full['rows'];
    $bestUsers = $full['users'];
  }

  return [
    'users' => $bestUsers,
    'rows' => $bestRows,
  ];
}


function admin_read_json_body(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw ?: '', true);
  return is_array($data) ? $data : [];
}

function admin_require_ajax_auth(): void {
  if (!is_authed()) {
    admin_json(['ok' => false, 'error' => 'admin_not_authed'], 401);
  }
}

function admin_require_ajax_csrf(array $data): void {
  $token = (string)($data['csrf'] ?? '');
  if (empty($_SESSION['csrf']) || !hash_equals((string)$_SESSION['csrf'], $token)) {
    admin_json(['ok' => false, 'error' => 'bad_csrf'], 400);
  }
}

function admin_user_table_info(PDO $pdo): array {
  static $info = null;
  if ($info !== null) return $info;

  $schema = admin_schema($pdo);
  $pick = admin_pick_user_table($schema);
  if (!$pick || empty($pick['table']) || empty($pick['id'])) {
    throw new RuntimeException('Could not resolve the users table from config/schema.');
  }

  $cols = $schema[$pick['table']] ?? [];
  $info = [
    'table' => (string)$pick['table'],
    'id' => (string)$pick['id'],
    'username' => $pick['username'] ?? null,
    'email' => $pick['email'] ?? null,
    'points' => admin_pick_col($cols, ['points', 'points_balance', 'current_points']),
    'created_at' => admin_pick_col($cols, ['created_at', 'registered_at', 'joined_at', 'signup_at', 'created', 'added_at', 'ts', 'timestamp']),
  ];
  return $info;
}

function admin_resolve_user(PDO $pdo, string $term): ?array {
  $term = trim($term);
  if ($term === '') return null;

  $info = admin_user_table_info($pdo);
  $table = admin_backtick($info['table']);

  $select = [
    'u.' . admin_backtick($info['id']) . ' AS id',
    ($info['username'] ? 'u.' . admin_backtick((string)$info['username']) : "''") . ' AS username',
    ($info['email'] ? 'u.' . admin_backtick((string)$info['email']) : "''") . ' AS email',
    ($info['created_at'] ? 'u.' . admin_backtick((string)$info['created_at']) : 'NULL') . ' AS created_at',
  ];
  $base = 'SELECT ' . implode(', ', $select) . ' FROM ' . $table . ' u';

  if (ctype_digit($term)) {
    $sql = $base . ' WHERE u.' . admin_backtick($info['id']) . ' = ? LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute([(int)$term]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (is_array($row)) return $row;
  }

  $checks = [];
  $params = [];
  if (!empty($info['username'])) {
    $checks[] = 'u.' . admin_backtick((string)$info['username']) . ' = ?';
    $params[] = $term;
  }
  if (!empty($info['email'])) {
    $checks[] = 'u.' . admin_backtick((string)$info['email']) . ' = ?';
    $params[] = $term;
  }
  if ($checks) {
    $sql = $base . ' WHERE (' . implode(' OR ', $checks) . ') LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (is_array($row)) return $row;
  }

  $likes = [];
  $likeParams = [];
  if (!empty($info['username'])) {
    $likes[] = 'u.' . admin_backtick((string)$info['username']) . ' LIKE ? ESCAPE "="';
    $likeParams[] = admin_like($term);
  }
  if (!empty($info['email'])) {
    $likes[] = 'u.' . admin_backtick((string)$info['email']) . ' LIKE ? ESCAPE "="';
    $likeParams[] = admin_like($term);
  }
  if ($likes) {
    $sql = $base . ' WHERE (' . implode(' OR ', $likes) . ') ORDER BY u.' . admin_backtick($info['id']) . ' ASC LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute($likeParams);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (is_array($row)) return $row;
  }

  return null;
}

function admin_ensure_user_state(PDO $pdo, int $uid): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS user_state (
    user_id BIGINT UNSIGNED NOT NULL,
    points INT NOT NULL DEFAULT 0,
    unlocked_json LONGTEXT NULL,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  $pdo->prepare("INSERT INTO user_state (user_id, points, unlocked_json)
                 VALUES (?, 0, '{}')
                 ON DUPLICATE KEY UPDATE user_id=user_id")
      ->execute([$uid]);
}

function admin_fetch_user_state(PDO $pdo, int $uid): array {
  admin_ensure_user_state($pdo, $uid);
  $st = $pdo->prepare("SELECT points, unlocked_json FROM user_state WHERE user_id=? LIMIT 1");
  $st->execute([$uid]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: ['points' => 0, 'unlocked_json' => '{}'];
  $points = (int)($row['points'] ?? 0);
  $decoded = json_decode((string)($row['unlocked_json'] ?? '{}'), true);
  $unlocked = is_array($decoded) ? $decoded : [];
  return ['points' => $points, 'unlocked' => $unlocked];
}

function admin_fetch_users_points(PDO $pdo, int $uid): ?int {
  $info = admin_user_table_info($pdo);
  $pointsCol = (string)($info['points'] ?? '');
  if ($pointsCol === '') return null;

  $sql = 'SELECT ' . admin_backtick($pointsCol) . ' AS points'
       . ' FROM ' . admin_backtick((string)$info['table'])
       . ' WHERE ' . admin_backtick((string)$info['id']) . ' = ?'
       . ' LIMIT 1';
  $st = $pdo->prepare($sql);
  $st->execute([$uid]);
  $value = $st->fetchColumn();
  return $value !== false && $value !== null && $value !== '' ? max(0, (int)$value) : null;
}

function admin_daily_reward_claim_stats(PDO $pdo, int $uid): array {
  $schema = admin_schema($pdo);
  if (!admin_table_exists_in_schema($schema, 'daily_reward_claims')) {
    return [
      'claim_count' => 0,
      'claimed_points_total' => 0,
      'latest_claimed_at' => null,
      'latest_claim_day' => null,
    ];
  }

  $cols = $schema['daily_reward_claims'];
  $userCol = admin_pick_col($cols, ['user_id', 'uid', 'account_id']);
  $pointsCol = admin_pick_col($cols, ['points', 'reward_points']);
  $claimedAtCol = admin_pick_col($cols, ['claimed_at', 'created_at', 'awarded_at']);
  $dayCol = admin_pick_col($cols, ['day_key', 'day', 'claim_day', 'reward_day']);

  if (!$userCol || !$pointsCol) {
    return [
      'claim_count' => 0,
      'claimed_points_total' => 0,
      'latest_claimed_at' => null,
      'latest_claim_day' => null,
    ];
  }

  $select = [
    'COUNT(*) AS claim_count',
    'COALESCE(SUM(' . admin_backtick($pointsCol) . '), 0) AS claimed_points_total',
  ];
  if ($claimedAtCol) {
    $select[] = 'MAX(' . admin_backtick($claimedAtCol) . ') AS latest_claimed_at';
  } else {
    $select[] = 'NULL AS latest_claimed_at';
  }
  if ($dayCol) {
    $select[] = 'MAX(' . admin_backtick($dayCol) . ') AS latest_claim_day';
  } else {
    $select[] = 'NULL AS latest_claim_day';
  }

  $sql = 'SELECT ' . implode(', ', $select)
       . ' FROM `daily_reward_claims`'
       . ' WHERE ' . admin_backtick($userCol) . ' = ?';
  $st = $pdo->prepare($sql);
  $st->execute([$uid]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];

  return [
    'claim_count' => max(0, (int)($row['claim_count'] ?? 0)),
    'claimed_points_total' => max(0, (int)($row['claimed_points_total'] ?? 0)),
    'latest_claimed_at' => isset($row['latest_claimed_at']) && $row['latest_claimed_at'] !== '' ? (string)$row['latest_claimed_at'] : null,
    'latest_claim_day' => isset($row['latest_claim_day']) && $row['latest_claim_day'] !== '' ? (string)$row['latest_claim_day'] : null,
  ];
}

function admin_daily_reward_claim_meta(PDO $pdo): ?array {
  $schema = admin_schema($pdo);
  if (!admin_table_exists_in_schema($schema, 'daily_reward_claims')) return null;
  $cols = $schema['daily_reward_claims'];
  $userCol = admin_pick_col($cols, ['user_id', 'uid', 'account_id']);
  $idCol = admin_pick_col($cols, ['id']);
  $pointsCol = admin_pick_col($cols, ['points', 'reward_points']);
  $claimedAtCol = admin_pick_col($cols, ['claimed_at', 'created_at', 'awarded_at']);
  $dayCol = admin_pick_col($cols, ['day_key', 'day', 'claim_day', 'reward_day']);
  if (!$userCol || !$idCol || !$pointsCol || !$claimedAtCol) return null;
  return [
    'user' => $userCol,
    'id' => $idCol,
    'points' => $pointsCol,
    'claimed_at' => $claimedAtCol,
    'day' => $dayCol,
  ];
}

function admin_ensure_daily_reward_repair_log(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS admin_daily_reward_repair_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_session_id VARCHAR(128) NOT NULL DEFAULT '',
    user_id BIGINT UNSIGNED NOT NULL,
    repaired_points INT NOT NULL DEFAULT 0,
    user_state_points_before INT NOT NULL DEFAULT 0,
    user_state_points_after INT NOT NULL DEFAULT 0,
    users_points_reference INT NOT NULL DEFAULT 0,
    daily_claim_count INT NOT NULL DEFAULT 0,
    daily_claim_points_total INT NOT NULL DEFAULT 0,
    latest_claim_day VARCHAR(32) NULL DEFAULT NULL,
    latest_claimed_at DATETIME NULL DEFAULT NULL,
    repair_mode VARCHAR(32) NOT NULL DEFAULT 'gap',
    claim_ids_json LONGTEXT NULL,
    note VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user (user_id),
    KEY idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  try {
    $st = $pdo->query("SHOW COLUMNS FROM admin_daily_reward_repair_log");
    $have = [];
    foreach (($st ? $st->fetchAll(PDO::FETCH_ASSOC) : []) as $row) {
      $name = (string)($row['Field'] ?? '');
      if ($name !== '') $have[strtolower($name)] = true;
    }
    if (!isset($have['repair_mode'])) {
      $pdo->exec("ALTER TABLE admin_daily_reward_repair_log ADD COLUMN repair_mode VARCHAR(32) NOT NULL DEFAULT 'gap'");
    }
    if (!isset($have['claim_ids_json'])) {
      $pdo->exec("ALTER TABLE admin_daily_reward_repair_log ADD COLUMN claim_ids_json LONGTEXT NULL");
    }
  } catch (Throwable $e) {
  }
}

function admin_recent_unrepaired_daily_claims(PDO $pdo, int $uid, int $windowHours = 24, int $limit = 20): array {
  $meta = admin_daily_reward_claim_meta($pdo);
  if (!$meta) return [];

  admin_ensure_daily_reward_repair_log($pdo);

  $repairedIds = [];
  try {
    $st = $pdo->prepare("SELECT claim_ids_json FROM admin_daily_reward_repair_log WHERE user_id = ? AND repair_mode = 'claims_fallback'");
    $st->execute([$uid]);
    foreach (($st->fetchAll(PDO::FETCH_COLUMN) ?: []) as $json) {
      if (!is_string($json) || trim($json) === '') continue;
      $decoded = json_decode($json, true);
      if (!is_array($decoded)) continue;
      foreach ($decoded as $id) {
        $id = (int)$id;
        if ($id > 0) $repairedIds[$id] = true;
      }
    }
  } catch (Throwable $e) {
  }

  $hours = max(1, min(168, $windowHours));
  $take = max(1, min(50, $limit));
  $sql = 'SELECT '
       . admin_backtick($meta['id']) . ' AS claim_id, '
       . admin_backtick($meta['points']) . ' AS claim_points, '
       . admin_backtick($meta['claimed_at']) . ' AS claimed_at'
       . ($meta['day'] ? ', ' . admin_backtick($meta['day']) . ' AS claim_day' : ', NULL AS claim_day')
       . ' FROM `daily_reward_claims`'
       . ' WHERE ' . admin_backtick($meta['user']) . ' = ?'
       . ' AND ' . admin_backtick($meta['points']) . ' > 0'
       . ' AND ' . admin_backtick($meta['claimed_at']) . ' >= (UTC_TIMESTAMP() - INTERVAL ' . $hours . ' HOUR)'
       . ' ORDER BY ' . admin_backtick($meta['claimed_at']) . ' DESC, ' . admin_backtick($meta['id']) . ' DESC'
       . ' LIMIT ' . $take;
  $st = $pdo->prepare($sql);
  $st->execute([$uid]);

  $rows = [];
  foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
    $claimId = (int)($row['claim_id'] ?? 0);
    if ($claimId <= 0 || isset($repairedIds[$claimId])) continue;
    $rows[] = [
      'claim_id' => $claimId,
      'claim_points' => max(0, (int)($row['claim_points'] ?? 0)),
      'claimed_at' => isset($row['claimed_at']) && $row['claimed_at'] !== '' ? (string)$row['claimed_at'] : null,
      'claim_day' => isset($row['claim_day']) && $row['claim_day'] !== '' ? (string)$row['claim_day'] : null,
    ];
  }

  return $rows;
}

function admin_ensure_premature_daily_claim_reopen_log(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS admin_premature_daily_claim_reopen_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_session_id VARCHAR(128) NOT NULL DEFAULT '',
    user_id BIGINT UNSIGNED NOT NULL,
    claim_row_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    day_key VARCHAR(32) NOT NULL DEFAULT '',
    claim_points INT NOT NULL DEFAULT 0,
    user_state_points_before INT NOT NULL DEFAULT 0,
    user_state_points_after INT NOT NULL DEFAULT 0,
    users_points_before INT NOT NULL DEFAULT 0,
    users_points_after INT NOT NULL DEFAULT 0,
    reverse_points TINYINT(1) NOT NULL DEFAULT 1,
    claim_timestamp VARCHAR(64) NULL DEFAULT NULL,
    note VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user_day (user_id, day_key),
    KEY idx_claim_row (claim_row_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function admin_reopen_premature_daily_claim(PDO $pdo, array $user, string $day, bool $reversePoints = true): array {
  $uid = (int)($user['id'] ?? 0);
  if ($uid <= 0) {
    throw new InvalidArgumentException('Invalid user id.');
  }
  $day = trim($day);
  if (!pq_day_valid($day)) {
    throw new InvalidArgumentException('Invalid day format.');
  }

  admin_ensure_user_state($pdo, $uid);
  admin_ensure_premature_daily_claim_reopen_log($pdo);

  $claimMeta = pq_claim_meta($pdo);
  $logMeta = pq_log_meta($pdo);
  $userInfo = admin_user_table_info($pdo);

  $report = [
    'uid' => $uid,
    'username' => trim((string)($user['username'] ?? '')),
    'email' => trim((string)($user['email'] ?? '')),
    'day_key' => $day,
    'found_claim_row' => false,
    'claim_row_id' => 0,
    'claim_points' => 0,
    'claim_timestamp' => null,
    'same_day_claim' => false,
    'reverse_points' => $reversePoints,
    'user_state_points_before' => 0,
    'user_state_points_after' => 0,
    'users_points_before' => admin_fetch_users_points($pdo, $uid),
    'users_points_after' => admin_fetch_users_points($pdo, $uid),
    'reopened' => false,
    'reversed_points' => 0,
    'note' => '',
  ];

  if (empty($claimMeta['exists']) || empty($claimMeta['user_col']) || empty($claimMeta['day_col']) || empty($claimMeta['id_col'])) {
    $report['note'] = 'daily_reward_claims schema is missing required columns.';
    return $report;
  }

  $initialState = admin_fetch_user_state($pdo, $uid);
  $report['user_state_points_before'] = (int)($initialState['points'] ?? 0);
  $report['user_state_points_after'] = $report['user_state_points_before'];

  $claimRow = pq_find_claim_row($pdo, $uid, $day, $claimMeta);
  if (!$claimRow) {
    $report['note'] = 'No claim row exists for that user/day.';
    return $report;
  }

  $claimId = ($claimMeta['id_col'] && isset($claimRow[$claimMeta['id_col']])) ? (int)$claimRow[$claimMeta['id_col']] : 0;
  $claimPoints = ($claimMeta['points_col'] && isset($claimRow[$claimMeta['points_col']])) ? max(0, (int)$claimRow[$claimMeta['points_col']]) : 0;
  $claimTimestamp = null;
  if ($claimMeta['claimed_at_col'] && isset($claimRow[$claimMeta['claimed_at_col']])) {
    $claimTimestamp = trim((string)$claimRow[$claimMeta['claimed_at_col']]);
  }
  if (($claimTimestamp === null || $claimTimestamp === '') && $claimMeta['created_at_col'] && isset($claimRow[$claimMeta['created_at_col']])) {
    $claimTimestamp = trim((string)$claimRow[$claimMeta['created_at_col']]);
  }
  $sameDayClaim = is_string($claimTimestamp) && strlen($claimTimestamp) >= 10 && substr($claimTimestamp, 0, 10) === $day;

  $report['found_claim_row'] = true;
  $report['claim_row_id'] = $claimId;
  $report['claim_points'] = $claimPoints;
  $report['claim_timestamp'] = $claimTimestamp ?: null;
  $report['same_day_claim'] = $sameDayClaim;

  if (!$sameDayClaim) {
    $report['note'] = 'Claim row exists, but it was not created on the same calendar day as the reward day, so no reopen was applied.';
    return $report;
  }

  $pdo->beginTransaction();
  try {
    $lock = $pdo->prepare("SELECT points FROM user_state WHERE user_id=? LIMIT 1 FOR UPDATE");
    $lock->execute([$uid]);
    $stateBefore = $lock->fetchColumn();
    $stateBefore = $stateBefore !== false ? max(0, (int)$stateBefore) : 0;

    $liveClaimSql = 'SELECT * FROM `daily_reward_claims` WHERE `' . $claimMeta['id_col'] . '` = ? LIMIT 1 FOR UPDATE';
    $liveClaimStmt = $pdo->prepare($liveClaimSql);
    $liveClaimStmt->execute([$claimId]);
    $liveClaim = $liveClaimStmt->fetch(PDO::FETCH_ASSOC);
    if (!$liveClaim) {
      $pdo->rollBack();
      $report['note'] = 'Claim row disappeared before the reopen could run.';
      return $report;
    }

    $livePoints = ($claimMeta['points_col'] && isset($liveClaim[$claimMeta['points_col']])) ? max(0, (int)$liveClaim[$claimMeta['points_col']]) : 0;
    $liveTimestamp = null;
    if ($claimMeta['claimed_at_col'] && isset($liveClaim[$claimMeta['claimed_at_col']])) {
      $liveTimestamp = trim((string)$liveClaim[$claimMeta['claimed_at_col']]);
    }
    if (($liveTimestamp === null || $liveTimestamp === '') && $claimMeta['created_at_col'] && isset($liveClaim[$claimMeta['created_at_col']])) {
      $liveTimestamp = trim((string)$liveClaim[$claimMeta['created_at_col']]);
    }
    $stillSameDay = is_string($liveTimestamp) && strlen($liveTimestamp) >= 10 && substr($liveTimestamp, 0, 10) === $day;
    if (!$stillSameDay) {
      $pdo->rollBack();
      $report['note'] = 'Live claim row no longer matched the premature same-day pattern, so no reopen was applied.';
      return $report;
    }

    $stateAfter = $stateBefore;
    $reversedPoints = 0;
    if ($reversePoints && $livePoints > 0) {
      $reversedPoints = min($livePoints, $stateBefore);
      $stateAfter = max(0, $stateBefore - $reversedPoints);
      $pdo->prepare("UPDATE user_state SET points = ? WHERE user_id=?")->execute([$stateAfter, $uid]);
    }

    $usersBefore = admin_fetch_users_points($pdo, $uid);
    $usersAfter = $usersBefore;
    $pointsCol = (string)($userInfo['points'] ?? '');
    $userIdCol = (string)($userInfo['id'] ?? '');
    $userTable = (string)($userInfo['table'] ?? '');
    if ($reversePoints && $reversedPoints > 0 && $pointsCol !== '' && $userIdCol !== '' && $userTable !== '' && $usersBefore !== null) {
      $usersAfter = max(0, $usersBefore - $reversedPoints);
      $sql = 'UPDATE ' . admin_backtick($userTable) . ' SET ' . admin_backtick($pointsCol) . ' = ? WHERE ' . admin_backtick($userIdCol) . ' = ? LIMIT 1';
      $pdo->prepare($sql)->execute([$usersAfter, $uid]);
    }

    if ($logMeta['exists'] && $logMeta['user_col'] && $logMeta['day_col']) {
      $updates = [];
      if ($logMeta['claimed_at_col']) $updates[] = '`' . $logMeta['claimed_at_col'] . '` = NULL';
      if ($logMeta['status_col']) $updates[] = '`' . $logMeta['status_col'] . '` = "ready"';
      if ($updates) {
        $sql = 'UPDATE `daily_reward_log` SET ' . implode(', ', $updates)
             . ' WHERE `' . $logMeta['user_col'] . '` = ? AND `' . $logMeta['day_col'] . '` = ?';
        $pdo->prepare($sql)->execute([$uid, $day]);
      }
    }

    $deleteSql = 'DELETE FROM `daily_reward_claims` WHERE `' . $claimMeta['id_col'] . '` = ? LIMIT 1';
    $pdo->prepare($deleteSql)->execute([$claimId]);

    $note = $reversePoints
      ? 'Reopened premature same-day claim and reversed credited points.'
      : 'Reopened premature same-day claim without reversing credited points.';

    $pdo->prepare(
      "INSERT INTO admin_premature_daily_claim_reopen_log (
        admin_session_id, user_id, claim_row_id, day_key, claim_points, user_state_points_before, user_state_points_after,
        users_points_before, users_points_after, reverse_points, claim_timestamp, note
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
    )->execute([
      session_id(),
      $uid,
      $claimId,
      $day,
      $livePoints,
      $stateBefore,
      $stateAfter,
      $usersBefore ?? 0,
      $usersAfter ?? 0,
      $reversePoints ? 1 : 0,
      $liveTimestamp,
      $note,
    ]);

    $pdo->commit();

    $report['user_state_points_before'] = $stateBefore;
    $report['user_state_points_after'] = $stateAfter;
    $report['users_points_before'] = $usersBefore;
    $report['users_points_after'] = $usersAfter;
    $report['reopened'] = true;
    $report['reversed_points'] = $reversedPoints;
    $report['note'] = $note;
    return $report;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }
}

function admin_repair_daily_reward_points(PDO $pdo, array $user): array {
  $uid = (int)($user['id'] ?? 0);
  if ($uid <= 0) {
    throw new InvalidArgumentException('Invalid user id.');
  }

  $username = trim((string)($user['username'] ?? ''));
  $email = trim((string)($user['email'] ?? ''));
  admin_ensure_user_state($pdo, $uid);

  $stateBefore = admin_fetch_user_state($pdo, $uid);
  $statePointsBefore = max(0, (int)($stateBefore['points'] ?? 0));
  $usersPointsReference = admin_fetch_users_points($pdo, $uid);
  $claimStats = admin_daily_reward_claim_stats($pdo, $uid);

  $report = [
    'uid' => $uid,
    'username' => $username,
    'email' => $email,
    'user_state_points_before' => $statePointsBefore,
    'user_state_points_after' => $statePointsBefore,
    'users_points_reference' => $usersPointsReference,
    'daily_claim_count' => (int)$claimStats['claim_count'],
    'daily_claim_points_total' => (int)$claimStats['claimed_points_total'],
    'latest_claim_day' => $claimStats['latest_claim_day'],
    'latest_claimed_at' => $claimStats['latest_claimed_at'],
    'repair_applied' => false,
    'repaired_points' => 0,
    'note' => '',
  ];

  if ($report['daily_claim_count'] <= 0) {
    $report['note'] = 'No daily reward claims were found for this user.';
    return $report;
  }

  if ($usersPointsReference === null) {
    $recentClaims = admin_recent_unrepaired_daily_claims($pdo, $uid, 24, 20);
    if (!$recentClaims) {
      $report['note'] = 'Users table has no points column to reconcile against, and no recent unrepaired daily claim rows were found.';
      return $report;
    }

    admin_ensure_daily_reward_repair_log($pdo);

    $pdo->beginTransaction();
    try {
      $lock = $pdo->prepare("SELECT points FROM user_state WHERE user_id=? LIMIT 1 FOR UPDATE");
      $lock->execute([$uid]);
      $lockedBefore = $lock->fetchColumn();
      $lockedBefore = $lockedBefore !== false ? max(0, (int)$lockedBefore) : 0;

      $claimIds = [];
      $claimedDays = [];
      $claimTotal = 0;
      $latestClaimedAt = null;
      foreach ($recentClaims as $claimRow) {
        $claimIds[] = (int)$claimRow['claim_id'];
        $claimTotal += max(0, (int)$claimRow['claim_points']);
        if (!empty($claimRow['claim_day'])) $claimedDays[] = (string)$claimRow['claim_day'];
        $candidateAt = (string)($claimRow['claimed_at'] ?? '');
        if ($candidateAt !== '' && ($latestClaimedAt === null || strcmp($candidateAt, $latestClaimedAt) > 0)) {
          $latestClaimedAt = $candidateAt;
        }
      }

      $after = $lockedBefore;
      if ($claimTotal > 0) {
        $after = $lockedBefore + $claimTotal;
        $pdo->prepare("UPDATE user_state SET points = ? WHERE user_id=?")->execute([$after, $uid]);
      }

      $note = $claimTotal > 0
        ? ('Applied recent unrepaired daily claims because no users.points reference exists. Claim rows: ' . count($claimIds) . '.')
        : 'No recent claim-row repair was necessary.';

      $pdo->prepare(
        "INSERT INTO admin_daily_reward_repair_log (
          admin_session_id, user_id, repaired_points, user_state_points_before, user_state_points_after,
          users_points_reference, daily_claim_count, daily_claim_points_total, latest_claim_day, latest_claimed_at,
          repair_mode, claim_ids_json, note
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
      )->execute([
        session_id(),
        $uid,
        $claimTotal,
        $lockedBefore,
        $after,
        0,
        count($claimIds),
        $claimTotal,
        $claimedDays ? max($claimedDays) : null,
        $latestClaimedAt,
        'claims_fallback',
        json_encode($claimIds, JSON_UNESCAPED_SLASHES),
        $note,
      ]);

      $pdo->commit();

      $report['user_state_points_before'] = $lockedBefore;
      $report['user_state_points_after'] = $after;
      $report['users_points_reference'] = null;
      $report['repair_applied'] = $claimTotal > 0;
      $report['repaired_points'] = $claimTotal;
      $report['daily_claim_count'] = count($claimIds);
      $report['daily_claim_points_total'] = $claimTotal;
      $report['latest_claim_day'] = $claimedDays ? max($claimedDays) : null;
      $report['latest_claimed_at'] = $latestClaimedAt;
      $report['note'] = $note;
      return $report;
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }
      throw $e;
    }
  }

  $gap = max(0, $usersPointsReference - $statePointsBefore);
  if ($gap <= 0) {
    $report['note'] = 'No repairable daily reward credit gap was found.';
    return $report;
  }

  admin_ensure_daily_reward_repair_log($pdo);

  $pdo->beginTransaction();
  try {
    $lock = $pdo->prepare("SELECT points FROM user_state WHERE user_id=? LIMIT 1 FOR UPDATE");
    $lock->execute([$uid]);
    $lockedBefore = $lock->fetchColumn();
    $lockedBefore = $lockedBefore !== false ? max(0, (int)$lockedBefore) : 0;

    $liveUsersPoints = admin_fetch_users_points($pdo, $uid);
    $liveUsersPoints = $liveUsersPoints === null ? $usersPointsReference : $liveUsersPoints;
    $applied = max(0, $liveUsersPoints - $lockedBefore);
    $after = $lockedBefore;
    if ($applied > 0) {
      $after = $lockedBefore + $applied;
      $pdo->prepare("UPDATE user_state SET points = ? WHERE user_id=?")->execute([$after, $uid]);
    }

    $note = $applied > 0
      ? 'Reconciled user_state.points to users.points after broken daily reward claims.'
      : 'No repair applied because the user_state balance already matched the users table at execution time.';

    $pdo->prepare(
      "INSERT INTO admin_daily_reward_repair_log (
        admin_session_id, user_id, repaired_points, user_state_points_before, user_state_points_after,
        users_points_reference, daily_claim_count, daily_claim_points_total, latest_claim_day, latest_claimed_at, note
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    )->execute([
      session_id(),
      $uid,
      $applied,
      $lockedBefore,
      $after,
      $liveUsersPoints,
      (int)$claimStats['claim_count'],
      (int)$claimStats['claimed_points_total'],
      $claimStats['latest_claim_day'],
      $claimStats['latest_claimed_at'],
      $note,
    ]);

    $pdo->commit();

    $report['user_state_points_before'] = $lockedBefore;
    $report['user_state_points_after'] = $after;
    $report['users_points_reference'] = $liveUsersPoints;
    $report['repair_applied'] = $applied > 0;
    $report['repaired_points'] = $applied;
    $report['note'] = $note;
    return $report;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }
}

function admin_inspect_daily_reward_status(PDO $pdo, array $user): array {
  $uid = (int)($user['id'] ?? 0);
  if ($uid <= 0) {
    throw new InvalidArgumentException('Invalid user id.');
  }
  $state = snapshift_daily_reward_state_resolve($pdo, $uid, null, true);

  return [
    'uid' => $uid,
    'username' => trim((string)($user['username'] ?? '')),
    'email' => trim((string)($user['email'] ?? '')),
  ] + $state;
}




function admin_delete_matching_rows(PDO $pdo, string $table, string $whereSql, array $params = []): int {
  $countSql = 'SELECT COUNT(*) FROM ' . admin_backtick($table) . ' WHERE ' . $whereSql;
  $st = $pdo->prepare($countSql);
  $st->execute($params);
  $count = (int)$st->fetchColumn();
  if ($count > 0) {
    $delSql = 'DELETE FROM ' . admin_backtick($table) . ' WHERE ' . $whereSql;
    $pdo->prepare($delSql)->execute($params);
  }
  return $count;
}

function admin_table_exists_in_schema(array $schema, string $table): bool {
  return array_key_exists($table, $schema);
}

function admin_table_has_gameplay_signature(string $table): bool {
  $lower = strtolower($table);
  foreach (['result','history','progress','completion','attempt','score','medal','award','state','unlock','reward','claim','visit','streak','daily','leaderboard','rating'] as $needle) {
    if (str_contains($lower, $needle)) return true;
  }
  return false;
}

function admin_reset_user_game_data(PDO $pdo, array $user): array {
  $uid = (int)($user['id'] ?? 0);
  if ($uid <= 0) {
    throw new InvalidArgumentException('Invalid user id.');
  }

  $username = trim((string)($user['username'] ?? ''));
  $email = trim((string)($user['email'] ?? ''));
  $schema = admin_schema($pdo);

  $report = [
    'uid' => $uid,
    'username' => $username,
    'email' => $email,
    'user_state_reset' => false,
    'user_row_updated' => false,
    'tables_deleted' => [],
    'tables_updated' => [],
    'total_deleted_rows' => 0,
  ];

  admin_ensure_user_state($pdo, $uid);

  $pdo->beginTransaction();
  try {
    $pdo->prepare("UPDATE user_state SET points = 0, unlocked_json = '{}' WHERE user_id=?")->execute([$uid]);
    $report['user_state_reset'] = true;

    if (admin_table_exists_in_schema($schema, 'users')) {
      $userCols = $schema['users'];
      $setSql = [];
      if (in_array('last_login_at', $userCols, true)) {
        $setSql[] = '`last_login_at` = NULL';
      }
      if (in_array('updated_at', $userCols, true)) {
        $setSql[] = '`updated_at` = CURRENT_TIMESTAMP()';
      }
      if ($setSql) {
        $sql = 'UPDATE `users` SET ' . implode(', ', $setSql) . ' WHERE `id` = ? LIMIT 1';
        $pdo->prepare($sql)->execute([$uid]);
        $report['user_row_updated'] = true;
        $report['tables_updated']['users'] = 1;
      }
    }

    $deleteByUserId = [
      'admin_reward_test_log',
      'auth_remember_tokens',
      'daily_reward_claims',
      'email_verification_tokens',
      'password_reset_tokens',
      'streak_reward_claims',
      'user_daily_done',
      'user_puzzle_progress',
      'site_visits',
    ];

    foreach ($deleteByUserId as $table) {
      if (!admin_table_exists_in_schema($schema, $table)) continue;
      $count = admin_delete_matching_rows($pdo, $table, '`user_id` = ?', [$uid]);
      if ($count > 0) {
        $report['tables_deleted'][$table] = $count;
        $report['total_deleted_rows'] += $count;
      }
    }

    if (admin_table_exists_in_schema($schema, 'leaderboard_daily')) {
      $lbCols = $schema['leaderboard_daily'];
      $clauses = [];
      $params = [];
      if (in_array('user_id', $lbCols, true)) {
        $clauses[] = '`user_id` = ?';
        $params[] = $uid;
      }
      if ($username !== '' && in_array('username', $lbCols, true)) {
        $clauses[] = '`username` = ?';
        $params[] = $username;
      }
      if ($clauses) {
        $count = admin_delete_matching_rows($pdo, 'leaderboard_daily', implode(' OR ', $clauses), $params);
        if ($count > 0) {
          $report['tables_deleted']['leaderboard_daily'] = $count;
          $report['total_deleted_rows'] += $count;
        }
      }
    }

    if ($email !== '' && admin_table_exists_in_schema($schema, 'login_attempts')) {
      $count = admin_delete_matching_rows($pdo, 'login_attempts', '`email` = ?', [$email]);
      if ($count > 0) {
        $report['tables_deleted']['login_attempts'] = $count;
        $report['total_deleted_rows'] += $count;
      }
    }

    $pdo->commit();
    return $report;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }
}

function admin_delete_user_account(PDO $pdo, array $user): array {
  $uid = (int)($user['id'] ?? 0);
  if ($uid <= 0) {
    throw new InvalidArgumentException('Invalid user id.');
  }

  $username = trim((string)($user['username'] ?? ''));
  $email = trim((string)($user['email'] ?? ''));
  $schema = admin_schema($pdo);

  $report = [
    'uid' => $uid,
    'username' => $username,
    'email' => $email,
    'account_deleted' => false,
    'tables_deleted' => [],
    'total_deleted_rows' => 0,
  ];

  $pdo->beginTransaction();
  try {
    $deleteByUserId = [
      'admin_reward_test_log',
      'auth_remember_tokens',
      'daily_reward_claims',
      'email_verification_tokens',
      'password_reset_tokens',
      'streak_reward_claims',
      'user_daily_done',
      'user_puzzle_progress',
      'site_visits',
      'user_state',
    ];

    foreach ($deleteByUserId as $table) {
      if (!admin_table_exists_in_schema($schema, $table)) continue;
      $count = admin_delete_matching_rows($pdo, $table, '`user_id` = ?', [$uid]);
      if ($count > 0) {
        $report['tables_deleted'][$table] = $count;
        $report['total_deleted_rows'] += $count;
      }
    }

    if (admin_table_exists_in_schema($schema, 'leaderboard_daily')) {
      $lbCols = $schema['leaderboard_daily'];
      $clauses = [];
      $params = [];
      if (in_array('user_id', $lbCols, true)) {
        $clauses[] = '`user_id` = ?';
        $params[] = $uid;
      }
      if ($username !== '' && in_array('username', $lbCols, true)) {
        $clauses[] = '`username` = ?';
        $params[] = $username;
      }
      if ($clauses) {
        $count = admin_delete_matching_rows($pdo, 'leaderboard_daily', implode(' OR ', $clauses), $params);
        if ($count > 0) {
          $report['tables_deleted']['leaderboard_daily'] = $count;
          $report['total_deleted_rows'] += $count;
        }
      }
    }

    if ($email !== '' && admin_table_exists_in_schema($schema, 'login_attempts')) {
      $count = admin_delete_matching_rows($pdo, 'login_attempts', '`email` = ?', [$email]);
      if ($count > 0) {
        $report['tables_deleted']['login_attempts'] = $count;
        $report['total_deleted_rows'] += $count;
      }
    }

    if (admin_table_exists_in_schema($schema, 'users')) {
      $count = admin_delete_matching_rows($pdo, 'users', '`id` = ?', [$uid]);
      if ($count > 0) {
        $report['tables_deleted']['users'] = $count;
        $report['total_deleted_rows'] += $count;
        $report['account_deleted'] = true;
      }
    }

    $pdo->commit();
    return $report;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }
}



if (($_GET['ajax'] ?? '') === 'grant_points') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $identifier = trim((string)($data['user'] ?? ''));
    $deltaRaw = $data['delta'] ?? null;

    if ($identifier === '' || $deltaRaw === null) {
      admin_json(['ok' => false, 'error' => 'user_and_delta_required'], 400);
    }
    if (!is_numeric($deltaRaw)) {
      admin_json(['ok' => false, 'error' => 'delta_must_be_number'], 400);
    }

    $delta = (int)$deltaRaw;
    if ($delta == 0) {
      admin_json(['ok' => false, 'error' => 'delta_nonzero_required'], 400);
    }

    $user = admin_resolve_user($pdo, $identifier);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $uid = (int)($user['id'] ?? 0);
    admin_ensure_user_state($pdo, $uid);
    $pdo->prepare("UPDATE user_state SET points = GREATEST(0, points + ?) WHERE user_id=?")->execute([$delta, $uid]);
    $state = admin_fetch_user_state($pdo, $uid);

    admin_json([
      'ok' => true,
      'uid' => $uid,
      'username' => (string)($user['username'] ?? ''),
      'email' => (string)($user['email'] ?? ''),
      'delta' => $delta,
      'points' => (int)$state['points'],
    ]);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'repair_daily_reward_points') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    if ($term === '') {
      admin_json(['ok' => false, 'error' => 'user_required'], 400);
    }

    $user = admin_resolve_user($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $report = admin_repair_daily_reward_points($pdo, $user);
    admin_json(['ok' => true] + $report);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'inspect_daily_reward_status') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    if ($term === '') {
      admin_json(['ok' => false, 'error' => 'user_required'], 400);
    }

    $user = admin_resolve_user($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $report = admin_inspect_daily_reward_status($pdo, $user);
    admin_json(['ok' => true] + $report);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'reopen_premature_daily_claim') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    $day = trim((string)($data['day'] ?? ''));
    $reversePoints = !empty($data['reverse_points']);
    if ($term === '') {
      admin_json(['ok' => false, 'error' => 'user_required'], 400);
    }
    if (!pq_day_valid($day)) {
      admin_json(['ok' => false, 'error' => 'valid_day_required'], 400);
    }

    $user = admin_resolve_user($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $report = admin_reopen_premature_daily_claim($pdo, $user, $day, $reversePoints);
    admin_json(['ok' => true] + $report);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'user_lookup') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    if ($term === '') {
      admin_json(['ok' => false, 'error' => 'user_required'], 400);
    }

    $user = admin_resolve_user_for_delete($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $uid = (int)($user['id'] ?? 0);
    $state = admin_fetch_user_state($pdo, $uid);

    $visits = [];
    $visitsScope = 'site-wide';
    $hasUserIdCol = false;
    try {
      $schema = admin_schema($pdo);
      if (!empty($schema['site_visits'])) {
        $cols = $schema['site_visits'];
        $createdCol = admin_pick_col($cols, ['created_at', 'visited_at', 'created', 'ts', 'timestamp']);
        $pageCol = admin_pick_col($cols, ['page', 'path', 'url', 'route']);
        $refCol = admin_pick_col($cols, ['referrer', 'referer', 'ref_domain', 'referrer_domain']);
        $userIdCol = admin_pick_col($cols, ['user_id']);
        if ($createdCol && $pageCol) {
          if ($userIdCol) {
            $hasUserIdCol = true;
            $visitsScope = 'per-user';
            $sql = "SELECT `{$pageCol}` AS page, " . ($refCol ? "`{$refCol}`" : "''") . " AS referrer, `{$createdCol}` AS created_at FROM `site_visits` WHERE `{$userIdCol}`=? ORDER BY `{$createdCol}` DESC LIMIT 20";
            $st = $pdo->prepare($sql);
            $st->execute([$uid]);
            $visits = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
          } else {
            $sql = "SELECT `{$pageCol}` AS page, " . ($refCol ? "`{$refCol}`" : "''") . " AS referrer, `{$createdCol}` AS created_at FROM `site_visits` ORDER BY `{$createdCol}` DESC LIMIT 10";
            $st = $pdo->query($sql);
            $visits = $st ? ($st->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
          }
        }
      }
    } catch (Throwable $e) {
      $visits = [];
    }

    admin_json([
      'ok' => true,
      'user' => [
        'id' => $uid,
        'username' => (string)($user['username'] ?? ''),
        'email' => (string)($user['email'] ?? ''),
        'created_at' => $user['created_at'] ?? null,
      ],
      'points' => (int)$state['points'],
      'unlocked' => $state['unlocked'],
      'visits_scope' => $visitsScope,
      'has_user_id_column' => $hasUserIdCol,
      'recent_visits' => $visits,
    ]);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'streak_reward_test') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    $milestone = (int)($data['milestone'] ?? 0);
    $rewardMap = [7 => 250, 14 => 1000, 30 => 2500];

    if ($term === '' || !isset($rewardMap[$milestone])) {
      admin_json(['ok' => false, 'error' => 'bad_request'], 400);
    }

    $user = admin_resolve_user($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $uid = (int)($user['id'] ?? 0);
    $reward = (int)$rewardMap[$milestone];

    admin_ensure_user_state($pdo, $uid);

    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_reward_test_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      admin_session_id VARCHAR(128) NOT NULL DEFAULT '',
      user_id BIGINT UNSIGNED NOT NULL,
      milestone INT NOT NULL,
      reward_points INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user (user_id),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->beginTransaction();
    try {
      $pdo->prepare("UPDATE user_state SET points = GREATEST(0, points + ?) WHERE user_id=?")->execute([$reward, $uid]);
      $pdo->prepare("INSERT INTO admin_reward_test_log (admin_session_id, user_id, milestone, reward_points) VALUES (?,?,?,?)")
          ->execute([session_id(), $uid, $milestone, $reward]);
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }

    $state = admin_fetch_user_state($pdo, $uid);
    admin_json([
      'ok' => true,
      'admin_test' => true,
      'uid' => $uid,
      'username' => (string)($user['username'] ?? ''),
      'email' => (string)($user['email'] ?? ''),
      'milestone' => $milestone,
      'reward' => $reward,
      'points' => (int)$state['points'],
      'note' => 'Test reward granted only. Real streak claims are untouched.',
    ]);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'reset_user_data') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    $confirm = strtoupper(trim((string)($data['confirm'] ?? '')));
    if ($term === '') {
      admin_json(['ok' => false, 'error' => 'user_required'], 400);
    }
    if ($confirm !== 'RESET') {
      admin_json(['ok' => false, 'error' => 'confirm_reset_required'], 400);
    }

    $user = admin_resolve_user($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $report = admin_reset_user_game_data($pdo, $user);
    admin_json(['ok' => true] + $report);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

if (($_GET['ajax'] ?? '') === 'delete_user_account') {
  $data = admin_read_json_body();
  admin_require_ajax_auth();
  admin_require_ajax_csrf($data);

  try {
    $pdo = admin_pdo();
    $term = trim((string)($data['user'] ?? ''));
    $confirm = strtoupper(trim((string)($data['confirm'] ?? '')));
    if ($term === '') {
      admin_json(['ok' => false, 'error' => 'user_required'], 400);
    }
    if ($confirm !== 'DELETE') {
      admin_json(['ok' => false, 'error' => 'confirm_delete_required'], 400);
    }

    $user = admin_resolve_user($pdo, $term);
    if (!$user) {
      admin_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $report = admin_delete_user_account($pdo, $user);
    admin_json(['ok' => true] + $report);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}


if (($_GET['ajax'] ?? '') === 'visitor_stats') {
  admin_require_ajax_auth();
  try {
    $pdo = admin_pdo();
    admin_json(admin_visit_stats($pdo));
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}


if (is_authed() && ($_GET['ajax'] ?? '') === 'medal_report') {

  try {
    $pdo = admin_pdo();
    $userTerm = (string)($_GET['user'] ?? '');
    $puzzleTerm = (string)($_GET['puzzle'] ?? '');
    $limit = (int)($_GET['limit'] ?? 150);
    $report = admin_medal_report($pdo, $userTerm, $puzzleTerm, $limit);
    admin_json(['ok' => true] + $report);
  } catch (InvalidArgumentException $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 400);
  } catch (Throwable $e) {
    admin_json(['ok' => false, 'error' => $e->getMessage()], 500);
  }
}

$msg = '';
$out = '';
$resetOut = '';
$deleteOut = '';

$theme = read_theme();
$stats = manifest_stats();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  require_post_csrf();

  $action = $_POST['action'] ?? '';

  if ($action === 'login') {
    $u = (string)($_POST['user'] ?? '');
    $p = (string)($_POST['pass'] ?? '');
    if (admin_login_is_locked()) {
      $msg = 'Login temporarily locked. Try again in ' . ceil(admin_login_lock_remaining() / 60) . ' minutes.';
    } elseif ($u === admin_user_value() && password_verify($p, admin_password_hash_value())) {
      $_SESSION['authed'] = true;
      $_SESSION['admin'] = true;
      session_regenerate_id(true);
      admin_clear_login_failures();
      $msg = "Logged in.";
    } else {
      admin_record_login_failure();
      $msg = "Login failed.";
    }
  } elseif ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    header("Location: admin.php");
    exit;
  } else {
    if (!is_authed()) {
      http_response_code(401);
      echo "Unauthorized";
      exit;
    }

    if ($action === 'reset_user_data_direct') {
      try {
        $pdo = admin_pdo();
        $term = trim((string)($_POST['user'] ?? ''));
        $confirm = strtoupper(trim((string)($_POST['confirm'] ?? '')));
        if ($term === '') {
          $msg = 'Reset failed.';
          $resetOut = 'Error: user_required';
          $out = $resetOut;
        } elseif ($confirm !== 'RESET') {
          $msg = 'Reset failed.';
          $resetOut = 'Error: confirm_reset_required';
          $out = $resetOut;
        } else {
          $user = admin_resolve_user($pdo, $term);
          if (!$user) {
            $msg = 'Reset failed.';
            $resetOut = 'Error: user_not_found';
          $out = $resetOut;
          } else {
            $report = admin_reset_user_game_data($pdo, $user);
            $lines = [
              'RESET COMPLETE',
              sprintf('User: %s%s', (string)($report['username'] ?? ''), !empty($report['email']) ? ' (' . (string)$report['email'] . ')' : ''),
              sprintf('UID: %s', (string)($report['uid'] ?? '')),
              sprintf('user_state reset: %s', !empty($report['user_state_reset']) ? 'yes' : 'no'),
              sprintf('user row updated: %s', !empty($report['user_row_updated']) ? 'yes' : 'no'),
              sprintf('Rows deleted: %d', (int)($report['total_deleted_rows'] ?? 0)),
              ''
            ];
            $tables = is_array($report['tables_deleted'] ?? null) ? $report['tables_deleted'] : [];
            if ($tables) {
              $lines[] = 'Deleted rows by table:';
              foreach ($tables as $row) {
                $lines[] = '- ' . (string)($row['table'] ?? '?') . ': ' . (int)($row['rows'] ?? 0);
              }
            } else {
              $lines[] = 'No matching gameplay rows were found to delete.';
            }
            $msg = 'User reset complete.';
            $resetOut = implode("
", $lines);
            $out = $resetOut;
          }
        }
      } catch (Throwable $e) {
        $msg = 'Reset failed.';
        $out = 'Error: ' . $e->getMessage();
      }
    }

    if ($action === 'delete_user_account_direct') {
      try {
        $pdo = admin_pdo();
        $term = trim((string)($_POST['user'] ?? ''));
        $confirm = strtoupper(trim((string)($_POST['confirm'] ?? '')));
        if ($term === '') {
          $msg = 'Delete failed.';
          $deleteOut = 'Error: user_required';
          $out = $deleteOut;
        } elseif ($confirm !== 'DELETE') {
          $msg = 'Delete failed.';
          $deleteOut = 'Error: confirm_delete_required';
          $out = $deleteOut;
        } else {
          $user = admin_resolve_user($pdo, $term);
          if (!$user) {
            $msg = 'Delete failed.';
            $deleteOut = 'Error: user_not_found';
          $out = $deleteOut;
          } else {
            $report = admin_delete_user_account($pdo, $user);
            $displayName = trim((string)($report['username'] ?? ''));
            $displayEmail = trim((string)($report['email'] ?? ''));
            $isOrphanOnly = !empty($user['orphan_only']);
            if ($displayName === '' && !empty($report['uid'])) {
              $displayName = 'User ' . (int)$report['uid'];
            }
            $userLine = 'User: ' . $displayName;
            if ($displayEmail !== '') {
              $userLine .= ' (' . $displayEmail . ')';
            }
            if ($isOrphanOnly) {
              $userLine .= ' [orphan cleanup]';
            }
            $lines = [
              'DELETE COMPLETE',
              $userLine,
              sprintf('UID: %s', (string)($report['uid'] ?? '')),
              sprintf('Account deleted: %s', !empty($report['account_deleted']) ? 'yes' : 'no'),
              sprintf('Rows deleted: %d', (int)($report['total_deleted_rows'] ?? 0)),
              ''
            ];
            $tables = is_array($report['tables_deleted'] ?? null) ? $report['tables_deleted'] : [];
            if ($tables) {
              $lines[] = 'Deleted rows by table:';
              foreach ($tables as $tableName => $rowCount) {
                $lines[] = '- ' . (string)$tableName . ': ' . (int)$rowCount;
              }
            } else {
              $lines[] = 'No matching rows were found to delete.';
            }
            $msg = 'User delete complete.';
            $deleteOut = implode("
", $lines);
            $out = $deleteOut;
          }
        }
      } catch (Throwable $e) {
        $msg = 'Delete failed.';
        $out = 'Error: ' . $e->getMessage();
      }
    }

    if ($action === 'reset_theme') {
      if (reset_theme_defaults()) {
        $theme = read_theme();
        $msg = "Theme reset to defaults.";
      } else {
        $msg = "Failed to reset theme.json (check permissions).";
      }
    }

    if ($action === 'run_build') {
      $r = run_build_index();
      $msg = $r["ok"] ? "Main catalog build completed." : "Main catalog build failed.";
      $out = $r["out"];
      $stats = manifest_stats();
    }

    if ($action === 'run_build_daily') {
      $r = run_build_daily_index();
      $msg = $r["ok"] ? "Daily catalog build completed." : "Daily catalog build failed.";
      $out = $r["out"];
      $stats = manifest_stats();
    }

    if ($action === 'run_build_all') {
      $r = run_build_all_catalogs();
      $msg = $r["ok"] ? "Main + Daily catalog builds completed." : "One or more catalog builds failed.";
      $out = $r["out"];
      $stats = manifest_stats();
    }

    if ($action === 'save_theme') {
      $themeEnabled = isset($_POST['themeEnabled']);
      $alphaPct = (float)($_POST['themeAlphaPct'] ?? 85);
      $bg = trim((string)($_POST['backgroundImage'] ?? 'jungle_background.png'));
      $frog = trim((string)($_POST['frogImage'] ?? 'red_eyed_frog.png'));
      $siteBackgroundColor = trim((string)($_POST['siteBackgroundColor'] ?? '#0B1220'));
      $panelBackgroundColor = trim((string)($_POST['panelBackgroundColor'] ?? '#0F172A'));
      $sectionBackgroundColor = trim((string)($_POST['sectionBackgroundColor'] ?? '#111B2D'));
      $cardBackgroundColor = trim((string)($_POST['cardBackgroundColor'] ?? '#1A2740'));
      $borderColor = trim((string)($_POST['borderColor'] ?? '#2A3952'));
      $textColor = trim((string)($_POST['textColor'] ?? '#E8EEF7'));
      $mutedTextColor = trim((string)($_POST['mutedTextColor'] ?? '#AFC2E0'));
      $accentColor = trim((string)($_POST['accentColor'] ?? '#36CFC9'));
      $accentSecondaryColor = trim((string)($_POST['accentSecondaryColor'] ?? '#7CC4FF'));
      $buttonBackgroundColor = trim((string)($_POST['buttonBackgroundColor'] ?? '#16335D'));
      $buttonTextColor = trim((string)($_POST['buttonTextColor'] ?? '#E8EEF7'));
      $pillBackgroundColor = trim((string)($_POST['pillBackgroundColor'] ?? '#142848'));
      $pillTextColor = trim((string)($_POST['pillTextColor'] ?? '#E8EEF7'));
      $fontFamily = trim((string)($_POST['fontFamily'] ?? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'));
      $headingFontFamily = trim((string)($_POST['headingFontFamily'] ?? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'));
      $contentMaxWidth = trim((string)($_POST['contentMaxWidth'] ?? '1180px'));
      $shellPadding = trim((string)($_POST['shellPadding'] ?? '18px'));
      $panelRadius = trim((string)($_POST['panelRadius'] ?? '18px'));
      $cardRadius = trim((string)($_POST['cardRadius'] ?? '16px'));
      $buttonRadius = trim((string)($_POST['buttonRadius'] ?? '999px'));
      $pillRadius = trim((string)($_POST['pillRadius'] ?? '999px'));
      $panelBlurPx = trim((string)($_POST['panelBlurPx'] ?? '10px'));
      $topbarHeight = trim((string)($_POST['topbarHeight'] ?? '64px'));
      $sectionGap = trim((string)($_POST['sectionGap'] ?? '12px'));
      $shopBannerEnabled = ((string)($_POST['shopBannerEnabled'] ?? '0')) === '1';
      $shopBannerImage = normalize_theme_asset_path((string)($_POST['shopBannerImage'] ?? '/98bannerads12/Banner1.png'));
      $shopBannerHref = trim((string)($_POST['shopBannerHref'] ?? '/shop.html'));
      $shopBannerAlt = trim((string)($_POST['shopBannerAlt'] ?? 'Snapshift Swag Shop banner'));
      $categoryShopBannerEnabled = ((string)($_POST['categoryShopBannerEnabled'] ?? '0')) === '1';
      $categoryShopBannerImage = normalize_theme_asset_path((string)($_POST['categoryShopBannerImage'] ?? '/98bannerads12/Banner1.png'));
      $categoryShopBannerHref = trim((string)($_POST['categoryShopBannerHref'] ?? '/shop.html'));
      $categoryShopBannerAlt = trim((string)($_POST['categoryShopBannerAlt'] ?? 'Snapshift category shop banner'));

      $theme = array_merge(read_theme(), [
        "themeEnabled" => $themeEnabled,
        "themeAlpha" => max(0.0, min(1.0, $alphaPct / 100.0)),
        "backgroundImage" => $bg,
        "frogImage" => $frog,
        "siteBackgroundColor" => $siteBackgroundColor,
        "panelBackgroundColor" => $panelBackgroundColor,
        "sectionBackgroundColor" => $sectionBackgroundColor,
        "cardBackgroundColor" => $cardBackgroundColor,
        "borderColor" => $borderColor,
        "textColor" => $textColor,
        "mutedTextColor" => $mutedTextColor,
        "accentColor" => $accentColor,
        "accentSecondaryColor" => $accentSecondaryColor,
        "buttonBackgroundColor" => $buttonBackgroundColor,
        "buttonTextColor" => $buttonTextColor,
        "pillBackgroundColor" => $pillBackgroundColor,
        "pillTextColor" => $pillTextColor,
        "fontFamily" => $fontFamily,
        "headingFontFamily" => $headingFontFamily,
        "contentMaxWidth" => $contentMaxWidth,
        "shellPadding" => $shellPadding,
        "panelRadius" => $panelRadius,
        "cardRadius" => $cardRadius,
        "buttonRadius" => $buttonRadius,
        "pillRadius" => $pillRadius,
        "panelBlurPx" => $panelBlurPx,
        "topbarHeight" => $topbarHeight,
        "sectionGap" => $sectionGap,
        "shopBannerEnabled" => $shopBannerEnabled,
        "shopBannerImage" => $shopBannerImage,
        "shopBannerHref" => $shopBannerHref,
        "shopBannerAlt" => $shopBannerAlt,
        "categoryShopBannerEnabled" => $categoryShopBannerEnabled,
        "categoryShopBannerImage" => $categoryShopBannerImage,
        "categoryShopBannerHref" => $categoryShopBannerHref,
        "categoryShopBannerAlt" => $categoryShopBannerAlt
      ]);

      if (write_theme($theme)) {
        $theme = read_theme();
        $msg = "Theme saved.";
      } else {
        $msg = "Failed to save theme.json (check permissions).";
      }
    }

    if ($action === 'save_growth') {
      $theme = array_merge(read_theme(), [
        "archiveEnabled" => isset($_POST['archiveEnabled']),
        "archiveIntroTitle" => trim((string)($_POST['archiveIntroTitle'] ?? 'Daily Puzzle Archive')),
        "archiveIntroText" => trim((string)($_POST['archiveIntroText'] ?? 'Browse past daily challenges and replay your favorites.')),
        "archiveCtaText" => trim((string)($_POST['archiveCtaText'] ?? "Play Today's Puzzle")),
        "shareResultEnabled" => isset($_POST['shareResultEnabled']),
        "shareResultTemplate" => trim((string)($_POST['shareResultTemplate'] ?? "I solved today's Snapshift in {time} with {score} points.")),
        "returnHookText" => trim((string)($_POST['returnHookText'] ?? 'Return tomorrow to keep your streak alive.')),
        "installPromptEnabled" => isset($_POST['installPromptEnabled']),
        "installPromptText" => trim((string)($_POST['installPromptText'] ?? 'Install Snapshift for faster daily play.')),
        "reminderCtaEnabled" => isset($_POST['reminderCtaEnabled']),
        "reminderCtaText" => trim((string)($_POST['reminderCtaText'] ?? 'Want a daily reminder?')),
        "featuredCategoryName" => trim((string)($_POST['featuredCategoryName'] ?? '')),
        "featuredCategoryHref" => trim((string)($_POST['featuredCategoryHref'] ?? '')),
      ]);

      if (write_theme($theme)) {
        $theme = read_theme();
        $msg = "Growth + archive settings saved.";
      } else {
        $msg = "Failed to save growth settings to theme.json (check permissions).";
      }
    }

    if ($action === 'run_build_daily_archive') {
      $r = run_build_daily_archive();
      $msg = $r["ok"] ? "Daily archive build completed." : "Daily archive build failed.";
      $out = $r["out"];
      $stats = manifest_stats();
    }

    if ($action === 'refresh') {
      $theme = read_theme();
      $stats = manifest_stats();
      $msg = "Refreshed.";
    }
  }
}

$healthFiles = app_file_statuses();
$linkGroups = admin_link_groups();
$themeLinkAudit = admin_theme_link_audit($theme);
$missingHealthFiles = array_values(array_filter($healthFiles, static fn($row) => empty($row['exists'])));
$themeAuditIssues = array_values(array_filter($themeLinkAudit, static fn($row) => in_array($row['status'], ['missing', 'invalid'], true)));
$systemWarnings = [];
if (!$stats['ok']) {
  $systemWarnings[] = (string)($stats['msg'] ?? 'Catalog stats could not be read.');
}
if ($missingHealthFiles) {
  $systemWarnings[] = count($missingHealthFiles) . ' core file(s) are missing from the resolved app root.';
}
if ($themeAuditIssues) {
  $systemWarnings[] = count($themeAuditIssues) . ' theme-linked asset or route reference(s) need attention.';
}
if (!file_exists(app_path('daily_puzzles/history.json'))) {
  $systemWarnings[] = 'Daily history.json is missing, so archive and homepage daily references may be stale.';
}
if (!file_exists(app_path('daily-archive.html'))) {
  $systemWarnings[] = 'daily-archive.html is missing from the public site.';
}

$csrf = ensure_csrf();
$ip = client_ip();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>PuzzleQuest Admin</title>
  <style>
    :root{
      color-scheme: dark;
      --bg:#0b0f14;
      --bg2:#101827;
      --card:rgba(15,23,42,0.82);
      --card-2:rgba(18,28,48,0.88);
      --line:rgba(72,98,140,0.38);
      --line-soft:rgba(255,255,255,0.08);
      --text:#e8eef7;
      --muted:#aebbd2;
      --pill:#0f1a2b;
      --accent:#6ea8ff;
      --success:#7CFFB2;
      --warn:#FFD37C;
      --danger:#ff7c9a;
      --shadow:0 18px 48px rgba(0,0,0,0.28);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    *{ box-sizing:border-box; }
    html{ scroll-behavior:smooth; }
    body{
      margin:0;
      color:var(--text);
      background:
        radial-gradient(1200px 520px at 20% -10%, rgba(54,91,166,0.18), transparent 58%),
        radial-gradient(900px 420px at 100% 0%, rgba(68,123,255,0.10), transparent 55%),
        linear-gradient(180deg, #0b0f14 0%, #0d1320 100%);
    }
    .wrap{ max-width: 1280px; margin: 0 auto; padding: 24px 18px 40px; }
    .hero{
      display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
      margin-bottom:16px;
      padding: 4px 2px 2px;
    }
    .hero h1{ margin:0; font-size: 22px; line-height:1.1; letter-spacing:.2px; }
    .hero p{ margin:6px 0 0; color:var(--muted); font-size:13px; }
    .card{
      background: linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(18,28,48,0.95) 100%);
      border: 1px solid rgba(96,129,186,0.34);
      border-radius: 20px;
      padding: 16px 17px;
      margin: 12px 0;
      box-shadow: 0 18px 48px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.03);
      backdrop-filter: blur(10px);
    }
    .card h2{ margin: 0 0 10px; font-size: 16px; line-height:1.2; }
    .section-note{ margin:0 0 10px; color:var(--muted); font-size:13px; }
    .row{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    label{ font-weight: 800; font-size: 13px; opacity:.94; display:block; margin-bottom: 6px; }
    input[type="text"], input[type="password"], input[type="number"]{
      width: min(520px, 100%);
      background: rgba(9,15,28,0.96);
      border: 1px solid rgba(88,116,163,0.38);
      border-radius: 12px;
      padding: 10px 12px;
      color:var(--text);
      font-weight: 800;
      box-sizing:border-box;
      outline:none;
    }
    input[type="text"]:focus, input[type="password"]:focus, input[type="number"]:focus{
      border-color: rgba(110,168,255,0.60);
      box-shadow: 0 0 0 3px rgba(110,168,255,0.12);
    }
    input[type="range"]{ width: 240px; }
    button{
      background: linear-gradient(180deg, rgba(17,28,47,0.98), rgba(11,18,32,0.98));
      color:var(--text);
      border: 1px solid rgba(88,116,163,0.42);
      border-radius: 12px;
      padding: 10px 12px;
      font-weight: 900;
      cursor:pointer;
      transition: transform .08s ease, filter .18s ease, border-color .18s ease;
    }
    button:hover{ filter:brightness(1.07); border-color: rgba(110,168,255,0.56); }
    button:active{ transform: translateY(1px); }
    a{ color:inherit; text-decoration:none; }
    .pill{
      display:inline-flex; align-items:center; gap:8px;
      padding: 7px 10px; border-radius:999px;
      border: 1px solid rgba(88,116,163,0.34);
      background: rgba(8,14,24,0.48);
      font-weight: 900; font-size: 12px;
    }
    .nav-pills{ display:flex; flex-wrap:wrap; gap:8px; }
    .nav-pills .pill{ padding:8px 11px; }
    .ok{ color:var(--success); }
    .warn{ color:var(--warn); }
    .bad{ color:var(--danger); }
    pre{
      white-space: pre-wrap;
      background: rgba(0,0,0,0.28);
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      padding: 12px;
      overflow:auto;
      max-height: 360px;
    }
    table{ width:100%; border-collapse: collapse; overflow:hidden; border-radius:12px; }
    th, td{ padding: 9px 8px; border-bottom: 1px solid var(--line-soft); font-size: 13px; vertical-align:top; }
    th{ text-align:left; color:#c9d6ea; }
    tbody tr:nth-child(odd){ background: rgba(255,255,255,0.015); }
    .tiny{ color:var(--muted); font-size: 12px; }
    .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .subgrid{
      display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:12px;
    }
    .section-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:16px 0 6px;padding:8px 2px 2px;}
    .section-bar h2{margin:0;font-size:18px;}
    .section-bar .tiny{font-size:12px;}
    .diag-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:14px;align-items:start;}
    .diag-grid > *,.diag-stack,.soft-panel{min-width:0;}
    .diag-stack{display:grid;gap:12px;}
    .action-cluster{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;align-items:flex-start;}
    .soft-panel{background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px;box-sizing:border-box;overflow:hidden;}
    .hc-table-wrap{max-width:100%;overflow:auto;}
    .status-strip{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:flex-start;}
    .status-strip .pill{font-size:12px;white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%;}
    #hcLog{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-width:100%;overflow:auto;box-sizing:border-box;}
    @media (max-width: 1180px){ .diag-grid{grid-template-columns:1fr;} }
    @media (max-width: 860px){
      .hero{ flex-direction:column; }
      .subgrid{ grid-template-columns: 1fr; }
      .wrap{ padding:16px 12px 28px; }
    }
  </style>

<style id="snapshift-admin-build-center-cleanup">
  .dashboard-grid{
    display:grid;
    grid-template-columns:repeat(4, minmax(0, 1fr));
    gap:12px;
    margin-top:14px;
  }
  .stat-card{
    padding:14px;
    border:1px solid rgba(255,255,255,.08);
    border-radius:16px;
    background:rgba(255,255,255,.03);
    min-width:0;
  }
  .stat-card h3{
    margin:0;
    font-size:14px;
  }
  .stat-number{
    margin-top:8px;
    font-size:28px;
    font-weight:900;
    line-height:1;
    letter-spacing:.02em;
  }
  .stat-meta{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin-top:10px;
  }
  .warning-list{
    margin:12px 0 0;
    padding-left:18px;
    color:var(--muted);
  }
  .warning-list li + li{
    margin-top:6px;
  }
  .audit-grid{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:12px;
    margin-top:14px;
  }
  .audit-group-title{
    margin:0 0 10px;
    font-size:14px;
  }
  .audit-table{
    width:100%;
  }
  .audit-table th,
  .audit-table td{
    font-size:12px;
    padding:8px 6px;
  }
  .status-badge{
    display:inline-flex;
    align-items:center;
    padding:4px 8px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.10);
    font-size:11px;
    font-weight:900;
    letter-spacing:.02em;
    text-transform:uppercase;
  }
  .status-badge.ok{
    color:var(--success);
    background:rgba(52, 211, 153, 0.14);
    border-color:rgba(52, 211, 153, 0.24);
  }
  .status-badge.warn{
    color:var(--warn);
    background:rgba(251, 191, 36, 0.14);
    border-color:rgba(251, 191, 36, 0.24);
  }
  .status-badge.bad{
    color:var(--danger);
    background:rgba(239, 68, 68, 0.14);
    border-color:rgba(239, 68, 68, 0.24);
  }
  .status-badge.neutral{
    color:#d6deeb;
    background:rgba(148, 163, 184, 0.14);
    border-color:rgba(148, 163, 184, 0.24);
  }
  #build-control-center .build-grid{
    display:grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap:12px;
    margin-top:14px;
  }
  #build-control-center .build-col{
    padding:14px;
    border:1px solid rgba(255,255,255,.08);
    border-radius:16px;
    background:rgba(255,255,255,.03);
  }
  #build-control-center .build-col h3{
    margin:0 0 8px;
    font-size:16px;
  }
  #build-control-center .build-actions{
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    margin-top:12px;
  }
  #build-control-center .build-actions button,
  #build-control-center .build-actions .pill{
    min-height:40px;
  }
  #build-control-center .build-meta{
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    margin-top:10px;
  }
  #build-control-center .build-output{
    margin-top:14px;
    padding:12px;
    border-radius:14px;
    background:rgba(0,0,0,0.28);
    border:1px solid rgba(255,255,255,.10);
    white-space:pre-wrap;
    min-height:220px;
    max-height:420px;
    overflow:auto;
  }
  @media (max-width: 980px){
    .dashboard-grid,
    .audit-grid,
    #build-control-center .build-grid{
      grid-template-columns:1fr;
    }
  }
</style>

</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1>Snapshift Admin Control Panel</h1>
        <p>Use this page for daily challenge updates, puzzle catalog rebuilds, theme changes, site checks, and user support. The quick-start section below shows the normal run order for each task.</p>
      </div>
      <div class="row">
        <span class="pill">IP: <?=h($ip)?></span>
        <span class="pill">Session: <?= is_authed() ? '<span class="ok">Authed</span>' : '<span class="warn">Guest</span>' ?></span>
      </div>
    </div>

    <?php if ($msg): ?>
      <div class="card"><b>Status:</b> <?=h($msg)?></div>
    <?php endif; ?>

    <?php if (is_authed()): ?>
      <div class="card">
        <div class="nav-pills">
          <a class="pill" href="#admin-overview">Overview</a>
          <a class="pill" href="#core-actions">Build controls</a>
          <a class="pill" href="#link-audit">Link audit</a>
          <a class="pill" href="#theme-settings">Theme / home</a>
          <a class="pill" href="#growth-archive-settings">Archive / copy</a>
          <a class="pill" href="#puzzle-pages">SEO pages</a>
          <a class="pill" href="#cloud-health">Health</a>
          <a class="pill" href="#catalog-stats">Catalog</a>
          <a class="pill" href="#visitor-stats">Visitors</a>
          <a class="pill" href="#client-cleanup">Cleanup</a>
          <a class="pill" href="#user-tools">Users</a>
          <a class="pill" href="#system-health">System</a>
        </div>
      </div>

      <div class="card" id="admin-overview">
        <div class="section-bar">
          <div>
            <h2>Operations Overview</h2>
            <div class="tiny">A faster top-level snapshot for catalog health, daily content, theme-linked assets, and file coverage.</div>
          </div>
          <div class="pill">Resolved root: <span class="mono"><?=h(app_root_dir())?></span></div>
        </div>

        <div class="dashboard-grid">
          <div class="stat-card">
            <h3>Main Catalog</h3>
            <div class="stat-number"><?= $stats['ok'] ? h((string)$stats['total']) : '0' ?></div>
            <div class="tiny">Total indexed puzzles</div>
            <div class="stat-meta">
              <span class="pill">Updated: <span class="mono"><?= $stats['ok'] && !empty($stats['mtime']) ? h(date('Y-m-d H:i', (int)$stats['mtime'])) : 'n/a' ?></span></span>
              <span class="pill">Latest: <b><?=h((string)($stats['latest']['name'] ?? 'n/a'))?></b></span>
            </div>
          </div>

          <div class="stat-card">
            <h3>Daily Content</h3>
            <div class="stat-number"><?= (file_exists(DAILY_MANIFEST_PATH) ? 1 : 0) + (file_exists(app_path('daily_puzzles/history.json')) ? 1 : 0) + (file_exists(app_path('daily-archive.html')) ? 1 : 0) ?>/3</div>
            <div class="tiny">Daily catalog, history, and archive present</div>
            <div class="stat-meta">
              <span class="pill"><?= file_exists(DAILY_MANIFEST_PATH) ? 'Daily catalog ready' : 'Daily catalog missing' ?></span>
              <span class="pill"><?= file_exists(app_path('daily_puzzles/history.json')) ? 'History ready' : 'History missing' ?></span>
              <span class="pill"><?= file_exists(app_path('daily-archive.html')) ? 'Archive ready' : 'Archive missing' ?></span>
            </div>
          </div>

          <div class="stat-card">
            <h3>Theme Links</h3>
            <div class="stat-number"><?= count($themeLinkAudit) - count($themeAuditIssues) ?>/<?=count($themeLinkAudit)?></div>
            <div class="tiny">Theme-linked assets and routes resolved</div>
            <div class="stat-meta">
              <a class="pill" href="#theme-settings">Open theme controls</a>
              <a class="pill" href="#link-audit">Review theme link audit</a>
            </div>
          </div>

          <div class="stat-card">
            <h3>Core File Health</h3>
            <div class="stat-number"><?=count($healthFiles) - count($missingHealthFiles)?>/<?=count($healthFiles)?></div>
            <div class="tiny">Core files detected under the current root</div>
            <div class="stat-meta">
              <a class="pill" href="#cloud-health">Open diagnostics</a>
              <span class="pill">Missing: <b><?=h((string)count($missingHealthFiles))?></b></span>
            </div>
          </div>
        </div>

        <div class="action-cluster">
          <a class="pill" href="<?=h(app_href('index.html'))?>" target="_blank" rel="noreferrer">Open homepage</a>
          <a class="pill" href="<?=h(app_href('daily-archive.html'))?>" target="_blank" rel="noreferrer">Open daily archive</a>
          <a class="pill" href="<?=h(app_href('puzzles/index.json'))?>" target="_blank" rel="noreferrer">Open main catalog</a>
          <a class="pill" href="<?=h(app_href('daily_puzzles/history.json'))?>" target="_blank" rel="noreferrer">Open daily history</a>
          <a class="pill" href="<?=h(app_href('theme.json'))?>" target="_blank" rel="noreferrer">Open theme.json</a>
        </div>

        <?php if ($systemWarnings): ?>
          <ul class="warning-list">
            <?php foreach ($systemWarnings as $warning): ?>
              <li><?=h($warning)?></li>
            <?php endforeach; ?>
          </ul>
        <?php else: ?>
          <div class="tiny" style="margin-top:12px;">No immediate root, catalog, or theme-link issues were detected from the server-side audit.</div>
        <?php endif; ?>
      </div>

      <div class="card" id="link-audit">
        <div class="section-bar">
          <div>
            <h2>Quick Links and Verification</h2>
            <div class="tiny">Direct open links grouped by purpose, plus path verification for theme-driven assets and routes.</div>
          </div>
          <div class="pill">Audit scope: files and internal route targets</div>
        </div>

        <div class="audit-grid">
          <?php foreach ($linkGroups as $group): ?>
            <div class="soft-panel">
              <h3 class="audit-group-title"><?=h((string)$group['group'])?></h3>
              <div class="hc-table-wrap">
                <table class="audit-table">
                  <thead>
                    <tr><th>Link</th><th>Status</th><th>Resolved</th><th>Open</th></tr>
                  </thead>
                  <tbody>
                    <?php foreach (($group['links'] ?? []) as $link): ?>
                      <?php $resolved = app_resolve_existing((array)($link['candidates'] ?? [])); ?>
                      <tr>
                        <td><?=h((string)($link['label'] ?? 'Link'))?></td>
                        <td>
                          <?php if (!empty($resolved['exists'])): ?>
                            <span class="status-badge ok">OK</span>
                          <?php else: ?>
                            <span class="status-badge bad">Missing</span>
                          <?php endif; ?>
                        </td>
                        <td class="mono tiny"><?=h((string)($resolved['display'] ?? ''))?></td>
                        <td><a class="pill" href="<?=h(app_href((string)($resolved['display'] ?? '')))?>" target="_blank" rel="noreferrer">Open</a></td>
                      </tr>
                    <?php endforeach; ?>
                  </tbody>
                </table>
              </div>
            </div>
          <?php endforeach; ?>

          <div class="soft-panel">
            <h3 class="audit-group-title">Theme-driven assets and targets</h3>
            <div class="hc-table-wrap">
              <table class="audit-table">
                <thead>
                  <tr><th>Theme field</th><th>Status</th><th>Resolved</th><th>Open</th></tr>
                </thead>
                <tbody>
                  <?php foreach ($themeLinkAudit as $row): ?>
                    <tr>
                      <td>
                        <div><?=h((string)$row['label'])?></div>
                        <div class="tiny mono"><?=h((string)$row['value'])?></div>
                      </td>
                      <td>
                        <?php if (($row['status'] ?? '') === 'ok'): ?>
                          <span class="status-badge ok">OK</span>
                        <?php elseif (($row['status'] ?? '') === 'external'): ?>
                          <span class="status-badge neutral">External</span>
                        <?php elseif (($row['status'] ?? '') === 'empty'): ?>
                          <span class="status-badge warn">Empty</span>
                        <?php else: ?>
                          <span class="status-badge bad">Needs fix</span>
                        <?php endif; ?>
                      </td>
                      <td class="mono tiny">
                        <?=h((string)($row['resolved'] ?: $row['note']))?>
                      </td>
                      <td>
                        <?php if (!empty($row['href'])): ?>
                          <a class="pill" href="<?=h((string)$row['href'])?>" target="_blank" rel="noreferrer">Open</a>
                        <?php else: ?>
                          <span class="tiny">No link</span>
                        <?php endif; ?>
                      </td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card" id="operator-guide">
        <div class="section-bar">
          <div>
            <h2>Operator Quick Start</h2>
            <div class="tiny">Use these four workflows when handing this page to another operator. They cover the normal tasks without needing to understand every section below.</div>
          </div>
          <div class="pill">Recommended run order</div>
        </div>

        <div class="subgrid">
          <div class="soft-panel">
            <div class="tiny" style="margin-bottom:8px;">Workflow 1</div>
            <h3 style="margin:0 0 8px;">After uploading new Daily Challenge images</h3>
            <div class="section-note" style="margin-bottom:12px;">This updates the daily image pool first, then rebuilds the saved archive/history used by the homepage and daily archive.</div>
            <div class="action-cluster" style="margin-top:0;">
              <form method="post">
                <input type="hidden" name="csrf" value="<?=h($csrf)?>">
                <input type="hidden" name="action" value="run_build_daily">
                <button type="submit">1. Build Daily Catalog</button>
              </form>
              <form method="post">
                <input type="hidden" name="csrf" value="<?=h($csrf)?>">
                <input type="hidden" name="action" value="run_build_daily_archive">
                <button type="submit">2. Rebuild Daily Archive</button>
              </form>
              <a class="pill" href="<?=h(app_href('daily_puzzles/history.json'))?>" target="_blank" rel="noreferrer">Open history.json</a>
              <a class="pill" href="<?=h(app_href('daily-archive.html'))?>" target="_blank" rel="noreferrer">Open Daily Archive</a>
            </div>
          </div>

          <div class="soft-panel">
            <div class="tiny" style="margin-bottom:8px;">Workflow 2</div>
            <h3 style="margin:0 0 8px;">After uploading normal puzzle images</h3>
            <div class="section-note" style="margin-bottom:12px;">This refreshes the main puzzle catalog and thumbnails. If you also want new SEO puzzle pages, run the page builder section after the catalog rebuild finishes.</div>
            <div class="action-cluster" style="margin-top:0;">
              <form method="post">
                <input type="hidden" name="csrf" value="<?=h($csrf)?>">
                <input type="hidden" name="action" value="run_build">
                <button type="submit">Build Main Catalog</button>
              </form>
              <a class="pill" href="#puzzle-pages">Go to SEO Puzzle Pages</a>
              <a class="pill" href="<?=h(app_href('puzzles/index.json'))?>" target="_blank" rel="noreferrer">Open puzzles/index.json</a>
            </div>
          </div>

          <div class="soft-panel">
            <div class="tiny" style="margin-bottom:8px;">Workflow 3</div>
            <h3 style="margin:0 0 8px;">Theme, banners, archive text, and featured messaging</h3>
            <div class="section-note" style="margin-bottom:12px;">Use Theme / Home for visuals. Use Archive / Copy for archive intro text, share copy, reminder text, install copy, and featured category messaging.</div>
            <div class="action-cluster" style="margin-top:0;">
              <a class="pill" href="#theme-settings">Go to Theme / Home</a>
              <a class="pill" href="#growth-archive-settings">Go to Archive / Copy</a>
              <a class="pill" href="<?=h(app_href('index.html'))?>" target="_blank" rel="noreferrer">Open Homepage</a>
            </div>
          </div>

          <div class="soft-panel">
            <div class="tiny" style="margin-bottom:8px;">Workflow 4</div>
            <h3 style="margin:0 0 8px;">Before handing off or after a change</h3>
            <div class="section-note" style="margin-bottom:12px;">Run health checks after uploads, then confirm the live pages load. Use User Tools for support tasks like points or user lookup. Browser Cleanup is for local test devices only.</div>
            <div class="action-cluster" style="margin-top:0;">
              <a class="pill" href="#cloud-health">Go to Health</a>
              <a class="pill" href="#user-tools">Go to User Tools</a>
              <form method="post">
                <input type="hidden" name="csrf" value="<?=h($csrf)?>">
                <input type="hidden" name="action" value="refresh">
                <button type="submit">Refresh Stats</button>
              </form>
            </div>
          </div>
        </div>

        <div class="section-note" style="margin-top:14px;">Daily challenge update order: <b>Build Daily Catalog</b> → <b>Rebuild Daily Archive</b>. Main catalog update order: <b>Build Main Catalog</b> → <b>SEO Puzzle Pages</b> if needed.</div>
      </div>

    <?php endif; ?>

    <?php if (!is_authed()): ?>
      <div class="card">
        <h2>Login</h2>
        <form method="post">
          <input type="hidden" name="csrf" value="<?=h($csrf)?>">
          <input type="hidden" name="action" value="login">
          <div class="row">
            <div>
              <label>Username</label>
              <input type="text" name="user" autocomplete="username" />
            </div>
            <div>
              <label>Password</label>
              <input type="password" name="pass" autocomplete="current-password" />
            </div>
            <div style="align-self:flex-end;">
              <button type="submit">Log in</button>
            </div>
          </div>
          <div class="tiny" style="margin-top:10px;">
            Local-only by default. Set `ADMIN_ENABLED=1` and explicit admin credentials in a non-public override file or environment if you need remote access.
          </div>
        </form>
      </div>
    <?php else: ?>

      
      <div class="card" id="core-actions">
        <div class="section-bar">
          <div>
            <h2>Build Control Center</h2>
            <div class="tiny">All rebuild tools in one place. These buttons use plain form submits, so they still work even if page JavaScript is failing.</div>
          </div>
          <form method="post">
            <input type="hidden" name="csrf" value="<?=h($csrf)?>">
            <input type="hidden" name="action" value="logout">
            <button type="submit">Logout</button>
          </form>
        </div>

        <div class="build-meta">
          <span class="pill">Catalog path: <span class="mono"><?=h(app_path('puzzles/index.json'))?></span></span>
          <span class="pill">Output root: <span class="mono"><?=h(app_root_dir())?></span></span>
          <a class="pill" href="<?=h(app_href('puzzles/index.json'))?>" target="_blank" rel="noreferrer">Open main catalog</a>
          <a class="pill" href="<?=h(app_href('daily_puzzles/index.json'))?>" target="_blank" rel="noreferrer">Open daily catalog</a>
          <a class="pill" href="<?=h(app_href('daily_puzzles/history.json'))?>" target="_blank" rel="noreferrer">Open history.json</a>
          <a class="pill" href="<?=h(app_href('build_puzzle_pages.php'))?>" target="_blank" rel="noreferrer">Open build_puzzle_pages.php</a>
          <a class="pill" href="about:blank" target="buildRunnerFrame">Clear output</a>
        </div>

        <div class="build-grid">
          <div class="build-col">
            <h3>Main puzzle content</h3>
            <div class="section-note">Use after uploading normal puzzle images.</div>
            <div class="build-actions">
              <form method="get" action="<?=h(app_href('puzzles/build_index.php'))?>" target="buildRunnerFrame">
                <button type="submit">Build Main Catalog</button>
              </form>

              <form method="get" action="<?=h(app_href('build_puzzle_pages.php'))?>" target="buildRunnerFrame">
                <input type="hidden" name="catalog" value="/home/dw9pjafc1wez/public_html/puzzles/index.json">
                <input type="hidden" name="out" value="/home/dw9pjafc1wez/public_html">
                <button type="submit">Build Puzzle Pages + Sitemap</button>
              </form>
            </div>
            <div class="tiny" style="margin-top:10px;">Order: <b>Build Main Catalog</b> → <b>Build Puzzle Pages + Sitemap</b></div>
          </div>

          <div class="build-col">
            <h3>Daily challenge content</h3>
            <div class="section-note">Use after uploading Daily Challenge images.</div>
            <div class="build-actions">
              <form method="get" action="<?=h(app_href('daily_puzzles/build_index.php'))?>" target="buildRunnerFrame">
                <button type="submit">Build Daily Catalog</button>
              </form>

              <form method="get" action="<?=h(app_href('build_daily_archive.php'))?>" target="buildRunnerFrame">
                <button type="submit">Rebuild Daily Archive</button>
              </form>
            </div>
            <div class="tiny" style="margin-top:10px;">Order: <b>Build Daily Catalog</b> → <b>Rebuild Daily Archive</b></div>
          </div>

          <div class="build-col">
            <h3>Quick links</h3>
            <div class="section-note">Useful checks while rebuilding.</div>
            <div class="build-actions">
              <a class="pill" href="<?=h(app_href('daily-archive.html'))?>" target="_blank" rel="noreferrer">Open Daily Archive</a>
              <a class="pill" href="<?=h(app_href('sitemap.xml'))?>" target="_blank" rel="noreferrer">Open sitemap.xml</a>
              <a class="pill" href="<?=h(app_href('puzzle/animals/'))?>" target="_blank" rel="noreferrer">Open puzzle/animals/</a>
            </div>
          </div>
        </div>

        <div class="tiny" style="margin-top:12px;">The black panel below is the live output box. Each build button opens its response there directly.</div>

        <div class="build-output" style="padding:0; overflow:hidden;">
          <iframe
            name="buildRunnerFrame"
            title="Build output"
            src="about:blank"
            style="display:block; width:100%; min-height:320px; border:0; background:rgba(0,0,0,0.28); color:#fff;"
          ></iframe>
        </div>
      </div>

      <div class="card" id="theme-settings">
        <h2>Theme + Home Visuals</h2>
        <p class="section-note">Update the shared site theme used by the landing and game views, plus the home-page shop banner image.</p>
        <form method="post">
          <input type="hidden" name="csrf" value="<?=h($csrf)?>">
          <input type="hidden" name="action" value="save_theme">

          <div class="row">
            <div style="min-width:220px;">
              <label>
                <input type="checkbox" name="themeEnabled" <?= !empty($theme["themeEnabled"]) ? "checked" : "" ?>>
                Enable theme
              </label>
            </div>

            <div>
              <label>Theme Strength (0–100)</label>
              <div class="row">
                <input type="range" min="0" max="100" name="themeAlphaPct" value="<?=h((string)round(((float)$theme["themeAlpha"]) * 100))?>">
                <span class="pill"><?=h((string)round(((float)$theme["themeAlpha"]) * 100))?>%</span>
              </div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Page Background Image Path</label>
              <input type="text" name="backgroundImage" value="<?=h((string)$theme["backgroundImage"])?>">
              <div class="tiny">Main page backdrop artwork used behind the site shell. Leave blank to use only the base background color.</div>
            </div>
            <div>
              <label>Bottom-Right Corner Image Path</label>
              <input type="text" name="frogImage" value="<?=h((string)$theme["frogImage"])?>">
              <div class="tiny">Optional mascot or decorative image pinned to the bottom-right corner. Leave blank to hide it site-wide.</div>
            </div>
          </div>

          <div class="row" style="margin-top:14px; align-items:flex-start;">
            <div style="min-width:220px;">
              <input type="hidden" name="shopBannerEnabled" value="0">
              <label>
                <input type="checkbox" name="shopBannerEnabled" value="1" <?= !empty($theme["shopBannerEnabled"]) ? "checked" : "" ?>>
                Enable home shop banner
              </label>
              <div class="tiny" style="margin-top:6px;">Controls the promo banner shown below the Rewards section on the home page.</div>
            </div>
            <div>
              <label>Banner Image Path</label>
              <input type="text" name="shopBannerImage" value="<?=h((string)($theme["shopBannerImage"] ?? "/98bannerads12/Banner1.png"))?>">
              <div class="tiny">Example: <b>/98bannerads12/Banner1.png</b> or <b>assets/banners/shop-banner.webp</b></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Banner Click URL</label>
              <input type="text" name="shopBannerHref" value="<?=h((string)($theme["shopBannerHref"] ?? "/shop.html"))?>">
              <div class="tiny">Example: <b>/shop.html</b> or any internal promo page.</div>
            </div>
            <div>
              <label>Banner Alt Text</label>
              <input type="text" name="shopBannerAlt" value="<?=h((string)($theme["shopBannerAlt"] ?? "Snapshift Swag Shop banner"))?>">
              <div class="tiny">Accessibility text for the banner image.</div>
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div style="flex:1 1 100%;">
              <div class="tiny" style="margin-bottom:6px;">Current Home Banner Preview</div>
              <?php $shopBannerImage = (string)($theme["shopBannerImage"] ?? ""); ?>
              <?php if ($shopBannerImage !== ''): ?>
                <a class="pill" href="<?=h($shopBannerImage)?>" target="_blank" rel="noreferrer" style="margin-bottom:8px; display:inline-flex;">Open current home banner</a>
                <div style="border:1px solid rgba(255,255,255,.08); border-radius:16px; overflow:hidden; background:#0b1220; padding:8px;">
                  <img src="<?=h($shopBannerImage)?>?t=<?=time()?>" alt="Home banner preview" style="display:block; width:100%; height:auto; border-radius:12px;">
                </div>
              <?php else: ?>
                <div class="tiny">No home banner image path set.</div>
              <?php endif; ?>
            </div>
          </div>

          <hr style="border:none; border-top:1px solid rgba(255,255,255,.08); margin:18px 0;">

          <div class="row" style="margin-top:0; align-items:flex-start;">
            <div style="min-width:220px;">
              <input type="hidden" name="categoryShopBannerEnabled" value="0">
              <label>
                <input type="checkbox" name="categoryShopBannerEnabled" value="1" <?= !empty($theme["categoryShopBannerEnabled"]) ? "checked" : "" ?>>
                Enable category shop banner
              </label>
              <div class="tiny" style="margin-top:6px;">Controls the promo banner shown near the bottom of category pages.</div>
            </div>
            <div>
              <label>Category Banner Image Path</label>
              <input type="text" name="categoryShopBannerImage" value="<?=h((string)($theme["categoryShopBannerImage"] ?? "/98bannerads12/Banner1.png"))?>">
              <div class="tiny">Example: <b>/98bannerads12/Banner1.png</b> or <b>assets/banners/category-shop-banner.webp</b></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Category Banner Click URL</label>
              <input type="text" name="categoryShopBannerHref" value="<?=h((string)($theme["categoryShopBannerHref"] ?? "/shop.html"))?>">
              <div class="tiny">Example: <b>/shop.html</b> or any internal promo page.</div>
            </div>
            <div>
              <label>Category Banner Alt Text</label>
              <input type="text" name="categoryShopBannerAlt" value="<?=h((string)($theme["categoryShopBannerAlt"] ?? "Snapshift category shop banner"))?>">
              <div class="tiny">Accessibility text for the category banner image.</div>
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div style="flex:1 1 100%;">
              <div class="tiny" style="margin-bottom:6px;">Current Category Banner Preview</div>
              <?php $categoryShopBannerImage = (string)($theme["categoryShopBannerImage"] ?? ""); ?>
              <?php if ($categoryShopBannerImage !== ''): ?>
                <a class="pill" href="<?=h($categoryShopBannerImage)?>" target="_blank" rel="noreferrer" style="margin-bottom:8px; display:inline-flex;">Open current category banner</a>
                <div style="border:1px solid rgba(255,255,255,.08); border-radius:16px; overflow:hidden; background:#0b1220; padding:8px;">
                  <img src="<?=h($categoryShopBannerImage)?>?t=<?=time()?>" alt="Category banner preview" style="display:block; width:100%; height:auto; border-radius:12px;">
                </div>
              <?php else: ?>
                <div class="tiny">No category banner image path set.</div>
              <?php endif; ?>
            </div>
          </div>

          <div class="row" style="margin-top:12px;">
            <div class="section-note">After changing banner toggles or banner image paths, use this save button before leaving the Theme section.</div>
            <button type="submit">Save Banner Settings</button>
          </div>

          <hr style="border:none; border-top:1px solid rgba(255,255,255,.08); margin:18px 0;">

          <h3 style="margin:0 0 8px;">Color + Font Styling Tokens</h3>
          <div class="section-note" style="margin-bottom:12px;">These settings are saved in <span class="mono">theme.json</span> so your page templates can read shared colors and fonts from one place.</div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Page Base Background Color</label>
              <input type="color" name="siteBackgroundColor" value="<?=h((string)($theme["siteBackgroundColor"] ?? "#0B1220"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Large Panel Background</label>
              <input type="color" name="panelBackgroundColor" value="<?=h((string)($theme["panelBackgroundColor"] ?? "#0F172A"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Section Surface Background</label>
              <input type="color" name="sectionBackgroundColor" value="<?=h((string)($theme["sectionBackgroundColor"] ?? "#111B2D"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Card / Tile Background</label>
              <input type="color" name="cardBackgroundColor" value="<?=h((string)($theme["cardBackgroundColor"] ?? "#1A2740"))?>" style="height:44px; padding:6px;">
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Border / Outline</label>
              <input type="color" name="borderColor" value="<?=h((string)($theme["borderColor"] ?? "#2A3952"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Main Text</label>
              <input type="color" name="textColor" value="<?=h((string)($theme["textColor"] ?? "#E8EEF7"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Muted Text</label>
              <input type="color" name="mutedTextColor" value="<?=h((string)($theme["mutedTextColor"] ?? "#AFC2E0"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Accent</label>
              <input type="color" name="accentColor" value="<?=h((string)($theme["accentColor"] ?? "#36CFC9"))?>" style="height:44px; padding:6px;">
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Accent Secondary</label>
              <input type="color" name="accentSecondaryColor" value="<?=h((string)($theme["accentSecondaryColor"] ?? "#7CC4FF"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Button Background</label>
              <input type="color" name="buttonBackgroundColor" value="<?=h((string)($theme["buttonBackgroundColor"] ?? "#16335D"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Button Text</label>
              <input type="color" name="buttonTextColor" value="<?=h((string)($theme["buttonTextColor"] ?? "#E8EEF7"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Pill Background</label>
              <input type="color" name="pillBackgroundColor" value="<?=h((string)($theme["pillBackgroundColor"] ?? "#142848"))?>" style="height:44px; padding:6px;">
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Pill Text</label>
              <input type="color" name="pillTextColor" value="<?=h((string)($theme["pillTextColor"] ?? "#E8EEF7"))?>" style="height:44px; padding:6px;">
            </div>
            <div>
              <label>Body Font Stack</label>
              <input type="text" name="fontFamily" value="<?=h((string)($theme["fontFamily"] ?? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"))?>">
              <div class="tiny">Example: <b>Inter, system-ui, sans-serif</b></div>
            </div>
            <div>
              <label>Heading Font Stack</label>
              <input type="text" name="headingFontFamily" value="<?=h((string)($theme["headingFontFamily"] ?? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"))?>">
              <div class="tiny">Example: <b>Montserrat, Arial, sans-serif</b></div>
            </div>
          </div>

          <hr style="border:none; border-top:1px solid rgba(255,255,255,.08); margin:18px 0;">

          <h3 style="margin:0 0 8px;">Shared Layout Tokens</h3>
          <div class="section-note" style="margin-bottom:12px;">These settings control the shared layout layer used by the homepage, category page, and game shell. Use simple CSS lengths like <span class="mono">18px</span>, <span class="mono">1rem</span>, or <span class="mono">90vw</span>.</div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Content Max Width</label>
              <input type="text" name="contentMaxWidth" value="<?=h((string)($theme["contentMaxWidth"] ?? "1180px"))?>">
              <div class="tiny">Maximum width of the shared page shell.</div>
            </div>
            <div>
              <label>Shell Padding</label>
              <input type="text" name="shellPadding" value="<?=h((string)($theme["shellPadding"] ?? "18px"))?>">
              <div class="tiny">Outer left/right page padding.</div>
            </div>
            <div>
              <label>Topbar Height</label>
              <input type="text" name="topbarHeight" value="<?=h((string)($theme["topbarHeight"] ?? "64px"))?>">
              <div class="tiny">Minimum shared topbar height.</div>
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Panel Radius</label>
              <input type="text" name="panelRadius" value="<?=h((string)($theme["panelRadius"] ?? "18px"))?>">
              <div class="tiny">Hero and panel corner rounding.</div>
            </div>
            <div>
              <label>Card Radius</label>
              <input type="text" name="cardRadius" value="<?=h((string)($theme["cardRadius"] ?? "16px"))?>">
              <div class="tiny">Puzzle card and tile corner rounding.</div>
            </div>
            <div>
              <label>Panel Blur</label>
              <input type="text" name="panelBlurPx" value="<?=h((string)($theme["panelBlurPx"] ?? "10px"))?>">
              <div class="tiny">Backdrop blur for glass surfaces.</div>
            </div>
          </div>

          <div class="row" style="margin-top:10px; align-items:flex-start;">
            <div>
              <label>Button Radius</label>
              <input type="text" name="buttonRadius" value="<?=h((string)($theme["buttonRadius"] ?? "999px"))?>">
              <div class="tiny">Shared button rounding.</div>
            </div>
            <div>
              <label>Pill Radius</label>
              <input type="text" name="pillRadius" value="<?=h((string)($theme["pillRadius"] ?? "999px"))?>">
              <div class="tiny">Topbar and stats pill rounding.</div>
            </div>
            <div>
              <label>Section Gap</label>
              <input type="text" name="sectionGap" value="<?=h((string)($theme["sectionGap"] ?? "12px"))?>">
              <div class="tiny">Default spacing between grouped controls.</div>
            </div>
          </div>

          <div style="margin-top:14px; padding:14px; border:1px solid rgba(255,255,255,.08); border-radius: <?=h((string)($theme["panelRadius"] ?? "18px"))?>; background: <?=h((string)($theme["panelBackgroundColor"] ?? "#0F172A"))?>; color: <?=h((string)($theme["textColor"] ?? "#E8EEF7"))?>; font-family: <?=h((string)($theme["fontFamily"] ?? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"))?>; max-width: <?=h((string)($theme["contentMaxWidth"] ?? "1180px"))?>;">
            <div style="font-family: <?=h((string)($theme["headingFontFamily"] ?? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"))?>; font-size:20px; font-weight:800; margin-bottom:8px;">Style Preview</div>
            <div style="color: <?=h((string)($theme["mutedTextColor"] ?? "#AFC2E0"))?>; margin-bottom:12px;">Shared color and font tokens for the public pages.</div>
            <div style="display:flex; gap:<?=h((string)($theme["sectionGap"] ?? "12px"))?>; flex-wrap:wrap; align-items:center;">
              <span class="pill" style="background: <?=h((string)($theme["pillBackgroundColor"] ?? "#142848"))?>; color: <?=h((string)($theme["pillTextColor"] ?? "#E8EEF7"))?>; border-color: <?=h((string)($theme["borderColor"] ?? "#2A3952"))?>; border-radius: <?=h((string)($theme["pillRadius"] ?? "999px"))?>;">Pill Preview</span>
              <span style="display:inline-flex; align-items:center; justify-content:center; padding:10px 14px; border-radius:<?=h((string)($theme["buttonRadius"] ?? "999px"))?>; background: <?=h((string)($theme["buttonBackgroundColor"] ?? "#16335D"))?>; color: <?=h((string)($theme["buttonTextColor"] ?? "#E8EEF7"))?>; border:1px solid <?=h((string)($theme["borderColor"] ?? "#2A3952"))?>; font-weight:800;">Button Preview</span>
              <span style="display:inline-flex; align-items:center; gap:8px; color: <?=h((string)($theme["accentColor"] ?? "#36CFC9"))?>; font-weight:800;">● Accent</span>
              <span style="display:inline-flex; align-items:center; gap:8px; color: <?=h((string)($theme["accentSecondaryColor"] ?? "#7CC4FF"))?>; font-weight:800;">● Accent 2</span>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button type="submit">Save Theme + Banners + Styling</button>
          </div>
        </form>
      </div>

      <div class="card" id="growth-archive-settings">
        <h2>Daily Archive + Messaging</h2>
        <p class="section-note">Manage Daily Archive text, post-solve share copy, return messaging, install prompts, reminder CTA text, and an optional featured category from one place.</p>

        <div class="row" style="margin-bottom:12px; align-items:flex-start;">
          <div style="flex:1 1 100%;">
            <div class="tiny" style="margin-bottom:8px;">Daily Archive Builder</div>
            <form method="post" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <input type="hidden" name="csrf" value="<?=h($csrf)?>">
              <input type="hidden" name="action" value="run_build_daily_archive">
              <button type="submit">Rebuild Daily Archive</button>
              <a class="pill" href="<?=h(app_href('daily-archive.html'))?>" target="_blank" rel="noreferrer">Open daily-archive.html</a>
              <a class="pill" href="<?=h(app_href('build_daily_archive.php'))?>" target="_blank" rel="noreferrer">Open build_daily_archive.php</a>
              <a class="pill" href="<?=h(app_href('daily_puzzles/history.json'))?>" target="_blank" rel="noreferrer">Open daily_puzzles/history.json</a>
            </form>
            <div class="tiny" style="margin-top:8px;">If <span class="mono">build_daily_archive.php</span> exists, the rebuild button will generate <span class="mono">daily_puzzles/history.json</span> as the saved daily-history source used by the Daily Archive and homepage daily card.</div>
          </div>
        </div>

        <form method="post">
          <input type="hidden" name="csrf" value="<?=h($csrf)?>">
          <input type="hidden" name="action" value="save_growth">

          <div class="row">
            <div style="min-width:220px;">
              <label>
                <input type="checkbox" name="archiveEnabled" <?= !empty($theme["archiveEnabled"]) ? "checked" : "" ?>>
                Enable Daily Archive links
              </label>
            </div>
            <div>
              <label>Archive CTA Button Text</label>
              <input type="text" name="archiveCtaText" value="<?=h((string)($theme["archiveCtaText"] ?? "Play Today's Puzzle"))?>">
              <div class="tiny">Example: <b>Play Today's Puzzle</b> or <b>Back to Today's Challenge</b></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Archive Intro Title</label>
              <input type="text" name="archiveIntroTitle" value="<?=h((string)($theme["archiveIntroTitle"] ?? "Daily Puzzle Archive"))?>">
            </div>
            <div>
              <label>Archive Intro Text</label>
              <textarea name="archiveIntroText" rows="3"><?=h((string)($theme["archiveIntroText"] ?? "Browse past daily challenges and replay your favorites."))?></textarea>
            </div>
          </div>

          <hr style="border:none; border-top:1px solid rgba(255,255,255,.08); margin:18px 0;">

          <div class="row">
            <div style="min-width:220px;">
              <label>
                <input type="checkbox" name="shareResultEnabled" <?= !empty($theme["shareResultEnabled"]) ? "checked" : "" ?>>
                Enable post-solve share prompt
              </label>
            </div>
            <div>
              <label>Share Result Template</label>
              <textarea name="shareResultTemplate" rows="3"><?=h((string)($theme["shareResultTemplate"] ?? "I solved today's Snapshift in {time} with {score} points."))?></textarea>
              <div class="tiny">Supported placeholders: <span class="mono">{time}</span>, <span class="mono">{score}</span>, <span class="mono">{points}</span>, <span class="mono">{streak}</span>, <span class="mono">{puzzle}</span>, <span class="mono">{category}</span></div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Return Hook Text</label>
              <input type="text" name="returnHookText" value="<?=h((string)($theme["returnHookText"] ?? "Return tomorrow to keep your streak alive."))?>">
              <div class="tiny">Shown after a solve to encourage the next visit.</div>
            </div>
            <div>
              <label>Featured Category Name</label>
              <input type="text" name="featuredCategoryName" value="<?=h((string)($theme["featuredCategoryName"] ?? ""))?>">
              <div class="tiny">Optional: use on the home page later for a featured category callout.</div>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div>
              <label>Featured Category URL</label>
              <input type="text" name="featuredCategoryHref" value="<?=h((string)($theme["featuredCategoryHref"] ?? ""))?>">
              <div class="tiny">Example: <b>/category.html?cat=animals</b></div>
            </div>
            <div></div>
          </div>

          <hr style="border:none; border-top:1px solid rgba(255,255,255,.08); margin:18px 0;">

          <div class="row">
            <div style="min-width:220px;">
              <label>
                <input type="checkbox" name="installPromptEnabled" <?= !empty($theme["installPromptEnabled"]) ? "checked" : "" ?>>
                Enable install prompt copy
              </label>
            </div>
            <div>
              <label>Install Prompt Text</label>
              <input type="text" name="installPromptText" value="<?=h((string)($theme["installPromptText"] ?? "Install Snapshift for faster daily play."))?>">
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <div style="min-width:220px;">
              <label>
                <input type="checkbox" name="reminderCtaEnabled" <?= !empty($theme["reminderCtaEnabled"]) ? "checked" : "" ?>>
                Enable reminder CTA copy
              </label>
            </div>
            <div>
              <label>Reminder CTA Text</label>
              <input type="text" name="reminderCtaText" value="<?=h((string)($theme["reminderCtaText"] ?? "Want a daily reminder?"))?>">
            </div>
          </div>

          <div class="row" style="margin-top:12px;">
            <button type="submit">Save Growth + Archive Settings</button>
          </div>
        </form>
      </div>

      <div class="card" id="puzzle-pages">
        <h2>SEO Puzzle Pages</h2>
        <div class="tiny" style="margin-bottom:10px;">Use this after a main catalog rebuild when you want fresh SEO puzzle pages and a refreshed sitemap. This section writes the <span class="mono">/puzzle/...</span> pages and <span class="mono">sitemap.xml</span> directly on the server.</div>

        <div class="row" style="margin-bottom:10px;">
          <a class="pill" href="<?=h(app_href('build_puzzle_pages.php'))?>" target="_blank" rel="noreferrer">Open build_puzzle_pages.php</a>
          <a class="pill" href="<?=h(app_href('sitemap.xml'))?>" target="_blank" rel="noreferrer">Open sitemap.xml</a>
          <a class="pill" href="<?=h(app_href('puzzles/index.json'))?>" target="_blank" rel="noreferrer">Open catalog</a>
          <a class="pill" href="<?=h(app_href('robots.txt'))?>" target="_blank" rel="noreferrer">Open robots.txt</a>
        </div>

        <div class="row">
          <button id="ppRebuildBtn" type="button">Rebuild Index + Thumbs</button>
          <button id="ppBuildPagesBtn" type="button">Build Puzzle Pages + Sitemap</button>
          <button id="ppFullBtn" type="button">Run Full Puzzle Update</button>
        </div>

        <div class="tiny" style="margin-top:10px;">Normal order: first <b>Rebuild Index + Thumbs</b>, then <b>Build Puzzle Pages + Sitemap</b>. Hand this section to operators only when they also manage SEO page generation.</div>
        <div class="tiny" style="margin-top:8px;">After each rebuild, keep <span class="mono">sitemap.xml</span> live in the site root, upload a root <span class="mono">robots.txt</span> that points to the sitemap, and submit the sitemap in Google Search Console.</div>

        <pre id="ppOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
      </div>

      <div class="card" id="cloud-health">
        <div class="section-bar">
          <div>
            <h2>Site Health & Diagnostics</h2>
            <div class="tiny">Resolved file paths, live endpoint checks, and quick recovery actions in one place.</div>
          </div>
          <div class="pill">Root: <span class="mono"><?=h(app_url_prefix() ?: './')?></span></div>
        </div>
        <div class="diag-grid">
          <div class="soft-panel">
            <div class="tiny" style="margin-bottom:10px;">File & route health</div>
            <?php $healthFiles = app_file_statuses(); ?>
            <div class="hc-table-wrap">
            <table>
              <thead><tr><th>Logical file</th><th>Resolved path</th><th>Status</th><th>Size</th><th>Modified</th></tr></thead>
              <tbody>
                <?php foreach ($healthFiles as $f): ?>
                  <tr>
                    <td class="mono"><?=h($f['file'])?></td>
                    <td class="mono tiny"><?=h($f['resolved'] ?? $f['file'])?></td>
                    <td><?= $f['exists'] ? '<span class="ok">OK</span>' : '<span class="bad">Missing</span>' ?></td>
                    <td><?=h((string)$f['size'])?></td>
                    <td><?= $f['mtime'] ? h(date('Y-m-d H:i:s', (int)$f['mtime'])) : '—' ?></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
            </div>
            <div class="action-cluster">
              <a class="pill" href="<?=h(app_href('index.html'))?>" target="_blank" rel="noreferrer">Open index</a>
              <a class="pill" href="<?=h(app_href('category.html'))?>" target="_blank" rel="noreferrer">Open category</a>
              <a class="pill" href="<?=h(app_href('game.html'))?>" target="_blank" rel="noreferrer">Open game</a>
              <a class="pill" href="<?=h(app_href_existing(['api/me.php', 'me.php']))?>" target="_blank" rel="noreferrer">Open me.php</a>
              <a class="pill" href="<?=h(app_href_existing(['api/leaderboard_top.php', 'leaderboard_top.php']))?>" target="_blank" rel="noreferrer">Open leaderboard</a>
            </div>
          </div>
          <div class="diag-stack">
            <div class="soft-panel">
              <div class="tiny" style="margin-bottom:8px;">Live API & assets</div>
              <div class="status-strip">
                <div class="pill" id="hcPoints">points_get: …</div>
                <div class="pill" id="hcUnlocks">unlocked_get: …</div>
                <div class="pill" id="hcReward">reward_status: …</div>
                <div class="pill" id="hcThumbs">thumbs: …</div>
              </div>
              <div class="action-cluster">
                <button id="hcRun" type="button">Run health check</button>
              </div>
              <pre id="hcLog" style="margin-top:12px; min-height:168px;">Use this after uploads or path changes to verify the live APIs and thumbs folder.</pre>
            </div>
            <div class="soft-panel">
              <div class="tiny" style="margin-bottom:8px;">When uploads or generated pages act strange</div>
              <div class="section-note" style="margin-bottom:0;">Start here before digging through save, reward, or SEO page issues. It covers the most common file/path/API problems from one panel.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" id="catalog-stats">
        <h2>Catalog Stats</h2>
        <?php if (!$stats["ok"]): ?>
          <div class="pill bad"><?=h($stats["msg"] ?? "Unknown error")?></div>
        <?php else: ?>
          <div class="row" style="justify-content:space-between;">
            <div class="pill">Total puzzles: <b><?=h((string)$stats["total"])?></b></div>
            <div class="pill">Manifest updated: <b><?=h(date('c', (int)$stats["mtime"]))?></b></div>
          </div>

          <div style="margin-top:10px;">
            <div class="pill">Latest: <b><?=h($stats["latest"]["name"] ?: "—")?></b> • <?=h($stats["latest"]["catId"] ?: "—")?></div>
            <?php if (!empty($stats["latest"]["src"])): ?>
              <div class="tiny" style="margin-top:6px;">Src: <?=h($stats["latest"]["src"])?></div>
            <?php endif; ?>
          </div>

          <h2 style="margin-top:14px;">Counts by Category</h2>
          <table>
            <thead><tr><th>Category</th><th>Count</th></tr></thead>
            <tbody>
              <?php foreach (($stats["cats"] ?? []) as $row): ?>
                <tr>
                  <td><?=h($row["catId"])?></td>
                  <td><?=h((string)$row["count"])?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        <?php endif; ?>
      </div>

<!-- ===== Visitor Stats ===== -->
<section id="visitor-stats" class="card" style="margin-top:16px;">
  <div class="section-bar"><div><h2 style="margin:0;">Monitoring & Cleanup</h2><div class="tiny">Traffic insights, local browser cleanup, and quick admin-side maintenance.</div></div></div>
  <h3 style="margin:0 0 8px 0;">Visitor Stats</h3>
  <div style="display:flex; gap:10px; flex-wrap:wrap;">
    <div class="pill" id="vsToday">Today: …</div>
    <div class="pill" id="vsWeek">Last 7 days: …</div>
  </div>
  <div id="vsTopPages" style="margin-top:10px; font-family:monospace; white-space:pre-wrap;"></div>
  <button id="vsRefresh" type="button"
    style="margin-top:10px; padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); cursor:pointer;">
    Refresh Visitor Stats
  </button>
</section>

<script>
(function(){
  const elToday = document.getElementById("vsToday");
  const elWeek = document.getElementById("vsWeek");
  const elTop = document.getElementById("vsTopPages");
  const btn = document.getElementById("vsRefresh");
  if (!elToday || !elWeek || !elTop || !btn) return;

  async function loadStats(){
    elToday.textContent = "Today: …";
    elWeek.textContent = "Last 7 days: …";
    elTop.textContent = "Loading…";
    try{
      const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=visitor_stats')) ?>, { credentials:"include", cache:"no-store" });
      const j = await r.json();
      if (!j || !j.ok){
        elTop.textContent = "Could not load stats.";
        return;
      }
      elToday.textContent = `Today (${j.today} UTC): ${j.views_today} views • ${j.uniques_today} uniques`;
      elWeek.textContent = `Last 7 days (since ${j.since} UTC): ${j.views_7d} views • ${j.uniques_7d} uniques`;

      const rows = (j.top_pages || []).map(p => `${String(p.page).padEnd(12)}  ${p.views} views`);
      const refs = (j.top_referrers || []).map(r => `${String(r.ref_domain||"").padEnd(28)}  ${r.views} views`);
      elTop.textContent = (rows.length ? ("Top pages (7d):\n" + rows.join("\n")) : "Top pages (7d): none")
        + "\n\n" + (refs.length ? ("Top referrers (7d):\n" + refs.join("\n")) : "Top referrers (7d): none");
    }catch(e){
      elTop.textContent = "Could not load stats.";
    }
  }

  btn.addEventListener("click", loadStats);
  loadStats();
})();
</script>


<!-- ===== Client Storage Cleanup (PuzzleQuest) ===== -->
<section id="client-cleanup" class="card" style="margin-top:16px;">
  <h3 style="margin:0 0 8px 0;">Client Storage Cleanup</h3>
  <p style="margin:0 0 10px 0; opacity:0.9;">
    Use this if a browser has stale PuzzleQuest data (daily completed stuck, unlocked puzzles shared, etc.).
    This clears old <code>localStorage</code> keys for this site on the current device/browser.
  </p>

  <button id="pqClearStorageBtn" type="button"
    style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); cursor:pointer;">
    Clear PuzzleQuest Local Storage (this browser)
  </button>

  <div id="pqClearStorageResult" style="margin-top:10px; font-family:monospace; white-space:pre-wrap;"></div>
</section>

<script>
(function(){
  const btn = document.getElementById("pqClearStorageBtn");
  const out = document.getElementById("pqClearStorageResult");
  if (!btn || !out) return;

  function clearPuzzleQuestStorage(){
    const prefixes = [
      "tilepuzzle_",
      "puzzlequest_"
    ];

    const exactKeys = [
      "tilepuzzle_day_active",
      "tilepuzzle_daily_active",
      "tilepuzzle_points_global",
      "tilepuzzle_last_category",
      "tilepuzzle_last_puzzle_hint",
      "tilepuzzle_last_user_tag",
      "tilepuzzle_theme_enabled",
      "tilepuzzle_theme_alpha",
      "tilepuzzle_theme_bg"
    ];

    let removed = [];
    let failed = [];

    try {
      for (const k of exactKeys){
        if (localStorage.getItem(k) !== null){
          localStorage.removeItem(k);
          removed.push(k);
        }
      }

      for (let i = localStorage.length - 1; i >= 0; i--){
        const k = localStorage.key(i);
        if (!k) continue;
        if (prefixes.some(p => k.startsWith(p))){
          localStorage.removeItem(k);
          removed.push(k);
        }
      }
    } catch (e){
      failed.push(String(e && e.message ? e.message : e));
    }

    return { removed, failed };
  }

  btn.addEventListener("click", () => {
    if (!confirm("Clear PuzzleQuest localStorage keys for this browser?")) return;
    const r = clearPuzzleQuestStorage();
    out.textContent =
      `Removed keys: ${r.removed.length}\n` +
      (r.removed.length ? r.removed.join("\n") + "\n" : "") +
      (r.failed.length ? ("\nErrors:\n" + r.failed.join("\n")) : "\nDone.");
  });
})();
</script>

  <section id="user-tools" class="card" style="margin-top:16px;">
    <div class="section-bar"><div><h2 style="margin:0;">User Tools</h2><div class="tiny">Points, daily reward repair, user lookup, and streak reward testing from one area.</div></div></div>
    <h2>Grant User Points</h2>
    <p style="opacity:.9;margin-top:-6px;">
      Add or subtract points for a user (no limit). Enter a <b>username</b>, <b>email</b>, or <b>user id</b>.
    </p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:220px;">
        <label for="gpUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="gpUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <div style="width:220px;">
        <label for="gpDelta" style="display:block; font-weight:700; margin-bottom:6px;">Points to add</label>
        <input id="gpDelta" type="number" step="1" placeholder="e.g. 500"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
        <div style="opacity:.8; font-size:12px; margin-top:6px;">Use negative to subtract.</div>
      </div>

      <button id="gpBtn" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Grant Points
      </button>
    </div>

    <pre id="gpOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
  </section>

  <script>
  (function(){
    const u = document.getElementById('gpUser');
    const d = document.getElementById('gpDelta');
    const b = document.getElementById('gpBtn');
    const o = document.getElementById('gpOut');
    if (!u || !d || !b || !o) return;

    async function grant(){
      const user = (u.value || '').trim();
      const delta = (d.value || '').trim();
      if (!user || !delta){
        o.textContent = 'Enter user and points.';
        return;
      }
      o.textContent = 'Working…';
      try{
        const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=grant_points')) ?>, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, delta: Number(delta), csrf: <?= json_encode($csrf) ?> })
        });
        const j = await r.json().catch(()=>null);
        if (!j){
          o.textContent = 'No JSON response.';
          return;
        }
        if (!j.ok){
          o.textContent = 'Error: ' + (j.error || 'unknown');
          return;
        }
        o.textContent =
          `OK\nUser: ${j.username || user} (${j.email || ''})\nUID: ${j.uid}\nDelta: ${j.delta}\nNew Total: ${j.points}`;
      }catch(e){
        o.textContent = 'Request failed.';
      }
    }

    b.addEventListener('click', grant);
  })();
  </script>

  <section class="card" style="margin-top:16px;">
    <h2>Repair Daily Reward Credits</h2>
    <p style="opacity:.9;margin-top:-6px;">
      One-time repair for users whose daily rewards were marked claimed but did not increase their live points total.
      This only applies a fix when <b>users.points</b> is provably ahead of <b>user_state.points</b>, which matches the broken claim window we just fixed.
    </p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:240px;">
        <label for="drUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="drUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <button id="drBtn" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Repair Daily Reward Credits
      </button>
    </div>

    <div class="tiny" style="margin-top:8px;">
      Safe behavior only: if there is no provable gap to repair, this reports that and leaves the balance unchanged.
    </div>

    <pre id="drOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
  </section>

  <script>
  (function(){
    const inp = document.getElementById('drUser');
    const btn = document.getElementById('drBtn');
    const out = document.getElementById('drOut');
    if (!inp || !btn || !out) return;

    async function run(){
      const user = (inp.value || '').trim();
      if (!user){
        out.textContent = 'Enter a user first.';
        return;
      }
      out.textContent = 'Working…';
      try{
        const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=repair_daily_reward_points')) ?>, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, csrf: <?= json_encode($csrf) ?> })
        });
        const j = await r.json().catch(()=>null);
        if (!j){
          out.textContent = 'No JSON response.';
          return;
        }
        if (!j.ok){
          out.textContent = 'Error: ' + (j.error || ('HTTP ' + r.status));
          return;
        }
        out.textContent =
          `OK
User: ${j.username || user} ${j.email ? '(' + j.email + ')' : ''}
UID: ${j.uid}
user_state before: ${j.user_state_points_before}
user_state after: ${j.user_state_points_after}
users.points reference: ${j.users_points_reference ?? 'n/a'}
Daily claim rows: ${j.daily_claim_count}
Daily claim points total: ${j.daily_claim_points_total}
Latest claim day: ${j.latest_claim_day || 'n/a'}
Latest claimed at: ${j.latest_claimed_at || 'n/a'}
Repair applied: ${j.repair_applied ? 'yes' : 'no'}
Repaired points: ${j.repaired_points}

${j.note || ''}`;
      }catch(e){
        out.textContent = 'Request failed.';
      }
    }

    btn.addEventListener('click', run);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run();
    });
  })();
  </script>

  <section class="card" style="margin-top:16px;">
    <h2>Reopen Premature Daily Claim</h2>
    <p style="opacity:.9;margin-top:-6px;">
      Reopen a daily reward that was claimed too early on the same calendar day as the reward day. This is the beta safety tool for the premature same-day claim bug.
    </p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:220px;">
        <label for="pcUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="pcUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <div style="width:220px;">
        <label for="pcDay" style="display:block; font-weight:700; margin-bottom:6px;">Reward day (YYYY-MM-DD)</label>
        <input id="pcDay" type="text" placeholder="2026-04-25"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <label style="display:flex; align-items:center; gap:8px; min-height:42px; padding:0 4px;">
        <input id="pcReverse" type="checkbox" checked>
        <span>Reverse credited points too</span>
      </label>

      <button id="pcBtn" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Reopen Premature Claim
      </button>
    </div>

    <div class="tiny" style="margin-top:8px;">
      Safe behavior only: this reopens only when the claim row was created on the same calendar day as the reward day. It will not touch older normal next-day claims.
    </div>

    <pre id="pcOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
  </section>

  <script>
  (function(){
    const userInp = document.getElementById('pcUser');
    const dayInp = document.getElementById('pcDay');
    const reverseInp = document.getElementById('pcReverse');
    const btn = document.getElementById('pcBtn');
    const out = document.getElementById('pcOut');
    if (!userInp || !dayInp || !reverseInp || !btn || !out) return;

    async function run(){
      const user = (userInp.value || '').trim();
      const day = (dayInp.value || '').trim();
      const reverse_points = !!reverseInp.checked;
      if (!user || !day){
        out.textContent = 'Enter user and reward day.';
        return;
      }
      out.textContent = 'Working...';
      try{
        const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=reopen_premature_daily_claim')) ?>, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, day, reverse_points, csrf: <?= json_encode($csrf) ?> })
        });
        const j = await r.json().catch(()=>null);
        if (!j){
          out.textContent = 'No JSON response.';
          return;
        }
        if (!j.ok){
          out.textContent = 'Error: ' + (j.error || ('HTTP ' + r.status));
          return;
        }
        out.textContent =
          `OK
User: ${j.username || user} ${j.email ? '(' + j.email + ')' : ''}
UID: ${j.uid}
Day: ${j.day_key || day}
Found claim row: ${j.found_claim_row ? 'yes' : 'no'}
Claim row id: ${j.claim_row_id || 0}
Claim points: ${j.claim_points || 0}
Claim timestamp: ${j.claim_timestamp || 'n/a'}
Same-day claim: ${j.same_day_claim ? 'yes' : 'no'}
Reverse points: ${j.reverse_points ? 'yes' : 'no'}
user_state before: ${j.user_state_points_before ?? 0}
user_state after: ${j.user_state_points_after ?? 0}
users.points before: ${j.users_points_before ?? 'n/a'}
users.points after: ${j.users_points_after ?? 'n/a'}
Reopened: ${j.reopened ? 'yes' : 'no'}
Reversed points: ${j.reversed_points ?? 0}

${j.note || ''}`;
      }catch(e){
        out.textContent = 'Request failed.';
      }
    }

    btn.addEventListener('click', run);
  })();
  </script>

  <section class="card" style="margin-top:16px;">
    <h2>Inspect Daily Reward Status</h2>
    <p style="opacity:.9;margin-top:-6px;">
      Live diagnostic for one user’s daily reward state. This shows the active day, default claim day, pending claim days, leaderboard rows, and the exact reward preview the backend is using to decide whether the <b>Claim Now</b> button should appear.
    </p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:240px;">
        <label for="drInspectUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="drInspectUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <button id="drInspectBtn" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Inspect Daily Reward Status
      </button>
    </div>

    <pre id="drInspectOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
  </section>

  <script>
  (function(){
    const inp = document.getElementById('drInspectUser');
    const btn = document.getElementById('drInspectBtn');
    const out = document.getElementById('drInspectOut');
    if (!inp || !btn || !out) return;

    async function run(){
      const user = (inp.value || '').trim();
      if (!user){
        out.textContent = 'Enter a user first.';
        return;
      }
      out.textContent = 'Working…';
      try{
        const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=inspect_daily_reward_status')) ?>, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, csrf: <?= json_encode($csrf) ?> })
        });
        const j = await r.json().catch(()=>null);
        if (!j){
          out.textContent = 'No JSON response.';
          return;
        }
        if (!j.ok){
          out.textContent = 'Error: ' + (j.error || ('HTTP ' + r.status));
          return;
        }
        out.textContent =
          `OK
User: ${j.username || user} ${j.email ? '(' + j.email + ')' : ''}
UID: ${j.uid}
Active day: ${j.active_day || 'n/a'}
Default claim day: ${j.default_claim_day || 'n/a'}
Preferred claim day: ${j.preferred_claim_day || 'n/a'}
Claimable count: ${j.claimable_count ?? 0}
Pending days: ${(j.pending_days || []).join(', ') || '(none)'}
Latest leaderboard day: ${j.latest_leaderboard_day || 'n/a'}
Has real claim for default day: ${j.has_real_claim_default_day ? 'yes' : 'no'}
Has real claim for preferred day: ${j.has_real_claim_preferred_day ? 'yes' : 'no'}
UTC fallback window active: ${j.utc_day_fallback_window_active ? 'yes' : 'no'}

Default claim row:
${JSON.stringify(j.default_claim_row || null, null, 2)}

Preferred claim row:
${JSON.stringify(j.preferred_claim_row || null, null, 2)}

Default day preview:
${JSON.stringify(j.default_claim_preview || null, null, 2)}

Preferred day preview:
${JSON.stringify(j.preferred_claim_preview || null, null, 2)}

Latest leaderboard row:
${JSON.stringify(j.latest_leaderboard_row || null, null, 2)}

Recent leaderboard rows:
${JSON.stringify(j.recent_leaderboard_rows || [], null, 2)}

Debug:
${JSON.stringify(j.debug || {}, null, 2)}`;
      }catch(e){
        out.textContent = 'Request failed.';
      }
    }

    btn.addEventListener('click', run);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run();
    });
  })();
  </script>


  <section class="card" style="margin-top:16px;">
    <h2>Reset User Data</h2>
    <p style="opacity:.9;margin-top:-6px;">
      Reset a player back to the beginning while keeping their account/login. This clears points, unlocks, puzzle history, progress, medal records, streak-related rows, reward claims, and other gameplay rows tied to that user.
    </p>

    <form method="post" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <input type="hidden" name="csrf" value="<?=h($csrf)?>">
      <input type="hidden" name="action" value="reset_user_data_direct">
      <div style="flex:1; min-width:240px;">
        <label for="ruUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="ruUser" name="user" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>
      <div style="width:180px;">
        <label for="ruConfirm" style="display:block; font-weight:700; margin-bottom:6px;">Type RESET</label>
        <input id="ruConfirm" name="confirm" type="text" placeholder="RESET"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff; text-transform:uppercase;">
        <div style="opacity:.8; font-size:12px; margin-top:6px;">Required safety check.</div>
      </div>
      <button type="submit"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(127,29,29,0.75); color:#fff; font-weight:800; cursor:pointer;">
        Reset User
      </button>
    </form>

    <pre id="ruOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"><?= h($resetOut) ?></pre>
  </section>


  <section class="card" style="margin-top:16px;">
    <h2>Delete User Completely</h2>
    <p style="opacity:.9;margin-top:-6px;">
      Permanently remove the entire account row and all associated gameplay, auth, token, reward, and login-tracking data tied to that user. This action is <b>irreversible</b>.
    </p>

    <form method="post" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <input type="hidden" name="csrf" value="<?=h($csrf)?>">
      <input type="hidden" name="action" value="delete_user_account_direct">
      <div style="flex:1; min-width:240px;">
        <label for="duUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="duUser" name="user" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>
      <div style="width:180px;">
        <label for="duConfirm" style="display:block; font-weight:700; margin-bottom:6px;">Type DELETE</label>
        <input id="duConfirm" name="confirm" type="text" placeholder="DELETE"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff; text-transform:uppercase;">
        <div style="opacity:.8; font-size:12px; margin-top:6px;">Required irreversible action check.</div>
      </div>
      <button type="submit"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(127,29,29,0.75); color:#fff; font-weight:800; cursor:pointer;">
        Delete User
      </button>
    </form>

    <pre id="duOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"><?= h($deleteOut) ?></pre>
  </section>


  <section class="card" style="margin-top:16px;">
    <h2>Test Streak Rewards</h2>
    <p style="opacity:.9;margin-top:-6px;">
      Admin-only test grant for the <b>7</b>, <b>14</b>, and <b>30</b> day streak rewards. This adds the reward points to a user
      <b>without consuming their real streak claim</b>.
    </p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:240px;">
        <label for="srUser" style="display:block; font-weight:700; margin-bottom:6px;">User (username / email / id)</label>
        <input id="srUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <button class="srBtn" data-milestone="7" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Test 7-Day (+250)
      </button>

      <button class="srBtn" data-milestone="14" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Test 14-Day (+1000)
      </button>

      <button class="srBtn" data-milestone="30" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Test 30-Day (+2500)
      </button>
    </div>

    <pre id="srOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
  </section>

  <script>
  (function(){
    const inp = document.getElementById('srUser');
    const out = document.getElementById('srOut');
    const btns = Array.from(document.querySelectorAll('.srBtn'));
    if (!inp || !out || !btns.length) return;

    async function run(milestone){
      const user = (inp.value || '').trim();
      if (!user){
        out.textContent = 'Enter a user first.';
        return;
      }
      out.textContent = 'Working…';
      try{
        const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=streak_reward_test')) ?>, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, milestone: Number(milestone), csrf: <?= json_encode($csrf) ?> })
        });
        const j = await r.json().catch(()=>null);
        if (!j){
          out.textContent = 'No JSON response.';
          return;
        }
        if (!j.ok){
          out.textContent = 'Error: ' + (j.error || ('HTTP ' + r.status));
          return;
        }
        out.textContent =
          `OK
User: ${j.username || ''} ${j.email ? '(' + j.email + ')' : ''}
UID: ${j.uid}
Milestone: ${j.milestone} day
Reward: ${j.reward}
New Total: ${j.points}

${j.note || ''}`;
      }catch(e){
        out.textContent = 'Request failed.';
      }
    }

    btns.forEach(btn => btn.addEventListener('click', () => run(btn.dataset.milestone || '0')));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && btns[1]) run(btns[1].dataset.milestone || '14');
    });
  })();
  </script>


  <section id="medal-history" class="card" style="margin-top:16px;">
    <div class="section-bar"><div><h2 style="margin:0;">User Medal History</h2><div class="tiny">Look up which puzzles a user earned Bronze, Silver, or Gold on.</div></div></div>
    <p style="opacity:.9;margin-top:-6px;">Search by <b>username</b>, <b>email</b>, or <b>user id</b>. Optional puzzle filter narrows by puzzle name, category, or medal.</p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:240px;">
        <label for="mrUser" style="display:block; font-weight:700; margin-bottom:6px;">User</label>
        <input id="mrUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>
      <div style="flex:1; min-width:220px;">
        <label for="mrPuzzle" style="display:block; font-weight:700; margin-bottom:6px;">Puzzle filter (optional)</label>
        <input id="mrPuzzle" type="text" placeholder="e.g. clownfish, animals, gold"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>
      <div style="width:120px;">
        <label for="mrLimit" style="display:block; font-weight:700; margin-bottom:6px;">Limit</label>
        <input id="mrLimit" type="number" min="1" max="500" value="150"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>
      <button id="mrBtn" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Find Medals
      </button>
    </div>

    <div id="mrMeta" class="tiny" style="margin-top:12px;"></div>
    <div id="mrTableWrap" style="display:none; margin-top:12px; overflow:auto; border-radius:12px; border:1px solid rgba(255,255,255,0.10); background:rgba(0,0,0,0.22);">
      <table style="width:100%; border-collapse:collapse; min-width:980px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Date</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">User</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Puzzle</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Category</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Diff</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Medal</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Stars</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Moves</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Time</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,0.08);">Score</th>
          </tr>
        </thead>
        <tbody id="mrBody"></tbody>
      </table>
    </div>
    <pre id="mrOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap; display:none;"></pre>
  </section>

  <script>
  (function(){
    const btn = document.getElementById('mrBtn');
    const user = document.getElementById('mrUser');
    const puzzle = document.getElementById('mrPuzzle');
    const limit = document.getElementById('mrLimit');
    const meta = document.getElementById('mrMeta');
    const wrap = document.getElementById('mrTableWrap');
    const body = document.getElementById('mrBody');
    const out = document.getElementById('mrOut');
    if (!btn || !user || !puzzle || !limit || !meta || !wrap || !body || !out) return;

    function starCount(value){
      const raw = String(value == null ? '' : value).trim();
      const num = Number(raw);
      if (!Number.isNaN(num)) return Math.max(0, Math.min(3, Math.round(num)));
      const matches = raw.match(/★/g);
      if (matches && matches.length) return Math.max(0, Math.min(3, matches.length));
      const lower = raw.toLowerCase();
      if (lower.includes('gold')) return 3;
      if (lower.includes('silver')) return 2;
      if (lower.includes('bronze')) return 1;
      return 0;
    }

    function medalLabel(row){
      const raw = String((row && (row.medal_label || row.medal)) || '').trim();
      const lower = raw.toLowerCase();
      if (raw && !['-', '—', '--', 'none', 'null', 'n/a', 'na', '0'].includes(lower)) return raw;
      const stars = starCount(row && row.stars);
      if (stars >= 3) return 'Gold';
      if (stars >= 2) return 'Silver';
      if (stars >= 1) return 'Bronze';
      const score = Number((row && row.score_pct) || 0);
      if (score >= 90) return 'Gold';
      if (score >= 75) return 'Silver';
      if (score > 0) return 'Bronze';
      return '';
    }

    function medalPill(row){
      const stars = starCount(row && row.stars);
      let label = '';
      if (stars >= 3) label = 'Gold';
      else if (stars >= 2) label = 'Silver';
      else if (stars >= 1) label = 'Bronze';
      else label = medalLabel(row);
      if (!label) return '<span style="opacity:.55;">—</span>';
      const color = label === 'Gold' ? '#ffd666' : (label === 'Silver' ? '#cfd8ff' : '#f7b267');
      return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid ${color}55;background:${color}22;color:${color};font-weight:800;">${label}</span>`;
    }

    async function run(){
      const q = (user.value || '').trim();
      if (!q){
        out.style.display = 'block';
        out.textContent = 'Enter a user first.';
        wrap.style.display = 'none';
        meta.textContent = '';
        return;
      }
      out.style.display = 'block';
      out.textContent = 'Loading…';
      wrap.style.display = 'none';
      meta.textContent = '';
      try{
        const qs = new URLSearchParams();
        qs.set('ajax', 'medal_report');
        qs.set('user', q);
        if ((puzzle.value || '').trim()) qs.set('puzzle', puzzle.value.trim());
        if ((limit.value || '').trim()) qs.set('limit', String(limit.value).trim());
        const r = await fetch('?' + qs.toString(), { credentials:'same-origin' });
        const j = await r.json().catch(()=>null);
        if (!j){ out.textContent = 'No JSON response.'; return; }
        if (!j.ok){ out.textContent = 'Error: ' + (j.error || ('HTTP ' + r.status)); return; }
        const users = Array.isArray(j.users) ? j.users : [];
        const rows = Array.isArray(j.rows) ? j.rows : [];
        meta.textContent = `${users.length} user match${users.length===1?'':'es'} • ${rows.length} medal record${rows.length===1?'':'s'}`;
        if (!rows.length){
          out.textContent = 'No completed medal records found for that search.';
          wrap.style.display = 'none';
          return;
        }
        body.innerHTML = rows.map(row => `
          <tr>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06); white-space:nowrap;">${String(row.updated_at || '').replace('T', ' ').slice(0, 19)}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06);"><div style="font-weight:800;">${row.username || ''}</div><div style="opacity:.7;font-size:12px;">${row.email || ''} • UID ${row.user_id || ''}</div></td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06); font-weight:800;">${row.puzzle_name || ''}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06); text-transform:capitalize;">${row.category_id || ''}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06); text-transform:capitalize;">${row.diff_key || ''}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06);">${medalPill(row)}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06);">${'★'.repeat(starCount(row.stars))}${'☆'.repeat(Math.max(0, 3 - starCount(row.stars)))}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06);">${row.moves || 0}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06);">${row.elapsed_label || ''}</td>
            <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06);">${row.score_pct || 0}%</td>
          </tr>
        `).join('');
        out.style.display = 'none';
        wrap.style.display = 'block';
      }catch(e){
        out.textContent = 'Request failed.';
        wrap.style.display = 'none';
      }
    }

    btn.addEventListener('click', run);
    user.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    puzzle.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  })();
  </script>


  <script>
  (function(){
    const elPts = document.getElementById("hcPoints");
    const elUnl = document.getElementById("hcUnlocks");
    const elRew = document.getElementById("hcReward");
    const elTh  = document.getElementById("hcThumbs");
    const btn   = document.getElementById("hcRun");
    const log   = document.getElementById("hcLog");
    if (!elPts || !elUnl || !elRew || !elTh || !btn || !log) return;

    function setPill(el, state, label, detail){
      el.textContent = label + (detail ? (": " + detail) : "");
      const map = {
        ok:   { bg: "rgba(52, 211, 153, 0.18)", bd: "1px solid rgba(52, 211, 153, 0.25)" },
        warn: { bg: "rgba(251, 191, 36, 0.18)", bd: "1px solid rgba(251, 191, 36, 0.28)" },
        bad:  { bg: "rgba(239, 68, 68, 0.18)",  bd: "1px solid rgba(239, 68, 68, 0.25)" }
      };
      const s = map[state] || map.bad;
      el.style.background = s.bg;
      el.style.border = s.bd;
    }

    async function pingJson(url){
      const r = await fetch(url, { credentials:"include", cache:"no-store" });
      const j = await r.json().catch(()=>null);
      return { status: r.status, ok: r.ok, json: j };
    }

    async function run(){
      log.textContent = "Running…\n";
      setPill(elPts, "warn", "points_get", "…");
      setPill(elUnl, "warn", "unlocked_get", "…");
      setPill(elRew, "warn", "reward_status", "…");
      setPill(elTh,  "warn", "thumbs", "…");

      try{
        const res = await pingJson(<?= json_encode(app_href_existing(['api/points_get.php', 'points_get.php'])) ?>);
        const ok = res.json && res.json.ok && res.json.loggedIn;
        const authReq = res.status === 401 || (res.json && res.json.loggedIn === false);
        setPill(elPts, ok ? "ok" : (authReq ? "warn" : "bad"), "points_get",
          ok ? ("points " + res.json.points) : (authReq ? "login required" : ("HTTP " + res.status)));
        log.textContent += "points_get: " + JSON.stringify(res.json) + "\n\n";
      }catch(e){
        setPill(elPts, "bad", "points_get", "error");
        log.textContent += "points_get: error\n\n";
      }

      try{
        const res = await pingJson(<?= json_encode(app_href_existing(['api/unlocked_get.php', 'unlocked_get.php'])) ?>);
        const ok = res.json && res.json.ok && res.json.loggedIn && res.json.unlocked && typeof res.json.unlocked === "object";
        const authReq = res.status === 401 || (res.json && res.json.loggedIn === false);
        const count = ok ? Object.keys(res.json.unlocked).length : 0;
        setPill(elUnl, ok ? "ok" : (authReq ? "warn" : "bad"), "unlocked_get",
          ok ? (count + " cats") : (authReq ? "login required" : ("HTTP " + res.status)));
        log.textContent += "unlocked_get: " + JSON.stringify(res.json) + "\n\n";
      }catch(e){
        setPill(elUnl, "bad", "unlocked_get", "error");
        log.textContent += "unlocked_get: error\n\n";
      }

      try{
        const res = await pingJson(<?= json_encode(app_href_existing(['api/reward_status.php', 'reward_status.php'])) ?>);
        const ok = res.json && res.json.ok;
        const authReq = res.status === 401 || (res.json && res.json.loggedIn === false);
        setPill(elRew, ok ? "ok" : (authReq ? "warn" : "bad"), "reward_status",
          ok ? (res.json.claimable ? "claimable" : "ok") : (authReq ? "login required" : ("HTTP " + res.status)));
        log.textContent += "reward_status: " + JSON.stringify(res.json) + "\n\n";
      }catch(e){
        setPill(elRew, "bad", "reward_status", "error");
        log.textContent += "reward_status: error\n\n";
      }

      try{
        let ok = false;
        let detail = "";
        try{
          const res = await pingJson(<?= json_encode(app_href('puzzles/thumb_diag.php')) ?>);
          ok = !!(res.json && res.json.ok && (res.json.thumb_dir_exists || res.json.mkdir_ok) && res.json.write_test_ok);
          detail = ok ? "writable" : "check";
          log.textContent += "thumb_diag: " + JSON.stringify(res.json) + "\n\n";
        }catch(e2){
          const r = await fetch(<?= json_encode(app_href('puzzles/_thumbs/animals/Elephant%20Eye.jpg')) ?>, { cache:"no-store" });
          ok = r.ok;
          detail = ok ? "sample ok" : ("HTTP " + r.status);
        }
        setPill(elTh, ok ? "ok" : "bad", "thumbs", detail);
      }catch(e){
        setPill(elTh, "bad", "thumbs", "error");
        log.textContent += "thumbs: error\n\n";
      }

      log.textContent += "Done.";
    }

    btn.addEventListener("click", run);

    const rebuildBtn = document.getElementById("rebuildIndexBtn");
    if (rebuildBtn){
      rebuildBtn.addEventListener("click", async () => {
        log.textContent = "Rebuilding…\n";
        try{
          const r = await fetch(<?= json_encode(app_href('puzzles/build_index.php')) ?>, { credentials:"include", cache:"no-store" });
          const t = await r.text();
          log.textContent = (r.ok ? "Rebuild OK\n\n" : ("Rebuild failed HTTP " + r.status + "\n\n")) + t;
        }catch(e){
          log.textContent = "Rebuild request failed.";
        }
      });
    }

    run();
  })();
  </script>


  <section class="card" style="margin-top:16px;">
    <h2>User Lookup</h2>
    <p style="opacity:.9;margin-top:-6px;">Search by <b>username</b>, <b>email</b>, or <b>user id</b> to view points and unlocks.</p>

    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:240px;">
        <label for="ulUser" style="display:block; font-weight:700; margin-bottom:6px;">User</label>
        <input id="ulUser" type="text" placeholder="username / email / id"
               style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff;">
      </div>

      <button id="ulBtn" type="button"
        style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-weight:800; cursor:pointer;">
        Lookup
      </button>
    </div>

    <pre id="ulOut" style="margin-top:12px; padding:10px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.10); white-space:pre-wrap;"></pre>
  </section>

  <script>
  (function(){
    const inp = document.getElementById("ulUser");
    const btn = document.getElementById("ulBtn");
    const out = document.getElementById("ulOut");
    if (!inp || !btn || !out) return;

    function fmtUnlocks(u){
      try{
        const keys = Object.keys(u||{});
        if (!keys.length) return "none";
        keys.sort();
        return keys.map(k => `${k}: ${u[k]}`).join("\n");
      }catch(e){ return "none"; }
    }

    async function lookup(){
      const user = (inp.value || "").trim();
      if (!user){ out.textContent = "Enter a user."; return; }
      out.textContent = "Working…";
      try{
        const r = await fetch(<?= json_encode((($_SERVER['PHP_SELF'] ?? 'admin.php') . '?ajax=user_lookup')) ?>, {
          method:"POST",
          credentials:"include",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ user, csrf: <?= json_encode($csrf) ?> })
        });
        const j = await r.json().catch(()=>null);
        if (!j){ out.textContent = "No JSON response."; return; }
        if (!j.ok){ out.textContent = "Error: " + (j.error || "unknown"); return; }

        const u = j.user || {};
        out.textContent =
          `User: ${u.username || ""}\n` +
          `Email: ${u.email || ""}\n` +
          `UID: ${u.id}\n` +
          `Created: ${u.created_at || ""}\n\n` +
          `Points: ${j.points}\n\n` +
          `Unlocks:\n${fmtUnlocks(j.unlocked)}\n\n` +
          `Recent visits (${j.visits_scope || 'site-wide'}):\n` +
          (Array.isArray(j.recent_visits) && j.recent_visits.length
            ? j.recent_visits.map(v => `${v.created_at}  ${v.page}  ${v.referrer||""}`).join("\n")
            : "none");
      }catch(e){
        out.textContent = "Request failed.";
      }
    }

    btn.addEventListener("click", lookup);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") lookup(); });
  })();
  </script>

    <?php endif; ?>

  </div>
</body>
</html>
