<?php
declare(strict_types=1);

require_once __DIR__ . '/auth_core.php';
require_once __DIR__ . '/pq_legacy_db.php';

function snapshift_reward_user_id(): int {
    try {
        $user = snapshift_auth_current_user();
        if (is_array($user) && !empty($user['id'])) {
            return (int)$user['id'];
        }
    } catch (Throwable $e) {
        // Fall back to legacy lookup.
    }

    return pq_user_id();
}

function pq_recently_after_reset(int $windowHours = 12): bool {
    $resetHour = pq_env_int('PQ_DAILY_RESET_HOUR', 17);
    $now = pq_now_local();
    $todayReset = $now->setTime($resetHour, 0, 0);
    if ($now < $todayReset) return false;
    $seconds = $now->getTimestamp() - $todayReset->getTimestamp();
    return $seconds >= 0 && $seconds <= ($windowHours * 3600);
}

function pq_claimable_day(string $day): bool {
    return $day < pq_active_daily_day();
}

function pq_claim_meta($pdo): array {
    $cols = pq_columns($pdo, 'daily_reward_claims');
    return [
        'exists' => !empty($cols),
        'table' => 'daily_reward_claims',
        'user_col' => pq_first_col($cols, ['user_id', 'account_id']),
        'day_col' => pq_first_col($cols, ['day_key', 'day']),
        'points_col' => pq_first_col($cols, ['points', 'reward_points']),
        'gold_col' => pq_first_col($cols, ['gold', 'reward_gold']),
        'silver_col' => pq_first_col($cols, ['silver', 'reward_silver']),
        'bronze_col' => pq_first_col($cols, ['bronze', 'reward_bronze']),
        'rank_col' => pq_first_col($cols, ['rank_position', 'rank_pos']),
        'id_col' => pq_first_col($cols, ['id']),
        'claimed_at_col' => pq_first_col($cols, ['claimed_at']),
        'created_at_col' => pq_first_col($cols, ['created_at']),
    ];
}

function pq_claim_row_is_placeholder(array $row, array $claimMeta): bool {
    $checks = [];
    foreach (['points_col', 'rank_col', 'gold_col', 'silver_col', 'bronze_col'] as $metaKey) {
        $col = $claimMeta[$metaKey] ?? null;
        if ($col && array_key_exists($col, $row)) {
            $checks[] = (int)($row[$col] ?? 0) <= 0;
        }
    }
    if (!$checks) return false;
    foreach ($checks as $ok) {
        if (!$ok) return false;
    }
    return true;
}

