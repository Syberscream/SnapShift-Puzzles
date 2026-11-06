<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/lib/site_config.php';

$snapshiftDbConfig = snapshift_db_config();

// Legacy helpers (lib/pq_legacy_db.php, debug tools) look for these constants,
// so they are still defined, but the values now come from config.local.php / env.
foreach (['host' => 'DB_HOST', 'name' => 'DB_NAME', 'user' => 'DB_USER', 'pass' => 'DB_PASS', 'charset' => 'DB_CHARSET'] as $key => $const) {
    if (!defined($const)) {
        define($const, $snapshiftDbConfig[$key]);
    }
}

function pq_pdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $config = snapshift_db_config();
    snapshift_assert_db_config($config);
    $host = $config['host'];
    $name = $config['name'];
    $user = $config['user'];
    $pass = $config['pass'];
    $charset = $config['charset'];

    $dsn = 'mysql:host=' . $host . ';dbname=' . $name . ';charset=' . $charset;
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function pq_json(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function pq_require_login(): array {
    $uid = (int)($_SESSION['uid'] ?? 0);
    $username = (string)($_SESSION['username'] ?? '');
    if ($uid <= 0 || $username === '') {
        pq_json(['ok' => false, 'loggedIn' => false, 'msg' => 'not_logged_in'], 401);
    }
    return ['uid' => $uid, 'username' => $username];
}

function pq_today_key(): string {
    return (new DateTime('now'))->format('Y-m-d');
}

function pq_get_user_state(PDO $pdo, int $uid): array {
    $stmt = $pdo->prepare('SELECT points, unlocked_json FROM user_state WHERE user_id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['points' => 0, 'unlocked' => new stdClass()];
    }
    $points = (int)($row['points'] ?? 0);
    $decoded = json_decode((string)($row['unlocked_json'] ?? '{}'));
    if (!is_object($decoded) && !is_array($decoded)) $decoded = new stdClass();
    return ['points' => $points, 'unlocked' => $decoded];
}

function pq_upsert_user_state(PDO $pdo, int $uid, int $points, string $unlockedJson): void {
    $stmt = $pdo->prepare(
        'INSERT INTO user_state (user_id, points, unlocked_json) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE points = VALUES(points), unlocked_json = VALUES(unlocked_json)'
    );
    $stmt->execute([$uid, $points, $unlockedJson]);
}
