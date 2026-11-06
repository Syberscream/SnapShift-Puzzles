<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function ph_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function ph_qid(string $name): string
{
    return '`' . str_replace('`', '``', $name) . '`';
}

function ph_include_first(array $paths): ?string
{
    foreach ($paths as $path) {
        if (is_string($path) && $path !== '' && is_file($path)) {
            require_once $path;
            return $path;
        }
    }
    return null;
}

function ph_root_dir(): string
{
    return dirname(__DIR__);
}

function ph_global_value(array $names)
{
    foreach ($names as $name) {
        if (array_key_exists($name, $GLOBALS) && $GLOBALS[$name] !== null && $GLOBALS[$name] !== '') {
            return $GLOBALS[$name];
        }
        if (defined($name)) {
            $value = constant($name);
            if ($value !== null && $value !== '') {
                return $value;
            }
        }
        $env = getenv($name);
        if ($env !== false && $env !== '') {
            return $env;
        }
    }
    return null;
}

function ph_bootstrap(): void
{
    $apiDir = __DIR__;
    $rootDir = ph_root_dir();

    ph_include_first([
        $rootDir . '/lib/bootstrap.php',
        $apiDir . '/../lib/bootstrap.php',
        $apiDir . '/lib/bootstrap.php',
        $rootDir . '/includes/bootstrap.php',
        $apiDir . '/../includes/bootstrap.php',
        $apiDir . '/includes/bootstrap.php',
    ]);

    ph_include_first([
        $rootDir . '/lib/auth_core.php',
        $apiDir . '/../lib/auth_core.php',
        $apiDir . '/lib/auth_core.php',
        $rootDir . '/includes/auth.php',
        $apiDir . '/../includes/auth.php',
        $apiDir . '/includes/auth.php',
    ]);

    ph_include_first([
        $rootDir . '/includes/db.php',
        $apiDir . '/../includes/db.php',
        $apiDir . '/includes/db.php',
        $rootDir . '/db.php',
        $apiDir . '/../db.php',
        $apiDir . '/db.php',
        $rootDir . '/config.php',
        $apiDir . '/../config.php',
        $apiDir . '/config.php',
    ]);
}

function ph_current_user(): ?array
{
    if (function_exists('snapshift_auth_current_user')) {
        try {
            $user = snapshift_auth_current_user();
            if (is_array($user) && !empty($user)) {
                return $user;
            }
        } catch (Throwable $e) {
        }
    }

    foreach (['user', 'auth_user', 'member', 'account'] as $key) {
        if (!empty($_SESSION[$key]) && is_array($_SESSION[$key])) {
            return $_SESSION[$key];
        }
    }

    return null;
}

function ph_user_id(?array $user): int
{
    if (!$user) {
        return 0;
    }
    foreach (['id', 'user_id', 'uid'] as $key) {
        if (isset($user[$key]) && (int)$user[$key] > 0) {
            return (int)$user[$key];
        }
    }
    return 0;
}

function ph_points_from_user(?array $user): ?int
{
    if (!$user) {
        return null;
    }
    foreach (['points', 'points_balance', 'current_points', 'balance'] as $key) {
        if (isset($user[$key]) && $user[$key] !== '' && $user[$key] !== null) {
            return (int)$user[$key];
        }
    }
    return null;
}

function ph_pdo(): ?PDO
{
    if (function_exists('snapshift_pdo')) {
        try {
            $pdo = snapshift_pdo();
            if ($pdo instanceof PDO) {
                return $pdo;
            }
        } catch (Throwable $e) {
        }
    }

    $host = ph_global_value(['DB_HOST', 'DATABASE_HOST', 'MYSQL_HOST']);
    $name = ph_global_value(['DB_NAME', 'DATABASE_NAME', 'MYSQL_DATABASE']);
    $user = ph_global_value(['DB_USER', 'DATABASE_USER', 'MYSQL_USER']);
    $pass = ph_global_value(['DB_PASS', 'DB_PASSWORD', 'DATABASE_PASS', 'DATABASE_PASSWORD', 'MYSQL_PASSWORD']);

    if (!$host || !$name || !$user) {
        return null;
    }

    $dsn = 'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4';
    return new PDO($dsn, (string)$user, (string)$pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function ph_table_exists(PDO $pdo, string $table): bool
{
    try {
        $stmt = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table));
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function ph_columns(PDO $pdo, string $table): array
{
    $out = [];
    try {
        $stmt = $pdo->query('SHOW COLUMNS FROM ' . ph_qid($table));
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!empty($row['Field'])) {
                $out[(string)$row['Field']] = true;
            }
        }
    } catch (Throwable $e) {
    }
    return $out;
}

