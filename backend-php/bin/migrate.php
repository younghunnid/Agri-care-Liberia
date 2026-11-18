#!/usr/bin/env php
<?php
declare(strict_types=1);
require __DIR__ . '/../app/autoload.php';

use Agri\Database\Connection;
use Agri\Migrations\Runner;

$cmd = $argv[1] ?? 'status';
$dry = in_array('--dry-run', $argv, true);
if (!in_array($cmd, ['status', 'up', 'lint'], true)) { fwrite(STDERR, "usage: migrate.php status|up|lint [--dry-run]  (connection from DB_HOST DB_PORT DB_NAME DB_USER DB_PASS)\n"); exit(2); }
$dir = getenv('MIGRATIONS_DIR') ?: __DIR__ . '/../migrations';
try {
    if ($cmd === 'lint') {
        $bad = [];
        foreach (glob($dir . '/*.sql') ?: [] as $p) $bad = array_merge($bad, \Agri\Migrations\Linter::lint($p, (string)file_get_contents($p)));
        echo $bad ? implode("\n", $bad) . "\n" : "lint ok\n";
        exit($bad ? 1 : 0);
    }
    $cfg = Connection::configFromEnv();
    if (($cfg['name'] ?? '') === '') throw new RuntimeException('DB_NAME is required.');
    $runner = new Runner(Connection::open($cfg), $dir, fn($m) => print($m . "\n"));
    if ($cmd === 'status') { foreach ($runner->status() as $s) printf("%-30s %s\n", $s['version'], $s['state']); exit(0); }
    $r = $runner->up($dry);
    echo $r ? '' : "nothing to apply\n";
} catch (Throwable $e) { fwrite(STDERR, 'error: ' . $e->getMessage() . "\n"); exit(1); }
