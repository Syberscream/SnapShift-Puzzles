<?php
declare(strict_types=1);
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/debug_gate.php';
pq_require_debug_access('json');

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }

function dh_json(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function dh_valid_day(?string $s): ?string {
    if (!$s) return null;
    $s = trim($s);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
}

function dh_day_list(int $days, DateTimeZone $tz): array {
    $out = [];
    $today = new DateTime('now', $tz);
    $today->setTime(0, 0, 0);
    for ($i = $days - 1; $i >= 0; $i--) {
        $d = clone $today;
        if ($i > 0) $d->modify('-' . $i . ' day');
        $out[] = $d->format('Y-m-d');
    }
    return $out;
}

function dh_compute_best_streak(array $completedDays): int {
    if (!$completedDays) return 0;
    sort($completedDays, SORT_STRING);
    $best = 0;
    $run = 0;
    $prev = null;
    foreach ($completedDays as $day) {
        if ($prev === null) {
            $run = 1;
        } else {
            $pd = new DateTime($prev, new DateTimeZone('UTC'));
            $pd->modify('+1 day');
            $expected = $pd->format('Y-m-d');
            $run = ($day === $expected) ? ($run + 1) : 1;
        }
        if ($run > $best) $best = $run;
        $prev = $day;
    }
    return $best;
}



function dh_fake_items(int $daysRequested, DateTimeZone $tz): array {
    $list = dh_day_list($daysRequested, $tz);
    $out = [];
    $today = (new DateTime('now', $tz))->format('Y-m-d');
    foreach ($list as $day) {
        $claimed = ($day !== $today);
        $out[] = [
            'day' => $day,
            'completed' => true,
            'claimed' => $claimed,
            'reward_points' => $claimed ? 50 : 0,
            'missed' => false,
            'is_today' => ($day === $today),
        ];
    }
    return $out;
}

function dh_is_test14_enabled(): bool {
    if (isset($_GET['test14'])) {
        $v = strtolower(trim((string)$_GET['test14']));
        return in_array($v, ['1','true','yes','on'], true);
    }
    return (isset($_COOKIE['pq_test14']) && $_COOKIE['pq_test14'] === '1');
}

try {
    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) {
        dh_json(['ok' => true, 'loggedIn' => false, 'days' => []]);
    }

    $pdo = pq_pdo();
    $daysRequested = (int)($_GET['days'] ?? 14);
    if ($daysRequested < 7) $daysRequested = 7;
    if ($daysRequested > 30) $daysRequested = 30;

    $tz = new DateTimeZone('UTC');
    $today = (new DateTime('now', $tz))->format('Y-m-d');
    $dayList = dh_day_list($daysRequested, $tz);
    $start = $dayList[0];
    $end = $dayList[count($dayList) - 1];


    if (dh_is_test14_enabled()) {
        $todayFake = (new DateTime('now', $tz))->format('Y-m-d');
        dh_json([
            'ok' => true,
            'loggedIn' => true,
            'test_mode' => true,
            'days_requested' => $daysRequested,
            'today' => $todayFake,
            'current_streak' => 14,
            'best_streak' => 14,
            'total_completed' => 14,
            'last_completed' => $todayFake,
            'days' => dh_fake_items($daysRequested, $tz),
        ]);
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS daily_reward_claims (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      day_key VARCHAR(10) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      rank_pos INT NOT NULL,
      reward_points INT NOT NULL,
      claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_day_user (day_key, user_id),
      KEY idx_day (day_key),
      KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $st = $pdo->prepare("SELECT day_key FROM leaderboard_daily WHERE user_id=? ORDER BY day_key ASC");
    $st->execute([$uid]);
    $completedAll = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $day = dh_valid_day($row['day_key'] ?? null);
        if ($day) $completedAll[$day] = true;
    }
    $completedKeys = array_keys($completedAll);
    sort($completedKeys, SORT_STRING);

    $claimed = [];
    $rewardPoints = [];
    $st2 = $pdo->prepare("SELECT day_key, reward_points FROM daily_reward_claims WHERE user_id=? AND day_key BETWEEN ? AND ? ORDER BY day_key ASC");
    $st2->execute([$uid, $start, $end]);
    while ($row = $st2->fetch(PDO::FETCH_ASSOC)) {
        $day = dh_valid_day($row['day_key'] ?? null);
        if (!$day) continue;
        $claimed[$day] = true;
        $rewardPoints[$day] = (int)($row['reward_points'] ?? 0);
    }

    $lastCompleted = $completedKeys ? end($completedKeys) : null;
    if ($lastCompleted !== false && $lastCompleted !== null) {
        $lastDate = new DateTime($lastCompleted, $tz);
        $yesterday = new DateTime($today, $tz);
        $yesterday->modify('-1 day');
        if ($lastDate < $yesterday) {
            $currentStreak = 0;
        } else {
            $currentStreak = 1;
            $cursor = clone $lastDate;
            while (true) {
                $cursor->modify('-1 day');
                $k = $cursor->format('Y-m-d');
                if (!isset($completedAll[$k])) break;
                $currentStreak++;
            }
        }
    } else {
        $currentStreak = 0;
    }

    $bestStreak = dh_compute_best_streak($completedKeys);
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

    dh_json([
        'ok' => true,
        'loggedIn' => true,
        'days_requested' => $daysRequested,
        'today' => $today,
        'current_streak' => $currentStreak,
        'best_streak' => $bestStreak,
        'total_completed' => count($completedKeys),
        'last_completed' => $lastCompleted ?: null,
        'days' => $items,
    ]);
} catch (Throwable $e) {
    dh_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
