<?php
declare(strict_types=1);

function snapshift_site_config_paths(): array {
    $root = dirname(__DIR__);
    $projectParent = dirname($root);

    return [
        $projectParent . '/public_html_work.local.php',
        $projectParent . '/snapshift.local.php',
        $root . '/config.local.php',
    ];
}

function snapshift_load_local_config(): array {
    static $loaded = null;
    if (is_array($loaded)) {
        return $loaded;
    }

    $loaded = [];
    foreach (snapshift_site_config_paths() as $path) {
        if (!is_file($path)) {
            continue;
        }

        $config = require $path;
        if (is_array($config)) {
            $loaded = $config;
            break;
        }
    }

    return $loaded;
}

function snapshift_config_value(string $key, $default = null) {
    $env = getenv($key);
    if ($env !== false && $env !== '') {
        return $env;
    }

    $local = snapshift_load_local_config();
    if (array_key_exists($key, $local) && $local[$key] !== null && $local[$key] !== '') {
        return $local[$key];
    }

    return $default;
}

function snapshift_db_config(): array {
    return [
        'host' => (string)snapshift_config_value('DB_HOST', 'localhost'),
        'name' => (string)snapshift_config_value('DB_NAME', ''),
        'user' => (string)snapshift_config_value('DB_USER', ''),
        'pass' => (string)snapshift_config_value('DB_PASS', ''),
        'charset' => (string)snapshift_config_value('DB_CHARSET', 'utf8mb4'),
    ];
}

/**
 * Fails with a clear message when the database settings have not been
 * provided (see config.example.php).
 */
function snapshift_assert_db_config(array $config): void {
    if ($config['name'] === '' || $config['user'] === '') {
        throw new RuntimeException(
            'Database settings missing: set DB_NAME, DB_USER and DB_PASS in config.local.php or the environment.'
        );
    }
}

function snapshift_smtp_password(): string {
    return (string)snapshift_config_value('SMTP_PASSWORD', '');
}
