<?php
declare(strict_types=1);

function app_root(): string { return __DIR__; }
function daily_catalog_path(): string { return app_root() . DIRECTORY_SEPARATOR . 'daily_puzzles' . DIRECTORY_SEPARATOR . 'index.json'; }
function daily_history_path(): string { return app_root() . DIRECTORY_SEPARATOR . 'daily_puzzles' . DIRECTORY_SEPARATOR . 'history.json'; }
function theme_path(): string { return app_root() . DIRECTORY_SEPARATOR . 'theme.json'; }
function daily_timezone(): DateTimeZone { static $tz = null; if (!$tz) $tz = new DateTimeZone('America/Vancouver'); return $tz; }
function rollover_hour(): int { return 17; }
function rollover_minute(): int { return 0; }

function read_json_file(string $path): array {
  if (!is_file($path)) throw new RuntimeException("Missing file: {$path}");
  $raw = file_get_contents($path);
  if ($raw === false) throw new RuntimeException("Unable to read file: {$path}");
  $json = json_decode($raw, true);
  if (!is_array($json)) throw new RuntimeException("Invalid JSON in: {$path}");
  return $json;
}

function read_json_if_exists(string $path): array {
  if (!is_file($path)) return [];
  $raw = file_get_contents($path);
  if ($raw === false) return [];
  $json = json_decode($raw, true);
  return is_array($json) ? $json : [];
}

function write_json_file(string $path, array $data): void {
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($json === false) throw new RuntimeException('Unable to encode JSON output.');
  if (file_put_contents($path, $json) === false) throw new RuntimeException("Unable to write file: {$path}");
}

function decode_maybe_twice(string $value): string {
  $v = trim($value);
  if ($v === '') return '';
  $v1 = rawurldecode($v);
  if ($v1 !== '') $v = $v1;
  if (preg_match('/%[0-9A-Fa-f]{2}/', $v)) {
    $v2 = rawurldecode($v);
    if ($v2 !== '') $v = $v2;
  }
  return $v;
}

function normalize_cat_id(string $catId): string {
  $catId = strtolower(trim($catId));
  $aliases = ['city' => 'cities', 'landscape' => 'landscapes'];
  return $aliases[$catId] ?? $catId;
}

function thumb_from_src(string $src): string {
  $clean = decode_maybe_twice($src);
  $dot = strrpos($clean, '.');
  if ($dot === false) return $clean;
  return substr($clean, 0, $dot) . '_thumb' . substr($clean, $dot);
}

function parse_day(string $day): ?DateTimeImmutable {
  $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $day, daily_timezone());
  return $dt ?: null;
}

function valid_day_string(string $day): bool {
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) === 1 && parse_day($day) !== null;
}

function day_key(DateTimeImmutable $dt): string {
  return $dt->setTimezone(daily_timezone())->format('Y-m-d');
}

function logical_today_dt(): DateTimeImmutable {
  $now = new DateTimeImmutable('now', daily_timezone());
  $rollover = $now->setTime(rollover_hour(), rollover_minute(), 0);
  if ($now < $rollover) $now = $now->modify('-1 day');
  return $now->setTime(0, 0, 0);
}

function configured_start_day(): ?string {
  $theme = read_json_if_exists(theme_path());
  $candidate = trim((string)($theme['archiveStartDate'] ?? $theme['dailyHistoryStartDate'] ?? ''));
  if ($candidate === '' || !valid_day_string($candidate)) return null;
  $today = day_key(logical_today_dt());
  if ($candidate > $today) return null;
  return $candidate;
}

function extract_daily_pool(array $catalog): array {
  $dailyList = null;
  if (isset($catalog['categories']) && is_array($catalog['categories']) && isset($catalog['categories']['daily']) && is_array($catalog['categories']['daily'])) {
    $dailyList = $catalog['categories']['daily'];
  } elseif (isset($catalog['catalog']) && is_array($catalog['catalog']) && isset($catalog['catalog']['daily']) && is_array($catalog['catalog']['daily'])) {
    $dailyList = $catalog['catalog']['daily'];
  } elseif (isset($catalog['daily']) && is_array($catalog['daily'])) {
    $dailyList = $catalog['daily'];
  }
  if (!is_array($dailyList)) return [];

  $items = [];
  $seen = [];
  foreach ($dailyList as $idx => $p) {
    if (!is_array($p) || empty($p['src'])) continue;
    $src = decode_maybe_twice((string)$p['src']);
    if ($src === '' || isset($seen[$src])) continue;
    $seen[$src] = true;
    $thumb = trim((string)($p['thumb'] ?? ''));
    if ($thumb === '') $thumb = thumb_from_src($src);
    $items[] = [
      'catId' => 'daily',
      'name' => trim((string)($p['name'] ?? 'Puzzle')),
      'src' => $src,
      'thumb' => $thumb,
      'updated' => (int)($p['updated'] ?? 0),
      'puzzleIdx' => $idx,
    ];
  }
  return array_values($items);
}

