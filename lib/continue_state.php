<?php
declare(strict_types=1);

require_once __DIR__ . '/auth_core.php';
require_once __DIR__ . '/state_core.php';
require_once __DIR__ . '/puzzle_unlock_state.php';
require_once __DIR__ . '/puzzle_completion_summary.php';

function snapshift_continue_normalize_progress_title(array $progress): string {
    $name = trim((string)($progress['puzzleName'] ?? ''));
    if ($name !== '') return $name;
    if (!empty($progress['isDaily'])) return 'Daily Challenge';
    $category = trim((string)($progress['categoryId'] ?? ''));
    return $category !== '' ? ucfirst($category) . ' puzzle' : 'Saved puzzle';
}

function snapshift_continue_difficulty_label(?string $diffKey): string {
    $key = strtolower(trim((string)$diffKey));
    if ($key === 'hard') return 'Hard';
    if ($key === 'medium') return 'Medium';
    return 'Easy';
}

function snapshift_continue_relative_time(?string $value): string {
    $raw = trim((string)$value);
    if ($raw === '') return '';
    try {
        $savedAt = new DateTimeImmutable($raw);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $diffSeconds = max(0, $now->getTimestamp() - $savedAt->getTimestamp());
        $mins = (int)round($diffSeconds / 60);
        if ($mins < 1) return 'saved just now';
        if ($mins < 60) return 'saved ' . $mins . ' min ago';
        $hours = (int)round($mins / 60);
        if ($hours < 24) return 'saved ' . $hours . ' hr ago';
        $days = (int)round($hours / 24);
        if ($days < 7) return 'saved ' . $days . ' day' . ($days === 1 ? '' : 's') . ' ago';
        return 'saved ' . $savedAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d');
    } catch (Throwable $e) {
        return '';
    }
}

function snapshift_continue_tiles_look_solved(array $progress): bool {
    $tileSets = [
        $progress['tiles'] ?? null,
        $progress['order'] ?? null,
        $progress['tileOrder'] ?? null,
    ];

    foreach ($tileSets as $tiles) {
        if (!is_array($tiles) || !$tiles) continue;
        $isIdentity = true;
        foreach (array_values($tiles) as $idx => $value) {
            if ((int)$value !== (int)$idx) {
                $isIdentity = false;
                break;
            }
        }
        if ($isIdentity) return true;
    }

    $locked = $progress['locked'] ?? null;
    if (is_array($locked) && $locked) {
        $allLocked = true;
        foreach ($locked as $value) {
            if (!$value) {
                $allLocked = false;
                break;
            }
        }
        if ($allLocked) return true;
    }

    return false;
}

function snapshift_continue_progress_has_resume_state(array $progress): bool {
    $summary = snapshift_state_extract_summary_from_payload($progress);
    if (!empty($summary['completed'])) return false;
    if (!empty($summary['completedAt'] ?? null)) return false;
    if (snapshift_continue_tiles_look_solved($progress)) return false;
    if ((int)($summary['moves'] ?? 0) > 0) return true;
    if ((int)($summary['elapsedMs'] ?? 0) > 0) return true;
    if ((int)($summary['scoreValue'] ?? 0) > 0) return true;
    if (!empty($progress['saveSeq']) || !empty($progress['swapCount']) || !empty($progress['hintCount'])) return true;

    $tileSets = [$progress['tiles'] ?? null, $progress['order'] ?? null, $progress['tileOrder'] ?? null];
    foreach ($tileSets as $tiles) {
        if (!is_array($tiles) || !$tiles) continue;
        return true;
    }

    return false;
}

function snapshift_continue_catalog_path(): string {
    return dirname(__DIR__) . '/puzzles/index.json';
}

function snapshift_continue_public_root(): string {
    return dirname(__DIR__);
}

function snapshift_continue_src_exists(string $src): bool {
    $raw = trim((string)$src);
    if ($raw === '') return false;
    if (str_contains($raw, '..')) return false;

    $fullPath = snapshift_continue_public_root() . '/' . str_replace('/', DIRECTORY_SEPARATOR, $raw);
    return is_file($fullPath);
}

function snapshift_continue_load_catalog_categories(): array {
    static $cache = null;
    if (is_array($cache)) return $cache;

    $path = snapshift_continue_catalog_path();
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
    $categories = (is_array($decoded) && isset($decoded['categories']) && is_array($decoded['categories']))
        ? $decoded['categories']
        : [];

    $clean = [];
    foreach ($categories as $catId => $items) {
        $normalizedCat = snapshift_unlock_normalize_cat_id((string)$catId);
        if ($normalizedCat === '' || !is_array($items)) continue;
        $clean[$normalizedCat] = array_values(array_filter($items, static fn($item) => is_array($item)));
    }

    $cache = $clean;
    return $cache;
}

