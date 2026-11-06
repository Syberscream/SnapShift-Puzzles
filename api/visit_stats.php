<?php
declare(strict_types=1);
require_once __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function pq_day_key_utc(int $daysAgo=0): string {
  $dt = new DateTime('now', new DateTimeZone('UTC'));
  if ($daysAgo !== 0) $dt->modify(($daysAgo > 0 ? '-' : '+') . abs($daysAgo) . ' day');
  return $dt->format('Y-m-d');
}

try {
  // Login required for admin dashboard, but return a clean JSON instead of a hard error
  try {
    $auth = pq_require_login();
  } catch (Throwable $e) {
    pq_json(['ok'=>false,'loggedIn'=>false,'error'=>'login_required']);
  }

  $pdo = pq_pdo();

  // Ensure table exists
  $pdo->exec("CREATE TABLE IF NOT EXISTS site_visits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    visitor_id VARCHAR(64) NOT NULL,
    page VARCHAR(128) NOT NULL,
    referrer VARCHAR(255) NULL,
    user_agent VARCHAR(255) NULL,
    ip_hash CHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_created_at (created_at),
    KEY idx_page (page),
    KEY idx_visitor_day (visitor_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  $today = pq_day_key_utc(0);
  $weekStart = (new DateTime($today, new DateTimeZone('UTC')))->modify('-6 day')->format('Y-m-d');

  $st = $pdo->prepare("SELECT 
      COUNT(*) as views_today,
      COUNT(DISTINCT visitor_id) as uniques_today
    FROM site_visits
    WHERE created_at >= CONCAT(?, ' 00:00:00')");
  $st->execute([$today]);
  $todayRow = $st->fetch(PDO::FETCH_ASSOC) ?: ['views_today'=>0,'uniques_today'=>0];

  $st2 = $pdo->prepare("SELECT 
      COUNT(*) as views_7d,
      COUNT(DISTINCT visitor_id) as uniques_7d
    FROM site_visits
    WHERE created_at >= CONCAT(?, ' 00:00:00')");
  $st2->execute([$weekStart]);
  $weekRow = $st2->fetch(PDO::FETCH_ASSOC) ?: ['views_7d'=>0,'uniques_7d'=>0];

  $st3 = $pdo->prepare("SELECT page, COUNT(*) as views
    FROM site_visits
    WHERE created_at >= CONCAT(?, ' 00:00:00')
    GROUP BY page
    ORDER BY views DESC
    LIMIT 10");
  $st3->execute([$weekStart]);
  $topPages = $st3->fetchAll(PDO::FETCH_ASSOC);

  $st4 = $pdo->prepare("SELECT 
      LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(referrer, '//', -1), '/', 1)) AS ref_domain,
      COUNT(*) as views
    FROM site_visits
    WHERE created_at >= CONCAT(?, ' 00:00:00')
      AND referrer IS NOT NULL
      AND referrer <> ''
    GROUP BY ref_domain
    ORDER BY views DESC
    LIMIT 10");
  $st4->execute([$weekStart]);
  $topReferrers = $st4->fetchAll(PDO::FETCH_ASSOC);

  pq_json([
    'ok'=>true,
    'loggedIn'=>true,
    'today'=>$today,
    'views_today'=>(int)($todayRow['views_today']??0),
    'uniques_today'=>(int)($todayRow['uniques_today']??0),
    'since'=>$weekStart,
    'views_7d'=>(int)($weekRow['views_7d']??0),
    'uniques_7d'=>(int)($weekRow['uniques_7d']??0),
    'top_pages'=>$topPages,
    'top_referrers'=>$topReferrers,
  ]);
} catch (Throwable $e) {
  // Always return JSON so the admin UI doesn't hang
  if (function_exists('pq_json')) {
    pq_json(['ok'=>false,'loggedIn'=>true,'error'=>'server_error','detail'=>$e->getMessage()], 500);
  }
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'server_error'], JSON_UNESCAPED_SLASHES);
}