function ph_has(array $cols, array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (isset($cols[$candidate])) {
            return $candidate;
        }
    }
    return null;
}

function ph_rank_label(?int $rank, ?string $label): string
{
    $label = trim((string)$label);
    if ($label !== '') return $label;
    if ($rank === 1) return '1st';
    if ($rank === 2) return '2nd';
    if ($rank === 3) return '3rd';
    if ($rank !== null && $rank > 0) return (string)$rank . 'th';
    return '';
}

function ph_pick_medal(?int $rank, array $row, array $meta): string
{
    if (!empty($meta['medal']) && isset($row['medal_key'])) {
        $medal = strtolower(trim((string)$row['medal_key']));
        if (in_array($medal, ['gold', 'silver', 'bronze'], true)) {
            return $medal;
        }
    }
    if ($rank === 1) return 'gold';
    if ($rank === 2) return 'silver';
    if ($rank === 3) return 'bronze';
    return 'daily';
}

function ph_sort_stamp(array $entry): int
{
    $explicit = (int)($entry['sort_ts'] ?? 0);
    if ($explicit > 0) {
        return $explicit;
    }
    $raw = trim((string)($entry['sort_at'] ?? $entry['claimed_at'] ?? ''));
    if ($raw === '') {
        $day = trim((string)($entry['display_day'] ?? $entry['day'] ?? ''));
        if ($day !== '') {
            $raw = $day . ' 00:00:00';
        }
    }
    if ($raw === '') {
        return 0;
    }
    $ts = strtotime($raw);
    return $ts !== false ? (int)$ts : 0;
}

function ph_sort_day(array $entry): string
{
    $day = trim((string)($entry['sort_day'] ?? $entry['display_day'] ?? $entry['day'] ?? ''));
    if ($day !== '') {
        $ts = strtotime($day);
        if ($ts !== false) {
            return date('Y-m-d', $ts);
        }
    }

    $raw = trim((string)($entry['sort_at'] ?? $entry['claimed_at'] ?? ''));
    if ($raw === '') {
        return '';
    }

    $ts = strtotime($raw);
    return $ts !== false ? date('Y-m-d', $ts) : '';
}

function ph_daily_meta(PDO $pdo): ?array
{
    if (!ph_table_exists($pdo, 'daily_reward_claims')) {
        return null;
    }

    $cols = ph_columns($pdo, 'daily_reward_claims');
    $meta = [
        'table' => 'daily_reward_claims',
        'user' => ph_has($cols, ['user_id', 'uid', 'account_id']),
        'day' => ph_has($cols, ['reward_day', 'claim_day', 'day', 'day_key']),
        'points' => ph_has($cols, ['points_awarded', 'reward_points', 'points']),
        'rank' => ph_has($cols, ['rank_position', 'rank_pos', 'rank']),
        'label' => ph_has($cols, ['rank_label', 'label']),
        'medal' => ph_has($cols, ['medal', 'medal_key']),
        'claimed_at' => ph_has($cols, ['claimed_at', 'created_at', 'awarded_at']),
    ];

    if (!$meta['user'] || !$meta['day'] || !$meta['points']) {
        return null;
    }

    return $meta;
}

function ph_supporter_state(PDO $pdo, int $uid): ?array
{
    if (!function_exists('snapshift_auth_supporter_state')) {
        return null;
    }

    $attempts = [
        [$pdo, $uid, true],
        [$pdo, $uid, false],
        [$pdo, $uid],
    ];
    foreach ($attempts as $args) {
        try {
            $state = call_user_func_array('snapshift_auth_supporter_state', $args);
            if (is_array($state) && !empty($state)) {
                return $state;
            }
        } catch (Throwable $e) {
        }
    }
    return null;
}