function snapshift_continue_category_label(string $categoryId): string {
    $key = snapshift_unlock_normalize_cat_id($categoryId);
    if ($key === '') return 'Puzzle';
    if ($key === 'scifi') return 'SciFi';

    $parts = preg_split('/[_-]+/', $key) ?: [];
    $parts = array_values(array_filter(array_map(static fn($part) => ucfirst(trim((string)$part)), $parts)));
    return $parts ? implode(' ', $parts) : 'Puzzle';
}

function snapshift_continue_enrich_progress_from_catalog(array $progress, array $catalog): array {
    $categoryId = snapshift_unlock_normalize_cat_id((string)($progress['categoryId'] ?? ''));
    $puzzleSrc = snapshift_unlock_normalize_src((string)($progress['puzzleSrc'] ?? ''));
    if ($categoryId === '' || $puzzleSrc === '') {
        return $progress;
    }

    $items = $catalog[$categoryId] ?? null;
    if (!is_array($items) || !$items) {
        return $progress;
    }

    foreach (array_values($items) as $idx => $item) {
        if (!is_array($item)) continue;
        $itemSrc = snapshift_unlock_normalize_src((string)($item['src'] ?? ''));
        if ($itemSrc === '' || $itemSrc !== $puzzleSrc) continue;

        $progress['categoryId'] = $categoryId;
        $progress['puzzleSrc'] = (string)($item['src'] ?? $progress['puzzleSrc'] ?? '');
        $progress['puzzleName'] = trim((string)($item['name'] ?? '')) ?: (string)($progress['puzzleName'] ?? '');
        $progress['puzzleIdx'] = max(0, (int)($item['puzzleIdx'] ?? $idx));
        return $progress;
    }

    return $progress;
}

function snapshift_continue_progress_is_unlocked(array $progress, array $catalog, array $unlockedMap): bool {
    if (!empty($progress['isDaily'])) return true;

    $categoryId = snapshift_unlock_normalize_cat_id((string)($progress['categoryId'] ?? ''));
    $puzzleSrcRaw = (string)($progress['puzzleSrc'] ?? '');
    $puzzleSrc = snapshift_unlock_normalize_src($puzzleSrcRaw);
    if ($categoryId === '' || $puzzleSrc === '') return false;
    if (!snapshift_continue_src_exists($puzzleSrcRaw)) return false;

    $items = $catalog[$categoryId] ?? null;
    if (!is_array($items) || !$items) return false;

    $unlockState = snapshift_build_unlock_state($unlockedMap, $categoryId, $items);
    $unlockedSet = is_array($unlockState['set'] ?? null) ? $unlockState['set'] : [];
    return isset($unlockedSet[$puzzleSrc]);
}

function snapshift_continue_catalog_item_is_completed(array $completionByKey, string $categoryId, int $puzzleIdx, string $puzzleSrc): bool {
    $normalizedSrc = snapshift_unlock_normalize_src($puzzleSrc);
    if ($normalizedSrc !== '') {
        $srcCompletion = $completionByKey['src:' . $normalizedSrc] ?? null;
        if (is_array($srcCompletion) && !empty($srcCompletion['completed'])) {
            return true;
        }
    }

    $normalizedCat = snapshift_unlock_normalize_cat_id($categoryId);
    if ($normalizedCat !== '' && $puzzleIdx >= 0) {
        $idxCompletion = $completionByKey['idx:' . $normalizedCat . ':' . $puzzleIdx] ?? null;
        if (is_array($idxCompletion) && !empty($idxCompletion['completed'])) {
            return true;
        }
    }

    return false;
}

function snapshift_continue_select_progress(PDO $pdo, int $uid, string $targetDailyDay): ?array {
    snapshift_state_ensure_tables($pdo);
    $catalog = snapshift_continue_load_catalog_categories();
    $unlockedMap = snapshift_fetch_unlocks($pdo, $uid);

    $st = $pdo->prepare(
        'SELECT * FROM user_puzzle_progress
         WHERE user_id = ?
           AND completed = 0
         ORDER BY updated_at DESC, progress_key DESC
         LIMIT 20'
    );
    $st->execute([$uid]);

    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $decoded = snapshift_state_decode_row(is_array($row) ? $row : null, $targetDailyDay);
        if (!is_array($decoded)) continue;
        $decoded = snapshift_continue_enrich_progress_from_catalog($decoded, $catalog);
        if (!snapshift_state_progress_matches_scope($decoded, null, $targetDailyDay, null, null, null, null)) continue;
        if (!snapshift_continue_progress_has_resume_state($decoded)) continue;
        if (!snapshift_continue_progress_is_unlocked($decoded, $catalog, $unlockedMap)) continue;
        return $decoded;
    }

    return null;
}