function pq_find_claim_row($pdo, int $uid, string $day, array $claimMeta): ?array {
    if (empty($claimMeta['table']) || empty($claimMeta['user_col']) || empty($claimMeta['day_col']) || empty($claimMeta['id_col'])) {
        return null;
    }
    $sql = sprintf(
        'SELECT * FROM `%s` WHERE `%s` = ? AND `%s` = ? ORDER BY `%s` DESC LIMIT 1',
        $claimMeta['table'],
        $claimMeta['user_col'],
        $claimMeta['day_col'],
        $claimMeta['id_col']
    );
    $st = $pdo->prepare($sql);
    $st->execute([$uid, $day]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

function pq_has_real_claim_row($pdo, int $uid, string $day, array $claimMeta): bool {
    $row = pq_find_claim_row($pdo, $uid, $day, $claimMeta);
    return $row ? !pq_claim_row_is_placeholder($row, $claimMeta) : false;
}

function pq_leaderboard_meta($pdo): array {
    $cols = pq_columns($pdo, 'leaderboard_daily');
    return [
        'exists' => !empty($cols),
        'table' => 'leaderboard_daily',
        'user_col' => pq_first_col($cols, ['user_id', 'account_id']),
        'day_col' => pq_first_col($cols, ['day_key', 'day']),
        'points_col' => pq_first_col($cols, ['reward_points', 'points']),
        'rank_col' => pq_first_col($cols, ['rank_position', 'rank_pos', 'position']),
        'gold_col' => pq_first_col($cols, ['reward_gold', 'gold']),
        'silver_col' => pq_first_col($cols, ['reward_silver', 'silver']),
        'bronze_col' => pq_first_col($cols, ['reward_bronze', 'bronze']),
        'score_col' => pq_first_col($cols, ['time_ms', 'score', 'score_ms', 'best_time_ms', 'completion_ms', 'elapsed_ms']),
        'moves_col' => pq_first_col($cols, ['moves', 'move_count']),
        'eff_col' => pq_first_col($cols, ['acc', 'accuracy', 'efficiency', 'eff']),
    ];
}

function pq_log_meta($pdo): array {
    $cols = pq_columns($pdo, 'daily_reward_log');
    return [
        'exists' => !empty($cols),
        'table' => 'daily_reward_log',
        'user_col' => pq_first_col($cols, ['user_id', 'account_id']),
        'day_col' => pq_first_col($cols, ['day_key', 'day']),
        'points_col' => pq_first_col($cols, ['reward_points', 'points']),
        'gold_col' => pq_first_col($cols, ['reward_gold', 'gold']),
        'silver_col' => pq_first_col($cols, ['reward_silver', 'silver']),
        'bronze_col' => pq_first_col($cols, ['reward_bronze', 'bronze']),
        'rank_col' => pq_first_col($cols, ['rank_position', 'rank_pos']),
        'status_col' => pq_first_col($cols, ['status']),
        'claimed_at_col' => pq_first_col($cols, ['claimed_at']),
    ];
}

function pq_preview_reward_for_day($pdo, int $uid, string $day, array $lbMeta, array $logMeta): array {
    $base = ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 0, 'rank' => 0];

    if ($logMeta['exists'] && $logMeta['user_col'] && $logMeta['day_col']) {
        $select = [];
        if ($logMeta['points_col']) $select[] = 'COALESCE(`' . $logMeta['points_col'] . '`,0) AS points';
        if ($logMeta['gold_col']) $select[] = 'COALESCE(`' . $logMeta['gold_col'] . '`,0) AS gold';
        if ($logMeta['silver_col']) $select[] = 'COALESCE(`' . $logMeta['silver_col'] . '`,0) AS silver';
        if ($logMeta['bronze_col']) $select[] = 'COALESCE(`' . $logMeta['bronze_col'] . '`,0) AS bronze';
        if ($logMeta['rank_col']) $select[] = 'COALESCE(`' . $logMeta['rank_col'] . '`,0) AS rank_pos';
        if ($select) {
            $sql = 'SELECT ' . implode(', ', $select) . ' FROM `daily_reward_log` WHERE `' . $logMeta['user_col'] . '` = ? AND `' . $logMeta['day_col'] . '` = ?';
            $params = [$uid, $day];
            if ($logMeta['status_col']) {
                $sql .= ' AND `' . $logMeta['status_col'] . '` = ?';
                $params[] = 'ready';
            }
            if ($logMeta['claimed_at_col']) {
                $sql .= ' AND `' . $logMeta['claimed_at_col'] . '` IS NULL';
            }
            $sql .= ' LIMIT 1';
            $st = $pdo->prepare($sql);
            $st->execute($params);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                $base = [
                    'points' => (int)($row['points'] ?? 0),
                    'gold' => (int)($row['gold'] ?? 0),
                    'silver' => (int)($row['silver'] ?? 0),
                    'bronze' => (int)($row['bronze'] ?? 0),
                    'rank' => (int)($row['rank_pos'] ?? 0),
                ];
                if ($base['points'] <= 0 && $base['gold'] <= 0 && $base['silver'] <= 0 && $base['bronze'] <= 0 && $base['rank'] > 0) {
                    $derived = pq_reward_from_rank($base['rank']);
                    $base['points'] = $derived['points'];
                    $base['gold'] = $derived['gold'];
                    $base['silver'] = $derived['silver'];
                    $base['bronze'] = $derived['bronze'];
                }
                if ($base['points'] > 0 || $base['gold'] > 0 || $base['silver'] > 0 || $base['bronze'] > 0) {
                    return $base;
                }
            }
        }
    }

    if ($lbMeta['exists'] && $lbMeta['user_col'] && $lbMeta['day_col']) {
        $select = [];
        if ($lbMeta['points_col']) $select[] = 'COALESCE(`' . $lbMeta['points_col'] . '`,0) AS points';
        if ($lbMeta['gold_col']) $select[] = 'COALESCE(`' . $lbMeta['gold_col'] . '`,0) AS gold';
        if ($lbMeta['silver_col']) $select[] = 'COALESCE(`' . $lbMeta['silver_col'] . '`,0) AS silver';
        if ($lbMeta['bronze_col']) $select[] = 'COALESCE(`' . $lbMeta['bronze_col'] . '`,0) AS bronze';
        if ($lbMeta['rank_col']) $select[] = 'COALESCE(`' . $lbMeta['rank_col'] . '`,0) AS rank_pos';
        if ($select) {
            $sql = 'SELECT ' . implode(', ', $select) . ' FROM `leaderboard_daily` WHERE `' . $lbMeta['user_col'] . '` = ? AND `' . $lbMeta['day_col'] . '` = ? LIMIT 1';
            $st = $pdo->prepare($sql);
            $st->execute([$uid, $day]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                $base = [
                    'points' => (int)($row['points'] ?? 0),
                    'gold' => (int)($row['gold'] ?? 0),
                    'silver' => (int)($row['silver'] ?? 0),
                    'bronze' => (int)($row['bronze'] ?? 0),
                    'rank' => (int)($row['rank_pos'] ?? 0),
                ];
                if ($base['points'] <= 0 && $base['gold'] <= 0 && $base['silver'] <= 0 && $base['bronze'] <= 0 && $base['rank'] > 0) {
                    $derived = pq_reward_from_rank($base['rank']);
                    $base['points'] = $derived['points'];
                    $base['gold'] = $derived['gold'];
                    $base['silver'] = $derived['silver'];
                    $base['bronze'] = $derived['bronze'];
                }
                if ($base['points'] > 0 || $base['gold'] > 0 || $base['silver'] > 0 || $base['bronze'] > 0) {
                    return $base;
                }
            }
        }
    }

    $base = pq_rank_reward_from_leaderboard_rows($pdo, $uid, $day, $lbMeta, $base);
    return $base;
}

