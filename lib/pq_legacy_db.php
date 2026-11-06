<?php
declare(strict_types=1);

mysqli_report(MYSQLI_REPORT_OFF);

class PQ_ArrayStatement {
    private array $rows;
    private int $idx = 0;

    public function __construct(array $rows) {
        $this->rows = array_values($rows);
    }

    public function execute(array $params = []): bool {
        return true;
    }

    public function fetchAll($mode = null): array {
        $mode = $mode ?? PDO::FETCH_BOTH;
        if ($mode === PDO::FETCH_COLUMN) {
            return array_map(function ($row) {
                if (!is_array($row)) {
                    return $row;
                }
                $values = array_values($row);
                return $values[0] ?? null;
            }, $this->rows);
        }

        if ($mode === PDO::FETCH_NUM) {
            return array_map(function ($row) {
                return is_array($row) ? array_values($row) : [$row];
            }, $this->rows);
        }

        return $this->rows;
    }

    public function fetch($mode = null) {
        if ($this->idx >= count($this->rows)) {
            return false;
        }

        $row = $this->rows[$this->idx++];
        $mode = $mode ?? PDO::FETCH_BOTH;
        if ($mode === PDO::FETCH_NUM) {
            return is_array($row) ? array_values($row) : [$row];
        }

        return $row;
    }

    public function fetchColumn(int $column = 0) {
        if (!$this->rows) {
            return false;
        }

        $row = $this->rows[0];
        if (!is_array($row)) {
            return $row;
        }

        $values = array_values($row);
        return $values[$column] ?? false;
    }
}

class PQ_MysqliPreparedStatement {
    private mysqli $db;
    private mysqli_stmt $stmt;
    private array $rows = [];
    private int $idx = 0;

    public function __construct(mysqli $db, string $sql) {
        $this->db = $db;
        $this->stmt = $db->prepare($sql);
        if (!$this->stmt) {
            throw new RuntimeException('Prepare failed: ' . $db->error);
        }
    }

    private function bindParams(array $params): void {
        if (!$params) {
            return;
        }

        $types = '';
        $values = [];
        foreach ($params as $value) {
            if (is_int($value) || is_bool($value)) {
                $types .= 'i';
            } elseif (is_float($value)) {
                $types .= 'd';
            } else {
                $types .= 's';
            }

            if (is_bool($value)) {
                $value = $value ? 1 : 0;
            }
            $values[] = $value;
        }

        $refs = [];
        foreach ($values as $index => $value) {
            $refs[$index] = &$values[$index];
        }
        array_unshift($refs, $types);

        if (!call_user_func_array([$this->stmt, 'bind_param'], $refs)) {
            throw new RuntimeException('bind_param failed: ' . $this->stmt->error);
        }
    }

    private function loadRows(): void {
        $this->rows = [];
        $meta = $this->stmt->result_metadata();
        if (!$meta) {
            return;
        }

        $fields = $meta->fetch_fields();
        $bind = [];
        $row = [];
        foreach ($fields as $field) {
            $row[$field->name] = null;
            $bind[] = &$row[$field->name];
        }

        call_user_func_array([$this->stmt, 'bind_result'], $bind);
        while ($this->stmt->fetch()) {
            $out = [];
            foreach ($row as $key => $value) {
                $out[$key] = $value;
            }
            $this->rows[] = $out;
        }
    }

    public function execute(array $params = []): bool {
        $this->idx = 0;
        $this->bindParams($params);
        $ok = $this->stmt->execute();
        if (!$ok) {
            throw new RuntimeException('Execute failed: ' . $this->stmt->error);
        }

        $this->loadRows();
        return true;
    }

    public function fetchAll($mode = null): array {
        return (new PQ_ArrayStatement($this->rows))->fetchAll($mode);
    }

    public function fetch($mode = null) {
        if ($this->idx >= count($this->rows)) {
            return false;
        }

        $row = $this->rows[$this->idx++];
        $mode = $mode ?? PDO::FETCH_BOTH;
        if ($mode === PDO::FETCH_NUM) {
            return array_values($row);
        }

        return $row;
    }

    public function fetchColumn(int $column = 0) {
        if (!$this->rows) {
            return false;
        }

        $values = array_values($this->rows[0]);
        return $values[$column] ?? false;
    }
}

class PQ_MysqliAdapter {
    private mysqli $db;
    private bool $inTx = false;

    public function __construct(mysqli $db) {
        $this->db = $db;
    }

    public function query(string $sql) {
        $res = $this->db->query($sql);
        if ($res === false) {
            throw new RuntimeException('Query failed: ' . $this->db->error);
        }

        if ($res === true) {
            return new PQ_ArrayStatement([]);
        }

        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
        $res->free();
        return new PQ_ArrayStatement($rows);
    }

    public function prepare(string $sql) {
        return new PQ_MysqliPreparedStatement($this->db, $sql);
    }

    public function beginTransaction(): bool {
        $this->inTx = $this->db->begin_transaction();
        return $this->inTx;
    }

    public function commit(): bool {
        $ok = $this->db->commit();
        $this->inTx = false;
        return $ok;
    }

    public function rollBack(): bool {
        $ok = $this->db->rollback();
        $this->inTx = false;
        return $ok;
    }

    public function inTransaction(): bool {
        return $this->inTx;
    }
}

function pq_bootstrap_files(): void {
    $candidates = [
        __DIR__ . '/../config.php',
        dirname(__DIR__) . '/config.php',
        __DIR__ . '/../db.php',
        dirname(__DIR__) . '/db.php',
        __DIR__ . '/../includes/config.php',
        dirname(__DIR__) . '/includes/config.php',
        __DIR__ . '/../includes/db.php',
        dirname(__DIR__) . '/includes/db.php',
    ];

    foreach ($candidates as $file) {
        if (is_file($file)) {
            require_once $file;
        }
    }
}

