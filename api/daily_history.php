<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';

try {
    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_auth_json(['ok' => true, 'loggedIn' => false, 'days' => []]);
    }

    $uid = (int)$user['id'];
    $pdo = snapshift_pdo();
    snapshift_auth_ensure_leaderboard_tables($pdo);

    $daysRequested = (int)($_GET['days'] ?? 14);
    if ($daysRequested < 7) $daysRequested = 7;
    if ($daysRequested > 400) $daysRequested = 400;

    $tz = new DateTimeZone('UTC');
    $today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');
    $dayList = snapshift_auth_day_list($daysRequested, $tz);
    $start = $dayList[0];
    $end = $dayList[count($dayList) - 1];

    $st = $pdo->prepare("SELECT DISTINCT day_key FROM leaderboard_daily WHERE user_id = ? ORDER BY day_key ASC");
    $st->execute([$uid]);
    $completedAll = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $day = snapshift_auth_valid_day($row['day_key'] ?? null);
        if ($day) $completedAll[$day] = true;
    }

    $completedKeys = array_keys($completedAll);
    sort($completedKeys, SORT_STRING);

    $claimed = [];
    $rewardPoints = [];
    $st2 = $pdo->prepare("SELECT day_key, reward_points FROM daily_reward_claims WHERE user_id = ? AND day_key BETWEEN ? AND ? ORDER BY day_key ASC");
    $st2->execute([$uid, $start, $end]);
    while ($row = $st2->fetch(PDO::FETCH_ASSOC)) {
        $day = snapshift_auth_valid_day($row['day_key'] ?? null);
        if (!$day) continue;
        $claimed[$day] = true;
        $rewardPoints[$day] = (int)($row['reward_points'] ?? 0);
    }

    $lastCompleted = $completedKeys ? end($completedKeys) : null;
    if ($lastCompleted !== false && $lastCompleted !== null) {
        $lastDate = new DateTimeImmutable($lastCompleted, $tz);
        $yesterday = (new DateTimeImmutable($today, $tz))->modify('-1 day');
        if ($lastDate < $yesterday) {
            $currentStreak = 0;
        } else {
            $currentStreak = 1;
            $cursor = $lastDate;
            while (true) {
                $cursor = $cursor->modify('-1 day');
                $k = $cursor->format('Y-m-d');
                if (!isset($completedAll[$k])) break;
                $currentStreak++;
            }
        }
    } else {
        $currentStreak = 0;
    }

    $bestStreak = snapshift_auth_compute_best_streak($completedKeys);

    $items = [];
    foreach ($dayList as $day) {
        $isToday = ($day === $today);
        $done = isset($completedAll[$day]);
        $missed = (!$done && !$isToday);
        $items[] = [
            'day' => $day,
            'completed' => $done,
            'claimed' => isset($claimed[$day]),
            'reward_points' => (int)($rewardPoints[$day] ?? 0),
            'missed' => $missed,
            'is_today' => $isToday,
        ];
    }

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'userId' => $uid,
        'days_requested' => $daysRequested,
        'today' => $today,
        'current_streak' => $currentStreak,
        'best_streak' => $bestStreak,
        'total_completed' => count($completedKeys),
        'last_completed' => $lastCompleted ?: null,
        'days' => $items,
    ]);
} catch (Throwable $e) {
    snapshift_auth_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
