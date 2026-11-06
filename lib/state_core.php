<?php
declare(strict_types=1);

require_once __DIR__ . '/auth_core.php';

function snapshift_state_today_utc(): string {
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d');
}

function snapshift_state_normalize_src(?string $src): string {
    $src = trim((string)$src);
    if ($src === '') return '';

    for ($i = 0; $i < 2; $i++) {
        $decoded = rawurldecode($src);
        if ($decoded === '' || $decoded === $src) break;
        $src = $decoded;
    }

    $src = str_replace('\\', '/', $src);
    $src = preg_replace('#^\./+#', '', $src);
    $src = preg_replace('#^/+#', '', $src);
    $src = preg_replace('#/+#', '/', $src);

    return strtolower(trim($src));
}

function snapshift_state_extract_daily_day(?string $progressKey): ?string {
    $progressKey = trim((string)$progressKey);
    if ($progressKey !== '' && preg_match('/^daily:(\d{4}-\d{2}-\d{2})(?::|$)/', $progressKey, $m)) {
        return $m[1];
    }
    return null;
}

function snapshift_state_progress_build_key(array $progress): string {
    $categoryId = preg_replace('/[^a-z0-9_-]/i', '', (string)($progress['categoryId'] ?? '')) ?: 'unknown';
    $puzzleIdx = max(0, (int)($progress['puzzleIdx'] ?? 0));
    $diffKey = preg_replace('/[^a-z0-9_-]/i', '', (string)($progress['diffKey'] ?? 'easy')) ?: 'easy';
    $isDaily = !empty($progress['isDaily']);
    $dayKey = (string)($progress['dayKey'] ?? '');
    if ($isDaily && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayKey)) {
        return substr("daily:{$dayKey}:{$diffKey}", 0, 191);
    }
    $src = snapshift_state_normalize_src((string)($progress['puzzleSrc'] ?? $progress['src'] ?? ''));
    if ($src !== '') {
        return substr("puzzle:{$categoryId}:src:{$src}:{$diffKey}", 0, 191);
    }
    return substr("puzzle:{$categoryId}:{$puzzleIdx}:{$diffKey}", 0, 191);
}

function snapshift_state_extract_int(array $data, array $keys): ?int {
    foreach ($keys as $key) {
        if (!array_key_exists($key, $data)) continue;
        $value = $data[$key];
        if ($value === '' || $value === null) continue;
        if (is_numeric($value)) return (int)round((float)$value);
    }
    return null;
}

function snapshift_state_extract_float(array $data, array $keys): ?float {
    foreach ($keys as $key) {
        if (!array_key_exists($key, $data)) continue;
        $value = $data[$key];
        if ($value === '' || $value === null) continue;
        if (is_numeric($value)) return (float)$value;
    }
    return null;
}

function snapshift_state_extract_string(array $data, array $keys): string {
    foreach ($keys as $key) {
        if (!array_key_exists($key, $data)) continue;
        $value = trim((string)$data[$key]);
        if ($value !== '') return $value;
    }
    return '';
}

function snapshift_state_normalize_datetime(?string $value): ?string {
    $value = trim((string)$value);
    if ($value === '') return null;
    try {
        return (new DateTime($value))->format('Y-m-d H:i:s');
    } catch (Throwable $e) {
        return null;
    }
}

function snapshift_state_medal_normalize(?string $raw): string {
    $value = strtolower(trim((string)$raw));
    if ($value === '') return '';
    $value = str_replace(['_', '-'], ' ', $value);
    $value = preg_replace('/\s+/', ' ', $value);
    if (in_array($value, ['', '0', 'none', 'null', 'n/a', 'na', '-', '—', '--'], true)) return '';
    if (strpos($value, 'gold') !== false) return 'Gold';
    if (strpos($value, 'silver') !== false) return 'Silver';
    if (strpos($value, 'bronze') !== false) return 'Bronze';
    return '';
}

function snapshift_state_medal_to_stars(string $medal): int {
    switch (strtolower(trim($medal))) {
        case 'gold': return 3;
        case 'silver': return 2;
        case 'bronze': return 1;
        default: return 0;
    }
}

function snapshift_state_stars_to_medal(int $stars): string {
    if ($stars >= 3) return 'Gold';
    if ($stars === 2) return 'Silver';
    if ($stars === 1) return 'Bronze';
    return '';
}

function snapshift_state_format_elapsed_label(int $elapsedMs): string {
    if ($elapsedMs <= 0) return '';
    $seconds = (int)floor($elapsedMs / 1000);
    $hours = intdiv($seconds, 3600);
    $minutes = intdiv($seconds % 3600, 60);
    $secs = $seconds % 60;
    if ($hours > 0) return sprintf('%d:%02d:%02d', $hours, $minutes, $secs);
    return sprintf('%d:%02d', $minutes, $secs);
}