function pq_global_value(array $names) {
    foreach ($names as $name) {
        if (array_key_exists($name, $GLOBALS) && $GLOBALS[$name] !== null && $GLOBALS[$name] !== '') {
            return $GLOBALS[$name];
        }
        if (defined($name)) {
            return constant($name);
        }
    }

    return null;
}

function pq_user_id(): int {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $authFile = __DIR__ . '/auth_core.php';
    if (is_file($authFile)) {
        require_once $authFile;
        if (function_exists('snapshift_auth_current_user')) {
            try {
                $user = snapshift_auth_current_user();
                if (is_array($user) && !empty($user['id'])) {
                    $cached = (int)$user['id'];
                    return $cached;
                }
            } catch (Throwable $e) {
                // Fall back to legacy session keys.
            }
        }
    }

    if (!empty($_SESSION['user']['id'])) {
        return $cached = (int)$_SESSION['user']['id'];
    }
    if (!empty($_SESSION['user_id'])) {
        return $cached = (int)$_SESSION['user_id'];
    }
    if (!empty($_SESSION['uid'])) {
        return $cached = (int)$_SESSION['uid'];
    }

    return $cached = 0;
}

function pq_day_valid(?string $day): bool {
    return is_string($day) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) === 1;
}

function pq_db() {
    global $pdo;

    pq_bootstrap_files();
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    foreach (['db', 'database', 'dbh'] as $name) {
        if (isset($GLOBALS[$name]) && $GLOBALS[$name] instanceof PDO) {
            return $GLOBALS[$name];
        }
    }

    foreach (['conn', 'mysqli', 'dbconn', 'link'] as $name) {
        if (isset($GLOBALS[$name]) && $GLOBALS[$name] instanceof mysqli) {
            return new PQ_MysqliAdapter($GLOBALS[$name]);
        }
    }

    $host = pq_global_value(['DB_HOST', 'DB_SERVER', 'MYSQL_HOST', 'db_host']);
    $name = pq_global_value(['DB_NAME', 'DB_DATABASE', 'MYSQL_DATABASE', 'db_name']);
    $user = pq_global_value(['DB_USER', 'DB_USERNAME', 'MYSQL_USER', 'db_user']);
    $pass = pq_global_value(['DB_PASS', 'DB_PASSWORD', 'MYSQL_PASSWORD', 'db_pass', 'db_password']);
    $charset = pq_global_value(['DB_CHARSET', 'MYSQL_CHARSET', 'db_charset']) ?: 'utf8mb4';

    if ($host && $name && $user !== null) {
        return new PDO(
            "mysql:host={$host};dbname={$name};charset={$charset}",
            (string)$user,
            (string)$pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
    }

    throw new RuntimeException('Database connection not available');
}

function pq_has_table($pdo, string $table): bool {
    try {
        $safe = str_replace('`', '``', $table);
        $rows = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($safe))->fetchAll(PDO::FETCH_NUM) ?: [];
        return !empty($rows);
    } catch (Throwable $e) {
        try {
            $pdo->query('DESCRIBE `' . str_replace('`', '``', $table) . '`');
            return true;
        } catch (Throwable $inner) {
            return false;
        }
    }
}

function pq_columns($pdo, string $table): array {
    if (!pq_has_table($pdo, $table)) {
        return [];
    }

    try {
        $rows = $pdo->query('DESCRIBE `' . str_replace('`', '``', $table) . '`')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $cols = [];
        foreach ($rows as $row) {
            $name = strtolower((string)($row['Field'] ?? ''));
            if ($name !== '') {
                $cols[$name] = true;
            }
        }
        return $cols;
    } catch (Throwable $e) {
        return [];
    }
}

function pq_first_col(array $cols, array $candidates): ?string {
    foreach ($candidates as $candidate) {
        $key = strtolower($candidate);
        if (isset($cols[$key])) {
            return $candidate;
        }
    }

    return null;
}

function pq_env_int(string $key, int $default): int {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }

    return is_numeric($value) ? (int)$value : $default;
}

function pq_now_local(): DateTimeImmutable {
    return new DateTimeImmutable('now', new DateTimeZone('America/Vancouver'));
}

function pq_active_daily_day(): string {
    $resetHour = pq_env_int('PQ_DAILY_RESET_HOUR', 17);
    $now = pq_now_local();
    if ((int)$now->format('G') < $resetHour) {
        $now = $now->modify('-1 day');
    }

    return $now->format('Y-m-d');
}

function pq_default_claim_day(): string {
    $dt = new DateTimeImmutable(pq_active_daily_day(), new DateTimeZone('America/Vancouver'));
    return $dt->modify('-1 day')->format('Y-m-d');
}

function pq_reward_from_rank(int $rank): array {
    if ($rank <= 0) {
        return ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 0];
    }
    if ($rank === 1) {
        return ['points' => 50, 'gold' => 1, 'silver' => 0, 'bronze' => 0];
    }
    if ($rank === 2) {
        return ['points' => 35, 'gold' => 0, 'silver' => 1, 'bronze' => 0];
    }
    if ($rank === 3) {
        return ['points' => 25, 'gold' => 0, 'silver' => 1, 'bronze' => 0];
    }
    if ($rank === 4) {
        return ['points' => 15, 'gold' => 0, 'silver' => 1, 'bronze' => 0];
    }
    if ($rank === 5) {
        return ['points' => 10, 'gold' => 0, 'silver' => 1, 'bronze' => 0];
    }
    if ($rank <= 10) {
        return ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 1];
    }

    return ['points' => 0, 'gold' => 0, 'silver' => 0, 'bronze' => 0];
}
