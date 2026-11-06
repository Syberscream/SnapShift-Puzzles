<?php
declare(strict_types=1);

require_once __DIR__ . '/auth_core.php';
require_once __DIR__ . '/puzzle_unlock_state.php';
require_once __DIR__ . '/puzzle_card_state.php';

function snapshift_unlock_action_clean_items($value): array {
    if (!is_array($value)) return [];

    $items = [];
    $seen = [];
    foreach ($value as $idx => $item) {
        if (!is_array($item)) continue;
        $src = trim((string)($item['src'] ?? ''));
        $key = snapshift_unlock_normalize_src($src);
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $items[] = [
            'src' => $src,
            'puzzleIdx' => max(0, (int)($item['puzzleIdx'] ?? $idx)),
        ];
    }

    return $items;
}

function snapshift_unlock_action_build_cards(string $categoryId, array $items): array {
    $cards = [];
    foreach ($items as $item) {
        $cards[] = [
            'categoryId' => $categoryId,
            'puzzleIdx' => max(0, (int)($item['puzzleIdx'] ?? 0)),
            'puzzleSrc' => (string)($item['src'] ?? ''),
        ];
    }
    return $cards;
}

function snapshift_unlock_action_ensure_ledger(PDO $pdo): bool {
    try {
        $sql = "CREATE TABLE IF NOT EXISTS `points_ledger` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `entry_type` VARCHAR(64) NOT NULL DEFAULT 'adjustment',
            `points_delta` INT NOT NULL,
            `balance_after` INT NULL DEFAULT NULL,
            `finish_text` VARCHAR(255) NULL DEFAULT NULL,
            `event_key` VARCHAR(190) NULL DEFAULT NULL,
            `category_id` VARCHAR(100) NULL DEFAULT NULL,
            `category_name` VARCHAR(150) NULL DEFAULT NULL,
            `puzzle_idx` INT NULL DEFAULT NULL,
            `puzzle_name` VARCHAR(190) NULL DEFAULT NULL,
            `puzzle_src` VARCHAR(255) NULL DEFAULT NULL,
            `diff_key` VARCHAR(32) NULL DEFAULT NULL,
            `day_key` VARCHAR(10) NULL DEFAULT NULL,
            `meta_json` MEDIUMTEXT NULL DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_points_ledger_event_key` (`event_key`),
            KEY `idx_points_ledger_user_created` (`user_id`, `created_at`),
            KEY `idx_points_ledger_user_type` (`user_id`, `entry_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
        $pdo->exec($sql);
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

function snapshift_unlock_action_record_ledger(
    PDO $pdo,
    int $uid,
    int $delta,
    int $balanceAfter,
    string $categoryId,
    int $puzzleIdx,
    string $puzzleSrc,
    int $unlockCost
): void {
    if (!snapshift_unlock_action_ensure_ledger($pdo)) {
        return;
    }

    $eventKey = sprintf('unlock:%d:%s:%s', $uid, $categoryId, snapshift_unlock_normalize_src($puzzleSrc));
    try {
        $insert = $pdo->prepare("INSERT INTO points_ledger (
            user_id, entry_type, points_delta, balance_after, finish_text, event_key,
            category_id, puzzle_idx, puzzle_src, meta_json
        ) VALUES (?, 'puzzle_unlock', ?, ?, ?, ?, ?, ?, ?, ?)");
        $insert->execute([
            $uid,
            $delta,
            $balanceAfter,
            sprintf('Unlock puzzle - %s - #%d', $categoryId, $puzzleIdx + 1),
            $eventKey,
            $categoryId,
            $puzzleIdx,
            $puzzleSrc,
            json_encode([
                'unlock_cost' => $unlockCost,
                'category_id' => $categoryId,
                'puzzle_idx' => $puzzleIdx,
                'puzzle_src' => $puzzleSrc,
            ], JSON_UNESCAPED_SLASHES),
        ]);
    } catch (Throwable $e) {
    }
}

function snapshift_unlock_action_response_state(PDO $pdo, int $uid, string $categoryId, array $items): array {
    $categories = [
        $categoryId => array_map(static function (array $item): array {
            return [
                'src' => (string)($item['src'] ?? ''),
                'puzzleIdx' => max(0, (int)($item['puzzleIdx'] ?? 0)),
            ];
        }, $items),
    ];
    $cards = snapshift_unlock_action_build_cards($categoryId, $items);
    return snapshift_puzzle_card_state_resolve($pdo, $uid, $categories, $cards);
}

function snapshift_unlock_action_apply(PDO $pdo, int $uid, array $input): array {
    $categoryId = snapshift_unlock_normalize_cat_id((string)($input['category_id'] ?? ''));
    $requestedSrcRaw = trim((string)($input['puzzle_src'] ?? ''));
    $requestedSrc = snapshift_unlock_normalize_src($requestedSrcRaw);
    $requestedIdx = isset($input['puzzle_idx']) ? max(0, (int)$input['puzzle_idx']) : null;
    $items = snapshift_unlock_action_clean_items($input['items'] ?? []);

    if ($categoryId === '' || $requestedSrc === '' || !$items) {
        return [
            'ok' => false,
            'loggedIn' => true,
            'error_code' => 'invalid_unlock_request',
            'msg' => 'Invalid unlock request.',
        ];
    }

    $pdo->beginTransaction();
    try {
        snapshift_auth_ensure_user_state_row($pdo, $uid);
        $supporter = snapshift_auth_supporter_state($pdo, $uid, true);
        $pointsNow = max(0, (int)($supporter['points'] ?? 0));

        $st = $pdo->prepare("SELECT unlocked_json FROM user_state WHERE user_id = ? LIMIT 1 FOR UPDATE");
        $st->execute([$uid]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: ['unlocked_json' => '{}'];
        $decoded = json_decode((string)($row['unlocked_json'] ?? '{}'), true);
        $unlockedMap = snapshift_unlock_clean_map($decoded);

        $unlockState = snapshift_build_unlock_state($unlockedMap, $categoryId, $items);
        $nextLockedSrc = (string)($unlockState['nextLockedSrc'] ?? '');
        $nextLockedIdx = max(0, (int)($unlockState['nextLockedIdx'] ?? 0));

        if ($nextLockedSrc === '') {
            $resolved = snapshift_unlock_action_response_state($pdo, $uid, $categoryId, $items);
            $pdo->commit();
            return [
                'ok' => false,
                'loggedIn' => true,
                'error_code' => 'already_fully_unlocked',
                'msg' => 'Everything in this category is already unlocked.',
                'points' => $pointsNow,
                'unlocked' => (object)$unlockedMap,
                'byCategory' => (object)($resolved['byCategory'] ?? []),
                'byCard' => (object)($resolved['byCard'] ?? []),
            ];
        }

        if ($requestedSrc !== $nextLockedSrc || ($requestedIdx !== null && $requestedIdx !== $nextLockedIdx)) {
            $resolved = snapshift_unlock_action_response_state($pdo, $uid, $categoryId, $items);
            $pdo->commit();
            return [
                'ok' => false,
                'loggedIn' => true,
                'error_code' => 'not_next_unlock',
                'msg' => sprintf('Unlock puzzle #%d first.', $nextLockedIdx + 1),
                'points' => $pointsNow,
                'unlockCost' => snapshift_unlock_cost_for_index($nextLockedIdx),
                'nextLockedIdx' => $nextLockedIdx,
                'nextLockedSrc' => $nextLockedSrc,
                'unlocked' => (object)$unlockedMap,
                'byCategory' => (object)($resolved['byCategory'] ?? []),
                'byCard' => (object)($resolved['byCard'] ?? []),
            ];
        }

        $cost = snapshift_unlock_cost_for_index($nextLockedIdx);
        if ($pointsNow < $cost) {
            $resolved = snapshift_unlock_action_response_state($pdo, $uid, $categoryId, $items);
            $pdo->commit();
            return [
                'ok' => false,
                'loggedIn' => true,
                'error_code' => 'insufficient_points',
                'msg' => sprintf('You need %d more points to unlock this puzzle.', max(0, $cost - $pointsNow)),
                'points' => $pointsNow,
                'unlockCost' => $cost,
                'nextLockedIdx' => $nextLockedIdx,
                'nextLockedSrc' => $nextLockedSrc,
                'unlocked' => (object)$unlockedMap,
                'byCategory' => (object)($resolved['byCategory'] ?? []),
                'byCard' => (object)($resolved['byCard'] ?? []),
            ];
        }

        $newSet = $unlockState['set'];
        $newSet[$nextLockedSrc] = true;
        $newUnlockedSrcs = [];
        foreach ($unlockState['orderedSrcs'] as $src) {
            if (isset($newSet[$src])) $newUnlockedSrcs[] = $src;
        }

        $unlockedMap[$categoryId] = [
            'version' => 2,
            'unlockedSrcs' => array_values($newUnlockedSrcs),
            'updatedAt' => gmdate('c'),
        ];

        $newPoints = max(0, $pointsNow - $cost);
        $json = json_encode($unlockedMap, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('json_encode_failed');
        }

        $update = $pdo->prepare("UPDATE user_state SET points = ?, unlocked_json = ? WHERE user_id = ?");
        $update->execute([$newPoints, $json, $uid]);

        snapshift_unlock_action_record_ledger(
            $pdo,
            $uid,
            -$cost,
            $newPoints,
            $categoryId,
            $nextLockedIdx,
            $requestedSrcRaw !== '' ? $requestedSrcRaw : $nextLockedSrc,
            $cost
        );

        $resolved = snapshift_unlock_action_response_state($pdo, $uid, $categoryId, $items);
        $pdo->commit();

        return [
            'ok' => true,
            'loggedIn' => true,
            'points' => $newPoints,
            'unlockCost' => $cost,
            'categoryId' => $categoryId,
            'puzzleIdx' => $nextLockedIdx,
            'puzzleSrc' => $requestedSrcRaw !== '' ? $requestedSrcRaw : $nextLockedSrc,
            'unlocked' => (object)$unlockedMap,
            'byCategory' => (object)($resolved['byCategory'] ?? []),
            'byCard' => (object)($resolved['byCard'] ?? []),
        ];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('puzzle_unlock_action_apply failed for uid=' . $uid
            . ' category=' . $categoryId
            . ' requested_idx=' . (string)($requestedIdx ?? '')
            . ' requested_src=' . $requestedSrc
            . ' message=' . $e->getMessage()
            . ' at ' . $e->getFile() . ':' . $e->getLine());
        throw $e;
    }
}