function snapshift_state_sanitize_tiles($tiles, int $expectedLen): ?array {
    if (!is_array($tiles) || count($tiles) !== $expectedLen) return null;
    $seen = [];
    $out = [];
    foreach ($tiles as $raw) {
        $n = (int)$raw;
        if ($n < 0 || $n >= $expectedLen || isset($seen[$n])) return null;
        $seen[$n] = true;
        $out[] = $n;
    }
    return $out;
}

function snapshift_state_sanitize_locked($locked, int $expectedLen): array {
    if (!is_array($locked) || count($locked) !== $expectedLen) {
        return array_fill(0, $expectedLen, false);
    }
    $out = [];
    foreach ($locked as $v) $out[] = (bool)$v;
    return array_slice($out, 0, $expectedLen);
}


function snapshift_state_truthy($value): bool {
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return ((float)$value) !== 0.0;
    $raw = strtolower(trim((string)$value));
    return in_array($raw, ['1', 'true', 'yes', 'y', 'on', 'done', 'completed', 'solved'], true);
}

function snapshift_state_extract_metrics(array $progress): array {
    $scoreValue = snapshift_state_extract_int($progress, ['scoreValue', 'score_value', 'score']);
    if ($scoreValue === null) $scoreValue = 0;
    $scoreValue = max(0, $scoreValue);

    $scorePct = snapshift_state_extract_float($progress, ['scorePct', 'score_pct', 'scorePercent', 'score_percent', 'completionPct', 'completion_pct']);
    if ($scorePct === null) $scorePct = 0.0;
    $scorePct = max(0.0, min(100.0, $scorePct));

    $moves = snapshift_state_extract_int($progress, ['movesMade', 'moves', 'moveCount', 'move_count']);
    if ($moves === null) $moves = 0;
    $moves = max(0, $moves);

    $elapsedMs = snapshift_state_extract_int($progress, ['elapsedMs', 'elapsed_ms', 'timeMs', 'time_ms']);
    if ($elapsedMs === null) {
        $elapsedMs = snapshift_state_extract_int($progress, ['elapsed', 'elapsedSeconds', 'elapsed_seconds', 'timeSeconds', 'time_seconds']);
        if ($elapsedMs !== null) $elapsedMs *= 1000;
    }
    if ($elapsedMs === null) $elapsedMs = 0;
    $elapsedMs = max(0, $elapsedMs);

    $elapsedLabel = snapshift_state_extract_string($progress, ['elapsedLabel', 'elapsed_label', 'elapsedText', 'elapsed_text', 'timeLabel', 'time_label']);
    if ($elapsedLabel === '' && $elapsedMs > 0) {
        $elapsedLabel = snapshift_state_format_elapsed_label($elapsedMs);
    }

    $stars = snapshift_state_extract_int($progress, ['stars', 'starCount', 'star_count', 'medalStars', 'medal_stars']);
    if ($stars === null) $stars = 0;
    $stars = max(0, min(3, $stars));

    $medal = snapshift_state_medal_normalize(
        snapshift_state_extract_string($progress, ['medal', 'medalKey', 'medal_key', 'medalName', 'medal_name', 'badge', 'tier'])
    );

    if ($stars <= 0 && $medal !== '') $stars = snapshift_state_medal_to_stars($medal);
    if ($medal === '' && $stars > 0) $medal = snapshift_state_stars_to_medal($stars);

    $moveEffPct = snapshift_state_extract_float($progress, ['moveEffPct', 'move_eff_pct', 'moveEfficiencyPct', 'move_efficiency_pct']);
    if ($moveEffPct === null) $moveEffPct = 0.0;
    $moveEffPct = max(0.0, min(100.0, $moveEffPct));

    $speedEffPct = snapshift_state_extract_float($progress, ['speedEffPct', 'speed_eff_pct', 'speedEfficiencyPct', 'speed_efficiency_pct']);
    if ($speedEffPct === null) $speedEffPct = 0.0;
    $speedEffPct = max(0.0, min(100.0, $speedEffPct));

    $completedAt = snapshift_state_normalize_datetime(
        snapshift_state_extract_string($progress, ['completedAt', 'completed_at'])
    );

    return [
        'scoreValue'   => $scoreValue,
        'scorePct'     => $scorePct,
        'moves'        => $moves,
        'elapsedMs'    => $elapsedMs,
        'elapsedLabel' => $elapsedLabel,
        'stars'        => $stars,
        'medal'        => $medal,
        'moveEffPct'   => $moveEffPct,
        'speedEffPct'  => $speedEffPct,
        'completedAt'  => $completedAt,
    ];
}

