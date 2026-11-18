<?php
declare(strict_types=1);

/**
 * MySQL 8.0 vs MariaDB compatibility probe (M2 preparation). Runs small SQL experiments on each engine and prints a comparison table.
 * It is READ-ONLY with respect to the project: it never touches an existing database and never runs the project's migrations.
 *
 * SAFETY: it only runs when AGRI_DISPOSABLE_DB_OK=1 is set, creates one scratch database named agri_probe_<random>, and drops it at the end.
 * Point it ONLY at disposable servers:   AGRI_DISPOSABLE_DB_OK=1 php database/validation/compat-probe.php 127.0.0.1:3307 127.0.0.1:3308
 */
if (getenv('AGRI_DISPOSABLE_DB_OK') !== '1') {
    fwrite(STDERR, "Refusing to run: set AGRI_DISPOSABLE_DB_OK=1 and target a disposable server.\n");
    exit(2);
}
$targets = array_slice($argv, 1);
if ($targets === []) {
    fwrite(STDERR, "Usage: AGRI_DISPOSABLE_DB_OK=1 php compat-probe.php host:port [host:port ...]\n");
    exit(2);
}

/** Each probe: [label, [statements...], optional SELECT whose first value is reported]. A thrown error is reported as ERR(code). */
$probes = [
    ['DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)', ['CREATE TABLE p1 (a DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB', 'INSERT INTO p1 () VALUES ()'], "SELECT LENGTH(CAST(a AS CHAR)) FROM p1"],
    ['TEXT NOT NULL DEFAULT \'\' (literal default on TEXT)', ["CREATE TABLE p2 (a TEXT NOT NULL DEFAULT '') ENGINE=InnoDB"]],
    ['TEXT DEFAULT (\'\') (expression default)', ["CREATE TABLE p3 (a TEXT NOT NULL DEFAULT ('')) ENGINE=InnoDB"]],
    ['native JSON column rejects invalid JSON', ['CREATE TABLE p4 (a JSON NOT NULL) ENGINE=InnoDB', "INSERT INTO p4 VALUES ('not json')"]],
    ['LONGTEXT + CHECK(JSON_VALID) rejects invalid JSON', ['CREATE TABLE p5 (a LONGTEXT NOT NULL, CONSTRAINT p5_json CHECK (JSON_VALID(a))) ENGINE=InnoDB', "INSERT INTO p5 VALUES ('not json')"]],
    ['LONGTEXT + CHECK(JSON_VALID) accepts valid JSON', ["INSERT INTO p5 VALUES ('{\"a\":1}')"]],
    ['CREATE INDEX IF NOT EXISTS', ['CREATE TABLE p6 (a INT) ENGINE=InnoDB', 'CREATE INDEX IF NOT EXISTS i6 ON p6 (a)']],
    ['ALTER TABLE ADD COLUMN IF NOT EXISTS', ['ALTER TABLE p6 ADD COLUMN IF NOT EXISTS b INT']],
    ['collation utf8mb4_unicode_ci', ['CREATE TABLE p7 (a VARCHAR(20) COLLATE utf8mb4_unicode_ci) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4']],
    ['collation utf8mb4_0900_ai_ci (MySQL-8 default)', ['CREATE TABLE p8 (a VARCHAR(20) COLLATE utf8mb4_0900_ai_ci) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4']],
    ['reserved word `key` unquoted as a column', ['CREATE TABLE p9 (key VARCHAR(10)) ENGINE=InnoDB']],
    ['column named `rank` / `groups` / `system` unquoted', ['CREATE TABLE p10 (rank INT, groups INT, system INT) ENGINE=InnoDB']],
    ['ONLY_FULL_GROUP_BY enforced', ['CREATE TABLE p11 (a INT, b INT) ENGINE=InnoDB', 'INSERT INTO p11 VALUES (1,1),(1,2)', "SET SESSION sql_mode='STRICT_ALL_TABLES,ONLY_FULL_GROUP_BY'", 'SELECT a, b FROM p11 GROUP BY a']],
    ['4-byte emoji round trip in utf8mb4', ['CREATE TABLE p12 (a VARCHAR(20)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', "INSERT INTO p12 VALUES ('🌾 rice')"], 'SELECT a FROM p12'],
    ['UNIQUE email is case-insensitive (unicode_ci)', ['CREATE TABLE p13 (e VARCHAR(40) NOT NULL, UNIQUE KEY (e)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', "INSERT INTO p13 VALUES ('A@x.com')", "INSERT INTO p13 VALUES ('a@x.com')"]],
    ['accent-insensitive LIKE (é matches e)', ['CREATE TABLE p14 (a VARCHAR(20)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', "INSERT INTO p14 VALUES ('café')"], "SELECT COUNT(*) FROM p14 WHERE a LIKE '%cafe%'"],
    ['ENUM rejects invalid value (strict)', ["SET SESSION sql_mode='STRICT_ALL_TABLES'", "CREATE TABLE p15 (s ENUM('a','b') NOT NULL) ENGINE=InnoDB", "INSERT INTO p15 VALUES ('c')"]],
    ['CHECK constraint enforced', ['CREATE TABLE p16 (n INT, CONSTRAINT c16 CHECK (n > 0)) ENGINE=InnoDB', 'INSERT INTO p16 VALUES (0)']],
    ['SELECT ... FOR UPDATE SKIP LOCKED', ['CREATE TABLE p17 (id INT PRIMARY KEY) ENGINE=InnoDB', 'SELECT * FROM p17 FOR UPDATE SKIP LOCKED']],
    ['INSERT ... RETURNING', ['INSERT INTO p17 (id) VALUES (1) RETURNING id']],
    ['INSERT ... ON DUPLICATE KEY UPDATE', ['INSERT INTO p17 (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id']],
    ['SET time_zone = \'+00:00\' (offset form)', ["SET time_zone = '+00:00'"]],
    ['GET_LOCK / RELEASE_LOCK', ["SELECT GET_LOCK('agri_probe', 1)"], "SELECT RELEASE_LOCK('agri_probe')"],
    ['composite PK of two VARCHAR(100) utf8mb4 (800-byte key)', ['CREATE TABLE p18 (actor VARCHAR(100) NOT NULL, op_key VARCHAR(100) NOT NULL, PRIMARY KEY (actor, op_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci']],
    ['FK ON DELETE SET NULL to BIGINT UNSIGNED', ['CREATE TABLE p19u (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB', 'CREATE TABLE p19l (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, uid BIGINT UNSIGNED NULL, CONSTRAINT fk19 FOREIGN KEY (uid) REFERENCES p19u(id) ON DELETE SET NULL) ENGINE=InnoDB', 'INSERT INTO p19u (id) VALUES (5)', 'INSERT INTO p19l (uid) VALUES (5)', 'DELETE FROM p19u WHERE id = 5'], 'SELECT IFNULL(uid, \'NULL\') FROM p19l'],
    ['explicit id insert then AUTO_INCREMENT reset', ['CREATE TABLE p20 (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, n INT) ENGINE=InnoDB', 'INSERT INTO p20 (id, n) VALUES (41, 1)', 'ALTER TABLE p20 AUTO_INCREMENT = 100', 'INSERT INTO p20 (n) VALUES (2)'], 'SELECT MAX(id) FROM p20'],
    ['information_schema COLUMN_DEFAULT representation', ["CREATE TABLE p21 (a VARCHAR(10) NOT NULL DEFAULT 'x', b INT NOT NULL DEFAULT 0) ENGINE=InnoDB"], "SELECT CONCAT(MAX(CASE WHEN COLUMN_NAME='a' THEN COLUMN_DEFAULT END), ' | ', MAX(CASE WHEN COLUMN_NAME='b' THEN COLUMN_DEFAULT END)) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'p21'"],
    ['DATETIME(3) round trip keeps milliseconds', ["CREATE TABLE p22 (t DATETIME(3) NOT NULL) ENGINE=InnoDB", "INSERT INTO p22 VALUES ('2026-11-18 12:34:56.789')"], "SELECT DATE_FORMAT(t, '%Y-%m-%d %H:%i:%s.%f') FROM p22"],
    ['updated_at NOT bumped by unrelated column update (no ON UPDATE)', ["CREATE TABLE p23 (v INT NOT NULL DEFAULT 0, updated_at DATETIME(3) NOT NULL DEFAULT '2000-01-01 00:00:00.000') ENGINE=InnoDB", 'INSERT INTO p23 () VALUES ()', 'UPDATE p23 SET v = v + 1'], "SELECT CAST(updated_at AS CHAR) FROM p23"],
    ['TIMESTAMP column with ON UPDATE bumps on any change (what we must NOT use)', ["CREATE TABLE p24 (v INT NOT NULL DEFAULT 0, u TIMESTAMP(3) NOT NULL DEFAULT '2000-01-02 00:00:00.000' ON UPDATE CURRENT_TIMESTAMP(3)) ENGINE=InnoDB", 'INSERT INTO p24 () VALUES ()', 'UPDATE p24 SET v = v + 1'], "SELECT CAST(u AS CHAR) FROM p24"],
];

