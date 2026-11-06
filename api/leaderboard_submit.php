<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';

try {
    $user = snapshift_auth_require_login();
    $uid = (int)$user['id'];
    $username = trim((string)($user['username'] ?? ''));
    if ($username === '') $username = 'Player';

    $pdo = snapshift_pdo();
    snapshift_auth_ensure_leaderboard_tables($pdo);

    $data = snapshift_auth_get_json_input();
    $day = snapshift_auth_day_key($data['day'] ?? null);
    $time_ms = max(0, (int)($data['time_ms'] ?? 0));
    $moves = max(0, (int)($data['moves'] ?? 0));
    $acc = isset($data['acc']) ? max(0, min(100, (int)$data['acc'])) : 0;

    if ($time_ms <= 0) {
        snapshift_auth_json(['ok' => false, 'error' => 'time_ms_required'], 400);
    }

    $st = $pdo->prepare("SELECT time_ms, moves, acc FROM leaderboard_daily WHERE day_key = ? AND user_id = ? LIMIT 1");
    $st->execute([$day, $uid]);
    $cur = $st->fetch(PDO::FETCH_ASSOC) ?: null;

    $shouldUpdate = false;
    if (!$cur) {
        $shouldUpdate = true;
    } else {
        $ct = (int)$cur['time_ms'];
        $cm = (int)$cur['moves'];
        $ca = (int)$cur['acc'];
        if ($time_ms < $ct) $shouldUpdate = true;
        elseif ($time_ms === $ct && $moves < $cm) $shouldUpdate = true;
        elseif ($time_ms === $ct && $moves === $cm && $acc > $ca) $shouldUpdate = true;
    }

    if (!$cur) {
        $ins = $pdo->prepare("INSERT INTO leaderboard_daily (day_key, user_id, username, time_ms, moves, acc) VALUES (?, ?, ?, ?, ?, ?)");
        $ins->execute([$day, $uid, $username, $time_ms, $moves, $acc]);
    } elseif ($shouldUpdate) {
        $up = $pdo->prepare("UPDATE leaderboard_daily
                             SET username = ?, time_ms = ?, moves = ?, acc = ?, created_at = CURRENT_TIMESTAMP
                             WHERE day_key = ? AND user_id = ?");
        $up->execute([$username, $time_ms, $moves, $acc, $day, $uid]);
    } else {
        $upUser = $pdo->prepare("UPDATE leaderboard_daily SET username = ? WHERE day_key = ? AND user_id = ? AND username <> ?");
        $upUser->execute([$username, $day, $uid, $username]);
    }

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'day' => $day,
        'user_id' => $uid,
        'username' => $username,
        'updated' => $shouldUpdate,
        'time_ms' => $time_ms,
        'moves' => $moves,
        'acc' => $acc,
        'efficiency' => $acc
    ]);
} catch (Throwable $e) {
    snapshift_auth_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
