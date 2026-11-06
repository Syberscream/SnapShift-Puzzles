<?php
declare(strict_types=1);

require_once __DIR__ . '/auth_core.php';
require_once __DIR__ . '/state_core.php';
require_once __DIR__ . '/daily_reward_state.php';

function snapshift_daily_hero_history_path(): string {
    return dirname(__DIR__) . '/daily_puzzles/history.json';
}

function snapshift_daily_hero_load_history(): array {
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $path = snapshift_daily_hero_history_path();
    if (!is_file($path)) {
        $cache = [];
        return $cache;
    }

    $raw = @file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
        $cache = [];
        return $cache;
    }

    $decoded = json_decode($raw, true);
    $cache = is_array($decoded) ? $decoded : [];
    return $cache;
}

function snapshift_daily_hero_decode_src(string $src): string {
    $value = trim($src);
    if ($value === '') return '';

    for ($i = 0; $i < 2; $i++) {
        $decoded = rawurldecode($value);
        if ($decoded === $value) break;
        $value = $decoded;
    }

    return $value;
}

function snapshift_daily_hero_normalize_item(array $item, string $day): ?array {
    $src = snapshift_daily_hero_decode_src((string)($item['src'] ?? ''));
    if ($src === '') return null;

    $catId = preg_replace('/[^a-z0-9_-]/i', '', (string)($item['catId'] ?? 'daily')) ?: 'daily';
    $name = trim((string)($item['name'] ?? 'Puzzle')) ?: 'Puzzle';

    return [
        'day' => $day,
        'category_id' => $catId,
        'display_category' => strtolower($catId) === 'daily' ? 'Daily Pool' : $catId,
        'name' => $name,
        'src' => $src,
        'thumb' => trim((string)($item['thumb'] ?? '')),
        'updated' => (int)($item['updated'] ?? 0),
        'puzzle_idx' => max(0, (int)($item['puzzleIdx'] ?? 0)),
    ];
}

function snapshift_daily_hero_current_daily(): ?array {
    $history = snapshift_daily_hero_load_history();
    $day = trim((string)($history['today'] ?? pq_active_daily_day()));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        return null;
    }

    $days = isset($history['days']) && is_array($history['days']) ? $history['days'] : [];
    $item = isset($days[$day]) && is_array($days[$day]) ? $days[$day] : null;
    if (!$item) return null;

    return snapshift_daily_hero_normalize_item($item, $day);
}

function snapshift_daily_hero_progress_has_state(array $progress, array $summary): bool {
    if (!empty($summary['completed'])) return true;
    if ((int)($summary['moves'] ?? 0) > 0) return true;
    if ((int)($summary['elapsedMs'] ?? 0) > 0) return true;
    if ((int)($summary['scoreValue'] ?? 0) > 0) return true;
    if ((int)($summary['stars'] ?? 0) > 0) return true;
    if (!empty($progress['saveSeq']) || !empty($progress['swapCount']) || !empty($progress['hintCount'])) return true;

    $tileSets = [
        $progress['tiles'] ?? null,
        $progress['order'] ?? null,
        $progress['tileOrder'] ?? null,
    ];
    foreach ($tileSets as $tiles) {
        if (!is_array($tiles) || !$tiles) continue;
        foreach (array_values($tiles) as $idx => $value) {
            if ((int)$value !== (int)$idx) {
                return true;
            }
        }
    }

    return false;
}

function snapshift_daily_hero_progress_snapshot(PDO $pdo, int $uid, array $daily): array {
    snapshift_state_ensure_tables($pdo);
    $progress = snapshift_state_fetch_progress(
        $pdo,
        $uid,
        null,
        (string)$daily['day'],
        'daily',
        snapshift_state_normalize_src((string)$daily['src']),
        null,
        (int)$daily['puzzle_idx']
    );

    if (!is_array($progress)) {
        return [
            'progress' => null,
            'summary' => null,
            'has_progress' => false,
        ];
    }

    $summary = snapshift_state_extract_summary_from_payload($progress);
    return [
        'progress' => $progress,
        'summary' => $summary,
        'has_progress' => snapshift_daily_hero_progress_has_state($progress, $summary),
    ];
}

function snapshift_daily_hero_leaderboard_snapshot(PDO $pdo, int $uid, string $day): ?array {
    snapshift_auth_ensure_leaderboard_tables($pdo);
    $st = $pdo->prepare(
        'SELECT day_key, time_ms, moves, acc, created_at
         FROM leaderboard_daily
         WHERE user_id = ? AND day_key = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1'
    );
    $st->execute([$uid, $day]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) return null;

    return [
        'completed' => true,
        'completedAt' => trim((string)($row['created_at'] ?? '')),
        'moves' => (int)($row['moves'] ?? 0),
        'elapsedMs' => (int)($row['time_ms'] ?? 0),
        'scoreValue' => 0,
        'scorePct' => 0.0,
        'stars' => 0,
        'medal' => '',
        'medalKey' => '',
        'source' => 'leaderboard',
    ];
}

