<?php
declare(strict_types=1);

use Agri\Controllers\CsrfController;
use Agri\Controllers\HealthController;
use Agri\Http\App;
use Agri\Http\HttpException;
use Agri\Http\Router;

/** M3 implements exactly two endpoints. Every other Node route is registered from the manifest and answers 501 until its milestone. */
return static function (Router $router, App $app, string $root): void {
    $router->add('GET', '/api/v1/health', new HealthController($app));
    $router->add('GET', '/api/v1/csrf-token', new CsrfController());
    $notYet = static function (): never { throw new HttpException(501, 'NOT_IMPLEMENTED', 'This endpoint has not been migrated to the PHP backend yet.'); };
    foreach (require $root . '/config/route_manifest.php' as [$method, $path]) {
        if (in_array([$method, $path], [['GET', '/api/v1/health'], ['GET', '/api/v1/csrf-token']], true)) continue;
        $router->add($method, $path, $notYet, false);
    }
};
