<?php
declare(strict_types=1);

define('PQ_CLAIM_BUILD', 'reward_claim_unified_2026_04_26');
header('Content-Type: application/json');
if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }

require_once __DIR__ . '/../lib/daily_reward_state.php';

function pq_claim_bool_flag(string $key): bool {
    $value = $_GET[$key] ?? null;
    if ($value === null) return false;
    $value = strtolower(trim((string)$value));
    return in_array($value, ['1', 'true', 'yes', 'on'], true);
}

function pq_claim_apply_day(PDO $pdo, int $uid, string $day, array $lbMeta, array $logMeta, array &$claimMeta): array {
    if (!$claimMeta['exists']) {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `daily_reward_claims` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `user_id` INT NOT NULL,
                `day_key` DATE NOT NULL,
                `points` INT NOT NULL DEFAULT 0,
                `gold` INT NOT NULL DEFAULT 0,
                `silver` INT NOT NULL DEFAULT 0,
                `bronze` INT NOT NULL DEFAULT 0,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_user_day` (`user_id`, `day_key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        $claimMeta = pq_claim_meta($pdo);
    }

    if (!$claimMeta['user_col'] || !$claimMeta['day_col']) {
        throw new RuntimeException('daily_reward_claims schema missing user/day columns');
    }

    $alreadySql = 'SELECT * FROM `daily_reward_claims` WHERE `' . $claimMeta['user_col'] . '` = ? AND `' . $claimMeta['day_col'] . '` = ? LIMIT 1 FOR UPDATE';
    $st = $pdo->prepare($alreadySql);
    $st->execute([$uid, $day]);
    $existingClaim = $st->fetch(PDO::FETCH_ASSOC);
    $placeholderClaimRow = ($existingClaim && pq_claim_row_is_placeholder($existingClaim, $claimMeta)) ? $existingClaim : null;
    if ($existingClaim && !$placeholderClaimRow) {
        return [
            'already_claimed' => true,
            'day' => $day,
            'points' => 0,
            'gold' => 0,
            'silver' => 0,
            'bronze' => 0,
            'rank' => 0,
        ];
    }

    $reward = pq_source_reward_row($pdo, $uid, $day, $logMeta, $lbMeta);

    $insertCols = [$claimMeta['user_col'], $claimMeta['day_col']];
    $insertVals = [$uid, $day];
    $placeholders = ['?', '?'];

    if ($claimMeta['points_col']) { $insertCols[] = $claimMeta['points_col']; $insertVals[] = $reward['points']; $placeholders[] = '?'; }
    if ($claimMeta['gold_col']) { $insertCols[] = $claimMeta['gold_col']; $insertVals[] = $reward['gold']; $placeholders[] = '?'; }
    if ($claimMeta['silver_col']) { $insertCols[] = $claimMeta['silver_col']; $insertVals[] = $reward['silver']; $placeholders[] = '?'; }
    if ($claimMeta['bronze_col']) { $insertCols[] = $claimMeta['bronze_col']; $insertVals[] = $reward['bronze']; $placeholders[] = '?'; }
    if ($claimMeta['rank_col']) { $insertCols[] = $claimMeta['rank_col']; $insertVals[] = $reward['rank']; $placeholders[] = '?'; }
    if ($claimMeta['claimed_at_col']) { $insertCols[] = $claimMeta['claimed_at_col']; $placeholders[] = 'NOW()'; }

    if ($placeholderClaimRow) {
        $updateParts = [];
        $updateVals = [];
        if ($claimMeta['points_col']) { $updateParts[] = '`' . $claimMeta['points_col'] . '` = ?'; $updateVals[] = $reward['points']; }
        if ($claimMeta['gold_col']) { $updateParts[] = '`' . $claimMeta['gold_col'] . '` = ?'; $updateVals[] = $reward['gold']; }
        if ($claimMeta['silver_col']) { $updateParts[] = '`' . $claimMeta['silver_col'] . '` = ?'; $updateVals[] = $reward['silver']; }
        if ($claimMeta['bronze_col']) { $updateParts[] = '`' . $claimMeta['bronze_col'] . '` = ?'; $updateVals[] = $reward['bronze']; }
        if ($claimMeta['rank_col']) { $updateParts[] = '`' . $claimMeta['rank_col'] . '` = ?'; $updateVals[] = $reward['rank']; }
        if ($claimMeta['claimed_at_col']) { $updateParts[] = '`' . $claimMeta['claimed_at_col'] . '` = NOW()'; }
        $updateVals[] = $uid;
        $updateVals[] = $day;
        $sql = 'UPDATE `daily_reward_claims` SET ' . implode(', ', $updateParts) . ' WHERE `' . $claimMeta['user_col'] . '` = ? AND `' . $claimMeta['day_col'] . '` = ?';
        $st = $pdo->prepare($sql);
        $st->execute($updateVals);
    } else {
        $quotedCols = array_map(fn($col) => '`' . $col . '`', $insertCols);
        $sql = 'INSERT INTO `daily_reward_claims` (' . implode(', ', $quotedCols) . ') VALUES (' . implode(', ', $placeholders) . ')';
        $st = $pdo->prepare($sql);
        $st->execute($insertVals);
    }

    if ($logMeta['exists'] && $logMeta['user_col'] && $logMeta['day_col']) {
        $updates = [];
        if ($logMeta['claimed_at_col']) $updates[] = '`' . $logMeta['claimed_at_col'] . '` = NOW()';
        if ($logMeta['status_col']) $updates[] = '`' . $logMeta['status_col'] . '` = "claimed"';
        if ($updates) {
            $st = $pdo->prepare('UPDATE `daily_reward_log` SET ' . implode(', ', $updates) . ' WHERE `' . $logMeta['user_col'] . '` = ? AND `' . $logMeta['day_col'] . '` = ?');
            $st->execute([$uid, $day]);
        }
    }

    return [
        'already_claimed' => false,
        'day' => $day,
        'points' => (int)($reward['points'] ?? 0),
        'gold' => (int)($reward['gold'] ?? 0),
        'silver' => (int)($reward['silver'] ?? 0),
        'bronze' => (int)($reward['bronze'] ?? 0),
        'rank' => (int)($reward['rank'] ?? 0),
    ];
}

