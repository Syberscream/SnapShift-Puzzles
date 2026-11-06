<?php
declare(strict_types=1);

require_once __DIR__ . '/daily_rewards.php';

function snapshift_daily_reward_zero_preview(): array {
    return ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 0, 'rank' => 0];
}

function snapshift_daily_reward_effective_claim_row(array $state): ?array {
    $preferred = (isset($state['preferred_claim_row']) && is_array($state['preferred_claim_row'])) ? $state['preferred_claim_row'] : null;
    if ($preferred && (int)($preferred['id'] ?? 0) > 0) {
        return $preferred;
    }

    $default = (isset($state['default_claim_row']) && is_array($state['default_claim_row'])) ? $state['default_claim_row'] : null;
    if ($default && (int)($default['id'] ?? 0) > 0) {
        return $default;
    }

    return null;
}

function snapshift_daily_reward_effective_preview(array $state): array {
    $preferred = (isset($state['preferred_claim_preview']) && is_array($state['preferred_claim_preview'])) ? $state['preferred_claim_preview'] : null;
    if ($preferred) {
        return $preferred;
    }

    $default = (isset($state['default_claim_preview']) && is_array($state['default_claim_preview'])) ? $state['default_claim_preview'] : null;
    if ($default) {
        return $default;
    }

    $reward = (isset($state['reward']) && is_array($state['reward'])) ? $state['reward'] : null;
    return $reward ?: snapshift_daily_reward_zero_preview();
}

function snapshift_daily_reward_build_ui(array $state): array {
    $claimableCount = max(0, (int)($state['claimable_count'] ?? 0));
    $claimDay = trim((string)($state['claim_day'] ?? ''));
    $pendingPoints = max(0, (int)($state['pending_points'] ?? 0));
    $activeDay = trim((string)($state['active_daily_day'] ?? ''));
    $backendMessage = trim((string)($state['msg'] ?? ''));
    $effectiveClaimRow = snapshift_daily_reward_effective_claim_row($state);
    $effectivePreview = snapshift_daily_reward_effective_preview($state);
    $effectiveDay = $effectiveClaimRow ? trim((string)($effectiveClaimRow['day_key'] ?? '')) : trim((string)($state['default_claim_day'] ?? $claimDay));
    $effectiveClaimedAt = $effectiveClaimRow ? trim((string)($effectiveClaimRow['claimed_at'] ?? $effectiveClaimRow['created_at'] ?? '')) : '';
    $effectivePoints = max(0, (int)($effectiveClaimRow['reward_points'] ?? $effectivePreview['points'] ?? 0));
    $rank = max(0, (int)($effectivePreview['rank'] ?? $state['rank'] ?? $state['rank_pos'] ?? 0));

    $ui = [
        'mode' => 'waiting',
        'button_visible' => false,
        'button_enabled' => false,
        'button_label' => ($claimableCount > 1 ? ('Claim Now (' . $claimableCount . ')') : 'Claim Now'),
        'message' => '',
    ];

    if (!empty($state['claimable']) || $claimableCount > 0 || $claimDay !== '') {
        $ui['mode'] = 'claimable';
        $ui['button_visible'] = true;
        $ui['button_enabled'] = true;
        if ($claimableCount > 1) {
            $ui['message'] = 'You have ' . $claimableCount . ' Daily rewards ready to claim.' . ($pendingPoints > 0 ? (' Pending total: +' . $pendingPoints . ' points.') : '');
        } elseif ($claimDay !== '' && $activeDay !== '' && $claimDay !== $activeDay) {
            $ui['message'] = $pendingPoints > 0
                ? ('Reward ready: claim +' . $pendingPoints . ' points from ' . $claimDay . '.')
                : ('Reward ready to claim from ' . $claimDay . '.');
        } else {
            $ui['message'] = $pendingPoints > 0
                ? ('Reward ready: claim +' . $pendingPoints . ' points.')
                : 'Reward ready to claim.';
        }
        return $ui;
    }

    if ($backendMessage !== '') {
        $ui['mode'] = $effectiveClaimRow ? 'already_claimed' : 'info';
        $ui['message'] = $backendMessage;
        return $ui;
    }

    if ($effectiveClaimRow) {
        $ui['mode'] = 'already_claimed';
        $whenText = $effectiveClaimedAt !== '' ? (' Claimed at ' . $effectiveClaimedAt . '.') : '';
        $ui['message'] = $effectivePoints > 0
            ? ('Reward for ' . $effectiveDay . ' was already claimed: +' . $effectivePoints . ' points.' . $whenText)
            : ('Reward for ' . $effectiveDay . ' was already claimed.' . $whenText);
        return $ui;
    }

    if ($rank > 0 || $effectiveDay !== '') {
        $ui['mode'] = 'no_reward';
        $ui['message'] = $rank > 0
            ? ('Daily finished at #' . $rank . '. No reward this time.')
            : 'No Daily reward available.';
        return $ui;
    }

    $ui['message'] = 'Daily rewards become claimable after reset.';
    return $ui;
}