function ph_user_state_row(PDO $pdo, int $uid): ?array
{
    if (!ph_table_exists($pdo, 'user_state')) return null;
    $cols = ph_columns($pdo, 'user_state');
    $userCol = ph_has($cols, ['user_id', 'uid', 'member_id']);
    if (!$userCol) return null;
    $selectBits = [];
    foreach (['points', 'points_balance', 'current_points', 'state_json', 'state', 'json_state', 'data_json'] as $candidate) {
        if (isset($cols[$candidate])) {
            $selectBits[] = ph_qid($candidate) . ' AS ' . $candidate;
        }
    }
    if (!$selectBits) return null;

    try {
        $sql = 'SELECT ' . implode(', ', $selectBits)
             . ' FROM ' . ph_qid('user_state')
             . ' WHERE ' . ph_qid($userCol) . ' = :uid LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':uid' => $uid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    } catch (Throwable $e) {
        return null;
    }
}

function ph_json_points_from_row(?array $row): ?int
{
    if (!$row) return null;
    foreach (['state_json', 'state', 'json_state', 'data_json'] as $key) {
        if (!isset($row[$key]) || !is_string($row[$key]) || $row[$key] === '') continue;
        $decoded = json_decode($row[$key], true);
        if (is_array($decoded) && array_key_exists('points', $decoded) && $decoded['points'] !== null && $decoded['points'] !== '') {
            return (int)$decoded['points'];
        }
    }
    return null;
}

function ph_users_table_points(PDO $pdo, int $uid): ?int
{
    if (!ph_table_exists($pdo, 'users')) return null;
    $cols = ph_columns($pdo, 'users');
    $idCol = ph_has($cols, ['id', 'user_id', 'uid']);
    $pointsCol = ph_has($cols, ['points', 'points_balance', 'current_points']);
    if (!$idCol || !$pointsCol) return null;

    try {
        $sql = 'SELECT ' . ph_qid($pointsCol) . ' AS points_value FROM ' . ph_qid('users')
             . ' WHERE ' . ph_qid($idCol) . ' = :uid LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':uid' => $uid]);
        $value = $stmt->fetchColumn();
        return ($value !== false && $value !== null) ? (int)$value : null;
    } catch (Throwable $e) {
        return null;
    }
}

function ph_supporter_bonus(PDO $pdo, int $uid, ?array $user): int
{
    $state = ph_supporter_state($pdo, $uid);
    if (is_array($state)) {
        foreach ([
            'supporter_bonus_awarded_points_total',
            'bonus_awarded_points_total',
            'supporter_bonus_points_total',
            'supporter_bonus_awarded_points',
            'bonus_awarded_points',
            'supporter_bonus_points'
        ] as $key) {
            if (isset($state[$key])) {
                return (int)$state[$key];
            }
        }
    }
    if ($user) {
        foreach ([
            'supporter_bonus_awarded_points_total',
            'bonus_awarded_points_total',
            'supporter_bonus_points_total',
            'supporter_bonus_awarded_points',
            'bonus_awarded_points',
            'supporter_bonus_points'
        ] as $key) {
            if (isset($user[$key])) return (int)$user[$key];
        }
    }
    return 0;
}

function ph_current_points(PDO $pdo, int $uid, ?array $user): int
{
    $state = ph_supporter_state($pdo, $uid);
    if (is_array($state) && isset($state['points']) && $state['points'] !== null && $state['points'] !== '') {
        return (int)$state['points'];
    }

    $userStateRow = ph_user_state_row($pdo, $uid);
    if ($userStateRow) {
        foreach (['points', 'points_balance', 'current_points'] as $key) {
            if (isset($userStateRow[$key]) && $userStateRow[$key] !== null && $userStateRow[$key] !== '') {
                return (int)$userStateRow[$key];
            }
        }
        $jsonPoints = ph_json_points_from_row($userStateRow);
        if ($jsonPoints !== null) return $jsonPoints;
    }

    $usersPoints = ph_users_table_points($pdo, $uid);
    if ($usersPoints !== null) return $usersPoints;
    $fallback = ph_points_from_user($user);
    return $fallback !== null ? $fallback : 0;
}

