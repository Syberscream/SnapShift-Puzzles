<?php
declare(strict_types=1);

function snapshift_unlock_normalize_cat_id(string $catId): string {
    $key = preg_replace('/[^a-z0-9_-]/i', '', strtolower(trim($catId)));
    return is_string($key) ? $key : '';
}

function snapshift_unlock_normalize_src(string $src): string {
    $v = trim($src);
    if ($v === '') return '';
    $decoded = rawurldecode($v);
    $decoded = str_replace('\\', '/', $decoded);
    $decoded = preg_replace('#^\./+#', '', $decoded);
    $decoded = preg_replace('#^/+#', '', $decoded);
    return strtolower((string)$decoded);
}

function snapshift_unlock_clean_record($value): ?array {
    if (!is_array($value)) return null;
    $srcs = $value['unlockedSrcs'] ?? null;
    if (!is_array($srcs)) return null;

    $seen = [];
    $cleanSrcs = [];
    foreach ($srcs as $src) {
        if (!is_string($src)) continue;
        $key = snapshift_unlock_normalize_src($src);
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $cleanSrcs[] = $key;
    }

    return [
        'version' => 2,
        'unlockedSrcs' => array_values($cleanSrcs),
        'updatedAt' => isset($value['updatedAt']) && is_string($value['updatedAt']) ? trim($value['updatedAt']) : '',
    ];
}

function snapshift_unlock_clean_map($value): array {
    if (!is_array($value)) return [];

    $clean = [];
    foreach ($value as $catId => $record) {
        $key = snapshift_unlock_normalize_cat_id((string)$catId);
        if ($key === '') continue;
        $cleanRecord = snapshift_unlock_clean_record($record);
        if ($cleanRecord === null) continue;
        $clean[$key] = $cleanRecord;
    }

    ksort($clean);
    return $clean;
}

function snapshift_fetch_unlocks(PDO $pdo, int $uid): array {
    $pdo->prepare(
        "INSERT INTO user_state (user_id, points, unlocked_json)
         VALUES (?, 0, '{}')
         ON DUPLICATE KEY UPDATE user_id = user_id"
    )->execute([$uid]);

    $st = $pdo->prepare("SELECT unlocked_json FROM user_state WHERE user_id = ? LIMIT 1");
    $st->execute([$uid]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: ['unlocked_json' => '{}'];

    $decoded = json_decode((string)($row['unlocked_json'] ?? '{}'), true);
    if (!is_array($decoded)) return [];

    return snapshift_unlock_clean_map($decoded);
}

function snapshift_build_unlock_state(array $unlockedMap, string $categoryId, array $items): array {
    $catId = snapshift_unlock_normalize_cat_id($categoryId);
    $raw = $unlockedMap[$catId] ?? null;
    $incoming = (is_array($raw) && isset($raw['unlockedSrcs']) && is_array($raw['unlockedSrcs']))
        ? $raw['unlockedSrcs']
        : [];

    $orderedSrcs = [];
    foreach ($items as $item) {
        if (is_array($item)) {
            $src = snapshift_unlock_normalize_src((string)($item['src'] ?? ''));
        } else {
            $src = snapshift_unlock_normalize_src((string)$item);
        }
        if ($src !== '') $orderedSrcs[] = $src;
    }

    $out = [];
    $seen = [];
    foreach ($incoming as $src) {
        $key = snapshift_unlock_normalize_src((string)$src);
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $out[] = $key;
    }

    $firstSrc = $orderedSrcs[0] ?? '';
    if ($firstSrc !== '' && !isset($seen[$firstSrc])) {
        array_unshift($out, $firstSrc);
        $seen[$firstSrc] = true;
    }

    $set = [];
    foreach ($out as $src) $set[$src] = true;

    $nextLockedIdx = count($orderedSrcs);
    $nextLockedSrc = '';
    foreach ($orderedSrcs as $idx => $src) {
        if (!isset($set[$src])) {
            $nextLockedIdx = $idx;
            $nextLockedSrc = $src;
            break;
        }
    }

    return [
        'categoryId' => $catId,
        'record' => [
            'version' => 2,
            'unlockedSrcs' => array_values($out),
            'updatedAt' => (is_array($raw) && is_string($raw['updatedAt'] ?? null)) ? trim((string)$raw['updatedAt']) : '',
        ],
        'set' => $set,
        'orderedSrcs' => $orderedSrcs,
        'unlockedCount' => count($set) ?: (count($orderedSrcs) ? 1 : 0),
        'totalCount' => count($orderedSrcs),
        'nextLockedIdx' => $nextLockedIdx,
        'nextLockedSrc' => $nextLockedSrc,
    ];
}

function snapshift_unlock_cost_for_index(int $nextIdx): int {
    return max(0, (int)floor(60 + (25 * max(0, $nextIdx))));
}
