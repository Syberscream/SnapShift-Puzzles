<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/state_core.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$debug = isset($_GET['debug']);

function snapshift_state_get_clean_string(string $key, int $maxLen = 191): ?string {
    if (!isset($_GET[$key])) return null;
    $value = trim((string)$_GET[$key]);
    if ($value === '') return null;
    return substr($value, 0, $maxLen);
}

function snapshift_state_get_clean_slug(?string $value): ?string {
    $value = preg_replace('/[^a-z0-9_-]/i', '', (string)$value);
    $value = trim((string)$value);
    return $value !== '' ? $value : null;
}

function snapshift_state_get_clean_int(string $key): ?int {
    if (!isset($_GET[$key])) return null;
    $value = $_GET[$key];
    if ($value === '' || $value === null) return null;
    if (!is_numeric($value)) return null;
    return (int)$value;
}

try {
    $user = function_exists('snapshift_auth_current_user')
        ? snapshift_auth_current_user()
        : snapshift_current_user();

    $progressKeyRaw = snapshift_state_get_clean_string('progress_key', 191);
    $progressKey = $progressKeyRaw !== null ? trim($progressKeyRaw) : null;

    $requestedDay = snapshift_state_get_clean_string('day', 32);
    $requestedDay = ($requestedDay !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestedDay)) ? $requestedDay : null;

    $targetDailyDay = $requestedDay
        ?: snapshift_state_extract_daily_day($progressKey)
        ?: snapshift_state_today_utc();

    if (!$user) {
        snapshift_auth_json([
            'ok' => true,
            'loggedIn' => false,
            'uid' => null,
            'userId' => null,
            'username' => null,
            'points' => 0,
            'unlocked' => (object)[],
            'day' => $targetDailyDay,
            'dailyDone' => false,
            'progress' => null,
            'progressKey' => null,
            'msg' => ''
        ]);
    }

    $uid = (int)($user['id'] ?? 0);
    if ($uid <= 0) {
        snapshift_auth_json([
            'ok' => true,
            'loggedIn' => false,
            'uid' => null,
            'userId' => null,
            'username' => null,
            'points' => 0,
            'unlocked' => (object)[],
            'day' => $targetDailyDay,
            'dailyDone' => false,
            'progress' => null,
            'progressKey' => null,
            'msg' => ''
        ]);
    }

    $username = (string)($user['username'] ?? '');
    $pdo = snapshift_pdo();
    snapshift_state_ensure_tables($pdo);

    $state = snapshift_state_fetch_user_state($pdo, $uid);

    $categoryId = snapshift_state_get_clean_slug(snapshift_state_get_clean_string('category_id', 64));
    $puzzleSrcRaw = snapshift_state_get_clean_string('puzzle_src', 512);
    $puzzleSrc = $puzzleSrcRaw !== null ? snapshift_state_normalize_src($puzzleSrcRaw) : null;
    if ($puzzleSrc === '') $puzzleSrc = null;
    $diffKey = snapshift_state_get_clean_slug(snapshift_state_get_clean_string('diff_key', 32));
    $puzzleIdx = snapshift_state_get_clean_int('puzzle_idx');
    if ($puzzleIdx !== null) $puzzleIdx = max(0, $puzzleIdx);

    $dailyDoneMeta = null;
    $q = $pdo->prepare('SELECT 1 FROM user_daily_done WHERE user_id=? AND day_key=? LIMIT 1');
    $q->execute([$uid, $targetDailyDay]);
    $dailyDone = (bool)$q->fetchColumn();
    if (!$dailyDone) {
        try {
            if (function_exists('snapshift_auth_ensure_leaderboard_tables')) {
                snapshift_auth_ensure_leaderboard_tables($pdo);
            }
            $lb = $pdo->prepare('SELECT time_ms, moves, acc FROM leaderboard_daily WHERE user_id=? AND day_key=? LIMIT 1');
            $lb->execute([$uid, $targetDailyDay]);
            $lbRow = $lb->fetch(PDO::FETCH_ASSOC) ?: null;
            if (is_array($lbRow)) {
                $dailyDone = true;
                $dailyDoneMeta = [
                    'time_ms' => max(0, (int)($lbRow['time_ms'] ?? 0)),
                    'moves' => max(0, (int)($lbRow['moves'] ?? 0)),
                    'acc' => max(0, (int)($lbRow['acc'] ?? 0)),
                ];
            }
        } catch (Throwable $e) {
            $dailyDone = false;
        }
    }

    $progress = snapshift_state_fetch_progress(
        $pdo,
        $uid,
        $progressKey,
        $targetDailyDay,
        $categoryId,
        $puzzleSrc,
        $diffKey,
        $puzzleIdx
    );

    // Defensive final scoping checks on the decoded payload before returning it.
    if (is_array($progress)) {
        $progressUserId = (int)($progress['userId'] ?? $uid);
        if ($progressUserId > 0 && $progressUserId !== $uid) {
            $progress = null;
        } else {
            if ($categoryId !== null && !empty($progress['categoryId']) && (string)$progress['categoryId'] !== $categoryId) {
                $progress = null;
            }
            if ($diffKey !== null && !empty($progress['diffKey']) && (string)$progress['diffKey'] !== $diffKey) {
                $progress = null;
            }
            if ($puzzleIdx !== null && !$progressKey && $puzzleSrc === null && isset($progress['puzzleIdx']) && (int)$progress['puzzleIdx'] !== $puzzleIdx) {
                $progress = null;
            }
            if ($puzzleSrc !== null && !empty($progress['puzzleSrc'])) {
                $savedSrc = snapshift_state_normalize_src((string)$progress['puzzleSrc']);
                if ($savedSrc !== '' && $savedSrc !== $puzzleSrc) {
                    $progress = null;
                }
            }
            if ($progress !== null && !empty($progress['isDaily'])) {
                $savedDay = trim((string)($progress['dayKey'] ?? ''));
                if ($savedDay !== '' && $savedDay !== $targetDailyDay) {
                    $progress = null;
                }
            }
        }
    }

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'uid' => $uid,
        'userId' => $uid,
        'username' => $username,
        'points' => (int)($state['points'] ?? 0),
        'unlocked' => $state['unlocked'] ?? (object)[],
        'day' => $targetDailyDay,
        'dailyDone' => $dailyDone,
        'dailyDoneMeta' => $dailyDoneMeta,
        'progress' => $progress,
        'progressKey' => is_array($progress) ? ($progress['progressKey'] ?? null) : null,
        'msg' => ''
    ]);
} catch (Throwable $e) {
    $out = [
        'ok' => false,
        'loggedIn' => false,
        'uid' => null,
        'userId' => null,
        'username' => null,
        'points' => 0,
        'unlocked' => (object)[],
        'day' => snapshift_state_today_utc(),
        'dailyDone' => false,
        'progress' => null,
        'progressKey' => null,
        'msg' => 'server_error'
    ];
    if ($debug) {
        $out['msg'] .= ': ' . $e->getMessage();
    }
    snapshift_auth_json($out, 200);
}