function normalize_entry_for_day(array $entry, string $day): array {
  $src = decode_maybe_twice((string)($entry['src'] ?? ''));
  if ($src === '') throw new RuntimeException('Daily entry missing src.');
  $thumb = trim((string)($entry['thumb'] ?? ''));
  if ($thumb === '') $thumb = thumb_from_src($src);
  return [
    'day' => $day,
    'catId' => 'daily',
    'name' => trim((string)($entry['name'] ?? 'Puzzle')),
    'src' => $src,
    'thumb' => $thumb,
    'updated' => (int)($entry['updated'] ?? 0),
    'puzzleIdx' => max(0, (int)($entry['puzzleIdx'] ?? 0)),
  ];
}

function pool_maps(array $pool): array {
  $bySrc = [];
  $srcs = [];
  foreach ($pool as $idx => $item) {
    $src = (string)($item['src'] ?? '');
    if ($src === '') continue;
    $bySrc[$src] = ['index' => $idx, 'item' => $item];
    $srcs[] = $src;
  }
  return [$bySrc, $srcs];
}

function load_existing_history(string $today): array {
  return read_json_if_exists(daily_history_path());
}

function load_existing_saved_days(array $history, string $today): array {
  $days = $history['days'] ?? [];
  if (!is_array($days)) return [];
  $out = [];
  foreach ($days as $day => $entry) {
    $day = (string)$day;
    if (!valid_day_string($day) || $day > $today) continue;
    if (!is_array($entry) || empty($entry['src'])) continue;
    $catId = normalize_cat_id((string)($entry['catId'] ?? 'daily'));
    if ($catId !== 'daily') continue;
    $out[$day] = normalize_entry_for_day($entry, $day);
  }
  ksort($out);
  return $out;
}

function fisher_yates_shuffle(array $items): array {
  $n = count($items);
  for ($i = $n - 1; $i > 0; $i--) {
    $j = random_int(0, $i);
    if ($i === $j) continue;
    $tmp = $items[$i];
    $items[$i] = $items[$j];
    $items[$j] = $tmp;
  }
  return array_values($items);
}

function unique_strings(array $values): array {
  $out = [];
  $seen = [];
  foreach ($values as $value) {
    $v = (string)$value;
    if ($v === '' || isset($seen[$v])) continue;
    $seen[$v] = true;
    $out[] = $v;
  }
  return $out;
}

function rotate_first_away_from_last(array $queue, ?string $lastSrc): array {
  $queue = array_values($queue);
  if (!$queue || $lastSrc === null || $lastSrc === '') return $queue;
  if (count($queue) <= 1 || $queue[0] !== $lastSrc) return $queue;
  for ($i = 1, $n = count($queue); $i < $n; $i++) {
    if ($queue[$i] !== $lastSrc) {
      $first = array_splice($queue, $i, 1);
      array_unshift($queue, $first[0]);
      return $queue;
    }
  }
  return $queue;
}

function create_cycle_queue(array $poolSrcs, ?string $lastSrc): array {
  $queue = fisher_yates_shuffle(unique_strings($poolSrcs));
  return rotate_first_away_from_last($queue, $lastSrc);
}

function bootstrap_rotation_state(array $poolSrcs, array $savedDays): array {
  $used = [];
  foreach ($savedDays as $entry) {
    if (!is_array($entry) || empty($entry['src'])) continue;
    $used[] = (string)$entry['src'];
  }
  $used = unique_strings($used);
  $usedSet = array_fill_keys($used, true);

  $unseen = [];
  $seen = [];
  foreach ($poolSrcs as $src) {
    if (isset($usedSet[$src])) $seen[] = $src;
    else $unseen[] = $src;
  }

  $lastSrc = $used ? end($used) : null;
  $queue = array_merge(
    fisher_yates_shuffle($unseen),
    fisher_yates_shuffle($seen)
  );
  $queue = rotate_first_away_from_last($queue, $lastSrc ?: null);

  return [
    'version' => 1,
    'cycle' => 1,
    'cursor' => 0,
    'queue' => array_values($queue),
    'queue_generated_at' => gmdate('c'),
    'pool_hash' => sha1(implode("\n", $poolSrcs)),
    'bootstrap_mode' => 'unseen-first-from-existing-history',
  ];
}

