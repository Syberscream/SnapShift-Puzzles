<?php
// Snapshift Daily Reward Debug Tool v4
// Merges the working DB bootstrap from the earlier version with safer leaderboard schema detection.

declare(strict_types=1);
session_start();
require_once __DIR__ . '/lib/debug_gate.php';
pq_require_debug_access('html');

header('Content-Type: text/html; charset=utf-8');

date_default_timezone_set('UTC');

function h($v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

function pq_bootstrap_candidates(): array {
    $dir = __DIR__;
    $parent = dirname($dir);
    $grand = dirname($parent);
    return array_values(array_unique(array_filter([
        $dir . '/config.php',
        $dir . '/db.php',
        $dir . '/bootstrap.php',
        $dir . '/api/config.php',
        $dir . '/api/db.php',
        $dir . '/api/bootstrap.php',
        $dir . '/includes/config.php',
        $dir . '/includes/db.php',
        $parent . '/config.php',
        $parent . '/db.php',
        $parent . '/api/config.php',
        $parent . '/api/db.php',
        $parent . '/includes/config.php',
        $parent . '/includes/db.php',
        $grand . '/config.php',
        $grand . '/db.php',
        $grand . '/api/config.php',
        $grand . '/api/db.php',
    ])));
}

function pq_bootstrap_db(): array {
    static $boot = null;
    if ($boot !== null) return $boot;

    $boot = [
        'ok' => false,
        'pdo' => null,
        'dsn' => null,
        'user' => null,
        'host' => null,
        'db' => null,
        'config_used' => null,
        'candidates' => pq_bootstrap_candidates(),
        'errors' => [],
    ];

    $preDsn = getenv('DB_DSN') ?: (defined('DB_DSN') ? DB_DSN : null);
    $preUser = getenv('DB_USER') ?: (defined('DB_USER') ? DB_USER : null);
    $prePass = getenv('DB_PASS') ?: (defined('DB_PASS') ? DB_PASS : null);
    if ($preDsn) {
        try {
            $pdo = new PDO($preDsn, (string)$preUser, (string)$prePass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $boot['ok'] = true;
            $boot['pdo'] = $pdo;
            $boot['dsn'] = $preDsn;
            $boot['user'] = $preUser;
            return $boot;
        } catch (Throwable $e) {
            $boot['errors'][] = 'env/constant DSN failed: ' . $e->getMessage();
        }
    }

    foreach ($boot['candidates'] as $cfg) {
        if (!is_file($cfg)) continue;
        try {
            require_once $cfg;
            $boot['config_used'] = $cfg;
        } catch (Throwable $e) {
            $boot['errors'][] = basename($cfg) . ' include failed: ' . $e->getMessage();
            continue;
        }

        $dsn  = getenv('DB_DSN') ?: (defined('DB_DSN') ? DB_DSN : null);
        $user = getenv('DB_USER') ?: (defined('DB_USER') ? DB_USER : null);
        $pass = getenv('DB_PASS') ?: (defined('DB_PASS') ? DB_PASS : null);
        $host = getenv('DB_HOST') ?: (defined('DB_HOST') ? DB_HOST : null);
        $name = getenv('DB_NAME') ?: (defined('DB_NAME') ? DB_NAME : null);
        $port = getenv('DB_PORT') ?: (defined('DB_PORT') ? DB_PORT : null);
        $charset = getenv('DB_CHARSET') ?: (defined('DB_CHARSET') ? DB_CHARSET : null) ?: 'utf8mb4';

        foreach (['db_host','database_host','mysql_host'] as $k) if (!$host && isset($GLOBALS[$k])) $host = $GLOBALS[$k];
        foreach (['db_name','database_name','mysql_db','dbname'] as $k) if (!$name && isset($GLOBALS[$k])) $name = $GLOBALS[$k];
        foreach (['db_user','database_user','mysql_user'] as $k) if (!$user && isset($GLOBALS[$k])) $user = $GLOBALS[$k];
        foreach (['db_pass','database_pass','mysql_pass','db_password'] as $k) if (!$pass && isset($GLOBALS[$k])) $pass = $GLOBALS[$k];
        foreach (['db_port','database_port','mysql_port'] as $k) if (!$port && isset($GLOBALS[$k])) $port = $GLOBALS[$k];
        foreach (['db_charset','database_charset','mysql_charset'] as $k) if ((!$charset || $charset === 'utf8mb4') && isset($GLOBALS[$k])) $charset = $GLOBALS[$k];

        if (!$dsn && $host && $name) {
            $dsn = 'mysql:host=' . $host . ';dbname=' . $name . ';charset=' . ($charset ?: 'utf8mb4');
            if ($port) $dsn .= ';port=' . $port;
        }

        if (!$dsn && isset($GLOBALS['pdo']) && $GLOBALS['pdo'] instanceof PDO) {
            $boot['ok'] = true;
            $boot['pdo'] = $GLOBALS['pdo'];
            $boot['dsn'] = 'existing $GLOBALS[pdo]';
            $boot['user'] = $user;
            $boot['host'] = $host;
            $boot['db'] = $name;
            return $boot;
        }

        if ($dsn) {
            try {
                $pdo = new PDO($dsn, (string)$user, (string)$pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);
                $boot['ok'] = true;
                $boot['pdo'] = $pdo;
                $boot['dsn'] = $dsn;
                $boot['user'] = $user;
                $boot['host'] = $host;
                $boot['db'] = $name;
                return $boot;
            } catch (Throwable $e) {
                $boot['errors'][] = basename($cfg) . ' connect failed: ' . $e->getMessage();
            }
        } else {
            $boot['errors'][] = basename($cfg) . ' loaded but no DSN or DB globals were found';
        }
    }

    return $boot;
}

function pq_db(): PDO {
    $boot = pq_bootstrap_db();
    if (!$boot['ok'] || !($boot['pdo'] instanceof PDO)) {
        $detail = [];
        if (!empty($boot['config_used'])) $detail[] = 'last config tried: ' . $boot['config_used'];
        if (!empty($boot['errors'])) $detail[] = implode(' | ', $boot['errors']);
        if (!empty($boot['candidates'])) $detail[] = 'checked: ' . implode(', ', $boot['candidates']);
        throw new RuntimeException('Could not locate usable DB config.php / db.php. ' . implode(' || ', $detail));
    }
    return $boot['pdo'];
}

function pq_table_exists(PDO $pdo, string $table): bool {
    try {
        $stmt = $pdo->prepare('SHOW TABLES LIKE ?');
        $stmt->execute([$table]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

function pq_cols(PDO $pdo, string $table): array {
    $out = [];
    if (!pq_table_exists($pdo, $table)) return $out;
    foreach ($pdo->query("SHOW COLUMNS FROM `{$table}`") as $row) {
        $out[] = (string)$row['Field'];
    }
    return $out;
}

function pq_has_cols(PDO $pdo, string $table, array $need): bool {
    $cols = array_flip(pq_cols($pdo, $table));
    foreach ($need as $c) if (!isset($cols[$c])) return false;
    return true;
}

function pq_one(PDO $pdo, string $sql, array $params = []): ?array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function pq_all(PDO $pdo, string $sql, array $params = []): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function pq_day_valid(?string $day): bool {
    return is_string($day) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) === 1;
}

function pq_active_daily_day(PDO $pdo): ?string {
    if (!pq_table_exists($pdo, 'daily_reward_log')) return null;
    if (pq_has_cols($pdo, 'daily_reward_log', ['day_key', 'is_active'])) {
        $row = pq_one($pdo, 'SELECT day_key FROM daily_reward_log WHERE is_active = 1 ORDER BY day_key DESC LIMIT 1');
        if ($row && pq_day_valid((string)$row['day_key'])) return (string)$row['day_key'];
    }
    if (pq_has_cols($pdo, 'daily_reward_log', ['day_key'])) {
        $row = pq_one($pdo, 'SELECT day_key FROM daily_reward_log ORDER BY day_key DESC LIMIT 1');
        if ($row && pq_day_valid((string)$row['day_key'])) return (string)$row['day_key'];
    }
    return null;
}

function pq_default_claim_day(PDO $pdo): string {
    $active = pq_active_daily_day($pdo);
    if ($active) {
        $ts = strtotime($active . ' UTC');
        if ($ts !== false) return gmdate('Y-m-d', $ts - 86400);
    }
    return gmdate('Y-m-d', time() - 86400);
}

function pq_resolve_user(PDO $pdo, string $lookup): ?array {
    $lookup = trim($lookup);
    if ($lookup === '') return null;
    if (ctype_digit($lookup)) {
        $row = pq_one($pdo, 'SELECT id, username, email FROM users WHERE id = ? LIMIT 1', [(int)$lookup]);
        if ($row) return $row;
    }
    $row = pq_one($pdo, 'SELECT id, username, email FROM users WHERE username = ? LIMIT 1', [$lookup]);
    if ($row) return $row;
    $row = pq_one($pdo, 'SELECT id, username, email FROM users WHERE email = ? LIMIT 1', [$lookup]);
    return $row ?: null;
}

function pq_first_existing_col(array $cols, array $preferred): ?string {
    $set = array_flip($cols);
    foreach ($preferred as $name) {
        if (isset($set[$name])) return $name;
    }
    return null;
}

function pq_guess_col_by_regex(array $cols, array $patterns, array $exclude = []): ?string {
    $excludeSet = array_flip($exclude);
    foreach ($cols as $col) {
        if (isset($excludeSet[$col])) continue;
        foreach ($patterns as $rx) {
            if (preg_match($rx, $col)) return $col;
        }
    }
    return null;
}

function pq_detect_leaderboard_schema(PDO $pdo): array {
    $cols = pq_cols($pdo, 'leaderboard_daily');
    $scoreCol = pq_first_existing_col($cols, [
        'time_seconds', 'best_seconds', 'seconds', 'best_time', 'time_sec',
        'best_time_seconds', 'solve_seconds', 'elapsed_seconds', 'total_seconds',
        'completion_seconds', 'time_taken', 'solve_time', 'duration_seconds',
        'duration', 'time'
    ]);
    if (!$scoreCol) {
        $scoreCol = pq_guess_col_by_regex(
            $cols,
            [
                '/(^|_)(best_)?(time|sec|second|seconds|elapsed|duration)(_|$)/i',
                '/(^|_)(solve|completion|complete)(_|$)/i',
            ],
            ['created_at', 'updated_at', 'day_key', 'user_id', 'rank_pos']
        );
    }

    $movesCol = pq_first_existing_col($cols, [
        'best_moves', 'moves', 'move_count', 'total_moves', 'solve_moves'
    ]);
    if (!$movesCol) {
        $movesCol = pq_guess_col_by_regex(
            $cols,
            ['/move/i'],
            ['created_at', 'updated_at', 'day_key', 'user_id']
        );
    }

    $effCol = pq_first_existing_col($cols, [
        'best_efficiency', 'efficiency', 'solve_efficiency'
    ]);
    if (!$effCol) {
        $effCol = pq_guess_col_by_regex(
            $cols,
            ['/efficien/i'],
            ['created_at', 'updated_at', 'day_key', 'user_id']
        );
    }

    return [
        'columns' => $cols,
        'score_col' => $scoreCol,
        'moves_col' => $movesCol,
        'efficiency_col' => $effCol,
        'has_user_id' => in_array('user_id', $cols, true),
        'has_day_key' => in_array('day_key', $cols, true),
    ];
}

function pq_leaderboard_row(PDO $pdo, int $uid, string $day): ?array {
    if (!pq_table_exists($pdo, 'leaderboard_daily')) return null;

    $schema = pq_detect_leaderboard_schema($pdo);
    if (!$schema['has_day_key'] || !$schema['has_user_id']) {
        return [
            '_schema_error' => 'leaderboard_daily is missing day_key and/or user_id',
            '_schema' => $schema,
        ];
    }

    $scoreCol = $schema['score_col'];
    $movesCol = $schema['moves_col'];
    $effCol = $schema['efficiency_col'];

    if (!$scoreCol) {
        return [
            '_schema_error' => 'No recognizable time/score column found in leaderboard_daily',
            '_schema' => $schema,
        ];
    }

    $select = [
        'user_id',
        'day_key',
        "`{$scoreCol}` AS seconds",
    ];
    if ($movesCol) $select[] = "`{$movesCol}` AS moves";
    if ($effCol) $select[] = "`{$effCol}` AS efficiency";

    $order = "`{$scoreCol}` ASC, user_id ASC";

    $sql = 'SELECT * FROM (SELECT ' . implode(', ', $select) . ', ROW_NUMBER() OVER (PARTITION BY day_key ORDER BY ' . $order . ') AS rank_pos FROM leaderboard_daily WHERE day_key = ?) ranked WHERE user_id = ? LIMIT 1';
    try {
        $row = pq_one($pdo, $sql, [$day, $uid]);
        if ($row) {
            $row['_schema'] = $schema;
            return $row;
        }
    } catch (Throwable $e) {
        // fallback below
    }

    $all = pq_all($pdo, 'SELECT ' . implode(', ', $select) . ' FROM leaderboard_daily WHERE day_key = ? ORDER BY ' . $order, [$day]);
    $rank = 0;
    foreach ($all as $row) {
        $rank++;
        if ((int)$row['user_id'] === $uid) {
            $row['rank_pos'] = $rank;
            $row['_schema'] = $schema;
            return $row;
        }
    }

    return [
        '_schema' => $schema,
        '_note' => 'No leaderboard row found for this user/day.',
    ];
}

function pq_reward_points(int $rank): int {
    if ($rank <= 0) return 0;
    if ($rank === 1) return 200;
    if ($rank === 2) return 150;
    if ($rank === 3) return 120;
    if ($rank === 4) return 100;
    if ($rank === 5) return 80;
    if ($rank <= 10) return 50;
    if ($rank <= 25) return 25;
    return 10;
}

function pq_medal(int $rank): string {
    if ($rank === 1) return 'gold';
    if ($rank === 2) return 'silver';
    if ($rank === 3) return 'bronze';
    return '';
}

function pq_claim_row(PDO $pdo, int $uid, string $day): ?array {
    if (!pq_table_exists($pdo, 'daily_reward_claims')) return null;
    return pq_one($pdo, 'SELECT * FROM daily_reward_claims WHERE user_id = ? AND day_key = ? LIMIT 1', [$uid, $day]);
}

function pq_log_row(PDO $pdo, string $day): ?array {
    if (!pq_table_exists($pdo, 'daily_reward_log')) return null;
    return pq_one($pdo, 'SELECT * FROM daily_reward_log WHERE day_key = ? LIMIT 1', [$day]);
}

function pq_has_real_claim(PDO $pdo, int $uid, string $day): bool {
    $row = pq_claim_row($pdo, $uid, $day);
    if (!$row) return false;
    $pts = (int)($row['reward_points'] ?? 0);
    $rank = (int)($row['rank_pos'] ?? 0);
    return $pts > 0 || $rank > 0;
}

function pq_claimable_day(PDO $pdo, string $day, ?string $activeDay, bool $ignoreCutoff = false): bool {
    if (!pq_day_valid($day)) return false;
    if ($ignoreCutoff) return true;
    $today = gmdate('Y-m-d');
    if ($day >= $today) return false;
    if ($activeDay && $day >= $activeDay) return false;
    return true;
}

function pq_pending_days(PDO $pdo, int $uid, ?string $activeDay, bool $ignoreCutoff = false): array {
    if (!pq_table_exists($pdo, 'leaderboard_daily')) return [];
    if (!pq_has_cols($pdo, 'leaderboard_daily', ['user_id', 'day_key'])) return [];

    $rows = pq_all($pdo, 'SELECT DISTINCT day_key FROM leaderboard_daily WHERE user_id = ? ORDER BY day_key ASC', [$uid]);
    $days = [];
    foreach ($rows as $row) {
        $day = (string)($row['day_key'] ?? '');
        if (!pq_day_valid($day)) continue;
        if (!pq_claimable_day($pdo, $day, $activeDay, $ignoreCutoff)) continue;
        if (pq_has_real_claim($pdo, $uid, $day)) continue;
        $days[] = $day;
    }
    return $days;
}

function pq_delete_placeholder_claim(PDO $pdo, int $uid, string $day): array {
    $row = pq_claim_row($pdo, $uid, $day);
    if (!$row) return ['ok' => false, 'msg' => 'No claim row found.'];
    $pts = (int)($row['reward_points'] ?? 0);
    $rank = (int)($row['rank_pos'] ?? 0);
    if ($pts > 0 || $rank > 0) return ['ok' => false, 'msg' => 'Claim row is real, not placeholder. Not deleted.'];
    $stmt = $pdo->prepare('DELETE FROM daily_reward_claims WHERE user_id = ? AND day_key = ? LIMIT 1');
    $stmt->execute([$uid, $day]);
    return ['ok' => true, 'msg' => 'Deleted zero-value placeholder claim row.'];
}

$lookup = trim((string)($_REQUEST['user_lookup'] ?? ''));
$selectedDay = trim((string)($_REQUEST['day_key'] ?? ''));
$ignoreCutoff = isset($_REQUEST['ignore_cutoff']) && (string)$_REQUEST['ignore_cutoff'] === '1';
$action = trim((string)($_REQUEST['action'] ?? 'inspect'));
$message = null;
$error = null;
$data = [];

try {
    $pdo = pq_db();
    $activeDay = pq_active_daily_day($pdo);
    $defaultClaimDay = pq_default_claim_day($pdo);

    if ($selectedDay === '') $selectedDay = $defaultClaimDay;
    if (!pq_day_valid($selectedDay)) $selectedDay = $defaultClaimDay;

    if ($lookup !== '') {
        $user = pq_resolve_user($pdo, $lookup);
        if (!$user) {
            $error = 'User not found.';
        } else {
            $uid = (int)$user['id'];

            if ($action === 'clear_placeholder') {
                $message = pq_delete_placeholder_claim($pdo, $uid, $selectedDay);
            }

            $pendingDays = pq_pending_days($pdo, $uid, $activeDay, $ignoreCutoff);
            $leaderboardRow = pq_leaderboard_row($pdo, $uid, $selectedDay);
            $claimRow = pq_claim_row($pdo, $uid, $selectedDay);
            $logRow = pq_log_row($pdo, $selectedDay);
            $realClaim = pq_has_real_claim($pdo, $uid, $selectedDay);
            $claimableByCutoff = pq_claimable_day($pdo, $selectedDay, $activeDay, $ignoreCutoff);

            $explicitDayProvided = isset($_REQUEST['day_key']) && trim((string)$_REQUEST['day_key']) !== '';
            $wouldChooseDay = $explicitDayProvided ? $selectedDay : ($pendingDays[0] ?? $selectedDay);
            $liveBugRisk = (!$explicitDayProvided && !empty($pendingDays) && $selectedDay !== $pendingDays[0]);

            $rankPos = (int)($leaderboardRow['rank_pos'] ?? 0);
            $sourcePoints = $rankPos > 0 ? pq_reward_points($rankPos) : 0;
            $sourceMedal = $rankPos > 0 ? pq_medal($rankPos) : '';

            $data = [
                'user' => $user,
                'active_day' => $activeDay,
                'default_claim_day' => $defaultClaimDay,
                'selected_day' => $selectedDay,
                'explicit_day_provided' => $explicitDayProvided,
                'ignore_cutoff' => $ignoreCutoff,
                'claimable_by_cutoff' => $claimableByCutoff,
                'pending_days' => $pendingDays,
                'would_choose_day' => $wouldChooseDay,
                'live_claim_bug_risk' => $liveBugRisk,
                'leaderboard_row' => $leaderboardRow,
                'leaderboard_schema' => pq_detect_leaderboard_schema($pdo),
                'source_points' => $sourcePoints,
                'source_medal' => $sourceMedal,
                'claim_row' => $claimRow,
                'has_real_claim' => $realClaim,
                'log_row' => $logRow,
                'status_should_show_claim_now' => (!empty($pendingDays) && !$realClaim),
                'dry_run_claim_result' => [
                    'ok' => ($rankPos > 0 && $claimableByCutoff && !$realClaim),
                    'reason' => ($rankPos <= 0)
                        ? 'No ranked leaderboard row for selected day, or schema could not identify the score column.'
                        : (!$claimableByCutoff
                            ? 'Selected day is not claimable by cutoff.'
                            : ($realClaim ? 'A real claim already exists for selected day.' : 'Would insert/update claim normally.')),
                ],
            ];
        }
    }
} catch (Throwable $e) {
    $error = $e->getMessage();
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Reward Debug</title>
<style>
    body{margin:0;background:#0b1020;color:#eef3ff;font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{max-width:1200px;margin:0 auto;padding:24px}
    .card{background:#131d3e;border:2px solid #6ba7ff;border-radius:22px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.28);margin-bottom:18px}
    h1,h2,h3{margin:0 0 12px}
    .muted{color:#b9c9ef}
    .row{display:grid;grid-template-columns:1.2fr .9fr auto auto;gap:12px;align-items:end}
    input,select{width:100%;padding:12px 14px;border-radius:14px;border:1px solid #84b8ff;background:#0b1635;color:#fff;font-size:15px;box-sizing:border-box}
    label{display:block;font-size:13px;color:#b9c9ef;margin-bottom:6px}
    .btns{display:flex;gap:10px;flex-wrap:wrap}
    button{padding:12px 16px;border-radius:999px;border:2px solid #b9d7ff;background:#1672ff;color:#fff;font-weight:700;cursor:pointer}
    button.secondary{background:#0b1635}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;background:#0b1635;border:1px solid #6ba7ff;margin:3px 6px 3px 0}
    .good{color:#95ffb6}.bad{color:#ff9ea6}.warn{color:#ffd780}
    .mini-status{margin:0 0 12px;font-size:14px;color:#dce8ff}
    .mini-status span{margin-left:8px}
    table{width:100%;border-collapse:collapse;font-size:14px;background:#0d1735;border-radius:18px;overflow:hidden}
    th,td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top;text-align:left}
    th{background:#1a2a57}
    pre{margin:0;background:#091127;color:#d8e6ff;padding:14px;border-radius:14px;overflow:auto;white-space:pre-wrap;word-break:break-word}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .notice{padding:12px 14px;border-radius:14px;margin-bottom:12px}
    .notice.good{background:#12371d;border:1px solid #3ea45a}.notice.bad{background:#3a1519;border:1px solid #d46a78}.notice.warn{background:#3a2c11;border:1px solid #dbb04e}
    ul{margin:0;padding-left:18px}
    @media (max-width:900px){.row,.grid{grid-template-columns:1fr}.btns{margin-top:8px}}
</style>
</head>
<body>
<div class="wrap">
    <div class="card">
        <h1>Daily Reward Debug</h1>
        <?php $boot = pq_bootstrap_db(); ?>
        <div class="mini-status">
            <strong>DB bootstrap:</strong> <?= $boot['ok'] ? 'connected' : 'not connected' ?>
            <?php if (!empty($boot['config_used'])): ?><span>• using <?= h($boot['config_used']) ?></span><?php endif; ?>
            <?php if (!empty($boot['db'])): ?><span>• db <?= h((string)$boot['db']) ?></span><?php endif; ?>
        </div>
        <p class="muted">Merged version: working DB bootstrap plus safer leaderboard schema detection.</p>
        <?php if ($message): ?>
            <div class="notice <?= !empty($message['ok']) ? 'good' : 'warn' ?>"><?= h($message['msg'] ?? '') ?></div>
        <?php endif; ?>
        <?php if ($error): ?>
            <div class="notice bad"><?= h($error) ?></div>
        <?php endif; ?>
        <form method="get">
            <div class="row">
                <div>
                    <label>User ID, username, or email</label>
                    <input type="text" name="user_lookup" value="<?= h($lookup) ?>" placeholder="PuzzleFox or 36 or email@example.com">
                </div>
                <div>
                    <label>Day key</label>
                    <input type="text" name="day_key" value="<?= h($selectedDay ?? '') ?>" placeholder="YYYY-MM-DD">
                </div>
                <div>
                    <label>Ignore cutoff</label>
                    <select name="ignore_cutoff">
                        <option value="0"<?= $ignoreCutoff ? '' : ' selected' ?>>No</option>
                        <option value="1"<?= $ignoreCutoff ? ' selected' : '' ?>>Yes</option>
                    </select>
                </div>
                <div class="btns">
                    <button type="submit" name="action" value="inspect">Inspect</button>
                    <button type="submit" name="action" value="dry_claim" class="secondary">Dry-run claim</button>
                    <button type="submit" name="action" value="clear_placeholder" class="secondary">Delete zero row</button>
                </div>
            </div>
        </form>
    </div>

    <?php if (!empty($data)): ?>
        <div class="grid">
            <div class="card">
                <h2>Quick verdict</h2>
                <table>
                    <tr><th>Check</th><th>Result</th></tr>
                    <tr><td>User</td><td>#<?= h($data['user']['id']) ?> · <?= h($data['user']['username']) ?> · <?= h($data['user']['email']) ?></td></tr>
                    <tr><td>Active daily day</td><td><?= h($data['active_day'] ?? 'none') ?></td></tr>
                    <tr><td>Default claim day</td><td><?= h($data['default_claim_day']) ?></td></tr>
                    <tr><td>Selected day</td><td><?= h($data['selected_day']) ?></td></tr>
                    <tr><td>Detected score column</td><td><?= h($data['leaderboard_schema']['score_col'] ?? 'none') ?></td></tr>
                    <tr><td>Explicit day provided</td><td class="<?= $data['explicit_day_provided'] ? 'warn' : 'good' ?>"><?= $data['explicit_day_provided'] ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Claimable by cutoff</td><td class="<?= $data['claimable_by_cutoff'] ? 'good' : 'bad' ?>"><?= $data['claimable_by_cutoff'] ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Leaderboard row usable</td><td class="<?= (!empty($data['leaderboard_row']) && empty($data['leaderboard_row']['_schema_error']) && !empty($data['leaderboard_row']['rank_pos'])) ? 'good' : 'bad' ?>"><?= (!empty($data['leaderboard_row']) && empty($data['leaderboard_row']['_schema_error']) && !empty($data['leaderboard_row']['rank_pos'])) ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Real claim already exists</td><td class="<?= $data['has_real_claim'] ? 'warn' : 'good' ?>"><?= $data['has_real_claim'] ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Status should show Claim Now</td><td class="<?= $data['status_should_show_claim_now'] ? 'good' : 'bad' ?>"><?= $data['status_should_show_claim_now'] ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Claim script should choose</td><td><?= h($data['would_choose_day']) ?></td></tr>
                    <tr><td>Live claim bug risk</td><td class="<?= $data['live_claim_bug_risk'] ? 'bad' : 'good' ?>"><?= $data['live_claim_bug_risk'] ? 'Yes — default day differs from first pending day.' : 'No' ?></td></tr>
                </table>
            </div>

            <div class="card">
                <h2>Pending days</h2>
                <?php if (!empty($data['pending_days'])): ?>
                    <?php foreach ($data['pending_days'] as $d): ?>
                        <span class="pill"><?= h($d) ?></span>
                    <?php endforeach; ?>
                <?php else: ?>
                    <p class="muted">No pending days found.</p>
                <?php endif; ?>
                <h3 style="margin-top:16px;">Dry-run claim result</h3>
                <p class="<?= !empty($data['dry_run_claim_result']['ok']) ? 'good' : 'bad' ?>">
                    <?= !empty($data['dry_run_claim_result']['ok']) ? 'Would succeed.' : 'Would fail.' ?>
                </p>
                <p class="muted"><?= h($data['dry_run_claim_result']['reason']) ?></p>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h2>Leaderboard source row</h2>
                <pre><?= h(json_encode($data['leaderboard_row'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>
                <p style="margin-top:12px;">Reward points: <strong><?= h($data['source_points']) ?></strong> · Medal: <strong><?= h($data['source_medal'] ?: 'none') ?></strong></p>
            </div>
            <div class="card">
                <h2>Existing claim row</h2>
                <pre><?= h(json_encode($data['claim_row'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h2>Daily reward log row</h2>
                <pre><?= h(json_encode($data['log_row'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>
            </div>
            <div class="card">
                <h2>Detected leaderboard schema</h2>
                <pre><?= h(json_encode($data['leaderboard_schema'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>
            </div>
        </div>

        <div class="card">
            <h2>What this means</h2>
            <ul>
                <li>If <strong>score_col</strong> is detected, this tool can rank the selected day without assuming <strong>best_seconds</strong>.</li>
                <li>If <strong>score_col</strong> is <strong>none</strong>, paste the schema block and I’ll map your exact column instantly.</li>
                <li>If <strong>pending_days</strong> contains older days but selected/default day is newer, the live claim endpoint can reject the claim.</li>
                <li>If <strong>claim_row</strong> exists with rank 0 and points 0, delete that zero row and test again.</li>
            </ul>
        </div>
    <?php endif; ?>
</div>
</body>
</html>
