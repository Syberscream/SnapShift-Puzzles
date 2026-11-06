<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';

try {
    $pdo = snapshift_pdo();
    snapshift_auth_ensure_leaderboard_tables($pdo);

    $limit = (int)($_GET['limit'] ?? 10);
    if ($limit < 1) $limit = 10;
    if ($limit > 50) $limit = 50;

    $day = trim((string)($_GET['day'] ?? ''));
    if ($day === '') {
        snapshift_auth_json(['ok' => true, 'mode' => 'daily', 'rows' => [], 'items' => [], 'message' => 'Missing day']);
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        snapshift_auth_json(['ok' => false, 'msg' => 'invalid day'], 400);
    }

    $rawRows = snapshift_auth_daily_ranked_rows($pdo, $day, max($limit, 50));
    $rows = [];
    $rank = 1;
    foreach (array_slice($rawRows, 0, $limit) as $r) {
        $eff = snapshift_auth_efficiency((int)($r['moves'] ?? 0), $r['acc'] ?? null);
        $rows[] = [
            'rank' => $rank++,
            'user_id' => (int)($r['user_id'] ?? 0),
            'username' => (string)($r['username'] ?? 'Player'),
            'time_ms' => (int)($r['time_ms'] ?? 0),
            'moves' => (int)($r['moves'] ?? 0),
            'acc' => $eff,
            'accuracy' => $eff,
            'efficiency' => $eff,
        ];
    }

    snapshift_auth_json([
        'ok' => true,
        'mode' => 'daily',
        'day' => $day,
        'rows' => $rows,
        'items' => $rows,
        'count_total' => count($rawRows),
    ]);
} catch (Throwable $e) {
    snapshift_auth_json(['ok' => false, 'msg' => 'server_error', 'error' => $e->getMessage()], 500);
}
