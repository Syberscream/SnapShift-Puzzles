<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';

try {
    $user = snapshift_auth_require_login();
    $uid = (int)$user['id'];

    $pdo = snapshift_pdo();
    snapshift_auth_ensure_leaderboard_tables($pdo);

    $day = snapshift_auth_day_key($_GET['day'] ?? null);
    $rows = snapshift_auth_daily_ranked_rows($pdo, $day);

    if (!$rows) {
        snapshift_auth_json([
            'ok' => true,
            'loggedIn' => true,
            'day' => $day,
            'has_entry' => false,
            'rank' => null,
        ]);
    }

    $rank = null;
    $meRow = null;
    foreach ($rows as $i => $r) {
        if ((int)($r['user_id'] ?? 0) === $uid) {
            $rank = $i + 1;
            $meRow = $r;
            break;
        }
    }

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'day' => $day,
        'has_entry' => (bool)$meRow,
        'rank' => $rank,
        'time_ms' => $meRow ? (int)$meRow['time_ms'] : null,
        'moves' => $meRow ? (int)$meRow['moves'] : null,
        'acc' => $meRow ? snapshift_auth_efficiency((int)$meRow['moves'], $meRow['acc'] ?? null) : null,
        'efficiency' => $meRow ? snapshift_auth_efficiency((int)$meRow['moves'], $meRow['acc'] ?? null) : null,
    ]);
} catch (Throwable $e) {
    snapshift_auth_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