function ph_load_daily_entries(PDO $pdo, int $uid): array
{
    $meta = ph_daily_meta($pdo);
    if ($meta === null) return [0, 0, []];

    $select = [
        ph_qid($meta['day']) . ' AS day_key',
        ph_qid($meta['points']) . ' AS reward_points',
    ];
    if ($meta['rank']) $select[] = ph_qid($meta['rank']) . ' AS rank_pos';
    if ($meta['label']) $select[] = ph_qid($meta['label']) . ' AS rank_label';
    if ($meta['medal']) $select[] = ph_qid($meta['medal']) . ' AS medal_key';
    if ($meta['claimed_at']) $select[] = ph_qid($meta['claimed_at']) . ' AS claimed_at';

    $orderBits = [ph_qid($meta['day']) . ' DESC'];
    if ($meta['claimed_at']) $orderBits[] = ph_qid($meta['claimed_at']) . ' DESC';

    $sql = 'SELECT ' . implode(', ', $select)
         . ' FROM ' . ph_qid($meta['table'])
         . ' WHERE ' . ph_qid($meta['user']) . ' = :uid'
         . ' ORDER BY ' . implode(', ', $orderBits)
         . ' LIMIT 100';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':uid' => $uid]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $points = 0;
    $count = 0;
    $entries = [];
    foreach ($rows as $row) {
        $entryPoints = (int)($row['reward_points'] ?? 0);
        $rank = isset($row['rank_pos']) && $row['rank_pos'] !== null && $row['rank_pos'] !== '' ? (int)$row['rank_pos'] : null;
        $label = isset($row['rank_label']) && $row['rank_label'] !== null ? trim((string)$row['rank_label']) : null;
        $dayKey = isset($row['day_key']) ? (string)$row['day_key'] : '';
        $entries[] = [
            'type' => 'daily_reward',
            'day' => $dayKey,
            'display_day' => $dayKey,
            'sort_day' => $dayKey,
            'points' => $entryPoints,
            'rank' => $rank,
            'label' => ph_rank_label($rank, $label),
            'finish_text' => 'Daily reward' . ($dayKey !== '' ? ' • ' . $dayKey : '') . (($rank !== null && $rank > 0) ? ' • ' . ph_rank_label($rank, $label) : ''),
            'medal' => ph_pick_medal($rank, $row, $meta),
            'claimed_at' => ($row['claimed_at'] ?? null) ?: null,
            'sort_at' => ($row['claimed_at'] ?? null) ?: ($dayKey !== '' ? ($dayKey . ' 00:00:00') : null),
            'sort_ts' => strtotime((string)(($row['claimed_at'] ?? null) ?: ($dayKey !== '' ? ($dayKey . ' 00:00:00') : ''))) ?: 0,
        ];
        $points += $entryPoints;
        $count++;
    }

    return [$points, $count, $entries];
}

