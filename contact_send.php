<?php

declare(strict_types=1);

$configPath = __DIR__ . '/smtp_config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo 'Missing smtp_config.php';
    exit;
}

$config = require $configPath;

function redirect_with(string $base, array $params): never {
    $sep = str_contains($base, '?') ? '&' : '?';
    header('Location: ' . $base . $sep . http_build_query($params));
    exit;
}

function clean_text(string $value): string {
    $value = trim($value);
    $value = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $value) ?? $value;
    $value = preg_replace('/\s+/u', ' ', $value) ?? $value;
    return trim($value);
}

function clean_multiline(string $value): string {
    $value = str_replace(["\r\n", "\r"], "\n", trim($value));
    $value = preg_replace("/\x00/u", '', $value) ?? $value;
    return trim($value);
}

function safe_header_value(string $value): string {
    return trim(str_replace(["\r", "\n"], ' ', $value));
}

function smtp_read_response($socket): string {
    $response = '';
    while (!feof($socket)) {
        $line = fgets($socket, 515);
        if ($line === false) {
            break;
        }
        $response .= $line;
        if (preg_match('/^\d{3} /', $line) === 1) {
            break;
        }
    }
    return $response;
}

function smtp_expect($socket, array $expectedCodes): string {
    $response = smtp_read_response($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP unexpected response: ' . trim($response));
    }
    return $response;
}

function smtp_write($socket, string $command): void {
    $written = fwrite($socket, $command . "\r\n");
    if ($written === false) {
        throw new RuntimeException('SMTP write failed');
    }
}

function smtp_send_mail(array $cfg, string $replyEmail, string $replyName, string $subject, string $body): void {
    $transport = ($cfg['smtp_secure'] ?? 'ssl') === 'ssl'
        ? 'ssl://' . $cfg['smtp_host']
        : (string)$cfg['smtp_host'];

    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true,
        ],
    ]);

    $socket = @stream_socket_client(
        $transport . ':' . (int)$cfg['smtp_port'],
        $errno,
        $errstr,
        20,
        STREAM_CLIENT_CONNECT,
        $context
    );

    if (!$socket) {
        throw new RuntimeException('SMTP connect failed: ' . $errstr . ' (' . $errno . ')');
    }

    stream_set_timeout($socket, 20);

    try {
        smtp_expect($socket, [220]);
        smtp_write($socket, 'EHLO ' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
        smtp_expect($socket, [250]);

        smtp_write($socket, 'AUTH LOGIN');
        smtp_expect($socket, [334]);
        smtp_write($socket, base64_encode((string)$cfg['smtp_username']));
        smtp_expect($socket, [334]);
        smtp_write($socket, base64_encode((string)$cfg['smtp_password']));
        smtp_expect($socket, [235]);

        smtp_write($socket, 'MAIL FROM:<' . $cfg['from_email'] . '>');
        smtp_expect($socket, [250]);
        smtp_write($socket, 'RCPT TO:<' . $cfg['to_email'] . '>');
        smtp_expect($socket, [250, 251]);
        smtp_write($socket, 'DATA');
        smtp_expect($socket, [354]);

        $encodedSubject = function_exists('mb_encode_mimeheader')
            ? mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n")
            : $subject;

        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'To: ' . safe_header_value(($cfg['to_name'] ?? '') !== '' ? ($cfg['to_name'] . ' <' . $cfg['to_email'] . '>') : $cfg['to_email']),
            'From: ' . safe_header_value(($cfg['from_name'] ?? '') !== '' ? ($cfg['from_name'] . ' <' . $cfg['from_email'] . '>') : $cfg['from_email']),
            'Reply-To: ' . safe_header_value($replyName !== '' ? ($replyName . ' <' . $replyEmail . '>') : $replyEmail),
            'Subject: ' . safe_header_value($encodedSubject),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'X-Mailer: Snapshift Contact Form SMTP',
        ];

        $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace(["\r\n", "\r"], "\n", $body);
        $message = str_replace("\n", "\r\n", $message);
        $message = preg_replace('/^\./m', '..', $message) ?? $message;

        fwrite($socket, $message . "\r\n.\r\n");
        smtp_expect($socket, [250]);
        smtp_write($socket, 'QUIT');
    } finally {
        fclose($socket);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo 'Method Not Allowed';
    exit;
}

$honeypot = trim((string)($_POST['website'] ?? ''));
if ($honeypot !== '') {
    redirect_with((string)$config['redirect_error'], ['error' => 'blocked']);
}

$name = clean_text((string)($_POST['name'] ?? ''));
$email = filter_var(trim((string)($_POST['email'] ?? '')), FILTER_VALIDATE_EMAIL) ?: '';
$topic = clean_text((string)($_POST['topic'] ?? 'General'));
$subject = clean_text((string)($_POST['subject'] ?? ''));
$message = clean_multiline((string)($_POST['message'] ?? ''));

if ($name === '' || $email === '' || $subject === '' || $message === '') {
    redirect_with((string)$config['redirect_error'], ['error' => 'missing']);
}

if (mb_strlen($message) > 5000) {
    redirect_with((string)$config['redirect_error'], ['error' => 'long']);
}

if ((string)$config['smtp_password'] === '' || str_contains((string)$config['smtp_password'], 'REPLACE_WITH_CONTACT_EMAIL_PASSWORD')) {
    redirect_with((string)$config['redirect_error'], ['error' => 'blocked']);
}

$fullSubject = '[Snapshift Contact] ' . $subject;
$body = "Snapshift contact form submission\n"
    . "==============================\n\n"
    . "Name: {$name}\n"
    . "Email: {$email}\n"
    . "Topic: {$topic}\n"
    . "IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n"
    . "User Agent: " . ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown') . "\n\n"
    . "Message:\n"
    . $message . "\n";

try {
    smtp_send_mail($config, $email, $name, $fullSubject, $body);
    redirect_with((string)$config['redirect_success'], ['sent' => '1', 'topic' => $topic]);
} catch (Throwable $e) {
    error_log('Snapshift contact SMTP failed: ' . $e->getMessage());
    redirect_with((string)$config['redirect_error'], ['error' => 'blocked']);
}