function pq_claim_apply_points_to_state(PDO $pdo, int $uid, int $points): void {
    if ($points <= 0) return;

    $userCols = pq_columns($pdo, 'users');
    $userIdCol = pq_first_col($userCols, ['id', 'user_id']);
    $userPointsCol = pq_first_col($userCols, ['points']);
    if (!empty($userCols) && $userIdCol && $userPointsCol) {
        $st = $pdo->prepare('UPDATE `users` SET `' . $userPointsCol . '` = COALESCE(`' . $userPointsCol . '`,0) + ? WHERE `' . $userIdCol . '` = ?');
        $st->execute([$points, $uid]);
    }

    $stateCols = pq_columns($pdo, 'user_state');
    $stateUserCol = pq_first_col($stateCols, ['user_id', 'uid', 'member_id']);
    $statePointsCol = pq_first_col($stateCols, ['points']);
    $stateJsonCol = pq_first_col($stateCols, ['state_json', 'state', 'json_state', 'data_json']);
    if (empty($stateCols) || !$stateUserCol) return;

    $selectCols = [];
    if ($statePointsCol) $selectCols[] = '`' . $statePointsCol . '` AS current_points';
    if ($stateJsonCol) $selectCols[] = '`' . $stateJsonCol . '` AS current_json';
    $rawRow = false;
    if ($selectCols) {
        $st = $pdo->prepare('SELECT ' . implode(', ', $selectCols) . ' FROM `user_state` WHERE `' . $stateUserCol . '` = ? LIMIT 1');
        $st->execute([$uid]);
        $rawRow = $st->fetch(PDO::FETCH_ASSOC);
    }

    $state = [];
    $existingPoints = 0;
    if (is_array($rawRow)) {
        if ($statePointsCol) $existingPoints = (int)($rawRow['current_points'] ?? 0);
        if ($stateJsonCol && is_string($rawRow['current_json'] ?? null) && $rawRow['current_json'] !== '') {
            $decoded = json_decode((string)$rawRow['current_json'], true);
            if (is_array($decoded)) $state = $decoded;
        }
    }

    $newPoints = $existingPoints + $points;
    $state['points'] = (int)($state['points'] ?? 0) + $points;
    $stateJson = $stateJsonCol ? json_encode($state, JSON_UNESCAPED_SLASHES) : null;

    if ($rawRow === false) {
        $insertCols = ['`' . $stateUserCol . '`'];
        $insertVals = [$uid];
        $placeholders = ['?'];
        if ($statePointsCol) {
            $insertCols[] = '`' . $statePointsCol . '`';
            $insertVals[] = $newPoints;
            $placeholders[] = '?';
        }
        if ($stateJsonCol) {
            $insertCols[] = '`' . $stateJsonCol . '`';
            $insertVals[] = $stateJson;
            $placeholders[] = '?';
        }
        $st = $pdo->prepare('INSERT INTO `user_state` (' . implode(', ', $insertCols) . ') VALUES (' . implode(', ', $placeholders) . ')');
        $st->execute($insertVals);
    } else {
        $updateParts = [];
        $updateVals = [];
        if ($statePointsCol) {
            $updateParts[] = '`' . $statePointsCol . '` = ?';
            $updateVals[] = $newPoints;
        }
        if ($stateJsonCol) {
            $updateParts[] = '`' . $stateJsonCol . '` = ?';
            $updateVals[] = $stateJson;
        }
        if ($updateParts) {
            $updateVals[] = $uid;
            $st = $pdo->prepare('UPDATE `user_state` SET ' . implode(', ', $updateParts) . ' WHERE `' . $stateUserCol . '` = ?');
            $st->execute($updateVals);
        }
    }
}