function snapshift_state_extract_summary_from_payload(array $payload): array {
    $metrics = snapshift_state_extract_metrics($payload);
    $completed = snapshift_state_truthy($payload['completed'] ?? null)
        || snapshift_state_truthy($payload['solved'] ?? null)
        || snapshift_state_truthy($payload['isSolved'] ?? null)
        || snapshift_state_truthy($payload['is_solved'] ?? null);

    $rows = snapshift_state_extract_int($payload, ['rows', 'rowCount', 'row_count']);
    $cols = snapshift_state_extract_int($payload, ['cols', 'colCount', 'col_count', 'columns']);

    $summary = [
        'completed'    => $completed,
        'completedAt'  => $metrics['completedAt'],
        'medal'        => $metrics['medal'],
        'medalKey'     => $metrics['medal'],
        'stars'        => (int)$metrics['stars'],
        'moves'        => (int)$metrics['moves'],
        'elapsedMs'    => (int)$metrics['elapsedMs'],
        'elapsedLabel' => (string)$metrics['elapsedLabel'],
        'scoreValue'   => (int)$metrics['scoreValue'],
        'scorePct'     => (float)$metrics['scorePct'],
        'moveEffPct'   => (float)$metrics['moveEffPct'],
        'speedEffPct'  => (float)$metrics['speedEffPct'],
        'rows'         => $rows !== null ? max(1, (int)$rows) : 0,
        'cols'         => $cols !== null ? max(1, (int)$cols) : 0,
        'diffKey'      => preg_replace('/[^a-z0-9_-]/i', '', (string)($payload['diffKey'] ?? $payload['diff_key'] ?? '')) ?: '',
        'categoryId'   => preg_replace('/[^a-z0-9_-]/i', '', (string)($payload['categoryId'] ?? $payload['category_id'] ?? '')) ?: '',
        'puzzleIdx'    => snapshift_state_extract_int($payload, ['puzzleIdx', 'puzzle_idx', 'index']),
        'puzzleSrc'    => snapshift_state_normalize_src((string)($payload['puzzleSrc'] ?? $payload['puzzle_src'] ?? $payload['src'] ?? '')),
    ];
    if (!snapshift_state_summary_has_meaningful_completion($summary)) {
        $summary['completed'] = false;
        $summary['completedAt'] = '';
    }
    if (!empty($summary['completed']) && snapshift_state_payload_has_unsolved_tiles($payload, (int)$summary['rows'], (int)$summary['cols'])) {
        $summary['completed'] = false;
        $summary['completedAt'] = '';
    }
    return $summary;
}

function snapshift_state_payload_has_unsolved_tiles(array $payload, int $rows, int $cols): bool {
    if (!array_key_exists('tiles', $payload) || !is_array($payload['tiles'])) return false;
    $total = $rows > 0 && $cols > 0 ? ($rows * $cols) : count($payload['tiles']);
    if ($total <= 0 || count($payload['tiles']) !== $total) return true;
    $seen = [];
    for ($i = 0; $i < $total; $i++) {
        $value = $payload['tiles'][$i] ?? null;
        if (!is_numeric($value)) return true;
        $n = (int)$value;
        if ($n < 0 || $n >= $total || isset($seen[$n])) return true;
        $seen[$n] = true;
        if ($n !== $i) return true;
    }
    return false;
}

function snapshift_state_extract_summary_from_row(array $row): array {
    $json = [];
    if (!empty($row['progress_json']) && is_string($row['progress_json'])) {
        $decoded = json_decode($row['progress_json'], true);
        if (is_array($decoded)) $json = $decoded;
    }
    $fromJson = snapshift_state_extract_summary_from_payload($json);

    $medal = snapshift_state_medal_normalize((string)($row['medal'] ?? ''));
    $stars = max(0, min(3, (int)($row['stars'] ?? 0)));
    if ($stars <= 0 && $medal !== '') $stars = snapshift_state_medal_to_stars($medal);
    if ($medal === '' && $stars > 0) $medal = snapshift_state_stars_to_medal($stars);

    $completedAt = snapshift_state_normalize_datetime((string)($row['completed_at'] ?? ''));

    $rowMoveEffPct = isset($row['move_eff_pct']) ? (float)$row['move_eff_pct'] : 0.0;
    $rowSpeedEffPct = isset($row['speed_eff_pct']) ? (float)$row['speed_eff_pct'] : 0.0;

    $summary = [
        'completed'    => snapshift_state_truthy($row['completed'] ?? null) || $fromJson['completed'],
        'completedAt'  => $completedAt ?: $fromJson['completedAt'],
        'medal'        => $medal !== '' ? $medal : $fromJson['medal'],
        'medalKey'     => ($medal !== '' ? $medal : $fromJson['medalKey']),
        'stars'        => $stars > 0 ? $stars : (int)$fromJson['stars'],
        'moves'        => (int)($row['moves'] ?? 0) > 0 ? (int)$row['moves'] : (int)$fromJson['moves'],
        'elapsedMs'    => (int)($row['elapsed_ms'] ?? 0) > 0 ? (int)$row['elapsed_ms'] : (int)$fromJson['elapsedMs'],
        'elapsedLabel' => trim((string)($row['elapsed_label'] ?? '')) !== '' ? trim((string)$row['elapsed_label']) : (string)$fromJson['elapsedLabel'],
        'scoreValue'   => (int)($row['score_value'] ?? 0) !== 0 ? (int)$row['score_value'] : (int)$fromJson['scoreValue'],
        'scorePct'     => (float)($row['score_pct'] ?? 0) > 0 ? (float)$row['score_pct'] : (float)$fromJson['scorePct'],
        'moveEffPct'   => $rowMoveEffPct > 0 ? $rowMoveEffPct : (float)$fromJson['moveEffPct'],
        'speedEffPct'  => $rowSpeedEffPct > 0 ? $rowSpeedEffPct : (float)$fromJson['speedEffPct'],
        'rows'         => isset($row['rows']) && (int)$row['rows'] > 0 ? (int)$row['rows'] : (int)$fromJson['rows'],
        'cols'         => isset($row['cols']) && (int)$row['cols'] > 0 ? (int)$row['cols'] : (int)$fromJson['cols'],
        'diffKey'      => trim((string)($row['diff_key'] ?? '')) !== '' ? (string)$row['diff_key'] : (string)$fromJson['diffKey'],
        'categoryId'   => trim((string)($row['category_id'] ?? '')) !== '' ? (string)$row['category_id'] : (string)$fromJson['categoryId'],
        'puzzleIdx'    => isset($row['puzzle_idx']) ? (int)$row['puzzle_idx'] : (int)($fromJson['puzzleIdx'] ?? 0),
        'puzzleSrc'    => trim((string)($row['puzzle_src'] ?? '')) !== '' ? snapshift_state_normalize_src((string)$row['puzzle_src']) : (string)$fromJson['puzzleSrc'],
    ];
    if (!snapshift_state_summary_has_meaningful_completion($summary)) {
        $summary['completed'] = false;
        $summary['completedAt'] = '';
    }
    return $summary;
}

