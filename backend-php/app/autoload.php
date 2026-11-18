<?php
declare(strict_types=1);
spl_autoload_register(static function (string $c): void {
    if (strncmp($c, 'Agri\\', 5) !== 0) return;
    $map = ['Database' => 'Database', 'Migrations' => 'Migrations', 'Seed' => 'Seed', 'Support' => 'Support', 'Schema' => 'Schema', 'Admin' => 'Admin'];
    $f = __DIR__ . '/' . str_replace('\\', '/', substr($c, 5)) . '.php';
    if (is_file($f)) require $f;
});
