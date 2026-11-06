<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/state_core.php';

function pr_json(array $payload, int $status = 200): void
{
    snapshift_auth_json($payload, $status);
}

function pr_table_exists(PDO $pdo, string $table): bool
{
    try {
        $stmt = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table));
        return (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function pr_points_ensure_ledger(PDO $pdo): void
{
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
}

function pr_diff_key(?string $value): string
{
    $value = preg_replace('/[^a-z0-9_-]/i', '', strtolower(trim((string) $value)));
    return $value !== '' ? $value : 'easy';
}

function pr_category_id(?string $value): string
{
    return preg_replace('/[^a-z0-9_-]/i', '', strtolower(trim((string) $value)));
}

function pr_diff_label(string $diffKey): string
{
    if ($diffKey === 'hard') return 'Hard';
    if ($diffKey === 'medium') return 'Medium';
    return 'Easy';
}

function pr_calc_completion_points(array $entry): int
{
    $diffKey = pr_diff_key((string) ($entry['diffKey'] ?? 'easy'));
    $baseMap = ['easy' => 40, 'medium' => 60, 'hard' => 80];
    $base = (int) ($baseMap[$diffKey] ?? 40);
    $elapsedMs = max(0, (int) ($entry['elapsedMs'] ?? 0));
    $timeBonus = 0;
    if ($elapsedMs > 0) {
        $timeSec = max(0.1, $elapsedMs / 1000);
        $timeBonus = max(0, (int) floor(600 / $timeSec));
    }
    $mult = !empty($entry['hardMode']) ? 1.45 : 1.0;
    return max(0, (int) floor(($base + $timeBonus) * $mult));
}

function pr_progress_entry_from_row(array $row): ?array
{
    $progressJson = [];
    if (!empty($row['progress_json']) && is_string($row['progress_json'])) {
        $decoded = json_decode($row['progress_json'], true);
        if (is_array($decoded)) {
            $progressJson = $decoded;
        }
    }

    $summary = snapshift_state_extract_summary_from_row($row);
    if (empty($summary['completed'])) {
        return null;
    }

    $progressKey = trim((string) ($row['progress_key'] ?? ''));
    $diffKey = pr_diff_key((string) ($summary['diffKey'] ?? ($progressJson['diffKey'] ?? 'easy')));
    $isDaily = !empty($row['is_daily']) || !empty($progressJson['isDaily']) || snapshift_state_extract_daily_day($progressKey) !== null;
    $dayKey = trim((string) ($row['day_key'] ?? ($progressJson['dayKey'] ?? '')));
    if ($isDaily && $dayKey === '') {
        $dayKey = (string) (snapshift_state_extract_daily_day($progressKey) ?? '');
    }

    $categoryId = pr_category_id((string) ($summary['categoryId'] ?? ($progressJson['categoryId'] ?? ($row['category_id'] ?? ''))));
    $puzzleIdx = isset($summary['puzzleIdx']) ? max(0, (int) $summary['puzzleIdx']) : max(0, (int) ($row['puzzle_idx'] ?? 0));
    $puzzleSrc = snapshift_state_normalize_src((string) ($summary['puzzleSrc'] ?? ($progressJson['puzzleSrc'] ?? ($row['puzzle_src'] ?? ''))));
    $categoryName = trim((string) ($progressJson['categoryName'] ?? ''));
    $puzzleName = trim((string) ($row['puzzle_name'] ?? ($progressJson['puzzleName'] ?? '')));
    $completedAt = trim((string) ($summary['completedAt'] ?? ''));
    if ($completedAt === '') {
        $completedAt = trim((string) ($row['updated_at'] ?? ''));
    }

    if ($progressKey === '') {
        $progressKey = snapshift_state_progress_build_key([
            'isDaily' => $isDaily,
            'dayKey' => $dayKey,
            'categoryId' => $categoryId,
            'puzzleIdx' => $puzzleIdx,
            'puzzleSrc' => $puzzleSrc,
            'diffKey' => $diffKey,
        ]);
    }

    return [
        'progressKey' => $progressKey,
        'isDaily' => $isDaily,
        'dayKey' => $dayKey,
        'categoryId' => $categoryId,
        'categoryName' => $categoryName,
        'puzzleIdx' => $puzzleIdx,
        'puzzleName' => $puzzleName,
        'puzzleSrc' => $puzzleSrc,
        'diffKey' => $diffKey,
        'elapsedMs' => max(0, (int) ($summary['elapsedMs'] ?? 0)),
        'moves' => max(0, (int) ($summary['moves'] ?? 0)),
        'rows' => max(0, (int) ($summary['rows'] ?? 0)),
        'cols' => max(0, (int) ($summary['cols'] ?? 0)),
        'scoreValue' => max(0, (int) ($summary['scoreValue'] ?? 0)),
        'scorePct' => max(0.0, (float) ($summary['scorePct'] ?? 0)),
        'moveEffPct' => max(0.0, (float) ($summary['moveEffPct'] ?? 0)),
        'speedEffPct' => max(0.0, (float) ($summary['speedEffPct'] ?? 0)),
        'completedAt' => $completedAt,
        'hardMode' => !empty($progressJson['hardMode']),
    ];
}

function pr_rewarded_progress_keys(PDO $pdo, int $uid): array
{
    if (!pr_table_exists($pdo, 'points_ledger')) {
        return [];
    }

    $sql = "SELECT entry_type, category_id, puzzle_idx, puzzle_src, diff_key, day_key
            FROM points_ledger
            WHERE user_id = ?
              AND entry_type IN ('puzzle_completion', 'daily_puzzle_completion')";
    $st = $pdo->prepare($sql);
    $st->execute([$uid]);

    $keys = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $type = strtolower(trim((string) ($row['entry_type'] ?? '')));
        $diffKey = pr_diff_key((string) ($row['diff_key'] ?? 'easy'));
        if ($type === 'daily_puzzle_completion') {
            $dayKey = trim((string) ($row['day_key'] ?? ''));
            if ($dayKey === '') {
                continue;
            }
            $key = snapshift_state_progress_build_key([
                'isDaily' => true,
                'dayKey' => $dayKey,
                'diffKey' => $diffKey,
            ]);
            $keys[$key] = true;
            continue;
        }

        $key = snapshift_state_progress_build_key([
            'categoryId' => pr_category_id((string) ($row['category_id'] ?? '')),
            'puzzleIdx' => max(0, (int) ($row['puzzle_idx'] ?? 0)),
            'puzzleSrc' => snapshift_state_normalize_src((string) ($row['puzzle_src'] ?? '')),
            'diffKey' => $diffKey,
        ]);
        $keys[$key] = true;
    }

    return $keys;
}