function snapshift_state_summary_has_meaningful_completion(array $summary): bool {
    if (empty($summary['completed'])) return true;
    $moves = (int)($summary['moves'] ?? 0);
    $elapsedMs = (int)($summary['elapsedMs'] ?? 0);
    $scoreValue = (int)($summary['scoreValue'] ?? 0);
    return $moves > 0 || $elapsedMs > 0 || $scoreValue > 0;
}

function snapshift_state_candidate_better(array $candidate, array $existing): bool {
    if (!$candidate['completed'] && $existing['completed']) return false;
    if ($candidate['completed'] && !$existing['completed']) return true;
    if ((int)$candidate['stars'] !== (int)$existing['stars']) return (int)$candidate['stars'] > (int)$existing['stars'];
    if ((float)$candidate['scorePct'] !== (float)$existing['scorePct']) return (float)$candidate['scorePct'] > (float)$existing['scorePct'];
    if ((int)$candidate['scoreValue'] !== (int)$existing['scoreValue']) return (int)$candidate['scoreValue'] > (int)$existing['scoreValue'];
    if ((int)$candidate['moves'] > 0 && (int)$existing['moves'] > 0 && (int)$candidate['moves'] !== (int)$existing['moves']) {
        return (int)$candidate['moves'] < (int)$existing['moves'];
    }
    if ((int)$candidate['elapsedMs'] > 0 && (int)$existing['elapsedMs'] > 0 && (int)$candidate['elapsedMs'] !== (int)$existing['elapsedMs']) {
        return (int)$candidate['elapsedMs'] < (int)$existing['elapsedMs'];
    }
    $candidateTs = $candidate['completedAt'] ? strtotime((string)$candidate['completedAt']) : 0;
    $existingTs = $existing['completedAt'] ? strtotime((string)$existing['completedAt']) : 0;
    return $candidateTs >= $existingTs;
}

function snapshift_state_pick_summary(array $existing, array $incoming): array {
    if (!$incoming['completed']) return $existing;
    if (!$existing['completed']) return $incoming;
    return snapshift_state_candidate_better($incoming, $existing) ? $incoming : $existing;
}

function snapshift_state_should_keep_existing_json(array $existing, array $incoming): bool {
    if (!$incoming['completed'] && $existing['completed']) return true;
    if ($incoming['completed'] && !$existing['completed']) return false;
    if ($incoming['completed'] && $existing['completed']) {
        return !snapshift_state_candidate_better($incoming, $existing);
    }
    return false;
}

