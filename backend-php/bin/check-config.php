#!/usr/bin/env php
<?php
declare(strict_types=1);
/** Validates the environment/.env exactly as the web front controller does. Prints setting NAMES only, never values. Exit 1 when invalid. */
require __DIR__ . '/../app/autoload.php';

use Agri\Config\Config;
use Agri\Config\ConfigException;
use Agri\Support\Env;

$root = dirname(__DIR__);
try {
    $c = Config::load(new Env($root . '/.env'), $root);
    echo json_encode(['ok' => true] + $c->summary(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
} catch (ConfigException $e) {
    fwrite(STDERR, "Configuration is NOT valid:\n - " . implode("\n - ", $e->problems) . "\n");
    exit(1);
}