function snapshift_daily_reward_claimed_points(PDO $pdo, int $uid, array $claimMeta): int {
    if (empty($claimMeta['exists']) || empty($claimMeta['user_col']) || empty($claimMeta['points_col'])) {
        return 0;
    }

    $sql = 'SELECT COALESCE(SUM(`' . $claimMeta['points_col'] . '`),0) FROM `daily_reward_claims` WHERE `' . $claimMeta['user_col'] . '` = ?';
    $st = $pdo->prepare($sql);
    $st->execute([$uid]);
    return (int)$st->fetchColumn();
}

function snapshift_daily_reward_medal_totals(PDO $pdo, int $uid, array $lbMeta): array {
    $totals = ['gold' => 0, 'silver' => 0, 'bronze' => 0];
    if (empty($lbMeta['exists']) || empty($lbMeta['user_col'])) {
        return $totals;
    }

    $goldExpr = $lbMeta['gold_col'] ? 'COALESCE(SUM(`' . $lbMeta['gold_col'] . '`),0)' : '0';
    $silverExpr = $lbMeta['silver_col'] ? 'COALESCE(SUM(`' . $lbMeta['silver_col'] . '`),0)' : '0';
    $bronzeExpr = $lbMeta['bronze_col'] ? 'COALESCE(SUM(`' . $lbMeta['bronze_col'] . '`),0)' : '0';
    $sql = 'SELECT ' . $goldExpr . ', ' . $silverExpr . ', ' . $bronzeExpr . ' FROM `leaderboard_daily` WHERE `' . $lbMeta['user_col'] . '` = ?';
    $st = $pdo->prepare($sql);
    $st->execute([$uid]);
    $row = $st->fetch(PDO::FETCH_NUM);
    if (!$row) {
        return $totals;
    }

    return ['gold' => (int)$row[0], 'silver' => (int)$row[1], 'bronze' => (int)$row[2]];
}

function snapshift_daily_reward_normalize_claim_row(?array $row, array $claimMeta): ?array {
    if (!$row) {
        return null;
    }

    return [
        'id' => ($claimMeta['id_col'] && isset($row[$claimMeta['id_col']])) ? (int)$row[$claimMeta['id_col']] : 0,
        'day_key' => ($claimMeta['day_col'] && isset($row[$claimMeta['day_col']])) ? (string)$row[$claimMeta['day_col']] : '',
        'user_id' => ($claimMeta['user_col'] && isset($row[$claimMeta['user_col']])) ? (int)$row[$claimMeta['user_col']] : 0,
        'rank_pos' => ($claimMeta['rank_col'] && isset($row[$claimMeta['rank_col']])) ? (int)$row[$claimMeta['rank_col']] : 0,
        'reward_points' => ($claimMeta['points_col'] && isset($row[$claimMeta['points_col']])) ? (int)$row[$claimMeta['points_col']] : 0,
        'claimed_at' => ($claimMeta['claimed_at_col'] && isset($row[$claimMeta['claimed_at_col']])) ? (string)$row[$claimMeta['claimed_at_col']] : null,
        'created_at' => ($claimMeta['created_at_col'] && isset($row[$claimMeta['created_at_col']])) ? (string)$row[$claimMeta['created_at_col']] : null,
    ];
}