function snapshift_state_force_completed_snapshot(array $progress, array $summary): array {
    $rows = max(1, (int)($progress['rows'] ?? $summary['rows'] ?? 0));
    $cols = max(1, (int)($progress['cols'] ?? $summary['cols'] ?? 0));
    $expectedLen = $rows * $cols;
    if ($expectedLen > 0) {
        $progress['tiles'] = range(0, $expectedLen - 1);
        $progress['locked'] = array_fill(0, $expectedLen, true);
    }
    $progress['rows'] = $rows;
    $progress['cols'] = $cols;
    $progress['completed'] = true;
    if (!empty($summary['completedAt'])) $progress['completedAt'] = (string)$summary['completedAt'];
    $progress['medal'] = (string)($summary['medal'] ?? '');
    $progress['medalKey'] = (string)($summary['medalKey'] ?? $summary['medal'] ?? '');
    $progress['stars'] = (int)($summary['stars'] ?? 0);
    $progress['moves'] = (int)($summary['moves'] ?? 0);
    $progress['movesMade'] = (int)($summary['moves'] ?? 0);
    $progress['elapsedMs'] = (int)($summary['elapsedMs'] ?? 0);
    $progress['elapsedLabel'] = (string)($summary['elapsedLabel'] ?? '');
    $progress['scoreValue'] = (int)($summary['scoreValue'] ?? 0);
    $progress['score'] = (int)($summary['scoreValue'] ?? 0);
    $progress['scorePct'] = (float)($summary['scorePct'] ?? 0);
    $progress['moveEffPct'] = (float)($summary['moveEffPct'] ?? 0);
    $progress['speedEffPct'] = (float)($summary['speedEffPct'] ?? 0);
    return $progress;
}

function snapshift_state_normalize_progress(array $progress): ?array {
    $categoryId = preg_replace('/[^a-z0-9_-]/i', '', (string)($progress['categoryId'] ?? ''));
    $diffKey = preg_replace('/[^a-z0-9_-]/i', '', (string)($progress['diffKey'] ?? 'easy')) ?: 'easy';
    $rows = max(1, (int)($progress['rows'] ?? 0));
    $cols = max(1, (int)($progress['cols'] ?? 0));
    $expectedLen = $rows * $cols;
    if ($categoryId === '' || $expectedLen <= 0) return null;

    $completed = !empty($progress['completed']);
    $tiles = snapshift_state_sanitize_tiles($progress['tiles'] ?? null, $expectedLen);
    if ($tiles === null) {
        if (!$completed) return null;
        $tiles = range(0, $expectedLen - 1);
    }

    $locked = snapshift_state_sanitize_locked($progress['locked'] ?? null, $expectedLen);
    if ($completed) $locked = array_fill(0, $expectedLen, true);

    $puzzleIdx = max(0, (int)($progress['puzzleIdx'] ?? 0));
    $isDaily = !empty($progress['isDaily']);
    $dayKey = (string)($progress['dayKey'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayKey)) $dayKey = '';

    $metrics = snapshift_state_extract_metrics($progress);

    return [
        'progressKey'      => snapshift_state_progress_build_key($progress),
        'schemaVersion'    => max(1, (int)($progress['schemaVersion'] ?? 1)),
        'clientSessionId'  => trim((string)($progress['clientSessionId'] ?? '')),
        'saveSeq'          => max(0, (int)($progress['saveSeq'] ?? 0)),
        'categoryId'       => $categoryId,
        'categoryName'     => trim((string)($progress['categoryName'] ?? '')),
        'puzzleIdx'        => $puzzleIdx,
        'puzzleName'       => trim((string)($progress['puzzleName'] ?? '')),
        'puzzleSrc'        => snapshift_state_normalize_src((string)($progress['puzzleSrc'] ?? '')),
        'diffKey'          => $diffKey,
        'rows'             => $rows,
        'cols'             => $cols,
        'tiles'            => $tiles,
        'locked'           => $locked,
        'score'            => max(0, (int)($progress['score'] ?? 0)),
        'scoreValue'       => (int)$metrics['scoreValue'],
        'scorePct'         => (float)$metrics['scorePct'],
        'streak'           => max(0, (int)($progress['streak'] ?? 0)),
        'movesMade'        => max(0, (int)($progress['movesMade'] ?? ($metrics['moves'] ?? 0))),
        'moves'            => (int)$metrics['moves'],
        'elapsedMs'        => max(0, (int)($progress['elapsedMs'] ?? ($metrics['elapsedMs'] ?? 0))),
        'elapsedLabel'     => (string)$metrics['elapsedLabel'],
        'hardMode'         => !empty($progress['hardMode']),
        'isDaily'          => $isDaily,
        'dayKey'           => $dayKey,
        'savedAt'          => trim((string)($progress['savedAt'] ?? '')),
        'completed'        => $completed,
        'completedAt'      => $metrics['completedAt'] ?? trim((string)($progress['completedAt'] ?? '')),
        'medal'            => (string)$metrics['medal'],
        'stars'            => (int)$metrics['stars'],
    ];
}