if (isset($_GET['probe'])) {
    try {
        $pdo = pq_db();
        $uid = snapshift_reward_user_id();
        $state = $uid > 0 ? snapshift_daily_reward_state_resolve($pdo, $uid, null, true) : null;
        echo json_encode([
            'ok' => true,
            'build' => PQ_CLAIM_BUILD,
            'file' => __FILE__,
            'uid' => $uid,
            'reward_state' => $state,
        ], JSON_PRETTY_PRINT);
    } catch (Throwable $e) {
        echo json_encode([
            'ok' => false,
            'build' => PQ_CLAIM_BUILD,
            'file' => __FILE__,
            'error' => $e->getMessage(),
        ], JSON_PRETTY_PRINT);
    }
    exit;
}

try {
    $uid = snapshift_reward_user_id();
    if ($uid <= 0) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Not logged in', 'loggedIn' => false, 'logged_in' => false]);
        exit;
    }

    $pdo = pq_db();
    $backlogMode = pq_claim_bool_flag('backlog');
    $requestedDayProvided = isset($_GET['day']) && trim((string)$_GET['day']) !== '';
    if ($backlogMode) $requestedDayProvided = false;
    $day = $requestedDayProvided ? trim((string)$_GET['day']) : pq_default_claim_day();
    if (!pq_day_valid($day)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid day']);
        exit;
    }

    $lbMeta = pq_leaderboard_meta($pdo);
    $logMeta = pq_log_meta($pdo);
    $claimMeta = pq_claim_meta($pdo);
    $activeDay = pq_active_daily_day();
    $requestedDayForState = $requestedDayProvided ? $day : null;
    $rewardState = snapshift_daily_reward_state_resolve($pdo, $uid, $requestedDayForState);
    $pendingDays = array_values($rewardState['pending_days'] ?? []);
    $preferredDay = $rewardState['preferred_claim_day'] ?? null;

    if (!$pendingDays) {
        if ($requestedDayProvided) {
            $alreadyClaimed = !empty($rewardState['already_claimed']);
            http_response_code(400);
            echo json_encode([
                'ok' => false,
                'error' => $alreadyClaimed ? 'Reward already claimed for this day.' : 'No claimable reward available for this day.',
                'requested_day' => $day,
                'already_claimed' => $alreadyClaimed,
                'reward_state' => $rewardState,
            ]);
            exit;
        }
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'No claimable rewards available', 'reward_state' => $rewardState]);
        exit;
    }

    $strictRequestedDay = isset($_GET['strict_day']) && (string)$_GET['strict_day'] === '1';
    $requestedDayOriginal = $requestedDayProvided ? $day : null;
    $requestedDayFallback = false;
    $claimDays = [];

    if ($backlogMode) {
        $claimDays = array_values($pendingDays);
        $day = $preferredDay ?? $pendingDays[0];
    } elseif ($requestedDayProvided) {
        if (!in_array($day, $pendingDays, true)) {
            $alreadyClaimed = !empty($rewardState['already_claimed']);
            if (!$strictRequestedDay && !$alreadyClaimed && $preferredDay && $preferredDay !== $day) {
                $day = $preferredDay;
                $requestedDayFallback = true;
            } else {
                http_response_code(400);
                echo json_encode([
                    'ok' => false,
                    'error' => $alreadyClaimed ? 'Reward already claimed for this day.' : 'No claimable reward available for this day.',
                    'requested_day' => $day,
                    'already_claimed' => $alreadyClaimed,
                    'debug' => $rewardState['debug'] ?? [],
                    'reward_state' => $rewardState,
                ]);
                exit;
            }
        }
        $claimDays = [$day];
    } else {
        $day = $preferredDay ?? $pendingDays[0];
        $claimDays = [$day];
    }

    foreach ($claimDays as $candidateDay) {
        if (!pq_claimable_day($candidateDay)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Reward not claimable for this day yet']);
            exit;
        }
    }

    $pdo->beginTransaction();

    $claimedRows = [];
    $totalReward = 0;
    $totals = ['gold' => 0, 'silver' => 0, 'bronze' => 0];

    foreach ($claimDays as $claimTargetDay) {
        $row = pq_claim_apply_day($pdo, $uid, $claimTargetDay, $lbMeta, $logMeta, $claimMeta);
        if (!empty($row['already_claimed'])) continue;
        $claimedRows[] = [
            'day' => (string)$row['day'],
            'rank' => (int)$row['rank'],
            'reward' => (int)$row['points'],
            'gold' => (int)$row['gold'],
            'silver' => (int)$row['silver'],
            'bronze' => (int)$row['bronze'],
        ];
        $totalReward += (int)$row['points'];
        $totals['gold'] += (int)$row['gold'];
        $totals['silver'] += (int)$row['silver'];
        $totals['bronze'] += (int)$row['bronze'];
    }

    if (!$claimedRows) {
        $pdo->rollBack();
        echo json_encode(['ok' => true, 'already_claimed' => true, 'day' => $day]);
        exit;
    }

    pq_claim_apply_points_to_state($pdo, $uid, $totalReward);

    $pdo->commit();
    $supporterState = snapshift_auth_supporter_state($pdo, $uid, false);
    $currentPoints = (int)($supporterState['points'] ?? 0);
    $claimedCount = count($claimedRows);
    $rewardStateAfter = snapshift_daily_reward_state_resolve($pdo, $uid, null);

    echo json_encode([
        'ok' => true,
        'build' => PQ_CLAIM_BUILD,
        'day' => $day,
        'claim_day' => $day,
        'claimed_days' => $claimedCount,
        'claimed_count' => $claimedCount,
        'claimed_day_rows' => $claimedRows,
        'claimed_points' => $totalReward,
        'total_reward' => $totalReward,
        'current_points' => $currentPoints,
        'points' => $totalReward,
        'gold' => $totals['gold'],
        'silver' => $totals['silver'],
        'bronze' => $totals['bronze'],
        'rank' => $claimedCount === 1 ? (int)($claimedRows[0]['rank'] ?? 0) : 0,
        'medals' => $totals,
        'backlog' => $backlogMode,
        'selected_by_default' => !$requestedDayProvided,
        'requested_day' => $requestedDayOriginal,
        'requested_day_fallback' => $requestedDayFallback,
        'resolved_day' => $day,
        'default_claim_day' => pq_default_claim_day(),
        'utc_day_fallback_window_active' => pq_recently_after_reset(12),
        'reward_state_build' => 'shared_daily_reward_state',
        'reward_state' => $rewardStateAfter,
        'loggedIn' => true,
        'logged_in' => true,
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && method_exists($pdo, 'inTransaction') && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ]);
}