function snapshift_continue_select_next_unplayed(PDO $pdo, int $uid): ?array {
    $categories = snapshift_continue_load_catalog_categories();
    if (!$categories) return null;

    $unlockedMap = snapshift_fetch_unlocks($pdo, $uid);
    $completionByKey = snapshift_puzzle_summary_best_by_key($pdo, $uid);

    foreach ($categories as $catId => $items) {
        if (!$items) continue;

        $unlockState = snapshift_build_unlock_state($unlockedMap, $catId, $items);
        $unlockedSet = is_array($unlockState['set'] ?? null) ? $unlockState['set'] : [];

        foreach (array_values($items) as $idx => $item) {
            $itemSrcRaw = (string)($item['src'] ?? '');
            $normalizedSrc = snapshift_unlock_normalize_src((string)($item['src'] ?? ''));
            if ($normalizedSrc === '' || !isset($unlockedSet[$normalizedSrc])) continue;
            if (!snapshift_continue_src_exists($itemSrcRaw)) continue;

            $puzzleIdx = max(0, (int)($item['puzzleIdx'] ?? $idx));
            if (snapshift_continue_catalog_item_is_completed($completionByKey, $catId, $puzzleIdx, $itemSrcRaw)) continue;

            $name = trim((string)($item['name'] ?? '')) ?: 'Puzzle';
            return [
                'categoryId' => $catId,
                'categoryLabel' => snapshift_continue_category_label($catId),
                'puzzleIdx' => $puzzleIdx,
                'puzzleSrc' => (string)($item['src'] ?? ''),
                'puzzleName' => $name,
                'title' => $name,
            ];
        }
    }

    return null;
}

function snapshift_continue_state_build_ui(?array $progress, ?array $nextPuzzle = null): array {
    if ($progress) {
        $main = !empty($progress['isDaily'])
            ? 'Resume Daily'
            : ('Continue ' . snapshift_continue_difficulty_label((string)($progress['diffKey'] ?? 'easy')));
        $title = snapshift_continue_normalize_progress_title($progress);
        $when = snapshift_continue_relative_time((string)($progress['updatedAt'] ?? ($progress['savedAt'] ?? '')));
        $subParts = [$title];
        if ($when !== '') $subParts[] = $when;

        return [
            'action' => 'resume_latest',
            'main_label' => $main,
            'sub_label' => implode(' · ', array_filter($subParts, static fn($v) => trim((string)$v) !== '')),
            'title' => $title !== '' ? $title : 'Continue your unfinished puzzle',
        ];
    }

    if ($nextPuzzle) {
        $puzzleName = trim((string)($nextPuzzle['puzzleName'] ?? '')) ?: 'Next puzzle';
        $categoryLabel = trim((string)($nextPuzzle['categoryLabel'] ?? '')) ?: 'Unlocked puzzle';
        return [
            'action' => 'play_next',
            'main_label' => 'Play Next',
            'sub_label' => $puzzleName . ' · ' . $categoryLabel,
            'title' => 'Open your next unlocked puzzle',
        ];
    }

    return [
        'action' => 'none',
        'main_label' => 'Browse Puzzles',
        'sub_label' => 'No unfinished puzzle to resume',
        'title' => 'Choose a category to keep playing',
    ];
}

function snapshift_continue_state_resolve(PDO $pdo, ?array $user): array {
    $state = [
        'ok' => true,
        'loggedIn' => false,
        'continue_state' => [
            'has_progress' => false,
            'progress' => null,
            'target' => null,
            'ui' => snapshift_continue_state_build_ui(null, null),
        ],
    ];

    if (!$user) {
        return $state;
    }

    $uid = (int)($user['id'] ?? 0);
    if ($uid <= 0) {
        return $state;
    }

    $progress = snapshift_continue_select_progress($pdo, $uid, snapshift_state_today_utc());
    $nextPuzzle = !$progress ? snapshift_continue_select_next_unplayed($pdo, $uid) : null;

    $state['loggedIn'] = true;
    $state['continue_state'] = [
        'has_progress' => is_array($progress),
        'progress' => $progress,
        'target' => $nextPuzzle,
        'ui' => snapshift_continue_state_build_ui($progress, $nextPuzzle),
    ];

    return $state;
}