function snapshift_daily_reward_recent_leaderboard_rows(PDO $pdo, int $uid, array $lbMeta, int $limit = 8): array {
    if (empty($lbMeta['exists']) || empty($lbMeta['user_col']) || empty($lbMeta['day_col'])) {
        return [];
    }

    $scoreExpr = $lbMeta['score_col'] ? 'COALESCE(`' . $lbMeta['score_col'] . '`,0)' : '0';
    $movesExpr = $lbMeta['moves_col'] ? 'COALESCE(`' . $lbMeta['moves_col'] . '`,0)' : '0';
    $effExpr = $lbMeta['eff_col'] ? 'COALESCE(`' . $lbMeta['eff_col'] . '`,0)' : '0';
    $pointsExpr = $lbMeta['points_col'] ? 'COALESCE(`' . $lbMeta['points_col'] . '`,0)' : '0';
    $rankExpr = $lbMeta['rank_col'] ? 'COALESCE(`' . $lbMeta['rank_col'] . '`,0)' : '0';

    $sql = 'SELECT `' . $lbMeta['day_col'] . '` AS day_key,' .
        $scoreExpr . ' AS score_value,' .
        $movesExpr . ' AS move_count,' .
        $effExpr . ' AS eff_value,' .
        $pointsExpr . ' AS reward_points,' .
        $rankExpr . ' AS rank_pos ' .
        'FROM `leaderboard_daily` WHERE `' . $lbMeta['user_col'] . '` = ? ORDER BY `' . $lbMeta['day_col'] . '` DESC LIMIT ' . max(1, (int)$limit);
    $st = $pdo->prepare($sql);
    $st->execute([$uid]);

    $rows = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $rows[] = [
            'day_key' => (string)($row['day_key'] ?? ''),
            'score_value' => (int)($row['score_value'] ?? 0),
            'move_count' => (int)($row['move_count'] ?? 0),
            'eff_value' => (float)($row['eff_value'] ?? 0),
            'reward_points' => (int)($row['reward_points'] ?? 0),
            'rank_pos' => (int)($row['rank_pos'] ?? 0),
        ];
    }

    return $rows;
}