function pq_pending_days($pdo, int $uid, array $lbMeta, array $claimMeta, array $logMeta, ?string $activeDay = null): array {
    $activeDay = $activeDay ?: pq_active_daily_day();
    $candidateDays = [];
    $days = [];

    if ($lbMeta['exists'] && $lbMeta['user_col'] && $lbMeta['day_col']) {
        $sql = 'SELECT DISTINCT ld.`' . $lbMeta['day_col'] . '` FROM `leaderboard_daily` ld WHERE ld.`' . $lbMeta['user_col'] . '` = ? AND ld.`' . $lbMeta['day_col'] . '` < ? ORDER BY ld.`' . $lbMeta['day_col'] . '` DESC LIMIT 60';
        $params = [$uid, $activeDay];
        $st = $pdo->prepare($sql);
        $st->execute($params);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) ?: [] as $day) {
            if (pq_day_valid($day)) $candidateDays[] = (string)$day;
        }
    }

    if ($logMeta['exists'] && $logMeta['user_col'] && $logMeta['day_col']) {
        $sql = 'SELECT DISTINCT l.`' . $logMeta['day_col'] . '` FROM `daily_reward_log` l WHERE l.`' . $logMeta['user_col'] . '` = ?';
        $params = [$uid];
        if ($logMeta['status_col']) {
            $sql .= ' AND l.`' . $logMeta['status_col'] . '` = ?';
            $params[] = 'ready';
        }
        if ($logMeta['claimed_at_col']) {
            $sql .= ' AND l.`' . $logMeta['claimed_at_col'] . '` IS NULL';
        }
        $sql .= ' AND l.`' . $logMeta['day_col'] . '` < ?';
        $params[] = $activeDay;
        $sql .= ' ORDER BY l.`' . $logMeta['day_col'] . '` DESC LIMIT 60';
        $st = $pdo->prepare($sql);
        $st->execute($params);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) ?: [] as $day) {
            if (pq_day_valid($day)) $candidateDays[] = (string)$day;
        }
    }

    $candidateDays = array_values(array_unique($candidateDays));
    sort($candidateDays, SORT_STRING);

    foreach ($candidateDays as $day) {
        if (pq_has_real_claim_row($pdo, $uid, $day, $claimMeta)) continue;
        $reward = pq_source_reward_row($pdo, $uid, $day, $logMeta, $lbMeta);
        if (($reward['points'] ?? 0) > 0 || ($reward['gold'] ?? 0) > 0 || ($reward['silver'] ?? 0) > 0 || ($reward['bronze'] ?? 0) > 0) {
            $days[] = $day;
        }
    }

    return $days;
}

