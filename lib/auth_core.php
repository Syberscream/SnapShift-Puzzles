<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function snapshift_auth_start(): void {
    snapshift_start_session();
}

function snapshift_auth_json(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        $json = json_encode([
            'ok' => false,
            'loggedIn' => (bool)($payload['loggedIn'] ?? false),
            'error_code' => 'json_encode_failed',
            'msg' => 'Server response could not be encoded cleanly.',
        ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    echo $json;
    exit;
}

function snapshift_auth_get_json_input(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return $_POST ?: [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function snapshift_auth_current_user(): ?array {
    snapshift_auth_start();
    return snapshift_current_user();
}

function snapshift_auth_require_login(): array {
    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_auth_json([
            'ok' => false,
            'loggedIn' => false,
            'error' => 'login_required'
        ], 401);
    }
    if (($user['status'] ?? 'active') !== 'active') {
        snapshift_auth_json([
            'ok' => false,
            'loggedIn' => false,
            'error' => 'account_disabled'
        ], 403);
    }
    return $user;
}

function snapshift_auth_user_id(): int {
    $user = snapshift_auth_require_login();
    return (int)($user['id'] ?? 0);
}

function snapshift_auth_username(): string {
    $user = snapshift_auth_require_login();
    $name = trim((string)($user['username'] ?? ''));
    return $name !== '' ? $name : 'Player';
}

function snapshift_auth_day_key(?string $s): string {
    $s = trim((string)$s);
    if ($s !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s;
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d');
}

function snapshift_auth_valid_day(?string $s): ?string {
    $s = trim((string)$s);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
}

function snapshift_auth_efficiency(int $moves, $storedAcc = null): int {
    $acc = (int)($storedAcc ?? 0);
    if ($acc > 0) return max(1, min(100, $acc));
    if ($moves <= 0) return 0;
    $eff = (int)round((96 / max(1, $moves)) * 100);
    return max(1, min(100, $eff));
}

function snapshift_auth_day_list(int $days, DateTimeZone $tz): array {
    $out = [];
    $today = new DateTimeImmutable('now', $tz);
    $today = $today->setTime(0, 0, 0);
    for ($i = $days - 1; $i >= 0; $i--) {
        $d = $today->modify('-' . $i . ' day');
        $out[] = $d->format('Y-m-d');
    }
    return $out;
}

function snapshift_auth_compute_best_streak(array $completedDays): int {
    if (!$completedDays) return 0;
    sort($completedDays, SORT_STRING);
    $best = 0;
    $run = 0;
    $prev = null;
    foreach ($completedDays as $day) {
        if ($prev === null) {
            $run = 1;
        } else {
            $pd = new DateTimeImmutable($prev, new DateTimeZone('UTC'));
            $expected = $pd->modify('+1 day')->format('Y-m-d');
            $run = ($day === $expected) ? ($run + 1) : 1;
        }
        if ($run > $best) $best = $run;
        $prev = $day;
    }
    return $best;
}

function snapshift_auth_ensure_leaderboard_tables(PDO $pdo): void {
    static $done = false;
    if ($done) return;

    $pdo->exec("CREATE TABLE IF NOT EXISTS leaderboard_daily (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        day_key VARCHAR(10) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        username VARCHAR(64) NOT NULL DEFAULT '',
        time_ms INT NOT NULL,
        moves INT NOT NULL DEFAULT 0,
        acc INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_day_user (day_key, user_id),
        KEY idx_day_time (day_key, time_ms),
        KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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

    $done = true;
}

function snapshift_auth_daily_ranked_rows(PDO $pdo, string $day, int $limit = 5000): array {
    $limit = max(1, min(5000, $limit));
    $sql = "SELECT a.user_id, a.username, a.time_ms, a.moves, a.acc
            FROM leaderboard_daily a
            WHERE a.day_key = ?
              AND a.user_id IS NOT NULL
              AND a.user_id > 0
              AND NOT EXISTS (
                SELECT 1
                FROM leaderboard_daily b
                WHERE b.day_key = a.day_key
                  AND b.user_id = a.user_id
                  AND (
                    b.time_ms < a.time_ms OR
                    (b.time_ms = a.time_ms AND COALESCE(b.moves, 2147483647) < COALESCE(a.moves, 2147483647)) OR
                    (b.time_ms = a.time_ms AND COALESCE(b.moves, 2147483647) = COALESCE(a.moves, 2147483647) AND COALESCE(b.acc, 0) > COALESCE(a.acc, 0)) OR
                    (b.time_ms = a.time_ms AND COALESCE(b.moves, 2147483647) = COALESCE(a.moves, 2147483647) AND COALESCE(b.acc, 0) = COALESCE(a.acc, 0) AND COALESCE(b.created_at, '9999-12-31 23:59:59') < COALESCE(a.created_at, '9999-12-31 23:59:59')) OR
                    (b.time_ms = a.time_ms AND COALESCE(b.moves, 2147483647) = COALESCE(a.moves, 2147483647) AND COALESCE(b.acc, 0) = COALESCE(a.acc, 0) AND COALESCE(b.created_at, '9999-12-31 23:59:59') = COALESCE(a.created_at, '9999-12-31 23:59:59') AND b.id < a.id)
                  )
              )
            ORDER BY a.time_ms ASC, a.moves ASC, a.acc DESC, a.created_at ASC, a.id ASC
            LIMIT {$limit}";
    $st = $pdo->prepare($sql);
    $st->execute([$day]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}


function snapshift_auth_ensure_user_state_supporter_schema(PDO $pdo): void {
    static $done = false;
    if ($done) return;

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_state (
        user_id BIGINT UNSIGNED NOT NULL,
        points INT NOT NULL DEFAULT 0,
        unlocked_json LONGTEXT NULL,
        PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $dbName = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($dbName === '') {
        $done = true;
        return;
    }

    $wanted = [
        'is_supporter' => "ALTER TABLE user_state ADD COLUMN is_supporter TINYINT(1) NOT NULL DEFAULT 0",
        'supporter_plan' => "ALTER TABLE user_state ADD COLUMN supporter_plan VARCHAR(20) NULL DEFAULT NULL",
        'supporter_started_at' => "ALTER TABLE user_state ADD COLUMN supporter_started_at DATETIME NULL DEFAULT NULL",
        'supporter_bonus_last_awarded_at' => "ALTER TABLE user_state ADD COLUMN supporter_bonus_last_awarded_at DATETIME NULL DEFAULT NULL",
        'supporter_expires_at' => "ALTER TABLE user_state ADD COLUMN supporter_expires_at DATETIME NULL DEFAULT NULL",
        'supporter_badge_label' => "ALTER TABLE user_state ADD COLUMN supporter_badge_label VARCHAR(64) NOT NULL DEFAULT 'Supporter'",
        'supporter_bonus_awarded_points_total' => "ALTER TABLE user_state ADD COLUMN supporter_bonus_awarded_points_total INT NOT NULL DEFAULT 0",
        'supporter_bonus_awarded_periods_total' => "ALTER TABLE user_state ADD COLUMN supporter_bonus_awarded_periods_total INT NOT NULL DEFAULT 0",
        'supporter_initial_bonus_awarded' => "ALTER TABLE user_state ADD COLUMN supporter_initial_bonus_awarded TINYINT(1) NOT NULL DEFAULT 0",
    ];

    $st = $pdo->prepare("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_state'");
    $st->execute([$dbName]);
    $have = [];
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) ?: [] as $col) {
        $have[(string)$col] = true;
    }

    foreach ($wanted as $col => $sql) {
        if (isset($have[$col])) continue;
        $pdo->exec($sql);
    }

    $done = true;
}

function snapshift_auth_ensure_user_state_row(PDO $pdo, int $uid): void {
    snapshift_auth_ensure_user_state_supporter_schema($pdo);
    $pdo->prepare(
        "INSERT INTO user_state (user_id, points, unlocked_json) VALUES (?, 0, '{}') ON DUPLICATE KEY UPDATE user_id = user_id"
    )->execute([$uid]);
}

function snapshift_auth_supporter_bonus_amount(): int {
    return 250;
}

function snapshift_auth_supporter_bonus_interval_days(): int {
    return 30;
}

function snapshift_auth_parse_utc_datetime(?string $value): ?DateTimeImmutable {
    $raw = trim((string)$value);
    if ($raw === '') return null;
    try {
        return new DateTimeImmutable($raw, new DateTimeZone('UTC'));
    } catch (Throwable $e) {
        return null;
    }
}

function snapshift_auth_supporter_state(PDO $pdo, int $uid, bool $applyBonus = true): array {
    snapshift_auth_ensure_user_state_row($pdo, $uid);

    $ownTx = !$pdo->inTransaction();
    if ($ownTx) $pdo->beginTransaction();
    try {
        $st = $pdo->prepare("SELECT points, is_supporter, supporter_plan, supporter_started_at, supporter_bonus_last_awarded_at, supporter_expires_at, supporter_badge_label, supporter_bonus_awarded_points_total, supporter_bonus_awarded_periods_total, supporter_initial_bonus_awarded FROM user_state WHERE user_id = ? LIMIT 1 FOR UPDATE");
        $st->execute([$uid]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: [
            'points' => 0,
            'is_supporter' => 0,
            'supporter_plan' => null,
            'supporter_started_at' => null,
            'supporter_bonus_last_awarded_at' => null,
            'supporter_expires_at' => null,
            'supporter_badge_label' => 'Supporter',
            'supporter_bonus_awarded_points_total' => 0,
            'supporter_bonus_awarded_periods_total' => 0,
            'supporter_initial_bonus_awarded' => 0,
        ];

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $startedAt = snapshift_auth_parse_utc_datetime($row['supporter_started_at'] ?? null);
        $lastAwardedAt = snapshift_auth_parse_utc_datetime($row['supporter_bonus_last_awarded_at'] ?? null);
        $expiresAt = snapshift_auth_parse_utc_datetime($row['supporter_expires_at'] ?? null);
        $badgeLabel = trim((string)($row['supporter_badge_label'] ?? '')) ?: 'Supporter';
        $plan = trim((string)($row['supporter_plan'] ?? '')) ?: null;
        $isSupporter = (int)($row['is_supporter'] ?? 0) === 1;
        $active = $isSupporter && ($expiresAt === null || $expiresAt > $now);
        $awardedPoints = 0;
        $awardedPeriods = 0;
        $bonusAmount = snapshift_auth_supporter_bonus_amount();
        $bonusIntervalDays = snapshift_auth_supporter_bonus_interval_days();
        $intervalSeconds = $bonusIntervalDays * 86400;
        $awardedPointsTotal = max(0, (int)($row['supporter_bonus_awarded_points_total'] ?? 0));
        $awardedPeriodsTotal = max(0, (int)($row['supporter_bonus_awarded_periods_total'] ?? 0));
        $initialBonusAwarded = !empty($row['supporter_initial_bonus_awarded']);

        if ($startedAt instanceof DateTimeImmutable && $lastAwardedAt instanceof DateTimeImmutable) {
            $historicalElapsed = max(0, $lastAwardedAt->getTimestamp() - $startedAt->getTimestamp());
            $historicalPeriods = intdiv($historicalElapsed, $intervalSeconds);
            $historicalPoints = $historicalPeriods * $bonusAmount;
            if ($historicalPeriods > $awardedPeriodsTotal || $historicalPoints > $awardedPointsTotal) {
                $awardedPeriodsTotal = max($awardedPeriodsTotal, $historicalPeriods);
                $awardedPointsTotal = max($awardedPointsTotal, $historicalPoints);
                $pdo->prepare("UPDATE user_state SET supporter_bonus_awarded_points_total = ?, supporter_bonus_awarded_periods_total = ? WHERE user_id = ?")
                    ->execute([$awardedPointsTotal, $awardedPeriodsTotal, $uid]);
            }
        }

        if ($active && $startedAt === null) {
            $startedAt = $now;
            $pdo->prepare("UPDATE user_state SET supporter_started_at = ? WHERE user_id = ?")
                ->execute([$startedAt->format('Y-m-d H:i:s'), $uid]);
        }

        if ($active && !$initialBonusAwarded) {
            $awardedPoints += $bonusAmount;
            $awardedPointsTotal += $bonusAmount;
            $initialBonusAwarded = true;
            $lastAwardedAt = $now;
            $pdo->prepare("UPDATE user_state SET points = points + ?, supporter_bonus_last_awarded_at = ?, supporter_bonus_awarded_points_total = supporter_bonus_awarded_points_total + ?, supporter_initial_bonus_awarded = 1 WHERE user_id = ?")
                ->execute([$bonusAmount, $now->format('Y-m-d H:i:s'), $bonusAmount, $uid]);
            $row['points'] = (int)($row['points'] ?? 0) + $bonusAmount;
        }

        if ($active && $applyBonus && $startedAt instanceof DateTimeImmutable) {
            $anchor = $lastAwardedAt ?: $startedAt;
            $elapsed = $now->getTimestamp() - $anchor->getTimestamp();
            if ($elapsed >= $intervalSeconds) {
                $awardedPeriods = intdiv($elapsed, $intervalSeconds);
                $awardedPoints = $awardedPeriods * $bonusAmount;
                $newAwardAt = $anchor->modify('+' . ($awardedPeriods * $bonusIntervalDays) . ' days');
                $pdo->prepare("UPDATE user_state SET points = points + ?, supporter_bonus_last_awarded_at = ?, supporter_bonus_awarded_points_total = supporter_bonus_awarded_points_total + ?, supporter_bonus_awarded_periods_total = supporter_bonus_awarded_periods_total + ? WHERE user_id = ?")
                    ->execute([$awardedPoints, $newAwardAt->format('Y-m-d H:i:s'), $awardedPoints, $awardedPeriods, $uid]);
                $row['points'] = (int)($row['points'] ?? 0) + $awardedPoints;
                $lastAwardedAt = $newAwardAt;
                $awardedPointsTotal += $awardedPoints;
                $awardedPeriodsTotal += $awardedPeriods;
            }
        }

        if ($ownTx && $pdo->inTransaction()) $pdo->commit();

        $nextBonusAt = null;
        if ($active && $startedAt instanceof DateTimeImmutable) {
            $anchor = $lastAwardedAt ?: $startedAt;
            $nextBonusAt = $anchor->modify('+' . $bonusIntervalDays . ' days');
        }

        return [
            'points' => (int)($row['points'] ?? 0),
            'active' => $active,
            'is_supporter' => $isSupporter,
            'plan' => $plan,
            'badge_label' => $badgeLabel,
            'started_at' => $startedAt?->format(DateTimeInterface::ATOM),
            'last_awarded_at' => $lastAwardedAt?->format(DateTimeInterface::ATOM),
            'expires_at' => $expiresAt?->format(DateTimeInterface::ATOM),
            'next_bonus_at' => $nextBonusAt?->format(DateTimeInterface::ATOM),
            'bonus_awarded_points' => $awardedPoints,
            'bonus_awarded_periods' => $awardedPeriods,
            'bonus_awarded_points_total' => $awardedPointsTotal,
            'bonus_awarded_periods_total' => $awardedPeriodsTotal,
            'supporter_bonus_awarded_points_total' => $awardedPointsTotal,
            'supporter_bonus_awarded_periods_total' => $awardedPeriodsTotal,
            'initial_bonus_awarded' => $initialBonusAwarded,
            'supporter_initial_bonus_awarded' => $initialBonusAwarded,
            'bonus_amount' => $bonusAmount,
            'bonus_interval_days' => $bonusIntervalDays,
        ];
    } catch (Throwable $e) {
        if ($ownTx && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
