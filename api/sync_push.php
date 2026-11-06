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
function num($v, $d=0){ return is_numeric($v) ? $v+0 : $d; }

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') out(['ok'=>false,'error'=>'POST required'],405);
$uid = (int)($_SESSION['user_id'] ?? 0);
$username = (string)($_SESSION['username'] ?? '');
if ($uid <= 0) out(['ok'=>false,'error'=>'Not logged in'],401);

$raw = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) $data = $_POST;

try {
  $pdo = pq_pdo();
  $pdo->beginTransaction();

  $points = max(0, (int)num($data['points'] ?? $data['global_points'] ?? 0, 0));
  // user_state upsert (works with or without updated_at)
  try {
    $st = $pdo->prepare('INSERT INTO user_state (user_id, points, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE points=VALUES(points), updated_at=NOW()');
    $st->execute([$uid, $points]);
  } catch (Throwable $e) {
    $st = $pdo->prepare('INSERT INTO user_state (user_id, points) VALUES (?, ?) ON DUPLICATE KEY UPDATE points=VALUES(points)');
    $st->execute([$uid, $points]);
  }

  $daily = is_array($data['daily'] ?? null) ? $data['daily'] : null;
  $dailySaved = false;
  if ($daily) {
    $dailyHash = trim((string)($daily['hash'] ?? $daily['daily_hash'] ?? ''));
    if ($dailyHash !== '') {
      $score = (int)num($daily['score'] ?? 0, 0);
      $timeMs = (int)num($daily['time_ms'] ?? $daily['timeMs'] ?? 0, 0);
      $moves = (int)num($daily['moves'] ?? 0, 0);
      $accuracy = (float)num($daily['accuracy'] ?? $daily['acc'] ?? 0, 0);
      $difficulty = (string)($daily['difficulty'] ?? 'easy');
      $metaJson = json_encode([
        'catId' => $daily['catId'] ?? null,
        'src' => $daily['src'] ?? null,
        'name' => $daily['name'] ?? null,
      ], JSON_UNESCAPED_SLASHES);

      // Save one best row per user/day hash if unique key exists; else insert then dedupe in SQL.
      $usedUpsert = false;
      try {
        $sql = 'INSERT INTO daily_scores (user_id, username, daily_hash, score, time_ms, moves, accuracy, difficulty, meta_json, created_at, updated_at) '
             . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) '
             . 'ON DUPLICATE KEY UPDATE '
             . 'score = GREATEST(score, VALUES(score)), '
             . 'time_ms = IF(score < VALUES(score), VALUES(time_ms), IF(score = VALUES(score), LEAST(time_ms, VALUES(time_ms)), time_ms)), '
             . 'moves = IF(score < VALUES(score), VALUES(moves), IF(score = VALUES(score), LEAST(moves, VALUES(moves)), moves)), '
             . 'accuracy = IF(score < VALUES(score), VALUES(accuracy), IF(score = VALUES(score), GREATEST(accuracy, VALUES(accuracy)), accuracy)), '
             . 'difficulty = VALUES(difficulty), meta_json = VALUES(meta_json), username = VALUES(username), updated_at = NOW()';
        $st = $pdo->prepare($sql);
        $st->execute([$uid, $username, $dailyHash, $score, $timeMs, $moves, $accuracy, $difficulty, $metaJson]);
        $usedUpsert = true;
      } catch (Throwable $e) {
        // Fallback minimal schema
        try {
          $st = $pdo->prepare('INSERT INTO daily_scores (user_id, username, daily_hash, score, time_ms, moves, accuracy, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())');
          $st->execute([$uid, $username, $dailyHash, $score, $timeMs, $moves, $accuracy, $difficulty]);
        } catch (Throwable $e2) {
          $st = $pdo->prepare('INSERT INTO daily_scores (user_id, daily_hash, score, time_ms, moves, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())');
          $st->execute([$uid, $dailyHash, $score, $timeMs, $moves, $accuracy]);
        }
      }

      // Dedupe if table allows duplicates
      try {
        $best = $pdo->prepare('SELECT id, score, time_ms, moves, accuracy FROM daily_scores WHERE user_id=? AND daily_hash=? ORDER BY score DESC, time_ms ASC, moves ASC, accuracy DESC, id ASC');
        $best->execute([$uid, $dailyHash]);
        $rows = $best->fetchAll(PDO::FETCH_ASSOC);
        if (count($rows) > 1 && isset($rows[0]['id'])) {
          $keep = (int)$rows[0]['id'];
          $ids = [];
          foreach ($rows as $r) { $id=(int)($r['id']??0); if ($id>0 && $id!==$keep) $ids[]=$id; }
          if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $del = $pdo->prepare("DELETE FROM daily_scores WHERE id IN ($in)");
            $del->execute($ids);
          }
        }
      } catch (Throwable $e) {}

      $dailySaved = true;
    }
  }

  $pdo->commit();
  out(['ok'=>true,'auth'=>true,'points'=>$points,'daily_saved'=>$dailySaved]);
} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  out(['ok'=>false,'error'=>$e->getMessage()],500);
}