function snapshift_daily_hero_reward_state(PDO $pdo, int $uid): array {
    $state = snapshift_daily_reward_state_resolve($pdo, $uid);

    return [
        'claimable' => !empty($state['claimable']),
        'claim_count' => (int)($state['claim_count'] ?? 0),
        'claimable_days' => array_values($state['claimable_days'] ?? []),
        'claim_day' => $state['claim_day'] ?? null,
        'default_claim_day' => $state['default_claim_day'] ?? pq_default_claim_day(),
        'active_daily_day' => $state['active_daily_day'] ?? pq_active_daily_day(),
        'pending_points' => (int)($state['pending_points'] ?? 0),
        'reward' => [
            'points' => (int)($state['reward']['points'] ?? 0),
            'gold' => (int)($state['reward']['gold'] ?? 0),
            'silver' => (int)($state['reward']['silver'] ?? 0),
            'bronze' => (int)($state['reward']['bronze'] ?? 0),
            'rank' => (int)($state['reward']['rank'] ?? 0),
        ],
    ];
}

function snapshift_daily_hero_resolve(PDO $pdo, ?array $user): array {
    $daily = snapshift_daily_hero_current_daily();
    $activeDay = pq_active_daily_day();

    $response = [
        'ok' => true,
        'loggedIn' => false,
        'active_day' => $activeDay,
        'daily' => $daily,
        'completion' => [
            'status' => 'new',
            'completed' => false,
            'source' => 'none',
            'completedAt' => '',
            'moves' => 0,
            'elapsedMs' => 0,
            'scoreValue' => 0,
            'scorePct' => 0.0,
            'medal' => '',
            'medalKey' => '',
            'stars' => 0,
            'has_progress' => false,
        ],
        'reward' => [
            'claimable' => false,
            'claim_count' => 0,
            'claimable_days' => [],
            'claim_day' => null,
            'default_claim_day' => pq_default_claim_day(),
            'active_daily_day' => $activeDay,
            'pending_points' => 0,
            'reward' => ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 0, 'rank' => 0],
        ],
        'hero' => [
            'cta_label' => 'Play Daily',
            'status_label' => '',
            'subtitle' => $daily ? (($daily['display_category'] ?? 'Daily') . ' • ' . ($daily['name'] ?? 'Puzzle')) : '',
        ],
    ];

    if (!$daily) {
        return $response;
    }

    if (!$user || empty($user['id'])) {
        return $response;
    }

    $uid = (int)($user['id'] ?? 0);
    if ($uid <= 0) {
        return $response;
    }

    $response['loggedIn'] = true;

    $progressSnapshot = snapshift_daily_hero_progress_snapshot($pdo, $uid, $daily);
    $summary = is_array($progressSnapshot['summary']) ? $progressSnapshot['summary'] : null;
    $hasProgress = !empty($progressSnapshot['has_progress']);

    $status = 'new';
    $source = 'none';

    if ($summary && !empty($summary['completed'])) {
        $status = 'completed';
        $source = 'progress';
        $response['completion'] = [
            'status' => $status,
            'completed' => true,
            'source' => $source,
            'completedAt' => (string)($summary['completedAt'] ?? ''),
            'moves' => (int)($summary['moves'] ?? 0),
            'elapsedMs' => (int)($summary['elapsedMs'] ?? 0),
            'scoreValue' => (int)($summary['scoreValue'] ?? 0),
            'scorePct' => (float)($summary['scorePct'] ?? 0),
            'medal' => (string)($summary['medal'] ?? ''),
            'medalKey' => (string)($summary['medalKey'] ?? ''),
            'stars' => (int)($summary['stars'] ?? 0),
            'has_progress' => true,
        ];
    } else {
        $leaderboard = snapshift_daily_hero_leaderboard_snapshot($pdo, $uid, (string)$daily['day']);
        if ($leaderboard) {
            $status = 'completed';
            $source = 'leaderboard';
            $response['completion'] = [
                'status' => $status,
                'completed' => true,
                'source' => $source,
                'completedAt' => (string)($leaderboard['completedAt'] ?? ''),
                'moves' => (int)($leaderboard['moves'] ?? 0),
                'elapsedMs' => (int)($leaderboard['elapsedMs'] ?? 0),
                'scoreValue' => (int)($leaderboard['scoreValue'] ?? 0),
                'scorePct' => (float)($leaderboard['scorePct'] ?? 0),
                'medal' => (string)($leaderboard['medal'] ?? ''),
                'medalKey' => (string)($leaderboard['medalKey'] ?? ''),
                'stars' => (int)($leaderboard['stars'] ?? 0),
                'has_progress' => true,
            ];
        } elseif ($hasProgress) {
            $status = 'in_progress';
            $source = 'progress';
            $response['completion'] = [
                'status' => $status,
                'completed' => false,
                'source' => $source,
                'completedAt' => '',
                'moves' => (int)($summary['moves'] ?? 0),
                'elapsedMs' => (int)($summary['elapsedMs'] ?? 0),
                'scoreValue' => (int)($summary['scoreValue'] ?? 0),
                'scorePct' => (float)($summary['scorePct'] ?? 0),
                'medal' => '',
                'medalKey' => '',
                'stars' => 0,
                'has_progress' => true,
            ];
        }
    }

    $response['reward'] = snapshift_daily_hero_reward_state($pdo, $uid);

    $statusLabel = '';
    $ctaLabel = 'Play Daily';
    if ($status === 'completed') {
        $statusLabel = 'Completed';
        $ctaLabel = 'View Daily';
    } elseif ($status === 'in_progress') {
        $statusLabel = 'In Progress';
        $ctaLabel = 'Resume Daily';
    }

    $response['hero'] = [
        'cta_label' => $ctaLabel,
        'status_label' => $statusLabel,
        'subtitle' => ($daily['display_category'] ?? 'Daily') . ' • ' . ($daily['name'] ?? 'Puzzle') . ($statusLabel !== '' ? ' • ' . $statusLabel : ''),
    ];

    return $response;
}
