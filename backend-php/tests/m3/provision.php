#!/usr/bin/env php
<?php
declare(strict_types=1);
/**
 * Creates / drops a DISPOSABLE database for the M3 HTTP tests: schema M001 + reference seed + a least-privilege app user.
 * Refuses unless AGRI_DISPOSABLE_DB_OK=1 and the host is loopback. Prints JSON {db,user,pass} (throw-away values) on `create`.
 * Usage: provision.php create <host:port> | drop <host:port> <db> <user>
 */
require __DIR__ . '/../../app/autoload.php';

use Agri\Database\Connection;
use Agri\Migrations\Runner;
use Agri\Seed\Seeder;

if (getenv('AGRI_DISPOSABLE_DB_OK') !== '1') { fwrite(STDERR, "Refusing: AGRI_DISPOSABLE_DB_OK=1 required.\n"); exit(2); }
[$cmd, $target] = [$argv[1] ?? '', $argv[2] ?? ''];
[$host, $port] = explode(':', $target) + [1 => '3306'];
if (!in_array($host, ['127.0.0.1', 'localhost'], true)) { fwrite(STDERR, "Refusing: only loopback servers.\n"); exit(2); }
$cfg = ['host' => $host, 'port' => (int)$port, 'name' => null, 'user' => (string)getenv('DB_USER'), 'pass' => (string)getenv('DB_PASS')];
$admin = Connection::open($cfg);
$root = dirname(__DIR__, 3);
if ($cmd === 'create') {
    $db = 'agri_m3_t_' . bin2hex(random_bytes(4)); $user = 'm3u_' . bin2hex(random_bytes(4)); $pass = bin2hex(random_bytes(12));
    $admin->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo = Connection::open(['name' => $db] + $cfg);
    (new Runner($pdo, $root . '/backend-php/migrations'))->up();
    (new Seeder($pdo, $root . '/database/seed'))->reference();
    foreach (['127.0.0.1', 'localhost'] as $h) {
        $admin->exec("CREATE USER '$user'@'$h' IDENTIFIED BY '$pass'");
        $admin->exec("GRANT SELECT, INSERT, UPDATE, DELETE ON `$db`.* TO '$user'@'$h'");
    }
    echo json_encode(['db' => $db, 'user' => $user, 'pass' => $pass]);
} elseif ($cmd === 'drop') {
    [$db, $user] = [$argv[3] ?? '', $argv[4] ?? ''];
    if (!preg_match('/^agri_m3_t_[0-9a-f]{8}$/', $db) || !preg_match('/^m3u_[0-9a-f]{8}$/', $user)) { fwrite(STDERR, "Refusing: not a scratch name.\n"); exit(2); }
    $admin->exec("DROP DATABASE IF EXISTS `$db`");
    foreach (['127.0.0.1', 'localhost'] as $h) $admin->exec("DROP USER IF EXISTS '$user'@'$h'");
} else { fwrite(STDERR, "usage\n"); exit(2); }
