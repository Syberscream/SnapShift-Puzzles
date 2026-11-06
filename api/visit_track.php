<?php
declare(strict_types=1);
require_once __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function pq_json_out(array $data, int $code=200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}

try{
  $pdo = pq_pdo();

  // Create table if missing (keep compatible with earlier installs)
  $pdo->exec("CREATE TABLE IF NOT EXISTS site_visits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    visitor_id VARCHAR(64) NOT NULL,
    page VARCHAR(64) NOT NULL,
    referrer VARCHAR(512) NULL,
    user_agent VARCHAR(512) NULL,
    ip_hash CHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_created (created_at),
    KEY idx_page (page),
    KEY idx_user (user_id),
    KEY idx_visitor (visitor_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

  // Ensure user_id exists (older installs)
  try{
    $has = $pdo->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME='site_visits'
                            AND COLUMN_NAME='user_id'");
    $has->execute();
    $exists = (int)$has->fetchColumn() > 0;
    if (!$exists){
      $pdo->exec("ALTER TABLE site_visits ADD COLUMN user_id BIGINT UNSIGNED NULL, ADD KEY idx_user (user_id)");
    }
  } catch (Throwable $e) { /* ignore */ }

  // Determine logged-in user id (best effort)
  $uid = null;

  // 1) Try your auth helper if present
  try{
    if (function_exists('pq_require_login')) {
      $auth = pq_require_login();
      if (is_array($auth)) {
        if (isset($auth['uid'])) $uid = (int)$auth['uid'];
        elseif (isset($auth['user_id'])) $uid = (int)$auth['user_id'];
        elseif (isset($auth['id'])) $uid = (int)$auth['id'];
      }
    }
  }catch(Throwable $e){ $uid = null; }

  // 2) Fall back to session keys (covers pages where pq_require_login isn't appropriate)
  try{
    if (session_status() !== PHP_SESSION_ACTIVE) @session_start();
    if ($uid === null && isset($_SESSION)) {
      foreach (['uid','user_id','userid','userId','id'] as $k) {
        if (isset($_SESSION[$k]) && is_numeric($_SESSION[$k])) { $uid = (int)$_SESSION[$k]; break; }
      }
      // sometimes user array is stored
      if ($uid === null && isset($_SESSION['user']) && is_array($_SESSION['user'])) {
        $u = $_SESSION['user'];
        foreach (['uid','user_id','id'] as $k) {
          if (isset($u[$k]) && is_numeric($u[$k])) { $uid = (int)$u[$k]; break; }
        }
      }
    }
  } catch (Throwable $e) { /* ignore */ }

  // Inputs
  $page = isset($_GET['page']) ? preg_replace('/[^a-z0-9_\-]/i','', (string)$_GET['page']) : '';
  if ($page === '') $page = 'unknown';

  $ref = $_SERVER['HTTP_REFERER'] ?? null;
  $ua  = $_SERVER['HTTP_USER_AGENT'] ?? null;

  // visitor_id cookie (anonymous browser id)
  $cookieName = 'pq_vid';
  $vid = $_COOKIE[$cookieName] ?? '';
  if (!preg_match('/^[a-zA-Z0-9_\-]{10,64}$/', $vid)) {
    $vid = bin2hex(random_bytes(16));
    setcookie($cookieName, $vid, [
      'expires' => time() + 60*60*24*365,
      'path' => '/',
      'secure' => true,
      'httponly' => false,
      'samesite' => 'Lax'
    ]);
  }

  // IP hash (privacy-safe)
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $ipHash = $ip ? hash('sha256', $ip) : null;

  $st = $pdo->prepare("INSERT INTO site_visits (user_id, visitor_id, page, referrer, user_agent, ip_hash)
                       VALUES (?,?,?,?,?,?)");
  $st->execute([$uid, $vid, $page, $ref, $ua, $ipHash]);

  pq_json_out(['ok'=>true,'user_id'=>$uid,'visitor_id'=>$vid,'page'=>$page]);
}catch(Throwable $e){
  pq_json_out(['ok'=>false,'error'=>$e->getMessage()], 500);
}