function sanitize_rotation_state(array $state, array $poolSrcs, ?string $lastAssignedSrc): array {
  $poolSet = array_fill_keys($poolSrcs, true);
  $queue = [];
  $seen = [];
  foreach (($state['queue'] ?? []) as $src) {
    $src = (string)$src;
    if ($src === '' || !isset($poolSet[$src]) || isset($seen[$src])) continue;
    $seen[$src] = true;
    $queue[] = $src;
  }

  $missing = [];
  foreach ($poolSrcs as $src) {
    if (!isset($seen[$src])) $missing[] = $src;
  }
  if ($missing) {
    foreach (fisher_yates_shuffle($missing) as $src) {
      $queue[] = $src;
    }
  }

  $cursor = max(0, (int)($state['cursor'] ?? 0));
  if ($cursor > count($queue)) $cursor = count($queue);

  // If the next queued item would repeat immediately, move the first non-matching remaining item forward.
  if ($lastAssignedSrc && isset($queue[$cursor]) && $queue[$cursor] === $lastAssignedSrc) {
    for ($i = $cursor + 1, $n = count($queue); $i < $n; $i++) {
      if ($queue[$i] !== $lastAssignedSrc) {
        $tmp = $queue[$cursor];
        $queue[$cursor] = $queue[$i];
        $queue[$i] = $tmp;
        break;
      }
    }
  }

  return [
    'version' => 1,
    'cycle' => max(1, (int)($state['cycle'] ?? 1)),
    'cursor' => $cursor,
    'queue' => array_values($queue),
    'queue_generated_at' => (string)($state['queue_generated_at'] ?? gmdate('c')),
    'pool_hash' => sha1(implode("\n", $poolSrcs)),
    'bootstrap_mode' => (string)($state['bootstrap_mode'] ?? 'persisted-queue'),
  ];
}

function create_new_cycle_state(array $poolSrcs, ?string $lastAssignedSrc, int $cycle): array {
  return [
    'version' => 1,
    'cycle' => max(1, $cycle),
    'cursor' => 0,
    'queue' => create_cycle_queue($poolSrcs, $lastAssignedSrc),
    'queue_generated_at' => gmdate('c'),
    'pool_hash' => sha1(implode("\n", $poolSrcs)),
    'bootstrap_mode' => 'fresh-cycle',
  ];
}

function next_item_from_state(array &$state, array $poolBySrc, array $poolSrcs, ?string $lastAssignedSrc): array {
  $attempts = 0;
  while ($attempts < 3) {
    if (empty($state['queue']) || (int)$state['cursor'] >= count($state['queue'])) {
      $state = create_new_cycle_state($poolSrcs, $lastAssignedSrc, max(1, (int)($state['cycle'] ?? 1)) + 1);
    }

    $cursor = (int)$state['cursor'];
    $src = (string)($state['queue'][$cursor] ?? '');
    if ($src === '' || !isset($poolBySrc[$src])) {
      $state['cursor'] = $cursor + 1;
      $attempts++;
      continue;
    }

    if ($lastAssignedSrc && $src === $lastAssignedSrc) {
      $swapped = false;
      for ($i = $cursor + 1, $n = count($state['queue']); $i < $n; $i++) {
        if ((string)$state['queue'][$i] !== $lastAssignedSrc && isset($poolBySrc[(string)$state['queue'][$i]])) {
          $tmp = $state['queue'][$cursor];
          $state['queue'][$cursor] = $state['queue'][$i];
          $state['queue'][$i] = $tmp;
          $src = (string)$state['queue'][$cursor];
          $swapped = true;
          break;
        }
      }
      if (!$swapped) {
        $state = create_new_cycle_state($poolSrcs, $lastAssignedSrc, max(1, (int)($state['cycle'] ?? 1)) + 1);
        $attempts++;
        continue;
      }
    }

    $state['cursor'] = $cursor + 1;
    return $poolBySrc[$src]['item'];
  }

  throw new RuntimeException('Unable to choose next daily item from queue state.');
}

