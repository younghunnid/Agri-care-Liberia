#!/usr/bin/env php
<?php
declare(strict_types=1);
require __DIR__ . '/../app/autoload.php';

use Agri\Database\Connection;
use Agri\Seed\Seeder;

$cmd = $argv[1] ?? '';
if (!in_array($cmd, ['reference', 'prototype', 'admin'], true)) { fwrite(STDERR, "usage: seed.php reference|prototype|admin   (prototype needs APP_ENV=test|development; admin reads ADMIN_BOOTSTRAP_* from the environment)\n"); exit(2); }
try {
    if ($cmd === 'prototype') Seeder::assertNonProduction(); // fail before connecting
    $seeder = new Seeder(Connection::open(Connection::configFromEnv()), getenv('SEED_DIR') ?: __DIR__ . '/../../database/seed');
    if ($cmd === 'admin') { echo 'administrator created (id ' . $seeder->bootstrapAdmin() . ")\n"; exit(0); }
    foreach ($cmd === 'reference' ? $seeder->reference() : $seeder->prototype() as $t => $n) printf("%-28s %d\n", $t, $n);
} catch (Throwable $e) { fwrite(STDERR, 'error: ' . $e->getMessage() . "\n"); exit(1); }