function ph_load_ledger_entries(PDO $pdo, int $uid): array
{
    if (!ph_table_exists($pdo, 'points_ledger')) return [0, []];
    $cols = ph_columns($pdo, 'points_ledger');
    $userCol = ph_has($cols, ['user_id', 'uid', 'member_id']);
    $pointsCol = ph_has($cols, ['points_delta', 'points', 'delta']);
    $typeCol = ph_has($cols, ['entry_type', 'type']);
    $finishTextCol = ph_has($cols, ['finish_text', 'label']);
    $createdCol = ph_has($cols, ['created_at', 'awarded_at']);
    if (!$userCol || !$pointsCol) return [0, []];

    $select = [
        ph_qid($pointsCol) . ' AS points_delta',
        ($typeCol ? ph_qid($typeCol) . ' AS entry_type' : "'adjustment' AS entry_type"),
        ($finishTextCol ? ph_qid($finishTextCol) . ' AS finish_text' : 'NULL AS finish_text'),
        (isset($cols['category_id']) ? ph_qid('category_id') . ' AS category_id' : 'NULL AS category_id'),
        (isset($cols['category_name']) ? ph_qid('category_name') . ' AS category_name' : 'NULL AS category_name'),
        (isset($cols['puzzle_idx']) ? ph_qid('puzzle_idx') . ' AS puzzle_idx' : 'NULL AS puzzle_idx'),
        (isset($cols['puzzle_name']) ? ph_qid('puzzle_name') . ' AS puzzle_name' : 'NULL AS puzzle_name'),
        (isset($cols['puzzle_src']) ? ph_qid('puzzle_src') . ' AS puzzle_src' : 'NULL AS puzzle_src'),
        (isset($cols['diff_key']) ? ph_qid('diff_key') . ' AS diff_key' : 'NULL AS diff_key'),
        (isset($cols['day_key']) ? ph_qid('day_key') . ' AS day_key' : 'NULL AS day_key'),
        (isset($cols['meta_json']) ? ph_qid('meta_json') . ' AS meta_json' : 'NULL AS meta_json'),
        ($createdCol ? ph_qid($createdCol) . ' AS created_at' : 'NULL AS created_at'),
    ];

    $sql = 'SELECT ' . implode(', ', $select)
         . ' FROM ' . ph_qid('points_ledger')
         . ' WHERE ' . ph_qid($userCol) . ' = :uid'
         . ' ORDER BY ' . ($createdCol ? ph_qid($createdCol) : 'id') . ' DESC LIMIT 200';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':uid' => $uid]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $total = 0;
    $entries = [];
    foreach ($rows as $row) {
        $points = (int)($row['points_delta'] ?? 0);
        $type = trim((string)($row['entry_type'] ?? 'adjustment')) ?: 'adjustment';
        $createdAt = ($row['created_at'] ?? null) ?: null;
        $dayKey = ($row['day_key'] ?? null) ? (string)$row['day_key'] : '';
        $finishText = trim((string)($row['finish_text'] ?? ''));
        $meta = [];
        if (!empty($row['meta_json']) && is_string($row['meta_json'])) {
            $decoded = json_decode($row['meta_json'], true);
            if (is_array($decoded)) $meta = $decoded;
        }
        $metaCompletedAt = '';
        if (!empty($meta['completed_at'])) {
            $normalizedMetaTs = strtotime((string)$meta['completed_at']);
            if ($normalizedMetaTs !== false) {
                $metaCompletedAt = date('Y-m-d H:i:s', $normalizedMetaTs);
            }
        }
        if ($finishText === '') {
            $puzzleName = trim((string)($row['puzzle_name'] ?? ''));
            $categoryName = trim((string)($row['category_name'] ?? ''));
            $diffKey = trim((string)($row['diff_key'] ?? ''));
            if ($type === 'puzzle_completion' || $type === 'daily_puzzle_completion') {
                $finishText = ($type === 'daily_puzzle_completion' ? 'Daily puzzle' : 'Puzzle completion');
                if ($categoryName !== '') $finishText .= ' • ' . $categoryName;
                if ($puzzleName !== '') $finishText .= ' • ' . $puzzleName;
                if ($diffKey !== '') $finishText .= ' • ' . $diffKey;
            } else {
                $finishText = 'Points adjustment';
            }
        }

        $entries[] = [
            'type' => $type,
            'day' => $dayKey !== '' ? $dayKey : ($createdAt ? substr((string)$createdAt, 0, 10) : ''),
            'display_day' => $dayKey !== '' ? $dayKey : ($createdAt ? substr((string)$createdAt, 0, 10) : ''),
            'sort_day' => $dayKey !== '' ? $dayKey : ($createdAt ? substr((string)$createdAt, 0, 10) : ''),
            'points' => $points,
            'label' => $finishText,
            'finish_text' => $finishText,
            'medal' => ($type === 'puzzle_completion' || $type === 'daily_puzzle_completion') ? 'adjustment' : 'adjustment',
            'claimed_at' => $createdAt,
            'sort_at' => $metaCompletedAt !== '' ? $metaCompletedAt : ($createdAt ?: ($dayKey !== '' ? ($dayKey . ' 00:00:00') : null)),
            'sort_ts' => strtotime((string)($metaCompletedAt !== '' ? $metaCompletedAt : ($createdAt ?: ($dayKey !== '' ? ($dayKey . ' 00:00:00') : '')))) ?: 0,
            'meta' => $meta,
        ];
        $total += $points;
    }

    return [$total, $entries];
}

