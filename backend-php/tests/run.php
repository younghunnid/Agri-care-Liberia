#!/usr/bin/env php
<?php
declare(strict_types=1);
/**
 * M2 validation matrix. Runs every check on every engine given as host:port arguments, each time in brand-new scratch databases
 * (agri_m2_t_<random>) that are dropped afterwards. Refuses unless AGRI_DISPOSABLE_DB_OK=1. Needs DB_USER/DB_PASS in the environment.
 * Usage: AGRI_DISPOSABLE_DB_OK=1 DB_USER=root DB_PASS= php backend-php/tests/run.php 127.0.0.1:3307 127.0.0.1:3308
 */
require __DIR__ . '/../app/autoload.php';

use Agri\Database\Connection;
use Agri\Migrations\Linter;
use Agri\Migrations\Runner;
use Agri\Seed\Seeder;

if (getenv('AGRI_DISPOSABLE_DB_OK') !== '1') { fwrite(STDERR, "Refusing: set AGRI_DISPOSABLE_DB_OK=1 (tests create and drop scratch databases).\n"); exit(2); }
$targets = array_slice($argv, 1);
if (!$targets) { fwrite(STDERR, "usage: run.php host:port [host:port ...]\n"); exit(2); }

$root = dirname(__DIR__, 2);
$migDir = $root . '/backend-php/migrations';
$seedDir = $root . '/database/seed';
$results = [];
$fails = 0;

function check(string $engine, string $name, callable $fn): void
{
    global $results, $fails;
    try { $fn(); $results[$name][$engine] = 'ok'; }
    catch (Throwable $e) { $results[$name][$engine] = 'FAIL: ' . $e->getMessage(); $fails++; }
}
function ok(bool $c, string $m): void { if (!$c) throw new RuntimeException($m); }
function eq(mixed $a, mixed $b, string $m): void { if ($a !== $b) throw new RuntimeException($m . ' (got ' . var_export($a, true) . ', expected ' . var_export($b, true) . ')'); }
function rejects(PDO $p, string $sql, array $args, string $m): void
{
    try { $p->prepare($sql)->execute($args); } catch (PDOException) { return; }
    throw new RuntimeException($m . ' was accepted but must be rejected');
}
function one(PDO $p, string $sql, array $a = []): mixed { $s = $p->prepare($sql); $s->execute($a); return $s->fetchColumn(); }
function newUser(PDO $p, string $tag): int
{
    $p->prepare("INSERT INTO users (display_name, phone, email, password_hash) VALUES (?,?,?, 'x')")->execute(["U $tag", "+231$tag", "$tag@example.test"]);
    return (int)$p->lastInsertId();
}
function tmpdir(): string { $d = sys_get_temp_dir() . '/agri_mig_' . bin2hex(random_bytes(4)); mkdir($d); return $d; }
const T = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

// ---------- SQLite reference (in memory, built from the Node migrations; no database file is opened) ----------
$lite = new PDO('sqlite::memory:');
$lite->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
foreach (glob($root . '/server/migrations/*.sql') as $f) $lite->exec((string)file_get_contents($f));
$liteSql = [];
foreach ($lite->query("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") as $r) $liteSql[$r['name']] = $r['sql'];
unset($liteSql['schema_migrations']);
ksort($liteSql);

