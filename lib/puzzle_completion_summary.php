<?php
declare(strict_types=1);

require_once __DIR__ . '/state_core.php';

function snapshift_puzzle_summary_normalize_diff_key(string $diffKey): string {
    $key = strtolower(trim($diffKey));
    if ($key === 'hard') return 'hard';
    if ($key === 'medium') return 'medium';
    return 'easy';
}

function snapshift_puzzle_summary_diff_label(string $diffKey): string {
    $key = snapshift_puzzle_summary_normalize_diff_key($diffKey);
    if ($key === 'hard') return 'Hard';
    if ($key === 'medium') return 'Medium';
    return 'Easy';
}

function snapshift_puzzle_summary_medal_key(array $progress): ?string {
    $medal = strtolower(trim((string)($progress['medal'] ?? $progress['medalKey'] ?? '')));
    if (in_array($medal, ['gold', 'silver', 'bronze'], true)) return $medal;

    $stars = (int)($progress['stars'] ?? 0);
    if ($stars >= 3) return 'gold';
    if ($stars === 2) return 'silver';
    if ($stars === 1) return 'bronze';
    return null;
}

function snapshift_puzzle_summary_rank(array $progress): int {
    $diff = snapshift_puzzle_summary_normalize_diff_key((string)($progress['diffKey'] ?? 'easy'));
    $diffWeight = ($diff === 'hard') ? 30 : (($diff === 'medium') ? 20 : 10);
    $stars = (int)($progress['stars'] ?? 0);
    $scorePct = (int)round((float)($progress['scorePct'] ?? $progress['score_pct'] ?? 0));
    $completed = !empty($progress['completed']) ? 1000 : 0;
    return $completed + $diffWeight + ($stars * 3) + $scorePct;
}

function snapshift_puzzle_summary_key(array $progress): ?string {
    $src = snapshift_state_normalize_src((string)($progress['puzzleSrc'] ?? ''));
    $diff = snapshift_puzzle_summary_normalize_diff_key((string)($progress['diffKey'] ?? 'easy'));
    if ($src !== '') {
        return 'src:' . $src . ':' . $diff;
    }
    $cat = preg_replace('/[^a-z0-9_-]/i', '', (string)($progress['categoryId'] ?? ''));
    $idx = isset($progress['puzzleIdx']) ? (int)$progress['puzzleIdx'] : -1;
    if ($cat !== '' && $idx >= 0) {
        return 'idx:' . strtolower($cat) . ':' . $idx . ':' . $diff;
    }
    return null;
}

function snapshift_puzzle_summary_shape(array $progress): array {
    $diff = snapshift_puzzle_summary_normalize_diff_key((string)($progress['diffKey'] ?? 'easy'));
    $fallback = ($diff === 'hard')
        ? ['rows' => 8, 'cols' => 12]
        : (($diff === 'medium') ? ['rows' => 6, 'cols' => 9] : ['rows' => 4, 'cols' => 6]);

    $rows = max(1, (int)($progress['rows'] ?? 0) ?: $fallback['rows']);
    $cols = max(1, (int)($progress['cols'] ?? 0) ?: $fallback['cols']);
    return ['rows' => $rows, 'cols' => $cols, 'total' => $rows * $cols];
}

function snapshift_puzzle_summary_rating(array $progress): array {
    $medalRaw = strtolower(trim((string)($progress['medal'] ?? $progress['medalKey'] ?? '')));
    $stars = max(0, (int)($progress['stars'] ?? 0));
    $label = '';
    $key = '';

    if (in_array($medalRaw, ['gold', '3', 'three'], true)) {
        $stars = max($stars, 3);
        $label = 'Gold';
        $key = 'gold';
    } elseif (in_array($medalRaw, ['silver', '2', 'two'], true)) {
        $stars = max($stars, 2);
        $label = 'Silver';
        $key = 'silver';
    } elseif (in_array($medalRaw, ['bronze', '1', 'one'], true)) {
        $stars = max($stars, 1);
        $label = 'Bronze';
        $key = 'bronze';
    }

    if ($label === '') {
        if ($stars >= 3) {
            $stars = 3;
            $label = 'Gold';
            $key = 'gold';
        } elseif ($stars === 2) {
            $label = 'Silver';
            $key = 'silver';
        } elseif ($stars === 1) {
            $label = 'Bronze';
            $key = 'bronze';
        }
    }

    if ($label !== '') {
        return [
            'stars' => $stars,
            'label' => $label,
            'key' => $key,
            'scorePct' => max(0, (int)($progress['scorePct'] ?? $progress['score_pct'] ?? 0)),
            'moveEffPct' => max(0, (int)($progress['moveEffPct'] ?? $progress['move_eff_pct'] ?? 0)),
            'speedEffPct' => max(0, (int)($progress['speedEffPct'] ?? $progress['speed_eff_pct'] ?? 0)),
        ];
    }

    $shape = snapshift_puzzle_summary_shape($progress);
    $diff = strtolower(trim((string)($progress['diffKey'] ?? 'easy')));
    $total = max(1, (int)$shape['total']);
    $moves = max($total, (int)($progress['movesMade'] ?? 0) ?: $total);
    $elapsedMs = max(1000, (int)($progress['elapsedMs'] ?? 0) ?: ($total * 7000));
    $parPerTileMs = ($diff === 'hard') ? 8000 : (($diff === 'medium') ? 6800 : 5600);
    $moveEff = min(1, $total / max(1, $moves));
    $speedEff = min(1, ($total * $parPerTileMs) / max(1, $elapsedMs));
    $score = max(0, min(1, ($moveEff * 0.72) + ($speedEff * 0.28)));

    $stars = 1;
    $label = 'Bronze';
    $key = 'bronze';
    if ($score >= 0.90) {
        $stars = 3;
        $label = 'Gold';
        $key = 'gold';
    } elseif ($score >= 0.76) {
        $stars = 2;
        $label = 'Silver';
        $key = 'silver';
    }

    return [
        'stars' => $stars,
        'label' => $label,
        'key' => $key,
        'scorePct' => (int)round($score * 100),
        'moveEffPct' => (int)round($moveEff * 100),
        'speedEffPct' => (int)round($speedEff * 100),
    ];
}

