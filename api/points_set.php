<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';

function pq_points_json(array $payload, int $status = 200): void
{
    snapshift_auth_json($payload, $status);
}

function pq_points_table_exists(PDO $pdo, string $table): bool
{
    try {
        $stmt = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table));
        return (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function pq_points_ensure_ledger(PDO $pdo): bool
{
    try {
        $sql = "CREATE TABLE IF NOT EXISTS `points_ledger` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `entry_type` VARCHAR(64) NOT NULL DEFAULT 'adjustment',
            `points_delta` INT NOT NULL,
            `balance_after` INT NULL DEFAULT NULL,
            `finish_text` VARCHAR(255) NULL DEFAULT NULL,
            `event_key` VARCHAR(190) NULL DEFAULT NULL,
            `category_id` VARCHAR(100) NULL DEFAULT NULL,
            `category_name` VARCHAR(150) NULL DEFAULT NULL,
            `puzzle_idx` INT NULL DEFAULT NULL,
            `puzzle_name` VARCHAR(190) NULL DEFAULT NULL,
            `puzzle_src` VARCHAR(255) NULL DEFAULT NULL,
            `diff_key` VARCHAR(32) NULL DEFAULT NULL,
            `day_key` VARCHAR(10) NULL DEFAULT NULL,
            `meta_json` MEDIUMTEXT NULL DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_points_ledger_event_key` (`event_key`),
            KEY `idx_points_ledger_user_created` (`user_id`, `created_at`),
            KEY `idx_points_ledger_user_type` (`user_id`, `entry_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
        $pdo->exec($sql);
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

function pq_points_current_total(PDO $pdo, int $uid): int
{
    try {
        $supporter = snapshift_auth_supporter_state($pdo, $uid, false);
        if (is_array($supporter) && isset($supporter['points'])) {
            return (int) $supporter['points'];
        }
    } catch (Throwable $e) {
    }

    try {
        $st = $pdo->prepare("SELECT points FROM user_state WHERE user_id = ? LIMIT 1");
        $st->execute([$uid]);
        $value = $st->fetchColumn();
        if ($value !== false && $value !== null) {
            return (int) $value;
        }
    } catch (Throwable $e) {
    }

    return 0;
}

function pq_points_existing_event_total(PDO $pdo, int $uid, string $eventKey): ?int
{
    if ($eventKey === '' || !pq_points_table_exists($pdo, 'points_ledger')) {
        return null;
    }

    try {
        $st = $pdo->prepare("SELECT balance_after FROM points_ledger WHERE user_id = ? AND event_key = ? LIMIT 1");
        $st->execute([$uid, $eventKey]);
        $value = $st->fetchColumn();
        if ($value !== false && $value !== null) {
            return (int) $value;
        }
    } catch (Throwable $e) {
    }

    return null;
}

try {
    $user = snapshift_auth_require_login();
    $uid = (int)$user['id'];
    $pdo = snapshift_pdo();

    snapshift_auth_ensure_user_state_row($pdo, $uid);

    $data = snapshift_auth_get_json_input();
    $delta = array_key_exists('delta', $data) ? (int)$data['delta'] : null;
    $set   = array_key_exists('points', $data) ? (int)$data['points'] : null;

    if ($delta === null && $set === null) {
        pq_points_json([
            'ok' => false,
            'loggedIn' => true,
            'error' => 'missing_delta_or_points'
        ], 400);
    }

    $ledgerReady = pq_points_ensure_ledger($pdo);
    $eventKey = trim((string)($data['event_key'] ?? ''));

    if ($ledgerReady && $eventKey !== '') {
        $existingTotal = pq_points_existing_event_total($pdo, $uid, $eventKey);
        if ($existingTotal !== null) {
            $supporter = snapshift_auth_supporter_state($pdo, $uid, false);
            pq_points_json([
                'ok' => true,
                'loggedIn' => true,
                'user_id' => $uid,
                'points' => $existingTotal,
                'supporter' => [
                    'active' => (bool)($supporter['active'] ?? false),
                    'plan' => $supporter['plan'] ?? null,
                    'badgeLabel' => $supporter['badge_label'] ?? 'Supporter',
                    'startedAt' => $supporter['started_at'] ?? null,
                    'lastAwardedAt' => $supporter['last_awarded_at'] ?? null,
                    'nextBonusAt' => $supporter['next_bonus_at'] ?? null,
                    'bonusAmount' => (int)($supporter['bonus_amount'] ?? 250),
                    'bonusIntervalDays' => (int)($supporter['bonus_interval_days'] ?? 30),
                    'bonusAwardedPoints' => 0,
                ],
                'ledgerRecorded' => true,
                'duplicateEvent' => true,
            ]);
        }
    }

    $oldTotal = pq_points_current_total($pdo, $uid);

    $pdo->beginTransaction();

    if ($delta !== null) {
        $st = $pdo->prepare("UPDATE user_state SET points = GREATEST(0, points + ?) WHERE user_id = ?");
        $st->execute([$delta, $uid]);
    } else {
        $st = $pdo->prepare("UPDATE user_state SET points = GREATEST(0, ?) WHERE user_id = ?");
        $st->execute([$set, $uid]);
    }

    $newTotal = pq_points_current_total($pdo, $uid);

    $entryType = trim((string)($data['entry_type'] ?? ''));
    $finishText = trim((string)($data['finish_text'] ?? ''));
    $shouldLedger = $ledgerReady && (
        $entryType !== ''
        || $finishText !== ''
        || $eventKey !== ''
        || array_key_exists('meta', $data)
        || array_key_exists('category_id', $data)
        || array_key_exists('puzzle_name', $data)
    );

    if ($shouldLedger) {
        $insert = $pdo->prepare("INSERT INTO points_ledger (
            user_id, entry_type, points_delta, balance_after, finish_text, event_key,
            category_id, category_name, puzzle_idx, puzzle_name, puzzle_src, diff_key, day_key, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $insert->execute([
            $uid,
            $entryType !== '' ? $entryType : ($delta !== null ? 'adjustment' : 'set_points'),
            (int)($delta !== null ? $delta : ($newTotal - $oldTotal)),
            $newTotal,
            $finishText !== '' ? $finishText : null,
            $eventKey !== '' ? $eventKey : null,
            ($data['category_id'] ?? null) !== null ? (string)$data['category_id'] : null,
            ($data['category_name'] ?? null) !== null ? (string)$data['category_name'] : null,
            array_key_exists('puzzle_idx', $data) ? (int)$data['puzzle_idx'] : null,
            ($data['puzzle_name'] ?? null) !== null ? (string)$data['puzzle_name'] : null,
            ($data['puzzle_src'] ?? null) !== null ? (string)$data['puzzle_src'] : null,
            ($data['diff_key'] ?? null) !== null ? (string)$data['diff_key'] : null,
            ($data['day_key'] ?? null) !== null ? (string)$data['day_key'] : null,
            array_key_exists('meta', $data) ? json_encode($data['meta'], JSON_UNESCAPED_SLASHES) : null,
        ]);
    }

    $pdo->commit();

    $supporter = snapshift_auth_supporter_state($pdo, $uid, false);

    pq_points_json([
        'ok' => true,
        'loggedIn' => true,
        'user_id' => $uid,
        'points' => (int)($supporter['points'] ?? $newTotal),
        'supporter' => [
            'active' => (bool)($supporter['active'] ?? false),
            'plan' => $supporter['plan'] ?? null,
            'badgeLabel' => $supporter['badge_label'] ?? 'Supporter',
            'startedAt' => $supporter['started_at'] ?? null,
            'lastAwardedAt' => $supporter['last_awarded_at'] ?? null,
            'nextBonusAt' => $supporter['next_bonus_at'] ?? null,
            'bonusAmount' => (int)($supporter['bonus_amount'] ?? 250),
            'bonusIntervalDays' => (int)($supporter['bonus_interval_days'] ?? 30),
            'bonusAwardedPoints' => 0,
        ],
        'ledgerRecorded' => $shouldLedger,
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    pq_points_json([
        'ok' => false,
        'loggedIn' => false,
        'error' => $e->getMessage(),
    ], 500);
}