function pq_source_reward_row($pdo, int $uid, string $day, array $logMeta, array $lbMeta): array {
    $result = [
        'points' => 0,
        'gold' => 0,
        'silver' => 0,
        'bronze' => 0,
        'rank' => 0,
    ];

    if ($logMeta['exists'] && $logMeta['user_col'] && $logMeta['day_col'] && ($logMeta['points_col'] || $logMeta['rank_col'] || $logMeta['gold_col'] || $logMeta['silver_col'] || $logMeta['bronze_col'])) {
        $select = [
            ($logMeta['points_col'] ? 'COALESCE(`' . $logMeta['points_col'] . '`,0)' : '0') . ' AS points',
            ($logMeta['gold_col'] ? 'COALESCE(`' . $logMeta['gold_col'] . '`,0)' : '0') . ' AS gold',
            ($logMeta['silver_col'] ? 'COALESCE(`' . $logMeta['silver_col'] . '`,0)' : '0') . ' AS silver',
            ($logMeta['bronze_col'] ? 'COALESCE(`' . $logMeta['bronze_col'] . '`,0)' : '0') . ' AS bronze',
            ($logMeta['rank_col'] ? 'COALESCE(`' . $logMeta['rank_col'] . '`,0)' : '0') . ' AS rank_pos',
        ];
        $sql = 'SELECT ' . implode(', ', $select)
             . ' FROM `daily_reward_log`'
             . ' WHERE `' . $logMeta['user_col'] . '` = ? AND `' . $logMeta['day_col'] . '` = ?'
             . ' LIMIT 1 FOR UPDATE';
        $st = $pdo->prepare($sql);
        $st->execute([$uid, $day]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $result = [
                'points' => (int)($row['points'] ?? 0),
                'gold' => (int)($row['gold'] ?? 0),
                'silver' => (int)($row['silver'] ?? 0),
                'bronze' => (int)($row['bronze'] ?? 0),
                'rank' => (int)($row['rank_pos'] ?? 0),
            ];
            if ($result['points'] <= 0 && $result['gold'] <= 0 && $result['silver'] <= 0 && $result['bronze'] <= 0 && $result['rank'] > 0) {
                $derived = pq_reward_from_rank($result['rank']);
                $result['points'] = $derived['points'];
                $result['gold'] = $derived['gold'];
                $result['silver'] = $derived['silver'];
                $result['bronze'] = $derived['bronze'];
            }
            if ($result['points'] > 0 || $result['gold'] > 0 || $result['silver'] > 0 || $result['bronze'] > 0) {
                return $result;
            }
        }
    }

    if ($lbMeta['exists'] && $lbMeta['user_col'] && $lbMeta['day_col'] && ($lbMeta['points_col'] || $lbMeta['rank_col'] || $lbMeta['gold_col'] || $lbMeta['silver_col'] || $lbMeta['bronze_col'])) {
        $select = [
            ($lbMeta['points_col'] ? 'COALESCE(`' . $lbMeta['points_col'] . '`,0)' : '0') . ' AS points',
            ($lbMeta['gold_col'] ? 'COALESCE(`' . $lbMeta['gold_col'] . '`,0)' : '0') . ' AS gold',
            ($lbMeta['silver_col'] ? 'COALESCE(`' . $lbMeta['silver_col'] . '`,0)' : '0') . ' AS silver',
            ($lbMeta['bronze_col'] ? 'COALESCE(`' . $lbMeta['bronze_col'] . '`,0)' : '0') . ' AS bronze',
            ($lbMeta['rank_col'] ? 'COALESCE(`' . $lbMeta['rank_col'] . '`,0)' : '0') . ' AS rank_pos',
        ];
        $sql = 'SELECT ' . implode(', ', $select)
             . ' FROM `leaderboard_daily`'
             . ' WHERE `' . $lbMeta['user_col'] . '` = ? AND `' . $lbMeta['day_col'] . '` = ?';
        if ($lbMeta['points_col'] && $lbMeta['rank_col']) {
            $sql .= ' ORDER BY COALESCE(`' . $lbMeta['points_col'] . '`,0) DESC, COALESCE(`' . $lbMeta['rank_col'] . '`,999999) ASC';
        } elseif ($lbMeta['points_col']) {
            $sql .= ' ORDER BY COALESCE(`' . $lbMeta['points_col'] . '`,0) DESC';
        } elseif ($lbMeta['rank_col']) {
            $sql .= ' ORDER BY COALESCE(`' . $lbMeta['rank_col'] . '`,999999) ASC';
        }
        $sql .= ' LIMIT 1 FOR UPDATE';
        $st = $pdo->prepare($sql);
        $st->execute([$uid, $day]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $result = [
                'points' => (int)($row['points'] ?? 0),
                'gold' => (int)($row['gold'] ?? 0),
                'silver' => (int)($row['silver'] ?? 0),
                'bronze' => (int)($row['bronze'] ?? 0),
                'rank' => (int)($row['rank_pos'] ?? 0),
            ];
            if ($result['points'] <= 0 && $result['gold'] <= 0 && $result['silver'] <= 0 && $result['bronze'] <= 0 && $result['rank'] > 0) {
                $derived = pq_reward_from_rank($result['rank']);
                $result['points'] = $derived['points'];
                $result['gold'] = $derived['gold'];
                $result['silver'] = $derived['silver'];
                $result['bronze'] = $derived['bronze'];
            }
            if ($result['points'] > 0 || $result['gold'] > 0 || $result['silver'] > 0 || $result['bronze'] > 0) {
                return $result;
            }
        }
    }

    return pq_rank_reward_from_leaderboard_rows($pdo, $uid, $day, $lbMeta, $result);
}

