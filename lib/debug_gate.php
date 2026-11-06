<?php
declare(strict_types=1);

function pq_debug_client_ip(): string {
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        $value = trim((string)$candidate);
        if ($value === '') {
            continue;
        }
        if (str_contains($value, ',')) {
            $value = trim((string)explode(',', $value)[0]);
        }
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function pq_debug_is_local_request(): bool {
    if (PHP_SAPI === 'cli') {
        return true;
    }

    $ip = pq_debug_client_ip();
    if ($ip === '') {
        return false;
    }

    return in_array($ip, ['127.0.0.1', '::1'], true);
}

function pq_debug_session_allowed(): bool {
    return !empty($_SESSION['authed'])
        || !empty($_SESSION['is_admin'])
        || !empty($_SESSION['admin'])
        || !empty($_SESSION['debug_allowed']);
}

function pq_debug_env_enabled(): bool {
    $value = getenv('SNAPSHIFT_ENABLE_DEBUG_TOOLS');
    if ($value === false) {
        return false;
    }

    $value = strtolower(trim($value));
    return in_array($value, ['1', 'true', 'yes', 'on'], true);
}

function pq_debug_access_allowed(): bool {
    return pq_debug_is_local_request() || pq_debug_session_allowed() || pq_debug_env_enabled();
}

function pq_require_debug_access(string $responseType = 'html'): void {
    if (pq_debug_access_allowed()) {
        return;
    }

    http_response_code(404);
    if ($responseType === 'json') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_SLASHES);
        exit;
    }

    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}
