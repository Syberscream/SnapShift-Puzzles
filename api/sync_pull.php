<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

function pq_pdo(): PDO {
  if (isset($GLOBALS['pdo']) && $GLOBALS['pdo'] instanceof PDO) return $GLOBALS['pdo'];
  if (function_exists('db')) {
    $pdo = db();
    if ($pdo instanceof PDO) return $pdo;
  }
  throw new RuntimeException('PDO not available from config.php');
}
function out(array $a, int $code = 200): void { http_response_code($code); echo json_encode($a, JSON_UNESCAPED_SLASHES); exit; }

try {
  $pdo = pq_pdo();
  $uid = (int)($_SESSION['user_id'] ?? 0);
  $username = (string)($_SESSION['username'] ?? '');
  if ($uid <= 0) {
    out(['ok'=>true,'auth'=>false,'points'=>0,'username'=>null,'daily'=>['done'=>false]]);
  }

  $points = 0;
  try {
    $st = $pdo->prepare('SELECT points FROM user_state WHERE user_id=? LIMIT 1');
    $st->execute([$uid]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row && isset($row['points'])) $points = max(0, (int)$row['points']);
  } catch (Throwable $e) {
    // user_state may not exist yet
  }

  $dailyHash = isset($_GET['daily_hash']) ? trim((string)$_GET['daily_hash']) : '';
  $dailyDone = false;
  if ($dailyHash !== '') {
    try {
      $st = $pdo->prepare('SELECT 1 FROM daily_scores WHERE user_id=? AND daily_hash=? LIMIT 1');
      $st->execute([$uid, $dailyHash]);
      $dailyDone = (bool)$st->fetchColumn();
    } catch (Throwable $e) {
      $dailyDone = false;
    }
  }

  out([
    'ok'=>true,
    'auth'=>true,
    'user_id'=>$uid,
    'username'=>$username !== '' ? $username : null,
    'points'=>$points,
    'daily'=>['done'=>$dailyDone, 'hash'=>$dailyHash !== '' ? $dailyHash : null],
  ]);
} catch (Throwable $e) {
  out(['ok'=>false,'error'=>$e->getMessage()], 500);
}