function snapshift_puzzle_summary_badge(array $progress, array $rating): array {
    $diffKey = snapshift_puzzle_summary_normalize_diff_key((string)($progress['diffKey'] ?? 'easy'));
    $diffLabel = snapshift_puzzle_summary_diff_label($diffKey);
    $medalLabel = (string)($rating['label'] ?? '');
    $stars = max(0, (int)($rating['stars'] ?? 0));
    $scorePct = max(0, (int)($rating['scorePct'] ?? 0));

    return [
        'completedLabel' => 'Completed',
        'diffLabel' => $diffLabel,
        'completedTitle' => 'Completed (' . $diffLabel . ')',
        'medalLabel' => $medalLabel,
        'medalKey' => strtolower(trim((string)($rating['key'] ?? ''))),
        'medalTitle' => $medalLabel !== ''
            ? ($medalLabel . ' - ' . $stars . ' star' . ($stars === 1 ? '' : 's') . ' - ' . $scorePct . '% performance')
            : '',
    ];
}

function snapshift_puzzle_summary_normalize(array $decoded): array {
    $diffKey = snapshift_puzzle_summary_normalize_diff_key((string)($decoded['diffKey'] ?? 'easy'));
    $medalKey = snapshift_puzzle_summary_medal_key($decoded);
    $rating = snapshift_puzzle_summary_rating($decoded);

    return [
        'completed' => true,
        'categoryId' => (string)($decoded['categoryId'] ?? ''),
        'puzzleIdx' => array_key_exists('puzzleIdx', $decoded) ? (int)$decoded['puzzleIdx'] : null,
        'puzzleSrc' => (string)($decoded['puzzleSrc'] ?? ''),
        'diffKey' => $diffKey,
        'diffLabel' => snapshift_puzzle_summary_diff_label($diffKey),
        'stars' => (int)($decoded['stars'] ?? 0),
        'medal' => $medalKey,
        'medalKey' => $medalKey,
        'scorePct' => (float)($decoded['scorePct'] ?? $decoded['score_pct'] ?? 0),
        'moveEffPct' => (int)($decoded['moveEffPct'] ?? $decoded['move_eff_pct'] ?? 0),
        'speedEffPct' => (int)($decoded['speedEffPct'] ?? $decoded['speed_eff_pct'] ?? 0),
        'rows' => isset($decoded['rows']) ? (int)$decoded['rows'] : null,
        'cols' => isset($decoded['cols']) ? (int)$decoded['cols'] : null,
        'updatedAt' => (string)($decoded['updatedAt'] ?? ''),
        'completedAt' => (string)($decoded['completedAt'] ?? ''),
        'rating' => $rating,
        'badge' => snapshift_puzzle_summary_badge($decoded, $rating),
    ];
}

function snapshift_puzzle_summary_best_by_key(PDO $pdo, int $uid): array {
    snapshift_state_ensure_tables($pdo);

    $stmt = $pdo->prepare(
        'SELECT *
           FROM user_puzzle_progress
          WHERE user_id = ?
            AND is_daily = 0
          ORDER BY updated_at DESC'
    );
    $stmt->execute([$uid]);

    $todayUtc = function_exists('snapshift_state_today_utc')
        ? snapshift_state_today_utc()
        : gmdate('Y-m-d');

    $bestByKey = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $decoded = snapshift_state_decode_row($row ?: null, $todayUtc);
        if (!is_array($decoded) || empty($decoded['completed'])) {
            continue;
        }

        $key = snapshift_puzzle_summary_key($decoded);
        if ($key === null) continue;

        $rank = snapshift_puzzle_summary_rank($decoded);
        if (!isset($bestByKey[$key]) || $rank > (int)$bestByKey[$key]['__rank']) {
            $bestByKey[$key] = ['__rank' => $rank] + snapshift_puzzle_summary_normalize($decoded);
        }
    }

    foreach ($bestByKey as $key => $value) {
        unset($bestByKey[$key]['__rank']);
    }

    return $bestByKey;
}