try {
    ph_bootstrap();

    $user = ph_current_user();
    $uid = ph_user_id($user);
    if ($uid <= 0) {
        ph_json([
            'ok' => true,
            'logged_in' => false,
            'build' => 'points_history_supporter_total_2026_04_19',
            'summary' => [
                'current_points' => 0,
                'daily_claimed_points' => 0,
                'puzzle_points' => 0,
                'supporter_bonus_points' => 0,
                'non_daily_points' => 0,
                'other_adjustments' => 0,
                'claim_count' => 0,
            ],
            'sources' => [],
            'entries' => [],
        ]);
    }

    $pdo = ph_pdo();
    if (!$pdo) {
        ph_json([
            'ok' => false,
            'logged_in' => true,
            'build' => 'points_history_supporter_total_2026_04_19',
            'error' => 'Database connection unavailable.',
            'summary' => [
                'current_points' => ph_points_from_user($user) ?? 0,
                'daily_claimed_points' => 0,
                'puzzle_points' => 0,
                'supporter_bonus_points' => 0,
                'non_daily_points' => 0,
                'other_adjustments' => 0,
                'claim_count' => 0,
            ],
            'sources' => [],
            'entries' => [],
        ], 500);
    }

    $currentPoints = ph_current_points($pdo, $uid, $user);
    $supporterBonus = ph_supporter_bonus($pdo, $uid, $user);
    [$dailyClaimedPoints, $claimCount, $dailyEntries] = ph_load_daily_entries($pdo, $uid);
    [$ledgerPoints, $ledgerEntries] = ph_load_ledger_entries($pdo, $uid);

    $entries = array_merge($dailyEntries, $ledgerEntries);
    usort($entries, static function (array $a, array $b): int {
        $leftDay = ph_sort_day($a);
        $rightDay = ph_sort_day($b);
        if ($leftDay !== $rightDay) {
            return strcmp($rightDay, $leftDay);
        }
        $leftTs = ph_sort_stamp($a);
        $rightTs = ph_sort_stamp($b);
        if ($leftTs !== $rightTs) {
            return $rightTs <=> $leftTs;
        }
        $left = (string)($a['finish_text'] ?? $a['label'] ?? '');
        $right = (string)($b['finish_text'] ?? $b['label'] ?? '');
        return strcmp($right, $left);
    });

    $otherAdjustments = $currentPoints - $supporterBonus - $dailyClaimedPoints - $ledgerPoints;
    $puzzleRewardsDisplay = $ledgerPoints + $otherAdjustments;

    foreach ($entries as &$entry) {
        unset($entry['sort_at']);
    }
    unset($entry);

    ph_json([
        'ok' => true,
        'logged_in' => true,
        'build' => 'points_history_supporter_total_2026_04_19',
        'summary' => [
            'current_points' => $currentPoints,
            'daily_claimed_points' => $dailyClaimedPoints,
            'puzzle_points' => $ledgerPoints,
            'puzzle_rewards' => $puzzleRewardsDisplay,
            'supporter_bonus_points' => $supporterBonus,
            'non_daily_points' => $otherAdjustments,
            'other_adjustments' => $otherAdjustments,
            'claim_count' => $claimCount,
        ],
        'sources' => [
            [
                'type' => 'daily_rewards',
                'label' => 'Daily rewards claimed',
                'points' => $dailyClaimedPoints,
                'count' => $claimCount,
            ],
            [
                'type' => 'puzzle_rewards',
                'label' => 'Puzzle rewards',
                'points' => $puzzleRewardsDisplay,
                'count' => count($ledgerEntries),
            ],
            [
                'type' => 'supporter_bonus',
                'label' => 'Supporter bonuses',
                'points' => $supporterBonus,
                'count' => $supporterBonus !== 0 ? 1 : 0,
            ],
            [
                'type' => 'other_adjustments',
                'label' => 'Other balance adjustments',
                'points' => $otherAdjustments,
                'count' => $otherAdjustments !== 0 ? 1 : 0,
            ],
        ],
        'entries' => $entries,
        'note' => 'Daily reward claims and logged puzzle completions are itemized individually. Puzzle rewards also include older non-daily balance that existed before ledger logging was added.',
    ]);
} catch (Throwable $e) {
    ph_json([
        'ok' => false,
        'build' => 'points_history_supporter_total_2026_04_19',
        'error' => $e->getMessage(),
    ], 500);
}
