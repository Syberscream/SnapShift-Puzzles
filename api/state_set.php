<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/state_core.php';
require_once __DIR__ . '/../lib/auth_core.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function snapshift_state_set_json(array $payload, int $status = 200): void {
    if (function_exists('snapshift_auth_json')) {
        snapshift_auth_json($payload, $status);
    }
    if (function_exists('snapshift_json')) {
        snapshift_json($payload, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function snapshift_state_set_truthy($value): bool {
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return ((float)$value) !== 0.0;
    $raw = strtolower(trim((string)$value));
    return in_array($raw, ['1', 'true', 'yes', 'y', 'on', 'done', 'completed', 'solved'], true);
}

function snapshift_state_set_body(): array {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function snapshift_state_set_clean_slug($value, int $maxLen = 64): string {
    $value = substr(trim((string)$value), 0, $maxLen);
    $value = preg_replace('/[^a-z0-9_-]/i', '', $value);
    return (string)$value;
}

function snapshift_state_set_clean_string($value, int $maxLen = 255): string {
    return trim(substr((string)$value, 0, $maxLen));
}

function snapshift_state_set_clean_progress_key($value): string {
    return trim(substr((string)$value, 0, 191));
}

function snapshift_state_set_active_daily_day(): string {
    try {
        if (function_exists('pq_active_daily_day')) {
            return pq_active_daily_day();
        }
    } catch (Throwable $e) {}

    $now = new DateTimeImmutable('now', new DateTimeZone('America/Vancouver'));
    if ((int)$now->format('G') < 17) {
        $now = $now->modify('-1 day');
    }
    return $now->format('Y-m-d');
}

function snapshift_state_set_extract_summary(array $progress): array {
    $completed = snapshift_state_set_truthy($progress['completed'] ?? null)
        || snapshift_state_set_truthy($progress['solved'] ?? null)
        || snapshift_state_set_truthy($progress['isSolved'] ?? null)
        || snapshift_state_set_truthy($progress['is_solved'] ?? null);

    $medal = '';
    if (function_exists('snapshift_state_medal_normalize')) {
        $medal = snapshift_state_medal_normalize((string)($progress['medal'] ?? $progress['medalKey'] ?? ''));
    } else {
        $medal = strtolower(trim((string)($progress['medal'] ?? $progress['medalKey'] ?? '')));
        if (!in_array($medal, ['gold', 'silver', 'bronze'], true)) $medal = '';
    }

    $stars = max(0, min(3, (int)($progress['stars'] ?? 0)));
    if ($stars <= 0 && $medal !== '') {
        $stars = ($medal === 'gold') ? 3 : (($medal === 'silver') ? 2 : 1);
    }
    if ($medal === '' && $stars > 0) {
        $medal = $stars >= 3 ? 'gold' : ($stars === 2 ? 'silver' : 'bronze');
    }

    $elapsedMs = (int)($progress['elapsedMs'] ?? $progress['elapsed_ms'] ?? $progress['timeMs'] ?? $progress['time_ms'] ?? 0);
    if ($elapsedMs <= 0) {
        $sec = (int)($progress['elapsed'] ?? $progress['elapsedSeconds'] ?? $progress['elapsed_seconds'] ?? $progress['timeSeconds'] ?? $progress['time_seconds'] ?? 0);
        if ($sec > 0) $elapsedMs = $sec * 1000;
    }
    $elapsedMs = max(0, $elapsedMs);

    $rows = max(0, (int)($progress['rows'] ?? $progress['rowCount'] ?? $progress['row_count'] ?? 0));
    $cols = max(0, (int)($progress['cols'] ?? $progress['colCount'] ?? $progress['col_count'] ?? $progress['columns'] ?? 0));
    if ($completed && function_exists('snapshift_state_payload_has_unsolved_tiles') && snapshift_state_payload_has_unsolved_tiles($progress, $rows, $cols)) {
        $completed = false;
    }

    $completedAt = trim((string)($progress['completedAt'] ?? $progress['completed_at'] ?? ''));
    if ($completed && $completedAt === '') {
        $completedAt = gmdate('Y-m-d H:i:s');
    } elseif (!$completed) {
        $completedAt = '';
    }

    return [
        'completed' => $completed,
        'completedAt' => $completedAt,
        'medal' => $medal,
        'stars' => $stars,
        'moves' => max(0, (int)($progress['movesMade'] ?? $progress['moves'] ?? $progress['moveCount'] ?? $progress['move_count'] ?? 0)),
        'elapsedMs' => $elapsedMs,
        'elapsedLabel' => trim((string)($progress['elapsedLabel'] ?? $progress['elapsed_label'] ?? '')),
        'scoreValue' => (int)($progress['scoreValue'] ?? $progress['score_value'] ?? $progress['score'] ?? 0),
        'scorePct' => max(0.0, min(100.0, (float)($progress['scorePct'] ?? $progress['score_pct'] ?? 0))),
        'moveEffPct' => max(0.0, min(100.0, (float)($progress['moveEffPct'] ?? $progress['move_eff_pct'] ?? 0))),
        'speedEffPct' => max(0.0, min(100.0, (float)($progress['speedEffPct'] ?? $progress['speed_eff_pct'] ?? 0))),
        'rows' => $rows,
        'cols' => $cols,
    ];
}

try {
    $user = function_exists('snapshift_auth_current_user')
        ? snapshift_auth_current_user()
        : snapshift_current_user();

    if (!$user) {
        snapshift_state_set_json([
            'ok' => false,
            'loggedIn' => false,
            'msg' => 'not_logged_in',
        ], 200);
    }

    $uid = (int)($user['id'] ?? 0);
    $username = (string)($user['username'] ?? '');
    if ($uid <= 0) {
        snapshift_state_set_json([
            'ok' => false,
            'loggedIn' => false,
            'msg' => 'not_logged_in',
        ], 200);
    }

    $body = snapshift_state_set_body();
    $progress = isset($body['progress']) && is_array($body['progress']) ? $body['progress'] : [];
    $progressKey = snapshift_state_set_clean_progress_key(
        $body['progressKey'] ?? $progress['progressKey'] ?? ''
    );

    if ($progressKey === '') {
        snapshift_state_set_json([
            'ok' => false,
            'loggedIn' => true,
            'uid' => $uid,
            'userId' => $uid,
            'username' => $username,
            'msg' => 'missing_progress_key',
        ], 200);
    }

    $pdo = snapshift_pdo();
    snapshift_state_ensure_tables($pdo);

    // Best-effort support for newer metric columns if they do not exist yet.
    try { $pdo->exec("ALTER TABLE user_puzzle_progress ADD COLUMN move_eff_pct DECIMAL(6,2) NOT NULL DEFAULT 0"); } catch (Throwable $e) {}
    try { $pdo->exec("ALTER TABLE user_puzzle_progress ADD COLUMN speed_eff_pct DECIMAL(6,2) NOT NULL DEFAULT 0"); } catch (Throwable $e) {}

    $clearProgress = !empty($body['clearProgress']);
    if ($clearProgress) {
        $st = $pdo->prepare('DELETE FROM user_puzzle_progress WHERE user_id = ? AND progress_key = ?');
        $st->execute([$uid, $progressKey]);

        snapshift_state_set_json([
            'ok' => true,
            'loggedIn' => true,
            'uid' => $uid,
            'userId' => $uid,
            'username' => $username,
            'cleared' => true,
            'progressSeq' => 0,
            'staleSaveIgnored' => false,
        ]);
    }

    if (!$progress) {
        snapshift_state_set_json([
            'ok' => false,
            'loggedIn' => true,
            'uid' => $uid,
            'userId' => $uid,
            'username' => $username,
            'msg' => 'missing_progress',
        ], 200);
    }

    $saveSeq = max(0, (int)($progress['saveSeq'] ?? 0));
    $categoryId = snapshift_state_set_clean_slug($progress['categoryId'] ?? $progress['category_id'] ?? '', 64);
    $diffKey = snapshift_state_set_clean_slug($progress['diffKey'] ?? $progress['diff_key'] ?? 'easy', 16);
    if ($diffKey === '') $diffKey = 'easy';

    $puzzleIdx = max(0, (int)($progress['puzzleIdx'] ?? $progress['puzzle_idx'] ?? 0));
    $puzzleName = snapshift_state_set_clean_string($progress['puzzleName'] ?? $progress['puzzle_name'] ?? '', 255);
    $puzzleSrc = function_exists('snapshift_state_normalize_src')
        ? snapshift_state_normalize_src((string)($progress['puzzleSrc'] ?? $progress['puzzle_src'] ?? $progress['src'] ?? ''))
        : trim((string)($progress['puzzleSrc'] ?? $progress['puzzle_src'] ?? $progress['src'] ?? ''));

    $isDaily = snapshift_state_set_truthy($progress['isDaily'] ?? null)
        || str_starts_with($progressKey, 'daily:');
    $dayKey = trim((string)($progress['dayKey'] ?? $progress['day_key'] ?? ''));
    if ($isDaily && $dayKey === '' && function_exists('snapshift_state_extract_daily_day')) {
        $dayKey = (string)(snapshift_state_extract_daily_day($progressKey) ?? '');
    }
    if ($isDaily && $dayKey !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayKey)) {
        $dayKey = '';
    }

    $summary = snapshift_state_set_extract_summary($progress);

    // Always persist the normalized summary fields into progress_json too.
    $progress['progressKey'] = $progressKey;
    $progress['categoryId'] = $categoryId;
    $progress['puzzleIdx'] = $puzzleIdx;
    $progress['diffKey'] = $diffKey;
    $progress['puzzleName'] = $puzzleName;
    $progress['puzzleSrc'] = $puzzleSrc;
    $progress['isDaily'] = $isDaily;
    $progress['dayKey'] = $dayKey;
    $progress['completed'] = $summary['completed'];
    $progress['completedAt'] = $summary['completedAt'];
    $progress['medal'] = $summary['medal'];
    $progress['medalKey'] = $summary['medal'];
    $progress['stars'] = $summary['stars'];
    $progress['moves'] = $summary['moves'];
    $progress['movesMade'] = $summary['moves'];
    $progress['elapsedMs'] = $summary['elapsedMs'];
    $progress['elapsedLabel'] = $summary['elapsedLabel'];
    $progress['scoreValue'] = $summary['scoreValue'];
    $progress['score'] = $summary['scoreValue'];
    $progress['scorePct'] = $summary['scorePct'];
    $progress['moveEffPct'] = $summary['moveEffPct'];
    $progress['speedEffPct'] = $summary['speedEffPct'];
    $progress['rows'] = $summary['rows'] > 0 ? $summary['rows'] : (int)($progress['rows'] ?? 0);
    $progress['cols'] = $summary['cols'] > 0 ? $summary['cols'] : (int)($progress['cols'] ?? 0);

    $progressJson = json_encode($progress, JSON_UNESCAPED_SLASHES);
    if (!is_string($progressJson) || $progressJson === '') {
        snapshift_state_set_json([
            'ok' => false,
            'loggedIn' => true,
            'uid' => $uid,
            'userId' => $uid,
            'username' => $username,
            'msg' => 'invalid_progress_json',
        ], 200);
    }

    $existingStmt = $pdo->prepare('SELECT * FROM user_puzzle_progress WHERE user_id = ? AND progress_key = ? LIMIT 1');
    $existingStmt->execute([$uid, $progressKey]);
    $existingRow = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;

    $existingCompleted = false;
    $existingSeq = 0;
    if (is_array($existingRow)) {
        $existingCompleted = !empty($existingRow['completed']);
        $existingJson = json_decode((string)($existingRow['progress_json'] ?? ''), true);
        if (is_array($existingJson)) {
            $existingSeq = max(0, (int)($existingJson['saveSeq'] ?? 0));
            if (!$existingCompleted) {
                $existingCompleted = snapshift_state_set_truthy($existingJson['completed'] ?? null)
                    || snapshift_state_set_truthy($existingJson['solved'] ?? null)
                    || snapshift_state_set_truthy($existingJson['isSolved'] ?? null);
            }
        }
    }

    $incomingCompleted = !empty($summary['completed']);
    $dailyAlreadyDone = false;
    $isArchiveDailyDay = $isDaily && $dayKey !== '' && $dayKey < snapshift_state_set_active_daily_day();
    if ($isDaily && $dayKey !== '' && !$incomingCompleted && $isArchiveDailyDay) {
        try {
            $doneStmt = $pdo->prepare('SELECT 1 FROM user_daily_done WHERE user_id=? AND day_key=? LIMIT 1');
            $doneStmt->execute([$uid, $dayKey]);
            $dailyAlreadyDone = (bool)$doneStmt->fetchColumn();
        } catch (Throwable $e) {
            $dailyAlreadyDone = false;
        }
        if (!$dailyAlreadyDone) {
            try {
                if (function_exists('snapshift_auth_ensure_leaderboard_tables')) {
                    snapshift_auth_ensure_leaderboard_tables($pdo);
                }
                $lbDoneStmt = $pdo->prepare('SELECT 1 FROM leaderboard_daily WHERE user_id=? AND day_key=? LIMIT 1');
                $lbDoneStmt->execute([$uid, $dayKey]);
                $dailyAlreadyDone = (bool)$lbDoneStmt->fetchColumn();
            } catch (Throwable $e) {
                $dailyAlreadyDone = false;
            }
        }
    }

    // Protect completed snapshots from being overwritten by later incomplete autosaves.
    $ignoreAsStale = false;
    if (($existingCompleted || $dailyAlreadyDone) && !$incomingCompleted) {
        $ignoreAsStale = true;
    } elseif ($existingSeq > 0 && $saveSeq > 0 && $saveSeq < $existingSeq && !($incomingCompleted && !$existingCompleted)) {
        $ignoreAsStale = true;
    }

    if ($ignoreAsStale) {
        $existingProgress = is_array($existingRow)
            ? snapshift_state_decode_row($existingRow, function_exists('snapshift_state_today_utc') ? snapshift_state_today_utc() : gmdate('Y-m-d'))
            : null;
        snapshift_state_set_json([
            'ok' => true,
            'loggedIn' => true,
            'uid' => $uid,
            'userId' => $uid,
            'username' => $username,
            'progressSeq' => max($existingSeq, $saveSeq),
            'staleSaveIgnored' => true,
            'completed' => $existingCompleted || $dailyAlreadyDone,
            'progress' => ($existingCompleted && is_array($existingProgress)) ? $existingProgress : null,
        ]);
    }

    $sql = '
        INSERT INTO user_puzzle_progress (
            user_id, progress_key, category_id, puzzle_idx, diff_key, puzzle_name, puzzle_src,
            is_daily, day_key, progress_json, completed, completed_at, medal, stars, moves,
            elapsed_ms, elapsed_label, score_value, score_pct, move_eff_pct, speed_eff_pct
        ) VALUES (
            :user_id, :progress_key, :category_id, :puzzle_idx, :diff_key, :puzzle_name, :puzzle_src,
            :is_daily, :day_key, :progress_json, :completed, :completed_at, :medal, :stars, :moves,
            :elapsed_ms, :elapsed_label, :score_value, :score_pct, :move_eff_pct, :speed_eff_pct
        )
        ON DUPLICATE KEY UPDATE
            category_id = VALUES(category_id),
            puzzle_idx = VALUES(puzzle_idx),
            diff_key = VALUES(diff_key),
            puzzle_name = VALUES(puzzle_name),
            puzzle_src = VALUES(puzzle_src),
            is_daily = VALUES(is_daily),
            day_key = VALUES(day_key),
            progress_json = VALUES(progress_json),
            completed = VALUES(completed),
            completed_at = VALUES(completed_at),
            medal = VALUES(medal),
            stars = VALUES(stars),
            moves = VALUES(moves),
            elapsed_ms = VALUES(elapsed_ms),
            elapsed_label = VALUES(elapsed_label),
            score_value = VALUES(score_value),
            score_pct = VALUES(score_pct),
            move_eff_pct = VALUES(move_eff_pct),
            speed_eff_pct = VALUES(speed_eff_pct),
            updated_at = CURRENT_TIMESTAMP
    ';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':user_id' => $uid,
        ':progress_key' => $progressKey,
        ':category_id' => $categoryId,
        ':puzzle_idx' => $puzzleIdx,
        ':diff_key' => $diffKey,
        ':puzzle_name' => $puzzleName,
        ':puzzle_src' => $puzzleSrc,
        ':is_daily' => $isDaily ? 1 : 0,
        ':day_key' => $dayKey,
        ':progress_json' => $progressJson,
        ':completed' => $incomingCompleted ? 1 : 0,
        ':completed_at' => $incomingCompleted ? ($summary['completedAt'] !== '' ? $summary['completedAt'] : gmdate('Y-m-d H:i:s')) : null,
        ':medal' => $summary['medal'],
        ':stars' => $summary['stars'],
        ':moves' => $summary['moves'],
        ':elapsed_ms' => $summary['elapsedMs'],
        ':elapsed_label' => $summary['elapsedLabel'],
        ':score_value' => $summary['scoreValue'],
        ':score_pct' => $summary['scorePct'],
        ':move_eff_pct' => $summary['moveEffPct'],
        ':speed_eff_pct' => $summary['speedEffPct'],
    ]);

    if ($isDaily && $incomingCompleted && $dayKey !== '') {
        $doneStmt = $pdo->prepare(
            'INSERT INTO user_daily_done (user_id, day_key) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE completed_at = completed_at'
        );
        $doneStmt->execute([$uid, $dayKey]);
    }

    snapshift_state_set_json([
        'ok' => true,
        'loggedIn' => true,
        'uid' => $uid,
        'userId' => $uid,
        'username' => $username,
        'progressSeq' => max($saveSeq, $existingSeq),
        'staleSaveIgnored' => false,
        'completed' => $incomingCompleted,
    ]);
} catch (Throwable $e) {
    snapshift_state_set_json([
        'ok' => false,
        'loggedIn' => false,
        'msg' => 'server_error',
    ], 200);
}
