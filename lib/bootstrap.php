<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/app.php';

function snapshift_cookie_secure(): bool {
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $proto = strtolower(trim((string)$_SERVER['HTTP_X_FORWARDED_PROTO']));
        if (in_array($proto, ['https', 'wss'], true)) {
            return true;
        }
    }
    if (!empty($_SERVER['REQUEST_SCHEME']) && strtolower((string)$_SERVER['REQUEST_SCHEME']) === 'https') {
        return true;
    }
    if ((int)($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    return false;
}

function snapshift_cookie_options(int $expires): array {
    return [
        'expires' => $expires,
        'path' => '/',
        'domain' => '',
        'secure' => snapshift_cookie_secure(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function snapshift_cookie_set(string $name, string $value, int $expires): void {
    setcookie($name, $value, snapshift_cookie_options($expires));
}

function snapshift_cookie_clear(string $name): void {
    setcookie($name, '', snapshift_cookie_options(time() - 42000));
}

function snapshift_storage_dir(): string {
    $cfg = snapshift_app_config();
    $dir = $cfg['storage_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}


function snapshift_reset_request_user_cache(): void {
    $GLOBALS['__snapshift_current_user_cache'] = ['loaded' => false, 'user' => null];
}

function snapshift_session_clear_identity(bool $clearRememberSelector = false): void {
    unset($_SESSION['user_id']);
    unset($_SESSION['auth_user_id']);
    unset($_SESSION['auth_user_sig']);
    if ($clearRememberSelector) {
        unset($_SESSION['remember_selector']);
    }
    snapshift_reset_request_user_cache();
}

function snapshift_login_user_session(array $user, ?string $rememberSelector = null): void {
    snapshift_start_session();
    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_regenerate_id(true);
    }
    $userId = (int)($user['id'] ?? 0);
    $_SESSION['user_id'] = $userId;
    $_SESSION['auth_user_id'] = $userId;
    $_SESSION['auth_user_sig'] = hash('sha256', $userId . '|' . (string)($user['username'] ?? '') . '|' . (string)($user['status'] ?? ''));
    if ($rememberSelector !== null && $rememberSelector !== '') {
        $_SESSION['remember_selector'] = $rememberSelector;
    }
    $GLOBALS['__snapshift_current_user_cache'] = ['loaded' => true, 'user' => $user];
}

function snapshift_logout_current_session(bool $clearRemember = true): void {
    snapshift_start_session();
    if ($clearRemember) {
        snapshift_clear_remember_token();
    } else {
        unset($_SESSION['remember_selector']);
    }

    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'] ?? '/',
            'domain' => $params['domain'] ?? '',
            'secure' => (bool)($params['secure'] ?? snapshift_cookie_secure()),
            'httponly' => (bool)($params['httponly'] ?? true),
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_destroy();
    }
    snapshift_reset_request_user_cache();
}

function snapshift_start_session(): void {
    static $booted = false;

    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    if (session_status() === PHP_SESSION_NONE) {
        if (!headers_sent()) {
            @ini_set('session.use_only_cookies', '1');
            @ini_set('session.use_strict_mode', '1');
            @ini_set('session.cookie_httponly', '1');
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'domain' => '',
                'secure' => snapshift_cookie_secure(),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        session_start();
    }

    if (!$booted) {
        $booted = true;
        snapshift_reset_request_user_cache();
        snapshift_try_remember_login();
    }
}

function snapshift_json(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function snapshift_only_post(): void {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        snapshift_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
    }
}

function snapshift_get_json_input(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return $_POST ?: [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function snapshift_normalize_email(string $email): string {
    return strtolower(trim($email));
}

function snapshift_validate_username(string $username): bool {
    return preg_match('/^[A-Za-z0-9_-]{3,20}$/', $username) === 1;
}

function snapshift_password_hash(string $password): string {
    $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    return password_hash($password, $algo);
}

function snapshift_random_token(): string {
    return bin2hex(random_bytes(32));
}

function snapshift_token_hash(string $token): string {
    return hash('sha256', $token);
}

function snapshift_send_mail(string $to, string $subject, string $body): bool {
    $cfg = snapshift_app_config();
    $from = $cfg['mail_from'];
    $fromName = $cfg['mail_from_name'];
    $returnPath = trim((string)($cfg['mail_return_path'] ?? $from));

    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headers[] = 'From: ' . $fromName . ' <' . $from . '>';
    $headers[] = 'Reply-To: ' . $from;
    if ($returnPath !== '') {
        $headers[] = 'Return-Path: ' . $returnPath;
    }

    $ok = false;
    $mailError = null;
    if (function_exists('mail')) {
        $params = $returnPath !== '' ? '-f' . $returnPath : '';
        try {
            if ($params !== '') {
                $ok = @mail($to, $subject, $body, implode("
", $headers), $params);
            } else {
                $ok = @mail($to, $subject, $body, implode("
", $headers));
            }
        } catch (Throwable $e) {
            $mailError = $e->getMessage();
            $ok = false;
        }
    }

    if (!$ok) {
        $logFile = snapshift_storage_dir() . '/mail_debug.log';
        $entry = "=== " . date('c') . " ===
"
               . "TO: {$to}
"
               . "FROM: {$from}
"
               . "RETURN_PATH: {$returnPath}
"
               . "SUBJECT: {$subject}
"
               . ($mailError ? "ERROR: {$mailError}
" : "")
               . $body . "

";
        file_put_contents($logFile, $entry, FILE_APPEND);
        return false;
    }

    return true;
}

function snapshift_rate_limit_login(string $email, string $ip): void {
    $cfg = snapshift_app_config();
    $pdo = snapshift_pdo();

    $emailLimit = (int)$cfg['login_email_limit'];
    $ipLimit = (int)$cfg['login_ip_limit'];
    $windowMinutes = (int)$cfg['login_window_minutes'];

    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM login_attempts
        WHERE email = :email
          AND created_at >= (NOW() - INTERVAL :mins MINUTE)
    ");
    $stmt->bindValue(':email', $email);
    $stmt->bindValue(':mins', $windowMinutes, PDO::PARAM_INT);
    $stmt->execute();
    $emailCount = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM login_attempts
        WHERE ip_address = :ip
          AND created_at >= (NOW() - INTERVAL :mins MINUTE)
    ");
    $stmt->bindValue(':ip', $ip);
    $stmt->bindValue(':mins', $windowMinutes, PDO::PARAM_INT);
    $stmt->execute();
    $ipCount = (int)$stmt->fetchColumn();

    if ($emailCount >= $emailLimit || $ipCount >= $ipLimit) {
        snapshift_json(['ok' => false, 'error' => 'Too many login attempts. Please try again later.'], 429);
    }
}

function snapshift_log_login_attempt(string $email, string $ip, bool $success): void {
    $pdo = snapshift_pdo();
    $stmt = $pdo->prepare("
        INSERT INTO login_attempts (email, ip_address, was_successful)
        VALUES (:email, :ip, :success)
    ");
    $stmt->execute([
        ':email' => $email,
        ':ip' => $ip,
        ':success' => $success ? 1 : 0,
    ]);
}

function snapshift_issue_token(int $userId, string $table, int $minutes): string {
    $pdo = snapshift_pdo();
    $token = snapshift_random_token();
    $tokenHash = snapshift_token_hash($token);

    $stmt = $pdo->prepare("
        INSERT INTO {$table} (user_id, token_hash, expires_at)
        VALUES (:user_id, :token_hash, DATE_ADD(NOW(), INTERVAL :mins MINUTE))
    ");
    $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
    $stmt->bindValue(':token_hash', $tokenHash);
    $stmt->bindValue(':mins', $minutes, PDO::PARAM_INT);
    $stmt->execute();

    return $token;
}

function snapshift_find_user_by_email(string $email): ?array {
    $pdo = snapshift_pdo();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function snapshift_find_user_by_username(string $username): ?array {
    $pdo = snapshift_pdo();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :username LIMIT 1");
    $stmt->execute([':username' => $username]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function snapshift_find_user_by_id(int $userId): ?array {
    $pdo = snapshift_pdo();
    $stmt = $pdo->prepare("
        SELECT id, email, username, email_verified, status, created_at, updated_at, last_login_at
        FROM users
        WHERE id = :id
        LIMIT 1
    ");
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function snapshift_current_user(): ?array {
    snapshift_start_session();

    $cache = $GLOBALS['__snapshift_current_user_cache'] ?? ['loaded' => false, 'user' => null];
    if (!empty($cache['loaded'])) {
        return is_array($cache['user']) ? $cache['user'] : null;
    }

    $userId = (int)($_SESSION['user_id'] ?? $_SESSION['auth_user_id'] ?? 0);
    if ($userId <= 0) {
        $GLOBALS['__snapshift_current_user_cache'] = ['loaded' => true, 'user' => null];
        return null;
    }

    $user = snapshift_find_user_by_id($userId);
    if (!$user || (string)($user['status'] ?? 'active') !== 'active') {
        snapshift_session_clear_identity(true);
        $GLOBALS['__snapshift_current_user_cache'] = ['loaded' => true, 'user' => null];
        return null;
    }

    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['auth_user_id'] = (int)$user['id'];
    $_SESSION['auth_user_sig'] = hash('sha256', (int)$user['id'] . '|' . (string)($user['username'] ?? '') . '|' . (string)($user['status'] ?? ''));

    $GLOBALS['__snapshift_current_user_cache'] = ['loaded' => true, 'user' => $user];
    return $user;
}

function snapshift_ensure_remember_table(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_remember_tokens (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        selector CHAR(24) NOT NULL UNIQUE,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME NULL,
        INDEX idx_art_user (user_id),
        INDEX idx_art_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $done = true;
}

function snapshift_issue_remember_token(int $userId): void {
    snapshift_start_session();
    $pdo = snapshift_pdo();
    snapshift_ensure_remember_table($pdo);

    $cfg = snapshift_app_config();
    $cookieName = (string)($cfg['remember_cookie_name'] ?? 'snapshift_remember');

    $oldSelector = trim((string)($_SESSION['remember_selector'] ?? ''));
    if ($oldSelector !== '') {
        try {
            $pdo->prepare("DELETE FROM auth_remember_tokens WHERE selector = ?")->execute([$oldSelector]);
        } catch (Throwable $e) {}
    }

    try {
        $pdo->exec("DELETE FROM auth_remember_tokens WHERE expires_at < NOW()");
    } catch (Throwable $e) {}

    $selector = bin2hex(random_bytes(12));
    $token = bin2hex(random_bytes(32));
    $tokenHash = snapshift_token_hash($token);
    $days = max(1, (int)($cfg['remember_days'] ?? 30));
    $expiresTs = time() + ($days * 86400);
    $expiresSql = date('Y-m-d H:i:s', $expiresTs);

    $stmt = $pdo->prepare("
        INSERT INTO auth_remember_tokens (user_id, selector, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$userId, $selector, $tokenHash, $expiresSql]);

    $_SESSION['remember_selector'] = $selector;
    snapshift_cookie_set($cookieName, $selector . ':' . $token, $expiresTs);
}

function snapshift_clear_remember_token(): void {
    snapshift_start_session();
    $cfg = snapshift_app_config();
    $cookieName = (string)($cfg['remember_cookie_name'] ?? 'snapshift_remember');
    $selector = '';

    if (!empty($_SESSION['remember_selector'])) {
        $selector = trim((string)$_SESSION['remember_selector']);
    } elseif (!empty($_COOKIE[$cookieName])) {
        $parts = explode(':', (string)$_COOKIE[$cookieName], 2);
        $selector = trim((string)($parts[0] ?? ''));
    }

    if ($selector !== '') {
        try {
            $pdo = snapshift_pdo();
            snapshift_ensure_remember_table($pdo);
            $stmt = $pdo->prepare("DELETE FROM auth_remember_tokens WHERE selector = ?");
            $stmt->execute([$selector]);
        } catch (Throwable $e) {}
    }

    unset($_SESSION['remember_selector']);
    snapshift_cookie_clear($cookieName);
}

function snapshift_try_remember_login(): void {
    if (!empty($_SESSION['user_id']) || !empty($_SESSION['auth_user_id'])) {
        return;
    }

    $cfg = snapshift_app_config();
    $cookieName = (string)($cfg['remember_cookie_name'] ?? 'snapshift_remember');
    $raw = (string)($_COOKIE[$cookieName] ?? '');
    if ($raw === '' || strpos($raw, ':') === false) {
        return;
    }

    [$selector, $token] = explode(':', $raw, 2);
    $selector = trim((string)$selector);
    $token = trim((string)$token);

    if (!preg_match('/^[a-f0-9]{24}$/', $selector) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        unset($_SESSION['remember_selector']);
        snapshift_cookie_clear($cookieName);
        return;
    }

    try {
        $pdo = snapshift_pdo();
        snapshift_ensure_remember_table($pdo);

        $stmt = $pdo->prepare("
            SELECT id, user_id, token_hash, expires_at
            FROM auth_remember_tokens
            WHERE selector = ?
            LIMIT 1
        ");
        $stmt->execute([$selector]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            unset($_SESSION['remember_selector']);
            snapshift_cookie_clear($cookieName);
            return;
        }

        if (strtotime((string)$row['expires_at']) < time()) {
            $pdo->prepare("DELETE FROM auth_remember_tokens WHERE id = ?")->execute([(int)$row['id']]);
            unset($_SESSION['remember_selector']);
            snapshift_cookie_clear($cookieName);
            return;
        }

        if (!hash_equals((string)$row['token_hash'], snapshift_token_hash($token))) {
            $pdo->prepare("DELETE FROM auth_remember_tokens WHERE id = ?")->execute([(int)$row['id']]);
            unset($_SESSION['remember_selector']);
            snapshift_cookie_clear($cookieName);
            return;
        }

        $user = snapshift_find_user_by_id((int)$row['user_id']);
        if (!$user || (string)($user['status'] ?? 'active') !== 'active') {
            $pdo->prepare("DELETE FROM auth_remember_tokens WHERE id = ?")->execute([(int)$row['id']]);
            unset($_SESSION['remember_selector']);
            snapshift_cookie_clear($cookieName);
            return;
        }

        $newToken = bin2hex(random_bytes(32));
        $newTokenHash = snapshift_token_hash($newToken);
        $days = max(1, (int)($cfg['remember_days'] ?? 30));
        $expiresTs = time() + ($days * 86400);
        $expiresSql = date('Y-m-d H:i:s', $expiresTs);

        $upd = $pdo->prepare("
            UPDATE auth_remember_tokens
            SET token_hash = ?, expires_at = ?, last_used_at = NOW()
            WHERE id = ?
        ");
        $upd->execute([$newTokenHash, $expiresSql, (int)$row['id']]);

        snapshift_login_user_session($user, $selector);
        snapshift_cookie_set($cookieName, $selector . ':' . $newToken, $expiresTs);
    } catch (Throwable $e) {
        unset($_SESSION['remember_selector']);
        snapshift_cookie_clear($cookieName);
        snapshift_reset_request_user_cache();
    }
}