function pr_current_total_for_update(PDO $pdo, int $uid): int
{
    $st = $pdo->prepare("SELECT points FROM user_state WHERE user_id = ? LIMIT 1 FOR UPDATE");
    $st->execute([$uid]);
    $value = $st->fetchColumn();
    return $value !== false ? max(0, (int) $value) : 0;
}

try {
    $user = snapshift_auth_require_login();
    $uid = (int) ($user['id'] ?? 0);
    if ($uid <= 0) {
        pr_json([
            'ok' => false,
            'loggedIn' => false,
            'error' => 'login_required',
        ], 401);
    }

    $pdo = snapshift_pdo();
    snapshift_state_ensure_tables($pdo);
    snapshift_auth_ensure_user_state_row($pdo, $uid);
    pr_points_ensure_ledger($pdo);

    $rewardedKeys = pr_rewarded_progress_keys($pdo, $uid);

    $progressStmt = $pdo->prepare("
        SELECT *
        FROM user_puzzle_progress
        WHERE user_id = ?
        ORDER BY COALESCE(completed_at, updated_at) ASC, updated_at ASC
    ");
    $progressStmt->execute([$uid]);

    $progressEntries = [];
    foreach ($progressStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $entry = pr_progress_entry_from_row($row);
        if (!$entry) {
            continue;
        }
        $progressEntries[] = $entry;
    }

    $missing = [];
    $alreadyRewarded = 0;
    foreach ($progressEntries as $entry) {
        $progressKey = (string) ($entry['progressKey'] ?? '');
        if ($progressKey === '') {
            continue;
        }
        if (isset($rewardedKeys[$progressKey])) {
            $alreadyRewarded++;
            continue;
        }
        $rewardedKeys[$progressKey] = true;
        $missing[] = $entry;
    }

    if (!$missing) {
        pr_json([
            'ok' => true,
            'loggedIn' => true,
            'applied' => 0,
            'applied_points' => 0,
            'already_rewarded' => $alreadyRewarded,
            'completed_found' => count($progressEntries),
            'points' => snapshift_state_fetch_user_state($pdo, $uid)['points'] ?? 0,
            'message' => 'No missing puzzle completion rewards were found.',
        ]);
    }

    $pdo->beginTransaction();
    $currentTotal = pr_current_total_for_update($pdo, $uid);
    $runningTotal = $currentTotal;

    $insert = $pdo->prepare("INSERT INTO points_ledger (
        user_id, entry_type, points_delta, balance_after, finish_text, event_key,
        category_id, category_name, puzzle_idx, puzzle_name, puzzle_src, diff_key, day_key, meta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    $applied = 0;
    $appliedPoints = 0;
    $awards = [];

    foreach ($missing as $entry) {
        $earned = pr_calc_completion_points($entry);
        if ($earned <= 0) {
            continue;
        }

        $diffLabel = pr_diff_label((string) ($entry['diffKey'] ?? 'easy'));
        $finishText = (($entry['isDaily'] ?? false) ? 'Daily puzzle' : 'Puzzle completion') . ' - '
            . (($entry['categoryName'] ?? '') !== '' ? (string) $entry['categoryName'] : ((string) ($entry['categoryId'] ?? '') !== '' ? (string) $entry['categoryId'] : 'Puzzle'))
            . ' - '
            . (($entry['puzzleName'] ?? '') !== '' ? (string) $entry['puzzleName'] : ('Puzzle ' . ((int) ($entry['puzzleIdx'] ?? 0) + 1)))
            . ' - '
            . $diffLabel;

        $eventKey = 'reconcile_completion|' . sha1((string) ($entry['progressKey'] ?? ''));
        $runningTotal += $earned;

        $meta = [
            'rows' => max(1, (int) ($entry['rows'] ?? 1)),
            'cols' => max(1, (int) ($entry['cols'] ?? 1)),
            'elapsed_ms' => max(0, (int) ($entry['elapsedMs'] ?? 0)),
            'moves_made' => max(0, (int) ($entry['moves'] ?? 0)),
            'earned_points' => $earned,
            'completed_at' => (string) ($entry['completedAt'] ?? ''),
            'is_daily' => !empty($entry['isDaily']),
            'hard_mode' => !empty($entry['hardMode']),
            'score_value' => max(0, (int) ($entry['scoreValue'] ?? 0)),
            'score_pct' => max(0.0, (float) ($entry['scorePct'] ?? 0)),
            'move_eff_pct' => max(0.0, (float) ($entry['moveEffPct'] ?? 0)),
            'speed_eff_pct' => max(0.0, (float) ($entry['speedEffPct'] ?? 0)),
            'progress_key' => (string) ($entry['progressKey'] ?? ''),
            'reconciled' => true,
            'reconciled_at' => gmdate('c'),
        ];

        $insert->execute([
            $uid,
            !empty($entry['isDaily']) ? 'daily_puzzle_completion' : 'puzzle_completion',
            $earned,
            $runningTotal,
            $finishText,
            $eventKey,
            (string) ($entry['categoryId'] ?? ''),
            (string) ($entry['categoryName'] ?? ''),
            max(0, (int) ($entry['puzzleIdx'] ?? 0)),
            (string) ($entry['puzzleName'] ?? ''),
            (string) ($entry['puzzleSrc'] ?? ''),
            pr_diff_key((string) ($entry['diffKey'] ?? 'easy')),
            !empty($entry['isDaily']) ? (string) ($entry['dayKey'] ?? '') : null,
            json_encode($meta, JSON_UNESCAPED_SLASHES),
        ]);

        $applied++;
        $appliedPoints += $earned;
        $awards[] = [
            'puzzle' => (string) ($entry['puzzleName'] ?? ''),
            'category' => (string) ($entry['categoryName'] ?? $entry['categoryId'] ?? ''),
            'diff' => pr_diff_key((string) ($entry['diffKey'] ?? 'easy')),
            'points' => $earned,
        ];
    }

    if ($applied > 0) {
        $update = $pdo->prepare("UPDATE user_state SET points = ? WHERE user_id = ?");
        $update->execute([$runningTotal, $uid]);
    }

    $pdo->commit();

    pr_json([
        'ok' => true,
        'loggedIn' => true,
        'applied' => $applied,
        'applied_points' => $appliedPoints,
        'already_rewarded' => $alreadyRewarded,
        'completed_found' => count($progressEntries),
        'points' => $runningTotal,
        'awards' => array_slice($awards, 0, 12),
        'message' => $applied > 0
            ? ('Recovered ' . $appliedPoints . ' points across ' . $applied . ' completed puzzle' . ($applied === 1 ? '' : 's') . '.')
            : 'No missing puzzle completion rewards were found.',
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    pr_json([
        'ok' => false,
        'loggedIn' => function_exists('snapshift_auth_current_user') && snapshift_auth_current_user() ? true : false,
        'error' => $e->getMessage(),
    ], 500);
}
