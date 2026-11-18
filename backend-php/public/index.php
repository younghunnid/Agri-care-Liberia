<?php
declare(strict_types=1);

/**
 * Front controller. Deployed as public_html/api/index.php; the application code lives above the web root.
 * Local development: php -S 127.0.0.1:8080 -t backend-php/public backend-php/public/index.php (router script).
 */
if (PHP_VERSION_ID < 80200) { // the application needs PHP 8.2+; answer cleanly instead of failing with a parse error on older hosts
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    error_log('agri: PHP 8.2 or newer is required, running ' . PHP_VERSION);
    echo '{"error":{"code":"SERVER_MISCONFIGURED","message":"The service is temporarily unavailable."}}';
    exit;
}
$root = is_file(__DIR__ . '/../app/autoload.php') ? dirname(__DIR__) : dirname(__DIR__, 2) . '/agri';
if (!is_file($root . '/app/autoload.php')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo '{"error":{"code":"SERVER_MISCONFIGURED","message":"The service is temporarily unavailable."}}';
    exit;
}
require $root . '/app/autoload.php';
\Agri\Bootstrap::run($root);
