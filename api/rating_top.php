<?php
declare(strict_types=1);
require_once __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

function pq_rating_top_json(array $payload, int $status = 200): void {
    if (function_exists('pq_json')) {
        pq_json($payload, $status);
    }
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function pq_rating_parse_progress(?string $raw): ?array {
    if ($raw === null || $raw === '') return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function pq_rating_truthy(mixed $value): bool {
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return ((int)$value) !== 0;
    $s = strtolower(trim((string)$value));
    return in_array($s, ['1','true','yes','y','on','completed','done','won','finished','success','solved'], true);
}

function pq_rating_is_completed(array $progress): bool {
    foreach (['completed', 'isCompleted', 'finished', 'won', 'success', 'solved'] as $key) {
        if (array_key_exists($key, $progress) && pq_rating_truthy($progress[$key])) return true;
    }
    foreach (['medal', 'medalKey', 'ratingLabel', 'ratingKey'] as $key) {
        $raw = strtolower(trim((string)($progress[$key] ?? '')));
        if (in_array($raw, ['gold', 'silver', 'bronze'], true)) return true;
    }
    $stars = (int)($progress['stars'] ?? ($progress['ratingStars'] ?? 0));
    if ($stars > 0) return true;

    $tiles = $progress['tiles'] ?? null;
    if (!is_array($tiles) || !$tiles) return false;
    foreach ($tiles as $i => $tile) {
        if ((int)$tile !== (int)$i) return false;
    }
    return true;
}

function pq_rating_shape(array $progress, string $diff): array {
    $fallback = [
        'easy' => [4, 6],
        'medium' => [6, 9],
        'hard' => [8, 12],
    ];
    [$fr, $fc] = $fallback[$diff] ?? [4, 6];
    $rows = max(1, (int)($progress['rows'] ?? $fr));
    $cols = max(1, (int)($progress['cols'] ?? $fc));
    return [$rows, $cols, max(1, $rows * $cols)];
}

function pq_rating_normalize_src(string $src): string {
    $src = trim($src);
    if ($src === '') return '';
    $decoded = rawurldecode($src);
    if ($decoded !== '') $src = $decoded;
    $src = str_replace('\\', '/', $src);
    $src = preg_replace('#^\./#', '', $src) ?? $src;
    $src = preg_replace('#^/+?#', '', $src) ?? $src;
    return strtolower($src);
}

function pq_rating_extract_daily_day(array $progress, array $row, string $progressKey, string $dailyKey): string {
    foreach ([
        $progress['dailyDay'] ?? null,
        $progress['day'] ?? null,
        $progress['daily_day'] ?? null,
        $progress['date'] ?? null,
        $dailyKey,
    ] as $candidate) {
        $v = trim((string)($candidate ?? ''));
        if (preg_match('/\b(\d{4}-\d{2}-\d{2})\b/', $v, $m)) return $m[1];
    }

    $pk = strtolower(trim($progressKey));
    if ($pk !== '' && preg_match('/daily:(\d{4}-\d{2}-\d{2})/', $pk, $m)) return $m[1];

    $updated = trim((string)($row['updated_at'] ?? ''));
    if ($updated !== '' && preg_match('/^(\d{4}-\d{2}-\d{2})/', $updated, $m)) return $m[1];
    return '';
}

function pq_rating_measure(array $progress, array $row): ?array {
    $diff = strtolower((string)($progress['diffKey'] ?? ($row['diff_key'] ?? 'easy')));
    if (!in_array($diff, ['easy','medium','hard'], true)) $diff = 'easy';
    if (!pq_rating_is_completed($progress)) return null;

    [$rows, $cols, $total] = pq_rating_shape($progress, $diff);
    $moves = max($total, (int)($progress['movesMade'] ?? 0));
    $elapsed = max(1000, (int)($progress['elapsedMs'] ?? 0));
    if ($elapsed <= 0) $elapsed = $total * 7000;

    $parPerTile = $diff === 'hard' ? 8000 : ($diff === 'medium' ? 6800 : 5600);
    $moveEff = min(1.0, $total / max($total, $moves));
    $speedEff = min(1.0, ($total * $parPerTile) / max(1000, $elapsed));
    $score = max(0.0, min(1.0, ($moveEff * 0.72) + ($speedEff * 0.28)));
    $scorePct = (int)round($score * 100);

    $stars = 1;
    $medal = 'bronze';
    if ($score >= 0.90) {
        $stars = 3;
        $medal = 'gold';
    } elseif ($score >= 0.76) {
        $stars = 2;
        $medal = 'silver';
    }

    $ratingMap = [
        'easy' => [1 => 10, 2 => 20, 3 => 30],
        'medium' => [1 => 20, 2 => 35, 3 => 50],
        'hard' => [1 => 35, 2 => 55, 3 => 75],
    ];
    $ratingPoints = $ratingMap[$diff][$stars] ?? 0;

    $srcKey = pq_rating_normalize_src((string)($progress['puzzleSrc'] ?? ($row['puzzle_src'] ?? '')));
    $catKey = strtolower(trim((string)($row['category_id'] ?? ($progress['categoryId'] ?? ''))));
    $puzzleIdx = isset($progress['puzzleIdx']) ? (int)$progress['puzzleIdx'] : (int)($row['puzzle_idx'] ?? -1);
    $progressKey = strtolower(trim((string)($progress['progressKey'] ?? ($row['progress_key'] ?? ''))));
    $dailyKey = trim((string)($progress['dailyKey'] ?? ''));
    $isDaily = pq_rating_truthy($progress['isDaily'] ?? false)
        || pq_rating_truthy($row['is_daily'] ?? false)
        || ($dailyKey !== '')
        || ($progressKey !== '' && str_starts_with($progressKey, 'daily:'));

    if ($isDaily) {
        $dayKey = pq_rating_extract_daily_day($progress, $row, $progressKey, $dailyKey);
        if ($progressKey !== '' && str_starts_with($progressKey, 'daily:')) {
            $entryKey = 'key:' . $progressKey;
        } elseif ($dayKey !== '') {
            $entryKey = sprintf('daily:%s:%s', $dayKey, $diff);
        } elseif ($srcKey !== '') {
            $entryKey = sprintf('daily-src:%s:%s:%s', $srcKey, (string)($row['updated_at'] ?? ''), $diff);
        } else {
            $entryKey = sprintf('daily-fallback:%s:%s:%s', (string)($row['updated_at'] ?? ''), $diff, md5(json_encode($progress)));
        }
    } elseif ($srcKey !== '') {
        $entryKey = sprintf('src:%s:%s', $srcKey, $diff);
    } elseif ($catKey !== '' && $puzzleIdx >= 0) {
        $entryKey = sprintf('idx:%s:%d:%s', $catKey, $puzzleIdx, $diff);
    } elseif ($progressKey !== '') {
        $entryKey = 'key:' . $progressKey;
    } else {
        $entryKey = sprintf('fallback:%s:%d:%s:%s', $catKey, $puzzleIdx, $diff, md5(json_encode($progress)));
    }

    return [
        'entry_key' => $entryKey,
        'diff_key' => $diff,
        'rows' => $rows,
        'cols' => $cols,
        'moves' => $moves,
        'elapsed_ms' => $elapsed,
        'score_pct' => $scorePct,
        'stars' => $stars,
        'medal' => $medal,
        'rating_points' => $ratingPoints,
        'updated_at' => (string)($row['updated_at'] ?? ''),
        'is_daily' => $isDaily ? 1 : 0,
    ];
}

function pq_rating_sort_entries(array &$entries): void {
    usort($entries, static function(array $a, array $b): int {
        return [$b['rating_points'], $b['stars'], $b['score_pct'], strcmp((string)$b['updated_at'], (string)$a['updated_at'])]
            <=>
               [$a['rating_points'], $a['stars'], $a['score_pct'], strcmp((string)$a['updated_at'], (string)$b['updated_at'])];
    });
}

function pq_rating_build_rows(PDO $pdo, int $perUserCap = 30): array {
    $sql = "SELECT p.user_id, p.progress_key, p.category_id, p.puzzle_idx, p.puzzle_src, p.diff_key, p.is_daily, p.updated_at, p.progress_json,
                   COALESCE(NULLIF(u.username, ''), CONCAT('User ', p.user_id)) AS username
            FROM user_puzzle_progress p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.user_id IS NOT NULL
              AND p.user_id > 0
            ORDER BY p.user_id ASC, p.updated_at DESC";
    $st = $pdo->query($sql);

    $users = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $uid = (int)($row['user_id'] ?? 0);
        if ($uid <= 0) continue;
        $progress = pq_rating_parse_progress((string)($row['progress_json'] ?? ''));
        if (!$progress) continue;
        $entry = pq_rating_measure($progress, $row);
        if (!$entry) continue;

        if (!isset($users[$uid])) {
            $users[$uid] = [
                'user_id' => $uid,
                'username' => (string)($row['username'] ?? ('User ' . $uid)),
                'entries' => [],
            ];
        }

        $existing = $users[$uid]['entries'][$entry['entry_key']] ?? null;
        if ($existing === null) {
            $users[$uid]['entries'][$entry['entry_key']] = $entry;
            continue;
        }
        $replace = false;
        if (($entry['rating_points'] ?? 0) > ($existing['rating_points'] ?? 0)) $replace = true;
        elseif (($entry['rating_points'] ?? 0) === ($existing['rating_points'] ?? 0) && ($entry['score_pct'] ?? 0) > ($existing['score_pct'] ?? 0)) $replace = true;
        elseif (($entry['rating_points'] ?? 0) === ($existing['rating_points'] ?? 0) && ($entry['score_pct'] ?? 0) === ($existing['score_pct'] ?? 0) && strcmp((string)($entry['updated_at'] ?? ''), (string)($existing['updated_at'] ?? '')) > 0) $replace = true;
        if ($replace) $users[$uid]['entries'][$entry['entry_key']] = $entry;
    }

    $rows = [];
    foreach ($users as $uid => $user) {
        $entries = array_values($user['entries']);
        if (!$entries) continue;
        pq_rating_sort_entries($entries);
        $counted = array_slice($entries, 0, max(1, $perUserCap));
        $rating = 0;
        $gold = 0;
        $silver = 0;
        $bronze = 0;
        $dailyCompleted = 0;
        foreach ($entries as $entry) {
            if (($entry['medal'] ?? '') === 'gold') $gold++;
            elseif (($entry['medal'] ?? '') === 'silver') $silver++;
            else $bronze++;
            if (!empty($entry['is_daily'])) $dailyCompleted++;
        }
        foreach ($counted as $entry) {
            $rating += (int)($entry['rating_points'] ?? 0);
        }
        $rows[] = [
            'user_id' => (int)$uid,
            'username' => (string)$user['username'],
            'rating' => $rating,
            'gold' => $gold,
            'silver' => $silver,
            'bronze' => $bronze,
            'completed_count' => count($entries),
            'counted_runs' => count($counted),
            'daily_completed' => $dailyCompleted,
        ];
    }

    usort($rows, static function(array $a, array $b): int {
        $cmp = ($b['rating'] <=> $a['rating']);
        if ($cmp !== 0) return $cmp;
        $cmp = ($b['gold'] <=> $a['gold']);
        if ($cmp !== 0) return $cmp;
        $cmp = ($b['silver'] <=> $a['silver']);
        if ($cmp !== 0) return $cmp;
        $cmp = ($b['bronze'] <=> $a['bronze']);
        if ($cmp !== 0) return $cmp;
        $cmp = ($b['completed_count'] <=> $a['completed_count']);
        if ($cmp !== 0) return $cmp;
        return strcasecmp((string)$a['username'], (string)$b['username']);
    });

    foreach ($rows as $i => &$row) {
        $row['rank'] = $i + 1;
    }
    unset($row);
    return $rows;
}

try {
    $pdo = pq_pdo();
    $limit = (int)($_GET['limit'] ?? 30);
    if ($limit < 1) $limit = 30;
    if ($limit > 100) $limit = 100;
    $rows = pq_rating_build_rows($pdo, 30);
    pq_rating_top_json([
        'ok' => true,
        'limit' => $limit,
        'rows' => array_slice($rows, 0, $limit),
        'items' => array_slice($rows, 0, $limit),
        'formula' => [
            'easy' => ['bronze' => 10, 'silver' => 20, 'gold' => 30],
            'medium' => ['bronze' => 20, 'silver' => 35, 'gold' => 50],
            'hard' => ['bronze' => 35, 'silver' => 55, 'gold' => 75],
            'counted_runs_cap' => 30,
            'scope' => 'all distinct completed puzzle results including daily',
        ],
    ]);
} catch (Throwable $e) {
    pq_rating_top_json(['ok' => false, 'msg' => 'server_error', 'error' => $e->getMessage()], 500);
}