function peek_next_src(array $state, array $poolBySrc, array $poolSrcs, ?string $lastAssignedSrc): string {
  try {
    $copy = $state;
    $next = next_item_from_state($copy, $poolBySrc, $poolSrcs, $lastAssignedSrc);
    return (string)($next['src'] ?? '');
  } catch (Throwable $e) {
    return '';
  }
}

function first_fill_day(DateTimeImmutable $startDt, DateTimeImmutable $todayDt, array $saved): ?DateTimeImmutable {
  $cursor = $startDt;
  while ($cursor <= $todayDt) {
    $day = day_key($cursor);
    if (!isset($saved[$day])) return $cursor;
    $cursor = $cursor->modify('+1 day');
  }
  return null;
}



function used_pool_src_set(array $days, array $poolBySrc, ?string $excludeDay = null): array {
  $used = [];
  foreach ($days as $day => $entry) {
    if ($excludeDay !== null && (string)$day === $excludeDay) continue;
    if (!is_array($entry) || empty($entry['src'])) continue;
    $src = (string)$entry['src'];
    if (!isset($poolBySrc[$src])) continue;
    $used[$src] = true;
  }
  return $used;
}

function unseen_pool_srcs(array $days, array $poolBySrc, array $poolSrcs, ?string $excludeDay = null): array {
  $used = used_pool_src_set($days, $poolBySrc, $excludeDay);
  $out = [];
  foreach ($poolSrcs as $src) {
    if (!isset($used[$src])) $out[] = $src;
  }
  return array_values($out);
}

function choose_unseen_item(array $poolBySrc, array $unseenSrcs): array {
  $queue = fisher_yates_shuffle(unique_strings($unseenSrcs));
  foreach ($queue as $src) {
    if (isset($poolBySrc[$src])) return $poolBySrc[$src]['item'];
  }
  throw new RuntimeException('Unable to choose unseen daily item.');
}

function history_entry_source_exists(array $entry): bool {
  $src = decode_maybe_twice((string)($entry['src'] ?? ''));
  if ($src === '') return false;
  $src = str_replace('\\', '/', $src);
  $src = preg_replace('#^/+#', '', $src);
  $path = app_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $src);
  return is_file($path);
}

function invalidate_today_if_unplayable(array $days, string $today, array $poolBySrc): array {
  if (!isset($days[$today]) || !is_array($days[$today]) || empty($days[$today]['src'])) return [$days, false];
  $todaySrc = (string)$days[$today]['src'];
  if (!isset($poolBySrc[$todaySrc]) && !history_entry_source_exists($days[$today])) {
    unset($days[$today]);
    return [$days, true];
  }

  return [$days, false];
}