function snapshift_state_fetch_user_state(PDO $pdo, int $uid): array {
    try {
        $pdo->prepare("
            INSERT INTO user_state (user_id, points, unlocked_json)
            VALUES (?, 0, '{}')
            ON DUPLICATE KEY UPDATE user_id = user_id
        ")->execute([$uid]);
    } catch (Throwable $e) {
        // table might already be there but schema could differ; continue to select
    }

    $st = $pdo->prepare("SELECT points, unlocked_json FROM user_state WHERE user_id = ? LIMIT 1");
    $st->execute([$uid]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: ['points' => 0, 'unlocked_json' => '{}'];

    $unlocked = json_decode((string)($row['unlocked_json'] ?? '{}'));
    if (!is_object($unlocked) && !is_array($unlocked)) $unlocked = new stdClass();

    return [
        'points' => max(0, (int)($row['points'] ?? 0)),
        'unlocked' => $unlocked,
    ];
}

function snapshift_state_ensure_tables(PDO $pdo): void {
    static $done = false;
    if ($done) return;

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_puzzle_progress (
        user_id BIGINT UNSIGNED NOT NULL,
        progress_key VARCHAR(191) NOT NULL,
        category_id VARCHAR(64) NOT NULL DEFAULT '',
        puzzle_idx INT NOT NULL DEFAULT 0,
        diff_key VARCHAR(16) NOT NULL DEFAULT '',
        puzzle_name VARCHAR(255) NOT NULL DEFAULT '',
        puzzle_src VARCHAR(255) NOT NULL DEFAULT '',
        is_daily TINYINT(1) NOT NULL DEFAULT 0,
        day_key VARCHAR(10) NOT NULL DEFAULT '',
        progress_json MEDIUMTEXT NOT NULL,
        completed TINYINT(1) NOT NULL DEFAULT 0,
        completed_at DATETIME NULL,
        medal VARCHAR(16) NOT NULL DEFAULT '',
        stars TINYINT NOT NULL DEFAULT 0,
        moves INT NOT NULL DEFAULT 0,
        elapsed_ms INT NOT NULL DEFAULT 0,
        elapsed_label VARCHAR(32) NOT NULL DEFAULT '',
        score_value INT NOT NULL DEFAULT 0,
        score_pct DECIMAL(6,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, progress_key),
        KEY idx_user_updated (user_id, updated_at),
        KEY idx_user_daily (user_id, is_daily, day_key, updated_at),
        KEY idx_user_category_src (user_id, category_id, diff_key, puzzle_src, updated_at),
        KEY idx_user_category_idx (user_id, category_id, diff_key, puzzle_idx, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_daily_done (
        user_id BIGINT UNSIGNED NOT NULL,
        day_key VARCHAR(10) NOT NULL,
        completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, day_key),
        KEY idx_day_key (day_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $needed = [
        'completed' => "ALTER TABLE user_puzzle_progress ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0",
        'completed_at' => "ALTER TABLE user_puzzle_progress ADD COLUMN completed_at DATETIME NULL",
        'medal' => "ALTER TABLE user_puzzle_progress ADD COLUMN medal VARCHAR(16) NOT NULL DEFAULT ''",
        'stars' => "ALTER TABLE user_puzzle_progress ADD COLUMN stars TINYINT NOT NULL DEFAULT 0",
        'moves' => "ALTER TABLE user_puzzle_progress ADD COLUMN moves INT NOT NULL DEFAULT 0",
        'elapsed_ms' => "ALTER TABLE user_puzzle_progress ADD COLUMN elapsed_ms INT NOT NULL DEFAULT 0",
        'elapsed_label' => "ALTER TABLE user_puzzle_progress ADD COLUMN elapsed_label VARCHAR(32) NOT NULL DEFAULT ''",
        'score_value' => "ALTER TABLE user_puzzle_progress ADD COLUMN score_value INT NOT NULL DEFAULT 0",
        'score_pct' => "ALTER TABLE user_puzzle_progress ADD COLUMN score_pct DECIMAL(6,2) NOT NULL DEFAULT 0",
    ];
    $cols = [];
    try {
        $st = $pdo->query("SHOW COLUMNS FROM user_puzzle_progress");
        while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
            $cols[(string)$row['Field']] = true;
        }
    } catch (Throwable $e) {}
    foreach ($needed as $col => $sql) {
        if (!isset($cols[$col])) {
            try { $pdo->exec($sql); } catch (Throwable $e) {}
        }
    }

    $indexes = [
        'idx_user_category_src' => "ALTER TABLE user_puzzle_progress ADD INDEX idx_user_category_src (user_id, category_id, diff_key, puzzle_src, updated_at)",
        'idx_user_category_idx' => "ALTER TABLE user_puzzle_progress ADD INDEX idx_user_category_idx (user_id, category_id, diff_key, puzzle_idx, updated_at)",
    ];
    $existingIndexes = [];
    try {
        $st = $pdo->query("SHOW INDEX FROM user_puzzle_progress");
        while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
            $existingIndexes[(string)($row['Key_name'] ?? '')] = true;
        }
    } catch (Throwable $e) {}
    foreach ($indexes as $name => $sql) {
        if (!isset($existingIndexes[$name])) {
            try { $pdo->exec($sql); } catch (Throwable $e) {}
        }
    }

    $done = true;
}


function snapshift_state_progress_matches_scope(array $decoded, ?string $progressKey, string $targetDailyDay, ?string $categoryId = null, ?string $puzzleSrc = null, ?string $diffKey = null, ?int $puzzleIdx = null): bool {
    $isDaily = !empty($decoded['isDaily']);
    $savedProgressKey = trim((string)($decoded['progressKey'] ?? ''));
    $savedCategoryId = trim((string)($decoded['categoryId'] ?? ''));
    $savedDiffKey = trim((string)($decoded['diffKey'] ?? ''));
    $savedPuzzleIdx = (int)($decoded['puzzleIdx'] ?? -1);
    $savedPuzzleSrc = snapshift_state_normalize_src((string)($decoded['puzzleSrc'] ?? ''));
    $savedDay = trim((string)($decoded['dayKey'] ?? ''));

    if ($progressKey !== null && $progressKey !== '') {
        $dailyKey = snapshift_state_extract_daily_day($progressKey);
        if ($dailyKey !== null) {
            if (!$isDaily) return false;
            if ($savedDay !== '' && $savedDay !== $dailyKey) return false;
        } else {
            if ($savedProgressKey !== '' && $savedProgressKey !== $progressKey) return false;
        }
    }

    if ($isDaily) {
        if ($targetDailyDay !== '' && $savedDay !== '' && $savedDay !== $targetDailyDay) return false;
    } else {
        if ($categoryId !== null && $savedCategoryId !== $categoryId) return false;
        if ($puzzleIdx !== null && $puzzleSrc === null && $savedPuzzleIdx !== (int)$puzzleIdx) return false;
    }

    if ($diffKey !== null && $savedDiffKey !== $diffKey) return false;

    if ($puzzleSrc !== null) {
        if ($savedPuzzleSrc === '') return false;
        if ($savedPuzzleSrc !== $puzzleSrc) return false;
    }

    return true;
}

function snapshift_state_decode_row(?array $row, string $targetDailyDay): ?array {
    if (!$row) return null;

    $isDaily = !empty($row['is_daily']);
    $dayKey = (string)($row['day_key'] ?? '');
    if ($isDaily && $dayKey !== '' && $targetDailyDay !== '' && $dayKey !== $targetDailyDay) {
        return null;
    }

    $raw = (string)($row['progress_json'] ?? '');
    if ($raw === '') return null;

    $progress = json_decode($raw, true);
    if (!is_array($progress)) return null;

    $summary = snapshift_state_extract_summary_from_row($row);

    $progress['progressKey'] = (string)($row['progress_key'] ?? ($progress['progressKey'] ?? ''));
    $progress['categoryId'] = (string)($summary['categoryId'] ?: ($progress['categoryId'] ?? ''));
    $progress['puzzleIdx'] = (int)($summary['puzzleIdx'] ?? ($progress['puzzleIdx'] ?? 0));
    $progress['diffKey'] = (string)($summary['diffKey'] ?: ($progress['diffKey'] ?? 'easy'));
    $progress['puzzleName'] = (string)($row['puzzle_name'] ?? ($progress['puzzleName'] ?? ''));
    $progress['puzzleSrc'] = (string)($summary['puzzleSrc'] ?: ($progress['puzzleSrc'] ?? ''));
    $progress['isDaily'] = $isDaily;
    $progress['dayKey'] = $dayKey;
    $progress['updatedAt'] = (string)($row['updated_at'] ?? '');
    if (!empty($summary['rows'])) $progress['rows'] = (int)$summary['rows'];
    if (!empty($summary['cols'])) $progress['cols'] = (int)$summary['cols'];

    $progress['completed'] = !empty($summary['completed']);
    if (!empty($summary['completedAt'])) $progress['completedAt'] = (string)$summary['completedAt'];
    $progress['medal'] = (string)$summary['medal'];
    $progress['medalKey'] = (string)($summary['medalKey'] ?? $summary['medal']);
    $progress['stars'] = (int)$summary['stars'];
    $progress['moves'] = (int)$summary['moves'];
    $progress['movesMade'] = (int)$summary['moves'];
    $progress['elapsedMs'] = (int)$summary['elapsedMs'];
    $progress['elapsedLabel'] = (string)$summary['elapsedLabel'];
    $progress['scoreValue'] = (int)$summary['scoreValue'];
    $progress['score'] = (int)$summary['scoreValue'];
    $progress['scorePct'] = (float)$summary['scorePct'];
    $progress['moveEffPct'] = (float)($summary['moveEffPct'] ?? 0);
    $progress['speedEffPct'] = (float)($summary['speedEffPct'] ?? 0);

    if (!empty($summary['completed'])) {
        $progress = snapshift_state_force_completed_snapshot($progress, $summary);
        $progress['forceSolved'] = true;
    }

    return $progress;
}

function snapshift_state_fetch_progress(PDO $pdo, int $uid, ?string $progressKey, string $targetDailyDay, ?string $categoryId = null, ?string $puzzleSrc = null, ?string $diffKey = null, ?int $puzzleIdx = null): ?array {
    snapshift_state_ensure_tables($pdo);

    $progressKey = trim((string)($progressKey ?? ''));
    if ($progressKey === '') $progressKey = null;
    if ($progressKey !== null) $progressKey = substr($progressKey, 0, 191);

    $categoryId = preg_replace('/[^a-z0-9_-]/i', '', (string)($categoryId ?? '')) ?: null;
    $puzzleSrc = snapshift_state_normalize_src($puzzleSrc);
    if ($puzzleSrc === '') $puzzleSrc = null;
    $diffKey = preg_replace('/[^a-z0-9_-]/i', '', (string)($diffKey ?? '')) ?: null;
    if ($puzzleIdx !== null) $puzzleIdx = max(0, (int)$puzzleIdx);

    if ($progressKey !== null) {
        $rows = [];
        $st = $pdo->prepare('SELECT * FROM user_puzzle_progress WHERE user_id=? AND progress_key=? LIMIT 1');
        $st->execute([$uid, $progressKey]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        if (is_array($row)) $rows[] = $row;

        $dailyKey = snapshift_state_extract_daily_day($progressKey);
        if ($dailyKey !== null) {
            $sql = 'SELECT * FROM user_puzzle_progress WHERE user_id=? AND is_daily=1 AND day_key=?';
            $params = [$uid, $dailyKey];

            if ($diffKey !== null) {
                $sql .= ' AND diff_key=?';
                $params[] = $diffKey;
            }
            if ($categoryId !== null) {
                $sql .= ' AND category_id=?';
                $params[] = $categoryId;
            }
            if ($puzzleSrc !== null) {
                $sql .= ' AND puzzle_src=?';
                $params[] = $puzzleSrc;
            } elseif ($puzzleIdx !== null) {
                $sql .= ' AND puzzle_idx=?';
                $params[] = (int)$puzzleIdx;
            }

            $sql .= ' ORDER BY completed DESC, updated_at DESC LIMIT 4';

            $st = $pdo->prepare($sql);
            $st->execute($params);
            while ($aliasRow = $st->fetch(PDO::FETCH_ASSOC)) {
                $rows[] = $aliasRow;
            }
        }

        foreach ($rows as $candidateRow) {
            $decoded = snapshift_state_decode_row(is_array($candidateRow) ? $candidateRow : null, $targetDailyDay);
            if ($decoded === null) continue;
            if (!snapshift_state_progress_matches_scope($decoded, $progressKey, $targetDailyDay, $categoryId, $puzzleSrc, $diffKey, $puzzleIdx)) continue;
            return $decoded;
        }
        return null;
    }

    if ($categoryId !== null && $diffKey !== null && $puzzleSrc !== null) {
        $st = $pdo->prepare('SELECT * FROM user_puzzle_progress WHERE user_id=? AND category_id=? AND diff_key=? AND puzzle_src=? ORDER BY completed DESC, updated_at DESC LIMIT 1');
        $st->execute([$uid, $categoryId, $diffKey, $puzzleSrc]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        $decoded = snapshift_state_decode_row(is_array($row) ? $row : null, $targetDailyDay);
        if ($decoded !== null && snapshift_state_progress_matches_scope($decoded, null, $targetDailyDay, $categoryId, $puzzleSrc, $diffKey, $puzzleIdx)) {
            return $decoded;
        }
    }

    if ($categoryId !== null && $diffKey !== null && $puzzleIdx !== null) {
        $st = $pdo->prepare('SELECT * FROM user_puzzle_progress WHERE user_id=? AND category_id=? AND diff_key=? AND puzzle_idx=? ORDER BY completed DESC, updated_at DESC LIMIT 1');
        $st->execute([$uid, $categoryId, $diffKey, (int)$puzzleIdx]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        $decoded = snapshift_state_decode_row(is_array($row) ? $row : null, $targetDailyDay);
        if ($decoded !== null && snapshift_state_progress_matches_scope($decoded, null, $targetDailyDay, $categoryId, $puzzleSrc, $diffKey, $puzzleIdx)) {
            return $decoded;
        }
    }

    $hasSpecificLookup = ($progressKey !== null && $progressKey !== '')
        || $categoryId !== null
        || $puzzleSrc !== null
        || $diffKey !== null
        || $puzzleIdx !== null;

    if ($hasSpecificLookup) return null;

    // Generic latest-progress fallback is for unfinished normal puzzles only.
    $st = $pdo->prepare('SELECT * FROM user_puzzle_progress WHERE user_id=? AND is_daily=0 ORDER BY completed ASC, updated_at DESC LIMIT 8');
    $st->execute([$uid]);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $decoded = snapshift_state_decode_row(is_array($row) ? $row : null, $targetDailyDay);
        if ($decoded !== null && snapshift_state_progress_matches_scope($decoded, null, $targetDailyDay, null, null, null, null)) {
            return $decoded;
        }
    }
    return null;
}
