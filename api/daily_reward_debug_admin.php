<?php
// Snapshift Daily Reward Debug Tool
// Drop this beside admin.php or anywhere under public_html and open it directly.
// Safe read-only by default. Optional cleanup only deletes zero-value placeholder claim rows.

declare(strict_types=1);
session_start();
require_once __DIR__ . '/../lib/debug_gate.php';
pq_require_debug_access('html');

header('Content-Type: text/html; charset=utf-8');

date_default_timezone_set('UTC');

function h($v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

function pq_cfg_candidates(): array {
    $base = __DIR__;
    return [
        $base . '/config.php',
        dirname($base) . '/config.php',
        $base . '/api/config.php',
        dirname($base) . '/api/config.php',
        $base . '/includes/config.php',
        dirname($base) . '/includes/config.php',
    ];
}

function pq_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    foreach (pq_cfg_candidates() as $cfg) {
        if (!is_file($cfg)) continue;
        $before = get_defined_vars();
        require_once $cfg;

        $host = $GLOBALS['DB_HOST'] ?? $GLOBALS['db_host'] ?? null;
        $name = $GLOBALS['DB_NAME'] ?? $GLOBALS['db_name'] ?? null;
        $user = $GLOBALS['DB_USER'] ?? $GLOBALS['db_user'] ?? null;
        $pass = $GLOBALS['DB_PASS'] ?? $GLOBALS['db_pass'] ?? null;
        if ($host && $name && $user !== null) {
            $dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";
            $pdo = new PDO($dsn, (string)$user, (string)$pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            return $pdo;
        }
    }

    throw new RuntimeException('Could not locate usable DB config.php');
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

function pq_leaderboard_row(PDO $pdo, int $uid, string $day): ?array {
    if (!pq_table_exists($pdo, 'leaderboard_daily')) return null;
    $hasDay = pq_has_cols($pdo, 'leaderboard_daily', ['day_key']);
    $hasUid = pq_has_cols($pdo, 'leaderboard_daily', ['user_id']);
    if (!$hasDay || !$hasUid) return null;

    $scoreCol = 'best_seconds';
    foreach (['time_seconds', 'best_seconds', 'seconds', 'best_time'] as $cand) {
        if (pq_has_cols($pdo, 'leaderboard_daily', [$cand])) { $scoreCol = $cand; break; }
    }
    $movesCol = pq_has_cols($pdo, 'leaderboard_daily', ['best_moves']) ? 'best_moves' : (pq_has_cols($pdo, 'leaderboard_daily', ['moves']) ? 'moves' : null);
    $effCol = pq_has_cols($pdo, 'leaderboard_daily', ['best_efficiency']) ? 'best_efficiency' : (pq_has_cols($pdo, 'leaderboard_daily', ['efficiency']) ? 'efficiency' : null);

    $select = [
        'user_id',
        'day_key',
        "{$scoreCol} AS seconds",
    ];
    if ($movesCol) $select[] = "{$movesCol} AS moves";
    if ($effCol) $select[] = "{$effCol} AS efficiency";

    $order = "{$scoreCol} ASC, user_id ASC";
    $sql = 'SELECT * FROM (SELECT ' . implode(', ', $select) . ', ROW_NUMBER() OVER (PARTITION BY day_key ORDER BY ' . $order . ') AS rank_pos FROM leaderboard_daily WHERE day_key = ?) ranked WHERE user_id = ? LIMIT 1';
    try {
        return pq_one($pdo, $sql, [$day, $uid]);
    } catch (Throwable $e) {
        // fallback without window functions
        $all = pq_all($pdo, 'SELECT ' . implode(', ', $select) . ' FROM leaderboard_daily WHERE day_key = ? ORDER BY ' . $order, [$day]);
        $rank = 0;
        foreach ($all as $row) {
            $rank++;
            if ((int)$row['user_id'] === $uid) {
                $row['rank_pos'] = $rank;
                return $row;
            }
        }
        return null;
    }
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

            $sourcePoints = 0;
            $sourceMedal = '';
            if ($leaderboardRow) {
                $sourcePoints = pq_reward_points((int)($leaderboardRow['rank_pos'] ?? 0));
                $sourceMedal = pq_medal((int)($leaderboardRow['rank_pos'] ?? 0));
            }

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
                'source_points' => $sourcePoints,
                'source_medal' => $sourceMedal,
                'claim_row' => $claimRow,
                'has_real_claim' => $realClaim,
                'log_row' => $logRow,
                'status_should_show_claim_now' => (!empty($pendingDays) && !$realClaim),
                'dry_run_claim_result' => [
                    'ok' => ($leaderboardRow && $claimableByCutoff && !$realClaim),
                    'reason' => !$leaderboardRow ? 'No leaderboard row for selected day.' : (!$claimableByCutoff ? 'Selected day is not claimable by cutoff.' : ($realClaim ? 'A real claim already exists for selected day.' : 'Would insert/update claim normally.')),
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
    table{width:100%;border-collapse:collapse;font-size:14px;background:#0d1735;border-radius:18px;overflow:hidden}
    th,td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top;text-align:left}
    th{background:#1a2a57}
    pre{margin:0;background:#091127;color:#d8e6ff;padding:14px;border-radius:14px;overflow:auto;white-space:pre-wrap;word-break:break-word}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .notice{padding:12px 14px;border-radius:14px;margin-bottom:12px}
    .notice.good{background:#12371d;border:1px solid #3ea45a}.notice.bad{background:#3a1519;border:1px solid #d46a78}.notice.warn{background:#3a2c11;border:1px solid #dbb04e}
    @media (max-width:900px){.row,.grid{grid-template-columns:1fr}.btns{margin-top:8px}}
</style>
</head>
<body>
<div class="wrap">
    <div class="card">
        <h1>Daily Reward Debug</h1>
        <p class="muted">Use this to test any user and any day instantly, without waiting for the next daily rollover.</p>
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
                    <tr><td>Explicit day provided</td><td class="<?= $data['explicit_day_provided'] ? 'warn' : 'good' ?>"><?= $data['explicit_day_provided'] ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Claimable by cutoff</td><td class="<?= $data['claimable_by_cutoff'] ? 'good' : 'bad' ?>"><?= $data['claimable_by_cutoff'] ? 'Yes' : 'No' ?></td></tr>
                    <tr><td>Leaderboard row exists</td><td class="<?= $data['leaderboard_row'] ? 'good' : 'bad' ?>"><?= $data['leaderboard_row'] ? 'Yes' : 'No' ?></td></tr>
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
                <h2>What to look for</h2>
                <ul>
                    <li>If <strong>pending_days</strong> contains older days but selected/default day is newer, the live claim endpoint can reject the claim.</li>
                    <li>If <strong>claim_row</strong> exists with rank 0 and points 0, delete that zero row and test again.</li>
                    <li>If <strong>leaderboard_row</strong> is missing, the user has no ranked daily result for that day.</li>
                    <li>If <strong>claimable_by_cutoff</strong> is No, the day has not rolled past the reward cutoff yet.</li>
                </ul>
            </div>
        </div>
    <?php endif; ?>
</div>
</body>
</html>