function pq_rank_reward_from_leaderboard_rows($pdo, int $uid, string $day, array $lbMeta, array $fallback = ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 0, 'rank' => 0]): array {
    if ($lbMeta['exists'] && $lbMeta['user_col'] && $lbMeta['day_col'] && $lbMeta['score_col']) {
        $order = ['`' . $lbMeta['score_col'] . '` ASC'];
        if (!empty($lbMeta['moves_col'])) $order[] = '`' . $lbMeta['moves_col'] . '` ASC';
        if (!empty($lbMeta['eff_col'])) $order[] = '`' . $lbMeta['eff_col'] . '` DESC';
        $order[] = '`' . $lbMeta['user_col'] . '` ASC';

        $sql = 'SELECT * FROM `leaderboard_daily` WHERE `' . $lbMeta['day_col'] . '` = ? ORDER BY ' . implode(', ', $order) . ' FOR UPDATE';
        $st = $pdo->prepare($sql);
        $st->execute([$day]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);

        $rank = 0;
        foreach ($rows as $row) {
            $candidateUid = isset($row[$lbMeta['user_col']]) ? (int)$row[$lbMeta['user_col']] : 0;
            if ($candidateUid <= 0) continue;
            $rank++;
            if ($candidateUid === $uid) {
                $reward = pq_reward_from_rank($rank);
                $reward['rank'] = $rank;
                return $reward;
            }
        }
    }

    return $fallback;
}

function pq_requested_day(): ?string {
    if (!isset($_GET['day'])) return null;
    $day = trim((string)$_GET['day']);
    return pq_day_valid($day) ? $day : null;
}

function pq_preferred_claim_day(array $days, ?string $requestedDay = null): ?string {
    $valid = [];
    foreach ($days as $day) {
        if (pq_day_valid($day)) $valid[] = $day;
    }
    $valid = array_values(array_unique($valid));
    if (!$valid) return null;
    if ($requestedDay && in_array($requestedDay, $valid, true)) return $requestedDay;

    $default = pq_default_claim_day();
    if (in_array($default, $valid, true)) return $default;

    rsort($valid, SORT_STRING);
    return $valid[0] ?? null;
}

function pq_claim_debug_context($pdo, int $uid, array $lbMeta, array $claimMeta, array $pendingDays, ?string $activeDay, ?string $requestedDay, ?string $preferredDay, array $logMeta): array {
    $defaultDay = pq_default_claim_day();
    return [
        'active_day' => $activeDay,
        'default_claim_day' => $defaultDay,
        'requested_day' => $requestedDay,
        'preferred_day' => $preferredDay,
        'pending_days' => array_values($pendingDays),
        'requested_day_claimable_by_cutoff' => ($requestedDay && $activeDay) ? pq_claimable_day($requestedDay) : null,
        'default_day_claimable_by_cutoff' => $activeDay ? pq_claimable_day($defaultDay) : null,
        'requested_day_source_reward' => $requestedDay ? pq_source_reward_row($pdo, $uid, $requestedDay, $logMeta, $lbMeta) : null,
        'default_day_source_reward' => pq_source_reward_row($pdo, $uid, $defaultDay, $logMeta, $lbMeta),
        'requested_day_has_real_claim' => $requestedDay ? pq_has_real_claim_row($pdo, $uid, $requestedDay, $claimMeta) : null,
        'default_day_has_real_claim' => pq_has_real_claim_row($pdo, $uid, $defaultDay, $claimMeta),
        'lb_meta' => [
            'user_col' => $lbMeta['user_col'] ?? null,
            'day_col' => $lbMeta['day_col'] ?? null,
            'score_col' => $lbMeta['score_col'] ?? null,
            'moves_col' => $lbMeta['moves_col'] ?? null,
            'eff_col' => $lbMeta['eff_col'] ?? null,
        ],
    ];
}