function runProbe(PDO $pdo, array $probe): string
{
    [, $statements] = $probe;
    $select = $probe[2] ?? null;
    $last = null;
    try {
        foreach ($statements as $sql) {
            $stmt = $pdo->query($sql);
            if ($stmt !== false && $stmt->columnCount() > 0) {
                $last = $stmt->fetchColumn();
                $stmt->closeCursor();
            }
        }
        if ($select !== null) {
            $stmt = $pdo->query($select);
            $last = $stmt->fetchColumn();
            $stmt->closeCursor();
        }
        return 'OK' . ($last !== null && $last !== false && $select !== null ? ' → ' . (string) $last : '');
    } catch (Throwable $e) {
        $code = $e instanceof PDOException && isset($e->errorInfo[1]) ? (string) $e->errorInfo[1] : '?';
        return 'ERR ' . $code;
    }
}

$results = [];
$versions = [];
foreach ($targets as $target) {
    [$host, $port] = explode(':', $target) + [1 => '3306'];
    $pdo = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $versions[$target] = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
    $db = 'agri_probe_' . bin2hex(random_bytes(4));
    $pdo->exec("CREATE DATABASE `$db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `$db`");
    try {
        foreach ($probes as $i => $probe) {
            $pdo->exec("SET SESSION sql_mode = DEFAULT");
            $results[$i][$target] = runProbe($pdo, $probe);
        }
    } finally {
        $pdo->exec("DROP DATABASE `$db`");
    }
}

echo "Engines: " . implode(' | ', array_map(fn ($t) => "$t = {$versions[$t]}", $targets)) . "\n\n";
foreach ($probes as $i => $probe) {
    $cells = array_map(fn ($t) => str_pad($results[$i][$t], 28), $targets);
    $same = count(array_unique(array_map(fn ($t) => $results[$i][$t], $targets))) === 1;
    echo ($same ? '  ' : '≠ ') . str_pad($probe[0], 72) . implode(' ', $cells) . "\n";
}
echo "\n(≠ marks a difference between the engines; scratch databases were dropped)\n";
