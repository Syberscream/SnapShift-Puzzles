<?php
declare(strict_types=1);
if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }
require_once __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function sr_json(array $data, int $code = 200): void {
    if (function_exists('pq_json')) {
        pq_json($data, $code);
    }
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function sr_valid_day(?string $s): ?string {
    if (!$s) return null;
    $s = trim($s);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
}

function sr_current_streak(array $completedDays, string $todayUtc): array {
    if (!$completedDays) {
        return [0, null];
    }
    sort($completedDays, SORT_STRING);
    $lastCompleted = end($completedDays);
    if ($lastCompleted === false) {
        return [0, null];
    }

    $tz = new DateTimeZone('UTC');
    $lastDate = new DateTime($lastCompleted, $tz);
    $yesterday = new DateTime($todayUtc, $tz);
    $yesterday->modify('-1 day');
    if ($lastDate < $yesterday) {
        return [0, $lastCompleted];
    }

    $set = array_fill_keys($completedDays, true);
    $streak = 1;
    $cursor = clone $lastDate;
    while (true) {
        $cursor->modify('-1 day');
        $k = $cursor->format('Y-m-d');
        if (!isset($set[$k])) break;
        $streak++;
    }
    return [$streak, $lastCompleted];
}


function sr_resolve_user(PDO $pdo, string $user): ?array {
    $user = trim($user);
    if ($user === '') return null;

    if (ctype_digit($user)) {
        $st = $pdo->prepare("SELECT id, username, email FROM users WHERE id=? LIMIT 1");
        $st->execute([(int)$user]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (is_array($row)) return $row;
    }

    $st = $pdo->prepare("SELECT id, username, email FROM users WHERE username=? OR email=? LIMIT 1");
    $st->execute([$user, $user]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

function sr_handle_admin_test(PDO $pdo, array $rewardMap): void {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    if (empty($_SESSION['authed']) || $_SESSION['authed'] !== true) {
        sr_json(['ok' => false, 'error' => 'admin_not_authed'], 403);
    }

    $csrf = (string)($_POST['csrf'] ?? '');
    if (empty($_SESSION['csrf']) || !hash_equals((string)$_SESSION['csrf'], $csrf)) {
        sr_json(['ok' => false, 'error' => 'bad_csrf'], 400);
    }

    $user = trim((string)($_POST['user'] ?? ''));
    $milestone = (int)($_POST['milestone'] ?? 0);
    if ($user === '' || !isset($rewardMap[$milestone])) {
        sr_json(['ok' => false, 'error' => 'bad_request'], 400);
    }

    $target = sr_resolve_user($pdo, $user);
    if (!$target) {
        sr_json(['ok' => false, 'error' => 'user_not_found'], 404);
    }

    $uid = (int)($target['id'] ?? 0);
    if ($uid <= 0) {
        sr_json(['ok' => false, 'error' => 'bad_user'], 400);
    }

    $reward = (int)$rewardMap[$milestone];

    $pdo->prepare("INSERT INTO user_state (user_id, points, unlocked_json)
                   VALUES (?, 0, '{}')
                   ON DUPLICATE KEY UPDATE user_id=user_id")
        ->execute([$uid]);

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
        $pdo->prepare("UPDATE user_state SET points = GREATEST(0, points + ?) WHERE user_id=?")
            ->execute([$reward, $uid]);

        $pdo->prepare("INSERT INTO admin_reward_test_log (admin_session_id, user_id, milestone, reward_points)
                       VALUES (?,?,?,?)")
            ->execute([session_id(), $uid, $milestone, $reward]);

        $pdo->commit();

        $state = pq_get_user_state($pdo, $uid);

        sr_json([
            'ok' => true,
            'admin_test' => true,
            'uid' => $uid,
            'username' => (string)($target['username'] ?? ''),
            'email' => (string)($target['email'] ?? ''),
            'milestone' => $milestone,
            'reward' => $reward,
            'points' => (int)($state['points'] ?? 0),
            'note' => 'Test reward granted only. Real streak claims are untouched.',
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
function sr_reached_day(string $lastCompleted, int $currentStreak, int $milestone): string {
    $tz = new DateTimeZone('UTC');
    $d = new DateTime($lastCompleted, $tz);
    $offset = max(0, $currentStreak - $milestone);
    if ($offset > 0) {
        $d->modify('-' . $offset . ' day');
    }
    return $d->format('Y-m-d');
}

try {
    $auth = pq_require_login();
    $uid = (int)($auth['uid'] ?? 0);
    if ($uid <= 0) {
        sr_json(['ok' => false, 'error' => 'not_logged_in'], 401);
    }

    $pdo = pq_pdo();
    $rewardMap = [7 => 250, 14 => 1000, 30 => 2500];

    if (($_POST['admin_test'] ?? '') === '1') {
        sr_handle_admin_test($pdo, $rewardMap);
    }

    $today = (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d');

    $pdo->exec("CREATE TABLE IF NOT EXISTS streak_reward_claims (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      milestone INT NOT NULL,
      reward_points INT NOT NULL,
      achieved_day VARCHAR(10) NOT NULL,
      current_streak_at_claim INT NOT NULL DEFAULT 0,
      claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_milestone (user_id, milestone),
      KEY idx_user (user_id),
      KEY idx_achieved_day (achieved_day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->prepare("INSERT INTO user_state (user_id, points, unlocked_json)
                   VALUES (?, 0, '{}')
                   ON DUPLICATE KEY UPDATE user_id=user_id")
        ->execute([$uid]);

    $st = $pdo->prepare("SELECT day_key FROM leaderboard_daily WHERE user_id=? ORDER BY day_key ASC");
    $st->execute([$uid]);
    $completed = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $day = sr_valid_day($row['day_key'] ?? null);
        if ($day) $completed[$day] = true;
    }
    $completedDays = array_keys($completed);
    sort($completedDays, SORT_STRING);

    [$currentStreak, $lastCompleted] = sr_current_streak($completedDays, $today);

    $awarded = [];
    if ($currentStreak >= 7 && $lastCompleted) {
        $pdo->beginTransaction();
        try {
            $claimedSt = $pdo->prepare("SELECT milestone FROM streak_reward_claims WHERE user_id=? FOR UPDATE");
            $claimedSt->execute([$uid]);
            $claimed = [];
            while ($row = $claimedSt->fetch(PDO::FETCH_ASSOC)) {
                $claimed[(int)($row['milestone'] ?? 0)] = true;
            }

            $ins = $pdo->prepare("INSERT IGNORE INTO streak_reward_claims
                (user_id, milestone, reward_points, achieved_day, current_streak_at_claim)
                VALUES (?,?,?,?,?)");
            $addPoints = $pdo->prepare("UPDATE user_state SET points = GREATEST(0, points + ?) WHERE user_id=?");

            foreach ($rewardMap as $milestone => $reward) {
                if ($currentStreak < $milestone || isset($claimed[$milestone])) continue;
                $achievedDay = sr_reached_day($lastCompleted, $currentStreak, $milestone);
                $ins->execute([$uid, $milestone, $reward, $achievedDay, $currentStreak]);
                if ($ins->rowCount() > 0) {
                    $addPoints->execute([$reward, $uid]);
                    $awarded[] = [
                        'milestone' => $milestone,
                        'reward' => $reward,
                        'achieved_day' => $achievedDay,
                    ];
                }
            }
            $pdo->commit();
        } catch (Throwable $txe) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $txe;
        }
    }

    $state = pq_get_user_state($pdo, $uid);
    sr_json([
        'ok' => true,
        'current_streak' => $currentStreak,
        'last_completed' => $lastCompleted,
        'awarded' => $awarded,
        'points' => (int)($state['points'] ?? 0),
    ]);
} catch (Throwable $e) {
    sr_json(['ok' => false, 'error' => $e->getMessage()], 500);
}