function build_history(array $pool): array {
  if (!$pool) throw new RuntimeException('Daily pool is empty.');

  $today = day_key(logical_today_dt());
  $existingHistory = load_existing_history($today);
  $saved = load_existing_saved_days($existingHistory, $today);

  $configuredStart = configured_start_day();
  $savedStart = $saved ? array_key_first($saved) : null;
  $start = $configuredStart ?: ($savedStart ?: $today);
  if (!valid_day_string($start) || $start > $today) $start = $today;

  $startDt = parse_day($start);
  $todayDt = parse_day($today);
  if (!$startDt || !$todayDt) throw new RuntimeException('Unable to resolve daily archive dates.');

  [$poolBySrc, $poolSrcs] = pool_maps($pool);
  if (!$poolSrcs) throw new RuntimeException('Daily pool is empty after normalization.');

  $days = $saved;
  [$days, $daysChanged] = invalidate_today_if_unplayable($days, $today, $poolBySrc);
  ksort($days);

  $lastSaved = $days ? end($days) : null;
  $lastAssignedSrc = $lastSaved ? (string)($lastSaved['src'] ?? '') : null;

  $stateRaw = $existingHistory['rotation_state'] ?? [];
  if (is_array($stateRaw) && !empty($stateRaw['queue'])) {
    $state = sanitize_rotation_state($stateRaw, $poolSrcs, $lastAssignedSrc);
  } else {
    $state = bootstrap_rotation_state($poolSrcs, $days);
  }

  $cursor = first_fill_day($startDt, $todayDt, $days);
  while ($cursor && $cursor <= $todayDt) {
    $fillDay = day_key($cursor);

    $unseen = unseen_pool_srcs($days, $poolBySrc, $poolSrcs, $fillDay);
    if ($unseen) {
      $item = choose_unseen_item($poolBySrc, $unseen);
      $daysChanged = true;
    } else {
      $item = next_item_from_state($state, $poolBySrc, $poolSrcs, $lastAssignedSrc);
    }

    $days[$fillDay] = [
      'day' => $fillDay,
      'catId' => 'daily',
      'name' => trim((string)($item['name'] ?? 'Puzzle')),
      'src' => (string)$item['src'],
      'thumb' => trim((string)($item['thumb'] ?? '')),
      'updated' => (int)($item['updated'] ?? 0),
      'puzzleIdx' => max(0, (int)($item['puzzleIdx'] ?? 0)),
    ];
    $lastAssignedSrc = (string)$item['src'];

    $cursor = $cursor->modify('+1 day');
    while ($cursor && $cursor <= $todayDt && isset($days[day_key($cursor)])) {
      $lastAssignedSrc = (string)$days[day_key($cursor)]['src'];
      $cursor = $cursor->modify('+1 day');
    }
  }

  ksort($days);

  if ($daysChanged) {
    $state = bootstrap_rotation_state($poolSrcs, $days);
  }

  $builtChronological = [];
  foreach ($days as $day => $entry) {
    if ($day < $start || $day > $today) continue;
    $builtChronological[] = normalize_entry_for_day($entry, (string)$day);
  }

  $entries = array_reverse($builtChronological);
  $last = $builtChronological ? end($builtChronological) : null;

  $remainingUnseen = unseen_pool_srcs($days, $poolBySrc, $poolSrcs);
  if ($remainingUnseen) {
    $nextItem = choose_unseen_item($poolBySrc, $remainingUnseen);
    $nextSrc = (string)($nextItem['src'] ?? '');
  } else {
    $nextSrc = peek_next_src($state, $poolBySrc, $poolSrcs, $last ? (string)$last['src'] : null);
  }

  return [
    'generated_at' => gmdate('c'),
    'algorithm' => 'persistent-shuffled-queue-v2-no-repeat-until-current-pool-exhausted',
    'source' => '/daily_puzzles/index.json',
    'source_bucket' => 'categories.daily',
    'today' => $today,
    'pool_size' => count($poolSrcs),
    'range' => [
      'start' => $start,
      'end' => $today,
      'days_back' => max(0, (int)$todayDt->diff($startDt)->format('%a')),
      'days_forward' => 0,
    ],
    'rotation' => [
      'last_day' => $last ? (string)$last['day'] : '',
      'last_src' => $last ? (string)$last['src'] : '',
      'next_src' => $nextSrc,
      'timezone' => daily_timezone()->getName(),
      'rollover_time' => sprintf('%02d:%02d', rollover_hour(), rollover_minute()),
      'cycle' => (int)($state['cycle'] ?? 1),
      'queue_remaining' => max(0, count($state['queue'] ?? []) - (int)($state['cursor'] ?? 0)),
    ],
    'rotation_state' => $state,
    'timezone' => daily_timezone()->getName(),
    'rollover_time' => sprintf('%02d:%02d', rollover_hour(), rollover_minute()),
    'days' => $days,
    'entries' => $entries,
  ];
}

try {
  $catalog = read_json_file(daily_catalog_path());
  $pool = extract_daily_pool($catalog);
  if (!$pool) throw new RuntimeException('No daily catalog items found in /daily_puzzles/index.json (expected categories.daily).');
  $history = build_history($pool);
  write_json_file(daily_history_path(), $history);
  echo "OK\n";
  echo "Generated daily_puzzles/history.json\n";
  echo "Algorithm: {$history['algorithm']}\n";
  echo "Today: {$history['today']}\n";
  echo "Timezone: {$history['timezone']} • rollover {$history['rollover_time']}\n";
  echo "Pool size: {$history['pool_size']}\n";
  echo "Range: {$history['range']['start']} → {$history['range']['end']}\n";
  echo "Last src: {$history['rotation']['last_src']}\n";
  echo "Next src: {$history['rotation']['next_src']}\n";
  echo "Cycle: {$history['rotation']['cycle']}\n";
  echo "Queue remaining: {$history['rotation']['queue_remaining']}\n";
} catch (Throwable $e) {
  http_response_code(500);
  echo "ERROR: " . $e->getMessage() . "\n";
}
