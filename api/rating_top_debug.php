<?php
declare(strict_types=1);
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/debug_gate.php';
pq_require_debug_access('json');

header('Content-Type: application/json; charset=utf-8');

function out(array $payload, int $status = 200): void {
    if (function_exists('pq_json')) pq_json($payload, $status);
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function truthy(mixed $value): bool {
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return ((int)$value) !== 0;
    $s = strtolower(trim((string)$value));
    return in_array($s, ['1','true','yes','y','on','completed','done','won','finished','success','solved'], true);
}

function parse_progress(?string $raw): ?array {
    if ($raw === null || $raw === '') return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function is_completed(array $progress): bool {
    foreach (['completed', 'isCompleted', 'finished', 'won', 'success', 'solved'] as $key) {
        if (array_key_exists($key, $progress) && truthy($progress[$key])) return true;
    }
    foreach (['medal', 'medalKey', 'ratingLabel', 'ratingKey'] as $key) {
        $raw = strtolower(trim((string)($progress[$key] ?? '')));
        if (in_array($raw, ['gold', 'silver', 'bronze'], true)) return true;
    }
    $stars = (int)($progress['stars'] ?? ($progress['ratingStars'] ?? 0));
    if ($stars > 0) return true;
    $tiles = $progress['tiles'] ?? null;
    if (!is_array($tiles) || !$tiles) return false;
    foreach ($tiles as $i => $tile) {
        if ((int)$tile !== (int)$i) return false;
    }
    return true;
}

function normalize_src(string $src): string {
    $src = trim($src);
    if ($src === '') return '';
    $decoded = rawurldecode($src);
    if ($decoded !== '') $src = $decoded;
    $src = str_replace('\\', '/', $src);
    $src = preg_replace('#^\./#', '', $src) ?? $src;
    $src = preg_replace('#^/+?#', '', $src) ?? $src;
    return strtolower($src);
}

function medal_from_progress(array $progress, array $row): array {
    $diff = strtolower((string)($progress['diffKey'] ?? ($row['diff_key'] ?? 'easy')));
    if (!in_array($diff, ['easy','medium','hard'], true)) $diff = 'easy';
    $fallback = ['easy'=>[4,6], 'medium'=>[6,9], 'hard'=>[8,12]];
    [$fr, $fc] = $fallback[$diff] ?? [4,6];
    $rows = max(1, (int)($progress['rows'] ?? $fr));
    $cols = max(1, (int)($progress['cols'] ?? $fc));
    $total = max(1, $rows * $cols);
    $moves = max($total, (int)($progress['movesMade'] ?? 0));
    $elapsed = max(1000, (int)($progress['elapsedMs'] ?? 0));
    if ($elapsed <= 0) $elapsed = $total * 7000;
    $parPerTile = $diff === 'hard' ? 8000 : ($diff === 'medium' ? 6800 : 5600);
    $moveEff = min(1.0, $total / max($total, $moves));
    $speedEff = min(1.0, ($total * $parPerTile) / max(1000, $elapsed));
    $score = max(0.0, min(1.0, ($moveEff * 0.72) + ($speedEff * 0.28)));
    $stars = 1; $medal = 'bronze';
    if ($score >= 0.90) { $stars = 3; $medal = 'gold'; }
    elseif ($score >= 0.76) { $stars = 2; $medal = 'silver'; }
    $srcKey = normalize_src((string)($progress['puzzleSrc'] ?? ($row['puzzle_src'] ?? '')));
    $catKey = strtolower(trim((string)($row['category_id'] ?? ($progress['categoryId'] ?? ''))));
    $puzzleIdx = isset($progress['puzzleIdx']) ? (int)$progress['puzzleIdx'] : (int)($row['puzzle_idx'] ?? -1);
    $progressKey = strtolower(trim((string)($progress['progressKey'] ?? ($row['progress_key'] ?? ''))));
    if ($srcKey !== '') $entryKey = sprintf('src:%s:%s', $srcKey, $diff);
    elseif ($catKey !== '' && $puzzleIdx >= 0) $entryKey = sprintf('idx:%s:%d:%s', $catKey, $puzzleIdx, $diff);
    elseif ($progressKey !== '') $entryKey = 'key:' . $progressKey;
    else $entryKey = sprintf('fallback:%s:%d:%s:%s', $catKey, $puzzleIdx, $diff, md5(json_encode($progress)));
    $ratingMap = ['easy'=>[1=>10,2=>20,3=>30], 'medium'=>[1=>20,2=>35,3=>50], 'hard'=>[1=>35,2=>55,3=>75]];
    return [
      'entry_key' => $entryKey,
      'diff_key' => $diff,
      'medal' => $medal,
      'stars' => $stars,
      'rating_points' => $ratingMap[$diff][$stars] ?? 0,
      'score_pct' => (int)round($score * 100),
      'updated_at' => (string)($row['updated_at'] ?? ''),
      'src' => $srcKey,
      'progress_key' => (string)($row['progress_key'] ?? ''),
      'category_id' => (string)($row['category_id'] ?? ''),
      'puzzle_idx' => (int)($row['puzzle_idx'] ?? -1),
    ];
}

try {
    $pdo = pq_pdo();
    $sql = "SELECT p.user_id, p.progress_key, p.category_id, p.puzzle_idx, p.puzzle_src, p.diff_key, p.is_daily, p.updated_at, p.progress_json,
                   COALESCE(NULLIF(u.username, ''), CONCAT('User ', p.user_id)) AS username
            FROM user_puzzle_progress p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.user_id IS NOT NULL AND p.user_id > 0
            ORDER BY p.user_id ASC, p.updated_at DESC";
    $st = $pdo->query($sql);
    $perUser = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $uid = (int)($row['user_id'] ?? 0);
        if ($uid <= 0) continue;
        $username = (string)($row['username'] ?? ('User '.$uid));
        $progress = parse_progress((string)($row['progress_json'] ?? ''));
        $reason = [];
        if ((int)($row['is_daily'] ?? 0) !== 0) $reason[] = 'row_is_daily';
        if ($progress && !empty($progress['isDaily'])) $reason[] = 'progress_is_daily';
        if (!$progress) $reason[] = 'bad_json';
        if ($progress && !is_completed($progress)) $reason[] = 'not_completed';
        $entry = (!$reason && $progress) ? medal_from_progress($progress, $row) : null;
        $perUser[$uid] ??= ['user_id'=>$uid,'username'=>$username,'raw_rows'=>0,'accepted'=>0,'daily_skipped'=>0,'incomplete_skipped'=>0,'bad_json'=>0,'entries'=>[]];
        $perUser[$uid]['raw_rows']++;
        if (in_array('row_is_daily', $reason, true) || in_array('progress_is_daily', $reason, true)) $perUser[$uid]['daily_skipped']++;
        if (in_array('not_completed', $reason, true)) $perUser[$uid]['incomplete_skipped']++;
        if (in_array('bad_json', $reason, true)) $perUser[$uid]['bad_json']++;
        if ($entry) {
            $perUser[$uid]['accepted']++;
            $existing = $perUser[$uid]['entries'][$entry['entry_key']] ?? null;
            if (!$existing || [$entry['rating_points'],$entry['score_pct'],$entry['updated_at']] > [$existing['rating_points'],$existing['score_pct'],$existing['updated_at']]) {
                $perUser[$uid]['entries'][$entry['entry_key']] = $entry;
            }
        }
    }
    foreach ($perUser as &$u) {
        $entries = array_values($u['entries']);
        usort($entries, fn($a,$b) => [$b['rating_points'],$b['stars'],$b['score_pct'],$b['updated_at']] <=> [$a['rating_points'],$a['stars'],$a['score_pct'],$a['updated_at']]);
        $u['distinct_completed'] = count($entries);
        $u['gold'] = count(array_filter($entries, fn($e)=>$e['medal']==='gold'));
        $u['silver'] = count(array_filter($entries, fn($e)=>$e['medal']==='silver'));
        $u['bronze'] = count(array_filter($entries, fn($e)=>$e['medal']==='bronze'));
        $u['sample_entries'] = array_slice($entries, 0, 20);
        unset($u['entries']);
    }
    unset($u);
    out(['ok'=>true,'users'=>array_values($perUser)]);
} catch (Throwable $e) {
    out(['ok'=>false,'error'=>$e->getMessage()],500);
}
