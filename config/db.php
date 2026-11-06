<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/site_config.php';

function snapshift_pdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dbConfig = snapshift_db_config();
    snapshift_assert_db_config($dbConfig);
    $dbHost = $dbConfig['host'];
    $dbName = $dbConfig['name'];
    $dbUser = $dbConfig['user'];
    $dbPass = $dbConfig['pass'];
    $charset = $dbConfig['charset'];

    $dsn = "mysql:host={$dbHost};dbname={$dbName};charset={$charset}";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $pdo = new PDO($dsn, $dbUser, $dbPass, $options);
    return $pdo;
}