function snapshift_daily_reward_state_resolve(PDO $pdo, int $uid, ?string $requestedDay = null, bool $includeRecentRows = false): array {
    $claimMeta = pq_claim_meta($pdo);
    $lbMeta = pq_leaderboard_meta($pdo);
    $logMeta = pq_log_meta($pdo);
    $activeDay = pq_active_daily_day();
    $defaultClaimDay = pq_default_claim_day();
    $claimableDays = pq_pending_days($pdo, $uid, $lbMeta, $claimMeta, $logMeta, $activeDay);
    $preferredDay = pq_preferred_claim_day($claimableDays, $requestedDay ?: $defaultClaimDay);
    $debug = pq_claim_debug_context($pdo, $uid, $lbMeta, $claimMeta, $claimableDays, $activeDay, $defaultClaimDay, $preferredDay, $logMeta);

    $pendingPoints = 0;
    foreach ($claimableDays as $day) {
        $preview = pq_preview_reward_for_day($pdo, $uid, $day, $lbMeta, $logMeta);
        $pendingPoints += (int)($preview['points'] ?? 0);
    }

    $claimable = count($claimableDays) > 0;
    $defaultDayReward = pq_source_reward_row($pdo, $uid, $defaultClaimDay, $logMeta, $lbMeta);
    $defaultDayClaimRowRaw = pq_find_claim_row($pdo, $uid, $defaultClaimDay, $claimMeta);
    $defaultDayAlreadyClaimed = $defaultDayClaimRowRaw ? !pq_claim_row_is_placeholder($defaultDayClaimRowRaw, $claimMeta) : false;
    $claimDay = $claimable
        ? ($preferredDay ?? ($requestedDay ?: $defaultClaimDay))
        : null;

    $rewardPreview = snapshift_daily_reward_zero_preview();
    $requestedDayClaimable = false;
    $alreadyClaimedRequestedDay = false;

    if ($requestedDay) {
        $requestedDayClaimable = in_array($requestedDay, $claimableDays, true);
        $alreadyClaimedRequestedDay = pq_has_real_claim_row($pdo, $uid, $requestedDay, $claimMeta);
        $claimable = $requestedDayClaimable;
    }

    if ($claimable && $claimDay !== null && $claimDay !== '') {
        $rewardPreview = pq_preview_reward_for_day($pdo, $uid, $claimDay, $lbMeta, $logMeta);
    }

    $preferredPreview = $preferredDay ? pq_preview_reward_for_day($pdo, $uid, $preferredDay, $lbMeta, $logMeta) : null;
    $preferredClaimRowRaw = ($preferredDay && $preferredDay !== $defaultClaimDay)
        ? pq_find_claim_row($pdo, $uid, $preferredDay, $claimMeta)
        : $defaultDayClaimRowRaw;

    $state = [
        'claimable' => $claimable,
        'claimable_count' => count($claimableDays),
        'claim_count' => count($claimableDays),
        'claimable_days' => array_values($claimableDays),
        'pending_days' => array_values($claimableDays),
        'claim_day' => $claimDay,
        'preferred_claim_day' => $preferredDay,
        'pending_points' => $pendingPoints,
        'total_reward' => $pendingPoints,
        'reward' => [
            'points' => (int)($rewardPreview['points'] ?? 0),
            'gold' => (int)($rewardPreview['gold'] ?? 0),
            'silver' => (int)($rewardPreview['silver'] ?? 0),
            'bronze' => (int)($rewardPreview['bronze'] ?? 0),
            'rank' => (int)($rewardPreview['rank'] ?? 0),
        ],
        'claimed_points' => snapshift_daily_reward_claimed_points($pdo, $uid, $claimMeta),
        'medals' => snapshift_daily_reward_medal_totals($pdo, $uid, $lbMeta),
        'can_claim_today' => $requestedDay ? ($requestedDay === $defaultClaimDay && $requestedDayClaimable) : $claimable,
        'active_daily_day' => $activeDay,
        'default_claim_day' => $defaultClaimDay,
        'default_day_already_claimed' => $defaultDayAlreadyClaimed,
        'default_day_reward' => [
            'points' => (int)($defaultDayReward['points'] ?? 0),
            'gold' => (int)($defaultDayReward['gold'] ?? 0),
            'silver' => (int)($defaultDayReward['silver'] ?? 0),
            'bronze' => (int)($defaultDayReward['bronze'] ?? 0),
            'rank' => (int)($defaultDayReward['rank'] ?? 0),
        ],
        'default_claim_row' => snapshift_daily_reward_normalize_claim_row($defaultDayClaimRowRaw, $claimMeta),
        'preferred_claim_row' => snapshift_daily_reward_normalize_claim_row($preferredClaimRowRaw, $claimMeta),
        'default_claim_preview' => [
            'points' => (int)($defaultDayReward['points'] ?? 0),
            'gold' => (int)($defaultDayReward['gold'] ?? 0),
            'silver' => (int)($defaultDayReward['silver'] ?? 0),
            'bronze' => (int)($defaultDayReward['bronze'] ?? 0),
            'rank' => (int)($defaultDayReward['rank'] ?? 0),
        ],
        'preferred_claim_preview' => $preferredPreview ? [
            'points' => (int)($preferredPreview['points'] ?? 0),
            'gold' => (int)($preferredPreview['gold'] ?? 0),
            'silver' => (int)($preferredPreview['silver'] ?? 0),
            'bronze' => (int)($preferredPreview['bronze'] ?? 0),
            'rank' => (int)($preferredPreview['rank'] ?? 0),
        ] : null,
        'has_real_claim_default_day' => pq_has_real_claim_row($pdo, $uid, $defaultClaimDay, $claimMeta),
        'has_real_claim_preferred_day' => $preferredDay ? pq_has_real_claim_row($pdo, $uid, $preferredDay, $claimMeta) : null,
        'default_claim_day_claimable' => in_array($defaultClaimDay, $claimableDays, true),
        'latest_claimable_day' => pq_preferred_claim_day($claimableDays),
        'utc_day_fallback_window_active' => pq_recently_after_reset(12),
        'debug' => $debug,
    ];

    if ($requestedDay) {
        $state['requested_day'] = $requestedDay;
        $state['requested_day_claimable'] = $requestedDayClaimable;
        $state['already_claimed'] = $alreadyClaimedRequestedDay;
    }

    if (!$claimable && $defaultDayAlreadyClaimed) {
        $when = $state['default_claim_row']['claimed_at'] ?? null;
        if (!$when) {
            $when = $state['default_claim_row']['created_at'] ?? null;
        }
        $pointsText = (int)($defaultDayReward['points'] ?? 0);
        $state['msg'] = $when
            ? ('Reward for ' . $defaultClaimDay . ' was already claimed: +' . $pointsText . ' points at ' . $when . '.')
            : ('Reward for ' . $defaultClaimDay . ' was already claimed: +' . $pointsText . ' points.');
    }

    if ($requestedDay && !$requestedDayClaimable) {
        $state['msg'] = $alreadyClaimedRequestedDay ? 'Reward already claimed for this day.' : 'No claimable reward for this day yet.';
    }

    if ($includeRecentRows) {
        $recentRows = snapshift_daily_reward_recent_leaderboard_rows($pdo, $uid, $lbMeta, 8);
        $state['recent_leaderboard_rows'] = $recentRows;
        $state['latest_leaderboard_row'] = $recentRows[0] ?? null;
        $state['latest_leaderboard_day'] = $recentRows[0]['day_key'] ?? null;
    }

    $state['ui'] = snapshift_daily_reward_build_ui($state);

    return $state;
}
