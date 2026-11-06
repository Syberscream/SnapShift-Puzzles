<?php
declare(strict_types=1);

require_once __DIR__ . '/puzzle_unlock_state.php';
require_once __DIR__ . '/puzzle_completion_summary.php';

function snapshift_puzzle_card_key(string $categoryId, int $puzzleIdx, string $puzzleSrc): string {
    $src = snapshift_unlock_normalize_src($puzzleSrc);
    if ($src !== '') return 'src:' . $src;
    return 'idx:' . snapshift_unlock_normalize_cat_id($categoryId) . ':' . max(0, $puzzleIdx);
}

function snapshift_puzzle_card_completion_rank(array $completion): int {
    if (empty($completion['completed'])) return -1;
    $diff = snapshift_puzzle_summary_normalize_diff_key((string)($completion['diffKey'] ?? 'easy'));
    $diffWeight = ($diff === 'hard') ? 30 : (($diff === 'medium') ? 20 : 10);
    $rating = $completion['rating'] ?? null;
    $stars = is_array($rating)
        ? (int)($rating['stars'] ?? 0)
        : (int)($completion['stars'] ?? 0);
    return $diffWeight + $stars;
}

function snapshift_puzzle_card_best_completion(array $completionByKey, string $categoryId, int $puzzleIdx, string $puzzleSrc): ?array {
    $catId = snapshift_unlock_normalize_cat_id($categoryId);
    $idx = max(0, $puzzleIdx);
    $src = snapshift_unlock_normalize_src($puzzleSrc);
    $best = null;
    $bestRank = PHP_INT_MIN;

    foreach (['hard', 'medium', 'easy'] as $diffKey) {
        $completionKey = ($src !== '')
            ? ('src:' . $src . ':' . $diffKey)
            : ('idx:' . $catId . ':' . $idx . ':' . $diffKey);
        $completion = $completionByKey[$completionKey] ?? null;
        if (!is_array($completion) || empty($completion['completed'])) continue;

        $rank = snapshift_puzzle_card_completion_rank($completion);
        if ($best === null || $rank > $bestRank) {
            $best = $completion;
            $bestRank = $rank;
        }
    }

    return $best;
}

function snapshift_puzzle_card_completion_by_diff(array $completionByKey, string $categoryId, int $puzzleIdx, string $puzzleSrc): array {
    $catId = snapshift_unlock_normalize_cat_id($categoryId);
    $idx = max(0, $puzzleIdx);
    $src = snapshift_unlock_normalize_src($puzzleSrc);
    $out = [];

    foreach (['easy', 'medium', 'hard'] as $diffKey) {
        $completionKey = ($src !== '')
            ? ('src:' . $src . ':' . $diffKey)
            : ('idx:' . $catId . ':' . $idx . ':' . $diffKey);
        $completion = $completionByKey[$completionKey] ?? null;
        if (is_array($completion) && !empty($completion['completed'])) {
            $out[$diffKey] = $completion;
        }
    }

    return $out;
}

function snapshift_puzzle_card_trifecta_summary(array $completionByKey, string $categoryId, int $puzzleIdx, string $puzzleSrc): array {
    $completionByDiff = snapshift_puzzle_card_completion_by_diff($completionByKey, $categoryId, $puzzleIdx, $puzzleSrc);
    $completedDiffs = [];
    foreach (['easy', 'medium', 'hard'] as $diffKey) {
        if (isset($completionByDiff[$diffKey])) $completedDiffs[] = $diffKey;
    }

    return [
        'completed' => count($completedDiffs) === 3,
        'completedDiffs' => $completedDiffs,
        'missingDiffs' => array_values(array_diff(['easy', 'medium', 'hard'], $completedDiffs)),
    ];
}

function snapshift_puzzle_card_state_resolve(PDO $pdo, int $uid, array $categories, array $cards): array {
    $unlockedMap = snapshift_fetch_unlocks($pdo, $uid);
    $completionByKey = snapshift_puzzle_summary_best_by_key($pdo, $uid);

    $byCategory = [];
    foreach ($categories as $rawCatId => $items) {
        $catId = snapshift_unlock_normalize_cat_id((string)$rawCatId);
        if ($catId === '') continue;
        $state = snapshift_build_unlock_state($unlockedMap, $catId, is_array($items) ? $items : []);
        $byCategory[$catId] = [
            'categoryId' => $catId,
            'unlockedCount' => (int)$state['unlockedCount'],
            'totalCount' => (int)$state['totalCount'],
            'nextLockedIdx' => (int)$state['nextLockedIdx'],
            'nextLockedSrc' => (string)$state['nextLockedSrc'],
            'unlockCost' => ($state['nextLockedIdx'] < $state['totalCount'])
                ? snapshift_unlock_cost_for_index((int)$state['nextLockedIdx'])
                : 0,
        ];
    }

    $byCard = [];
    foreach ($cards as $card) {
        if (!is_array($card)) continue;
        $catId = snapshift_unlock_normalize_cat_id((string)($card['categoryId'] ?? $card['catId'] ?? ''));
        if ($catId === '') continue;

        $idx = max(0, (int)($card['puzzleIdx'] ?? $card['index'] ?? 0));
        $src = snapshift_unlock_normalize_src((string)($card['puzzleSrc'] ?? $card['src'] ?? ''));
        $cardKey = snapshift_puzzle_card_key($catId, $idx, $src);

        $catState = $byCategory[$catId] ?? [
            'categoryId' => $catId,
            'unlockedCount' => 0,
            'totalCount' => 0,
            'nextLockedIdx' => 0,
            'nextLockedSrc' => '',
            'unlockCost' => 0,
        ];
        $unlockState = snapshift_build_unlock_state($unlockedMap, $catId, $categories[$catId] ?? []);
        $unlocked = ($src !== '' && isset($unlockState['set'][$src]));
        $actionableUnlock = !$unlocked
            && $src !== ''
            && $src === (string)$unlockState['nextLockedSrc']
            && (int)$unlockState['nextLockedIdx'] < (int)$unlockState['totalCount'];

        $completion = snapshift_puzzle_card_best_completion($completionByKey, $catId, $idx, $src);
        $trifecta = snapshift_puzzle_card_trifecta_summary($completionByKey, $catId, $idx, $src);

        $byCard[$cardKey] = [
            'cardKey' => $cardKey,
            'categoryId' => $catId,
            'puzzleIdx' => $idx,
            'puzzleSrc' => $src,
            'unlocked' => $unlocked,
            'locked' => !$unlocked,
            'actionableUnlock' => $actionableUnlock,
            'unlockCost' => $actionableUnlock ? snapshift_unlock_cost_for_index((int)$unlockState['nextLockedIdx']) : 0,
            'nextLockedIdx' => (int)$unlockState['nextLockedIdx'],
            'completion' => is_array($completion) ? $completion : null,
            'trifecta' => $trifecta,
        ];
    }

    return [
        'byCategory' => $byCategory,
        'byCard' => $byCard,
    ];
}