$cfgBase = Connection::configFromEnv();
foreach ($targets as $t) {
    [$host, $port] = explode(':', $t) + [1 => '3306'];
    $admin = Connection::open(['host' => $host, 'port' => (int)$port, 'name' => null] + $cfgBase);
    $banner = (string)$admin->query('SELECT VERSION()')->fetchColumn();
    $engine = (stripos($banner, 'mariadb') !== false ? 'MariaDB ' : 'MySQL ') . preg_replace('/-.*/', '', preg_replace('/^5\.5\.5-/', '', $banner));
    $drops = [];
    $mk = function () use ($admin, $host, $port, $cfgBase, &$drops): array {
        $db = 'agri_m2_t_' . bin2hex(random_bytes(4));
        $admin->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $drops[] = $db;
        return [$db, Connection::open(['host' => $host, 'port' => (int)$port, 'name' => $db] + $cfgBase)];
    };
    $fresh = function () use ($mk, $migDir): array { [$db, $pdo] = $mk(); (new Runner($pdo, $migDir))->up(); return [$db, $pdo]; };

    check($engine, '01 lint passes on migrations', function () use ($migDir) {
        foreach (glob("$migDir/*.sql") as $f) { $v = Linter::lint($f, (string)file_get_contents($f)); ok(!$v, implode('; ', $v)); }
    });
    check($engine, '02 lint rejects non-portable SQL', function () {
        $bad = ["CREATE TABLE t (id INT, created TIMESTAMP) " . T . ";",
            "CREATE TABLE t (id INT, u DATETIME(3) ON UPDATE CURRENT_TIMESTAMP(3)) " . T . ";",
            "CREATE TABLE t (d JSON) " . T . ";",
            "CREATE TABLE t (\n  b TEXT NOT NULL DEFAULT 'x'\n) " . T . ";",
            "CREATE TABLE t (\n  key VARCHAR(5)\n) " . T . ";",
            "CREATE TABLE t (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;",
            "CREATE TABLE t (id INT);", "CREATE INDEX IF NOT EXISTS i ON t (id);", "DROP TABLE t;", "CREATE TABLE Tt (id INT) " . T . ";"];
        foreach ($bad as $i => $sql) ok(count(Linter::lint("x$i.sql", $sql)) > 0, "linter missed: " . str_replace("\n", ' ', $sql));
    });

    check($engine, '03 preflight accepts engine and session', function () use ($mk, $migDir) { [, $p] = $mk(); $r = (new Runner($p, $migDir))->preflight(); ok($r['version'] !== '', 'no version'); });
    check($engine, '04 dry run changes nothing', function () use ($mk, $migDir) {
        [, $p] = $mk();
        eq((new Runner($p, $migDir))->up(true), ['001_schema'], 'dry-run list');
        eq((int)one($p, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()"), 0, 'tables after dry run');
    });
    check($engine, '05 install #1: 26 tables + ledger = 27', function () use ($mk, $migDir) {
        [, $p] = $mk();
        eq((new Runner($p, $migDir))->up(), ['001_schema'], 'applied');
        eq((int)one($p, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE'"), 27, 'table count');
        eq(strlen((string)one($p, 'SELECT checksum FROM schema_migrations')), 64, 'checksum length');
    });
    check($engine, '06 install #2 is a no-op (idempotent)', function () use ($fresh, $migDir) {
        [, $p] = $fresh(); $q = 'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()'; $before = one($p, $q);
        eq((new Runner($p, $migDir))->up(), [], 'second run applied something');
        eq(one($p, $q), $before, 'columns changed'); eq((int)one($p, 'SELECT COUNT(*) FROM schema_migrations'), 1, 'ledger rows');
    });
    check($engine, '07 checksum tamper is detected', function () use ($fresh, $migDir) {
        [, $p] = $fresh(); $tmp = tmpdir();
        copy("$migDir/001_schema.sql", "$tmp/001_schema.sql"); file_put_contents("$tmp/001_schema.sql", "\n-- tampered\n", FILE_APPEND);
        try { (new Runner($p, $tmp))->up(); $caught = false; } catch (RuntimeException $e) { $caught = str_contains($e->getMessage(), 'checksum mismatch'); }
        $st = (new Runner($p, $tmp))->status(); unlink("$tmp/001_schema.sql"); rmdir($tmp);
        ok($caught, 'tampered migration was not refused'); eq($st[0]['state'], 'changed', 'status');
    });
    check($engine, '08 advisory lock blocks concurrent runs', function () use ($mk, $migDir, $host, $port, $cfgBase) {
        [$d, $p] = $mk();
        $other = Connection::open(['host' => $host, 'port' => (int)$port, 'name' => $d] + $cfgBase);
        $other->query("SELECT GET_LOCK('agri_migrate', 0)")->fetchAll();
        try { (new Runner($p, $migDir))->up(); $blocked = false; } catch (RuntimeException $e) { $blocked = str_contains($e->getMessage(), 'lock'); }
        $other->query("SELECT RELEASE_LOCK('agri_migrate')")->fetchAll();
        ok($blocked, 'second runner was not blocked');
        eq((new Runner($p, $migDir))->up(), ['001_schema'], 'run after release');
    });
    check($engine, '09 unmanaged non-empty schema refused', function () use ($mk, $migDir) {
        [, $p] = $mk(); $p->exec('CREATE TABLE stray (id INT) ENGINE=InnoDB');
        try { (new Runner($p, $migDir))->up(); $r = false; } catch (RuntimeException $e) { $r = str_contains($e->getMessage(), 'no migration ledger'); }
        ok($r, 'ran against an unmanaged database');
    });
    check($engine, '10 failed migration not recorded, statement reported', function () use ($mk) {
        [, $p] = $mk(); $tmp = tmpdir();
        file_put_contents("$tmp/001_bad.sql", "CREATE TABLE ok_t (id INT) " . T . ";\nCREATE TABLE ok_t (id INT) " . T . ";\n");
        try { (new Runner($p, $tmp))->up(); $e2 = false; } catch (RuntimeException $e) { $e2 = str_contains($e->getMessage(), 'statement 2'); }
        unlink("$tmp/001_bad.sql"); rmdir($tmp);
        ok($e2, 'failure not reported with statement number'); eq((int)one($p, 'SELECT COUNT(*) FROM schema_migrations'), 0, 'ledger recorded a failed file');
    });
    check($engine, '11 lint failure blocks the runner', function () use ($mk) {
        [, $p] = $mk(); $tmp = tmpdir(); file_put_contents("$tmp/001_x.sql", "CREATE TABLE zz (a TIMESTAMP) " . T . ";\n");
        try { (new Runner($p, $tmp))->up(); $r = false; } catch (RuntimeException $e) { $r = str_contains($e->getMessage(), 'Lint failed'); }
        unlink("$tmp/001_x.sql"); rmdir($tmp); ok($r, 'non-portable migration ran');
        eq((int)one($p, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()"), 0, 'tables created');
    });

    [, $sp] = $fresh();
    check($engine, '12 same tables as SQLite reference', function () use ($sp, $liteSql) {
        $mysql = array_column($sp->query("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations' ORDER BY 1")->fetchAll(), 'n');
        $mysql = array_map('strtolower', $mysql); sort($mysql); eq($mysql, array_keys($liteSql), 'table set'); eq(count($mysql), 26, 'data table count');
    });
    check($engine, '13 same columns and nullability', function () use ($sp, $lite, $liteSql) {
        foreach (array_keys($liteSql) as $tbl) {
            $mc = [];
            $st = $sp->prepare('SELECT column_name AS c, is_nullable AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?'); $st->execute([$tbl]);
            foreach ($st->fetchAll() as $r) $mc[strtolower($r['c'])] = $r['n'] === 'YES';
            $lc = [];
            foreach ($lite->query("PRAGMA table_info('$tbl')") as $r) {
                $n = ($tbl === 'platform_settings' && $r['name'] === 'key') ? 'setting_key' : $r['name'];
                $lc[$n] = !$r['notnull'] && !$r['pk'];
            }
            ksort($mc); ksort($lc);
            eq(array_keys($mc), array_keys($lc), "$tbl columns");
            foreach ($lc as $c => $nullable) {
                if ($mc[$c] === $nullable) continue;
                $pk = (int)one($sp, "SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? AND constraint_name = 'PRIMARY'", [$tbl, $c]);
                ok($pk === 1 && $mc[$c] === false, "$tbl.$c nullability differs");
            }
        }
    });
    check($engine, '14 foreign keys: 30, same delete rules', function () use ($sp, $lite, $liteSql) {
        $m = [];
        foreach ($sp->query("SELECT table_name t, column_name c, referenced_table_name rt, referenced_column_name rc, constraint_name n FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL")->fetchAll() as $r) {
            $rule = one($sp, 'SELECT delete_rule FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND constraint_name = ? AND table_name = ?', [$r['n'], $r['t']]);
            $m[strtolower("{$r['t']}.{$r['c']}->{$r['rt']}.{$r['rc']}")] = strtoupper((string)$rule);
        }
        $l = [];
        foreach (array_keys($liteSql) as $tbl) foreach ($lite->query("PRAGMA foreign_key_list('$tbl')") as $r) $l["$tbl.{$r['from']}->{$r['table']}.{$r['to']}"] = strtoupper(str_replace('NO ACTION', 'RESTRICT', $r['on_delete']));
        ksort($m); ksort($l); eq($m, $l, 'FK set / delete rules'); eq(count($m), 30, 'FK count');
    });
    check($engine, '15 every FK column has a leading index', function () use ($sp) {
        foreach ($sp->query("SELECT table_name t, column_name c FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL")->fetchAll() as $r) {
            ok((int)one($sp, "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? AND seq_in_index = 1", [$r['t'], $r['c']]) > 0, "{$r['t']}.{$r['c']} has no leading index");
        }
    });
    check($engine, '16 same UNIQUE constraints (7)', function () use ($sp, $lite, $liteSql) {
        $m = [];
        foreach ($sp->query("SELECT table_name t, GROUP_CONCAT(column_name ORDER BY seq_in_index) cols FROM information_schema.statistics WHERE table_schema = DATABASE() AND non_unique = 0 AND index_name <> 'PRIMARY' AND table_name <> 'schema_migrations' GROUP BY table_name, index_name")->fetchAll() as $r) $m[] = strtolower($r['t'] . '(' . $r['cols'] . ')');
        $l = [];
        foreach (array_keys($liteSql) as $tbl) foreach ($lite->query("PRAGMA index_list('$tbl')") as $ix) {
            if (!$ix['unique'] || $ix['origin'] === 'pk') continue;
            $l[] = "$tbl(" . implode(',', array_column($lite->query("PRAGMA index_info('{$ix['name']}')")->fetchAll(), 'name')) . ')';
        }
        sort($m); sort($l);
        // SQLite reports composite PRIMARY KEY-like uniques the same way; compare sets and require at least the 7 declared ones
        eq($m, $l, 'unique set'); ok(count($m) >= 7, 'fewer than 7 UNIQUE constraints');
    });
    check($engine, '17 explicit SQLite indexes exist by name', function () use ($sp, $lite) {
        $n = 0;
        foreach ($lite->query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")->fetchAll(PDO::FETCH_COLUMN) as $ix) {
            ok((int)one($sp, 'SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name = ?', [$ix]) > 0, "missing index $ix"); $n++;
        }
        ok($n >= 6, "only $n indexes compared");
    });
    check($engine, '18 ENUM values equal SQLite CHECK sets', function () use ($sp, $liteSql) {
        $n = 0;
        foreach ($liteSql as $tbl => $sql) {
            if (!preg_match_all('/(\w+)\s+TEXT[^,]*?CHECK\s*\(\s*\1\s+IN\s*\(([^)]*)\)\s*\)/is', $sql, $mm, PREG_SET_ORDER)) continue;
            foreach ($mm as $x) {
                $want = array_map(fn($v) => trim($v, " '"), explode(',', $x[2]));
                $type = (string)one($sp, 'SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [$tbl, $x[1]]);
                preg_match_all("/'((?:[^']|'')*)'/", $type, $e);
                eq(array_map(fn($v) => str_replace("''", "'", $v), $e[1]), $want, "$tbl.{$x[1]} enum"); $n++;
            }
        }
        ok($n >= 13, "only $n CHECK sets compared");
    });
    check($engine, '19 ALTER-added CHECK (availability_status) is an ENUM', function () use ($sp) {
        eq((string)one($sp, "SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='marketplace_listings' AND column_name='availability_status'"), "enum('Available','Limited Stock','Sold Out')", 'enum');
    });
    check($engine, '20 InnoDB + utf8mb4_unicode_ci everywhere', function () use ($sp) {
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND (engine <> 'InnoDB' OR table_collation <> 'utf8mb4_unicode_ci')"), 0, 'tables');
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND collation_name IS NOT NULL AND collation_name <> 'utf8mb4_unicode_ci'"), 0, 'columns');
    });
    check($engine, '21 timestamps: DATETIME(3), no TIMESTAMP, no ON UPDATE', function () use ($sp, $lite, $liteSql) {
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND data_type = 'timestamp'"), 0, 'TIMESTAMP columns');
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND LOWER(extra) LIKE '%on update%'"), 0, 'ON UPDATE columns');
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND data_type = 'datetime' AND datetime_precision <> 3"), 0, 'precision');
        $want = [];
        foreach (array_keys($liteSql) as $tbl) foreach ($lite->query("PRAGMA table_info('$tbl')") as $r) if (str_ends_with($r['name'], '_at')) $want[] = "$tbl.{$r['name']}";
        $got = array_column($sp->query("SELECT CONCAT(table_name, '.', column_name) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND data_type = 'datetime' AND table_name <> 'schema_migrations'")->fetchAll(), 'c');
        sort($want); sort($got); eq($got, $want, 'every SQLite *_at column (and only those) is DATETIME(3)'); ok(count($want) === 32, 'expected 32 timestamp columns, saw ' . count($want));
    });
    check($engine, '22 no reserved or uppercase identifiers', function () use ($sp) {
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND (column_name = 'key' OR BINARY column_name <> LOWER(column_name))"), 0, 'columns');
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND BINARY table_name <> LOWER(table_name)"), 0, 'tables');
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='platform_settings' AND column_name='setting_key'"), 1, 'setting_key');
    });
    check($engine, '23 JSON CHECK constraints present (5)', function () use ($sp) {
        eq((int)one($sp, "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_type = 'CHECK' AND constraint_name LIKE 'ck\\_%'"), 5, 'JSON CHECK constraints');
    });

    check($engine, '24 session sql_mode and time_zone applied', function () use ($sp) {
        eq((string)one($sp, 'SELECT @@time_zone'), '+00:00', 'time_zone');
        foreach (['STRICT_ALL_TABLES', 'ONLY_FULL_GROUP_BY', 'NO_ZERO_DATE'] as $m) ok(str_contains((string)one($sp, 'SELECT @@sql_mode'), $m), "sql_mode lacks $m");
    });
    check($engine, '25 NOT NULL / ENUM / too-long / orphan FK rejected', function () use ($sp) {
        rejects($sp, "INSERT INTO users (display_name, phone, password_hash) VALUES (NULL,'+2310001','x')", [], 'NULL display_name');
        rejects($sp, "INSERT INTO users (display_name, phone, password_hash, status) VALUES ('a','+2310002','x','bogus')", [], 'bad enum');
        rejects($sp, "INSERT INTO users (display_name, phone, password_hash) VALUES (?, '+2310003','x')", [str_repeat('a', 121)], 'too-long varchar');
        rejects($sp, "INSERT INTO user_roles (user_id, role_id) VALUES (99999, 99999)", [], 'orphan FK');
    });
    check($engine, '26 UNIQUE phone/email; case-variant email rejected (D16)', function () use ($sp) {
        $sp->exec("INSERT INTO users (display_name, phone, email, password_hash) VALUES ('a','+2319001','Case@Example.test','x')");
        rejects($sp, "INSERT INTO users (display_name, phone, email, password_hash) VALUES ('b','+2319002','case@example.TEST','x')", [], 'case-variant duplicate email');
        rejects($sp, "INSERT INTO users (display_name, phone, email, password_hash) VALUES ('c','+2319001','z@example.test','x')", [], 'duplicate phone');
        $sp->exec("INSERT INTO users (display_name, phone, email, password_hash) VALUES ('d','+2319003',NULL,'x')");
        $sp->exec("INSERT INTO users (display_name, phone, email, password_hash) VALUES ('e','+2319004',NULL,'x')");
    });
    check($engine, '27 cascade / set null / restrict behave', function () use ($sp) {
        $sp->exec("INSERT INTO roles (name, description) VALUES ('r_t','t')"); $role = (int)$sp->lastInsertId();
        $u = newUser($sp, '7001'); $sp->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)')->execute([$u, $role]);
        $sp->exec("INSERT INTO crops (slug,name,summary,season_note,image_url) VALUES ('c_t','c','s','s','u')"); $crop = (int)$sp->lastInsertId();
        $sp->exec("INSERT INTO guide_categories (slug,name,description) VALUES ('g_t','g','d')"); $cat = (int)$sp->lastInsertId();
        $sp->prepare("INSERT INTO agricultural_guides (slug,crop_id,category_id,title,summary,content_markdown,image_url,source_attribution,created_by) VALUES ('s_t',?,?,'t','s','m','u','a',?)")->execute([$crop, $cat, $u]);
        $gid = (int)$sp->lastInsertId();
        $sp->prepare("INSERT INTO marketplace_listings (seller_user_id,seller_name,category,product_name,quantity,unit,price_lrd,county,town,description,image_url) VALUES (?,'s','c','p','1','kg',5,'Lofa','t','d','u')")->execute([$u]);
        $lid = (int)$sp->lastInsertId();
        rejects($sp, 'DELETE FROM crops WHERE id = ?', [$crop], 'deleting a crop that has guides (RESTRICT)');
        $sp->prepare('DELETE FROM users WHERE id = ?')->execute([$u]);
        eq((int)one($sp, 'SELECT COUNT(*) FROM user_roles WHERE user_id = ?', [$u]), 0, 'user_roles cascade');
        eq(one($sp, 'SELECT created_by FROM agricultural_guides WHERE id = ?', [$gid]), null, 'guide.created_by SET NULL');
        eq(one($sp, 'SELECT seller_user_id FROM marketplace_listings WHERE id = ?', [$lid]), null, 'listing.seller SET NULL');
        $sp->prepare("INSERT INTO marketplace_inquiries (listing_id,buyer_name,buyer_county,message) VALUES (?,'b','Lofa','m')")->execute([$lid]);
        $sp->prepare('DELETE FROM marketplace_listings WHERE id = ?')->execute([$lid]);
        eq((int)one($sp, 'SELECT COUNT(*) FROM marketplace_inquiries WHERE listing_id = ?', [$lid]), 0, 'inquiry cascade');
    });
    check($engine, '28 JSON: valid ok, invalid rejected, NULL tolerated (D12)', function () use ($sp) {
        $u = newUser($sp, '7002');
        $sp->prepare("INSERT INTO saved_advice (user_id,source_type,title,content_text,metadata_json) VALUES (?,'guide','t','c',?)")->execute([$u, '{"a":[1,2]}']);
        rejects($sp, "INSERT INTO saved_advice (user_id,source_type,title,content_text,metadata_json) VALUES (?,'guide','t','c','{bad')", [$u], 'invalid JSON');
        rejects($sp, "INSERT INTO saved_advice (user_id,source_type,title,content_text,metadata_json) VALUES (?,'guide','t','c',NULL)", [$u], 'NULL into NOT NULL JSON column');
        eq((string)one($sp, "SELECT metadata_json FROM saved_advice WHERE user_id = ? LIMIT 1", [$u]), '{"a":[1,2]}', 'json round trip');
        $sp->exec('CREATE TEMPORARY TABLE tmp_json_null (j LONGTEXT NULL, CONSTRAINT ck_tmp CHECK (JSON_VALID(j)))');
        $sp->exec('INSERT INTO tmp_json_null VALUES (NULL)'); $sp->exec("INSERT INTO tmp_json_null VALUES ('[]')");
        rejects($sp, "INSERT INTO tmp_json_null VALUES ('nope')", [], 'invalid JSON in nullable column');
    });
    check($engine, '29 D1: view-count update keeps updated_at; edit changes it', function () use ($sp) {
        $sp->exec("INSERT INTO marketplace_listings (seller_name,category,product_name,quantity,unit,price_lrd,county,town,description,image_url) VALUES ('s','c','p','1','kg',5,'Lofa','t','d','u')");
        $id = (int)$sp->lastInsertId(); $q = 'SELECT DATE_FORMAT(updated_at, "%Y-%m-%d %H:%i:%s.%f") FROM marketplace_listings WHERE id = ?';
        $t0 = (string)one($sp, $q, [$id]); usleep(30000);
        $sp->prepare('UPDATE marketplace_listings SET view_count = view_count + 1 WHERE id = ?')->execute([$id]);
        eq((string)one($sp, $q, [$id]), $t0, 'updated_at changed by a view-count-only update');
        eq((int)one($sp, 'SELECT view_count FROM marketplace_listings WHERE id = ?', [$id]), 1, 'view_count');
        $sp->prepare('UPDATE marketplace_listings SET price_lrd = 6, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?')->execute([$id]);
        ok((string)one($sp, $q, [$id]) > $t0, 'updated_at not advanced by an edit');
        $sp->prepare('UPDATE marketplace_listings SET updated_at = ? WHERE id = ?')->execute(['2026-01-02 03:04:05.678', $id]);
        eq((string)one($sp, $q, [$id]), '2026-01-02 03:04:05.678000', 'millisecond round trip');
    });
    check($engine, '30 emoji / multibyte round trip', function () use ($sp) {
        $txt = "Cassava 🌱 kwɛ̃ — café ñ 漢字";
        $sp->prepare("INSERT INTO feedback (name,message) VALUES ('e',?)")->execute([$txt]);
        eq((string)one($sp, 'SELECT message FROM feedback ORDER BY id DESC LIMIT 1'), $txt, 'utf8mb4');
    });
    check($engine, '31 2.5 MB data URL round-trips in all 4 large columns', function () use ($sp) {
        $max = (int)one($sp, 'SELECT @@max_allowed_packet'); ok($max >= 16 * 1048576, "max_allowed_packet too small for the test ($max)");
        $payload = 'data:image/jpeg;base64,' . base64_encode(random_bytes((int)(2.5 * 1048576 * 0.75)));
        ok(strlen($payload) >= (int)(2.49 * 1048576), 'payload smaller than 2.5 MB'); $h = hash('sha256', $payload);
        $sp->prepare("INSERT INTO marketplace_listings (seller_name,category,product_name,quantity,unit,price_lrd,county,town,description,image_url) VALUES ('s','c','big','1','kg',5,'Lofa','t','d',?)")->execute([$payload]);
        $sp->prepare("INSERT INTO local_language_recordings (language_code,topic_slug,topic_label,question_text,answer_text,speaker_name,audio_data_url) VALUES ('en','big','t','q','a','sp',?)")->execute([$payload]);
        $sp->prepare("INSERT INTO demo_expert_requests (farmer_name,category,county,title,description,photo_data_url,voice_note_data_url) VALUES ('f','c','Lofa','big','d',?,?)")->execute([$payload, $payload]);
        foreach ([['marketplace_listings', 'image_url', "product_name='big'"], ['local_language_recordings', 'audio_data_url', "topic_slug='big'"], ['demo_expert_requests', 'photo_data_url', "title='big'"], ['demo_expert_requests', 'voice_note_data_url', "title='big'"]] as [$tb, $c, $w]) {
            $back = (string)one($sp, "SELECT `$c` FROM `$tb` WHERE $w LIMIT 1");
            eq(strlen($back), strlen($payload), "$tb.$c length"); eq(hash('sha256', $back), $h, "$tb.$c hash");
        }
    });
    check($engine, '32 sync_operations (actor, op_key) is unique', function () use ($sp) {
        $ins = "INSERT INTO sync_operations (actor, op_key, kind, status_code, response_json) VALUES ('u:1','k1','create_listing',201,'{\"ok\":true}')";
        $sp->exec($ins); rejects($sp, $ins, [], 'duplicate (actor, op_key)');
        $sp->exec("INSERT INTO sync_operations (actor, op_key, kind, status_code, response_json) VALUES ('u:2','k1','create_listing',201,'{}')");
        $sp->exec("INSERT INTO sync_operations (actor, op_key, kind, status_code, response_json) VALUES ('u:1','k1','x',200,'{}') ON DUPLICATE KEY UPDATE actor = actor");
        eq((int)one($sp, "SELECT COUNT(*) FROM sync_operations WHERE actor='u:1' AND op_key='k1'"), 1, 'one row');
    });
    check($engine, '33 owner key hash stored; bad availability rejected', function () use ($sp) {
        $h = hash_hmac('sha256', 'k', 's');
        $sp->prepare("INSERT INTO marketplace_listings (seller_name,category,product_name,quantity,unit,price_lrd,county,town,description,image_url,owner_key_hash) VALUES ('s','c','h','1','kg',5,'Lofa','t','d','u',?)")->execute([$h]);
        eq((string)one($sp, "SELECT owner_key_hash FROM marketplace_listings WHERE product_name='h'"), $h, 'hash');
        rejects($sp, "INSERT INTO marketplace_listings (seller_name,category,product_name,quantity,unit,price_lrd,county,town,description,image_url,availability_status) VALUES ('s','c','x','1','kg',5,'Lofa','t','d','u','Gone')", [], 'invalid availability_status');
    });

    $env = fn(string $k, ?string $v) => $v === null ? putenv($k) : putenv("$k=$v");
    $counts = json_decode((string)file_get_contents("$seedDir/counts.json"), true);
    [, $rp] = $fresh();
    check($engine, '34 reference seed loads with source row counts', function () use ($rp, $seedDir, $counts) {
        $r = (new Seeder($rp, $seedDir))->reference();
        foreach (['roles', 'crops', 'guide_categories', 'agricultural_guides', 'guide_translations', 'platform_settings'] as $t) {
            eq((int)one($rp, "SELECT COUNT(*) FROM `$t`"), $counts[$t], "$t row count"); eq($r[$t], $counts[$t], "$t processed");
        }
        eq((int)one($rp, 'SELECT COUNT(*) FROM users'), 0, 'reference seed must create no users');
        eq((int)one($rp, 'SELECT COUNT(*) FROM marketplace_listings'), 0, 'reference seed must create no demo listings');
    });
    check($engine, '35 reference seed is idempotent', function () use ($rp, $seedDir, $counts) {
        $q = 'SELECT SUM(CRC32(CONCAT(slug,title,content_markdown))) FROM agricultural_guides'; $before = one($rp, $q);
        (new Seeder($rp, $seedDir))->reference();
        eq((int)one($rp, 'SELECT COUNT(*) FROM agricultural_guides'), $counts['agricultural_guides'], 'guide count after rerun');
        eq(one($rp, $q), $before, 'content changed on rerun');
    });
    check($engine, '36 reference parity: every seeded value equals Node export', function () use ($rp, $seedDir) {
        $data = json_decode((string)file_get_contents("$seedDir/reference.json"), true);
        $norm = fn($v) => is_string($v) ? preg_replace(['/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\.000$/', '/^(\d{4}-\d\d-\d\d) 00:00:00$/'], ['$1', '$1'], $v) : $v; // SQLite kept some date-only strings (last_reviewed_at); MySQL stores them as midnight UTC
        foreach ($data as $t => $rows) {
            $pk = $t === 'platform_settings' ? 'setting_key' : 'id';
            foreach ($rows as $row) {
                $st = $rp->prepare("SELECT * FROM `$t` WHERE `$pk` = ?"); $st->execute([$row[$pk]]); $db = $st->fetch();
                ok((bool)$db, "$t {$row[$pk]} missing");
                foreach ($row as $c => $v) eq((string)$norm($db[$c]), (string)$v, "$t.$pk={$row[$pk]}.$c");
            }
        }
    });
    check($engine, '37 prototype seed refused unless APP_ENV is test/development', function () use ($rp, $seedDir, $env) {
        $before = (int)one($rp, 'SELECT COUNT(*) FROM users');
        foreach ([null, '', 'production', 'staging', 'Production', 'prod'] as $e) {
            $env('APP_ENV', $e);
            try { (new Seeder($rp, $seedDir))->prototype(); $refused = false; } catch (RuntimeException $x) { $refused = str_contains($x->getMessage(), 'Refusing'); }
            ok($refused, 'prototype seed ran with APP_ENV=' . var_export($e, true));
        }
        $env('APP_ENV', null);
        eq((int)one($rp, 'SELECT COUNT(*) FROM users'), $before, 'users created despite refusal');
        foreach (['production', ''] as $e) {
            $out = []; exec('APP_ENV=' . escapeshellarg($e) . ' DB_USER=nobody php ' . escapeshellarg(__DIR__ . '/../bin/seed.php') . ' prototype 2>&1', $out, $code);
            ok($code !== 0 && str_contains(implode("\n", $out), 'Refusing'), "CLI did not refuse with APP_ENV='$e'");
        }
    });
    check($engine, '38 prototype seed needs env-supplied demo passwords', function () use ($rp, $seedDir, $env) {
        $env('DEMO_FARMER_PASSWORD', null); $env('DEMO_EXPERT_PASSWORD', null);
        try { (new Seeder($rp, $seedDir))->prototype('test'); $r = false; } catch (RuntimeException $x) { $r = str_contains($x->getMessage(), 'DEMO_FARMER_PASSWORD'); }
        ok($r, 'seeded demo accounts without environment-supplied passwords'); eq((int)one($rp, 'SELECT COUNT(*) FROM users'), 0, 'partial users');
    });
    check($engine, '39 prototype seed loads with source row counts', function () use ($rp, $seedDir, $counts, $env) {
        $env('DEMO_FARMER_PASSWORD', 'test-only-' . bin2hex(random_bytes(6))); $env('DEMO_EXPERT_PASSWORD', 'test-only-' . bin2hex(random_bytes(6)));
        (new Seeder($rp, $seedDir))->prototype('test');
        foreach (['users', 'user_roles', 'farmer_profiles', 'expert_profiles', 'language_preferences', 'advisory_questions', 'advisory_messages', 'expert_assignments', 'marketplace_listings', 'marketplace_inquiries', 'local_language_recordings', 'demo_expert_requests'] as $t) eq((int)one($rp, "SELECT COUNT(*) FROM `$t`"), $counts[$t], "$t row count");
        (new Seeder($rp, $seedDir))->prototype('test');
        eq((int)one($rp, 'SELECT COUNT(*) FROM marketplace_listings'), $counts['marketplace_listings'], 'listing count after rerun');
        eq((int)one($rp, "SELECT COUNT(*) FROM marketplace_listings WHERE owner_key_hash <> '' OR owner_token <> ''"), 0, 'seeded listings must not carry ownership secrets');
        eq((int)one($rp, "SELECT COUNT(*) FROM marketplace_listings WHERE is_demo_listing = 1 AND is_fictional_seller = 1"), $counts['marketplace_listings'], 'listings flagged demo/fictional');
    });
    check($engine, '40 demo hashes verify and are Node-compatible scrypt', function () use ($rp) {
        $farmer = (string)getenv('DEMO_FARMER_PASSWORD'); $hash = (string)one($rp, 'SELECT password_hash FROM users WHERE id = 1');
        ok(Seeder::verifyPassword($farmer, $hash), 'PHP cannot verify its own hash'); ok(!Seeder::verifyPassword('wrong-password-123', $hash), 'wrong password accepted');
        ok((bool)preg_match('/^[0-9a-f]{32}:[0-9a-f]{128}$/', $hash), 'hash format differs from Node');
        $js = 'const c=require("crypto");const [p,h]=process.argv.slice(1);const [s,x]=h.split(":");process.stdout.write(c.scryptSync(p,s,64).toString("hex")===x?"yes":"no")';
        eq(shell_exec('node -e ' . escapeshellarg($js) . ' ' . escapeshellarg($farmer) . ' ' . escapeshellarg($hash)), 'yes', 'Node verifies the PHP-generated hash');
        $nodeHash = shell_exec('node -e ' . escapeshellarg('const c=require("crypto");const s=c.randomBytes(16).toString("hex");process.stdout.write(s+":"+c.scryptSync(process.argv[1],s,64).toString("hex"))') . ' ' . escapeshellarg('Node-made-Pass-1'));
        ok(Seeder::verifyPassword('Node-made-Pass-1', (string)$nodeHash), 'PHP cannot verify a Node-generated hash');
    });
    check($engine, '41 prototype relations intact', function () use ($rp) {
        eq((int)one($rp, 'SELECT COUNT(*) FROM advisory_questions q LEFT JOIN users u ON u.id = q.farmer_id WHERE u.id IS NULL'), 0, 'orphan questions');
        eq((int)one($rp, 'SELECT COUNT(*) FROM advisory_messages m LEFT JOIN advisory_questions q ON q.id = m.question_id WHERE q.id IS NULL'), 0, 'orphan messages');
        eq((int)one($rp, 'SELECT COUNT(*) FROM marketplace_inquiries i LEFT JOIN marketplace_listings l ON l.id = i.listing_id WHERE l.id IS NULL'), 0, 'orphan inquiries');
    });
    check($engine, '42 admin bootstrap: env-only, validated, unique', function () use ($rp, $seedDir, $env) {
        $s = new Seeder($rp, $seedDir);
        $env('ADMIN_BOOTSTRAP_PHONE', '+231770000001'); $env('ADMIN_BOOTSTRAP_PASSWORD', 'short');
        try { $s->bootstrapAdmin(); $r = false; } catch (RuntimeException) { $r = true; } ok($r, 'accepted a short password');
        $pw = 'Adm-' . bin2hex(random_bytes(8)); $env('ADMIN_BOOTSTRAP_PASSWORD', $pw);
        $id = $s->bootstrapAdmin();
        eq((string)one($rp, "SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?", [$id]), 'admin', 'role');
        ok(Seeder::verifyPassword($pw, (string)one($rp, 'SELECT password_hash FROM users WHERE id = ?', [$id])), 'admin password verify');
        eq((int)one($rp, "SELECT COUNT(*) FROM audit_logs WHERE action = 'admin_bootstrapped' AND target_id = ?", [(string)$id]), 1, 'audit row');
        eq((int)one($rp, "SELECT COUNT(*) FROM audit_logs WHERE details_json LIKE ?", ['%' . $pw . '%']), 0, 'password leaked into audit log');
        try { $s->bootstrapAdmin(); $dup = false; } catch (PDOException) { $dup = true; } ok($dup, 'duplicate admin phone accepted');
        $env('ADMIN_BOOTSTRAP_PHONE', null); $env('ADMIN_BOOTSTRAP_PASSWORD', null);
    });
    check($engine, '43 seed JSON has no hashes or ownership secrets', function () use ($seedDir) {
        foreach (['prototype.json', 'reference.json'] as $f) {
            $txt = (string)file_get_contents("$seedDir/$f");
            ok(!preg_match('/[0-9a-f]{32}:[0-9a-f]{128}/', $txt), "$f contains a password hash");
            foreach (['password_hash', 'owner_key_hash', 'owner_token', 'requester_key_hash', 'requester_token', 'buyer_token'] as $k) ok(!str_contains($txt, $k), "$f contains $k");
        }
    });

    foreach ($drops as $db) $admin->exec("DROP DATABASE IF EXISTS `$db`");
    $remaining = (int)$admin->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name LIKE 'agri_m2_t_%'")->fetchColumn();
    check($engine, '44 scratch databases cleaned up', fn() => eq($remaining, 0, 'leftover scratch databases'));
}

$engines = [];
foreach ($results as $row) foreach (array_keys($row) as $e) if (!in_array($e, $engines, true)) $engines[] = $e;
printf("%-62s", 'check'); foreach ($engines as $e) printf(" %-20s", $e); echo "\n", str_repeat('-', 62 + 21 * count($engines)), "\n";
foreach ($results as $name => $row) { printf("%-62s", substr($name, 0, 61)); foreach ($engines as $e) printf(" %-20s", substr($row[$e] ?? '-', 0, 19)); echo "\n"; }
foreach ($results as $name => $row) foreach ($row as $e => $r) if ($r !== 'ok') echo "\n[$e] $name\n  $r\n";
$total = count($results) * count($engines);
printf("\n%d checks x %d engines: %d passed, %d failed\n", count($results), count($engines), $total - $fails, $fails);
exit($fails ? 1 : 0);
