<?php
declare(strict_types=1);

namespace Agri;

use Agri\Config\Config;
use Agri\Config\ConfigException;
use Agri\Http\App;
use Agri\Http\HttpException;
use Agri\Http\Kernel;
use Agri\Http\Request;
use Agri\Http\Response;
use Agri\Http\Router;
use Agri\Support\Env;
use Agri\Support\Logger;

/** Wires the application and runs one request. Anything that goes wrong becomes a generic JSON error; details only go to the private log. */
final class Bootstrap
{
    public static function run(string $root, ?Env $env = null): void
    {
        // Shared hosts sometimes disable functions (a disabled function is "undefined"); none of these hardening calls may be fatal.
        if (function_exists('ini_set')) {
            ini_set('display_errors', '0');
            ini_set('display_startup_errors', '0');
            ini_set('log_errors', '1');
            ini_set('html_errors', '0');
        }
        error_reporting(E_ALL);
        if (function_exists('header_remove')) header_remove('X-Powered-By');
        if (function_exists('putenv')) putenv('HTTP_PROXY'); // (shared hosts often disable putenv; a warning there would become a 500) httpoxy: under CGI a client 'Proxy:' header would become this variable and redirect any outbound HTTP (M7+)
        unset($_SERVER['HTTP_PROXY']);
        $requestId = bin2hex(random_bytes(8));
        $logger = new Logger(self::fallbackLogDir($root), $requestId);

        self::installHandlers($logger, $requestId);

        try {
            $config = Config::load($env ?? new Env($root . '/.env'), $root);
        } catch (ConfigException $e) {
            // Fail closed: log which settings are wrong (names only, never values) and answer every request with a generic error.
            $logger->error('configuration invalid; refusing to serve', ['problems' => $e->problems]);
            self::emit(Response::error(500, 'SERVER_MISCONFIGURED', 'The service is temporarily unavailable.', ['Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff', 'X-Request-Id' => $requestId], ['requestId' => $requestId]), false);
            return;
        }

        $logger = new Logger($config->logDir, $requestId);
        self::installHandlers($logger, $requestId);
        foreach (self::hygiene($config, $root, (string)($_SERVER['DOCUMENT_ROOT'] ?? '')) as $w) $logger->warning($w);
        try {
            $request = Request::fromGlobals($config->maxBodyBytes, $config->trustedProxies);
        } catch (HttpException $e) {
            $res = Response::error($e->status, $e->errorCode, $e->getMessage(), $e->headers + ['X-Request-Id' => $requestId]);
            foreach (Kernel::securityHeaders($config, false) as $k => $v) $res->headers[$k] = $v;
            $res->headers['Cache-Control'] = 'no-store';
            self::emit($res, false);
            return;
        }
        $app = new App($config, $logger);
        $router = new Router();
        (require $root . '/config/routes.php')($router, $app, $root);
        $response = Kernel::make($config, $router, $logger)->handle($request, $requestId);
        self::emit($response, $request->method === 'HEAD');
    }

    /**
     * Deployment-hygiene findings that should be fixed but do not justify refusing to serve (shared hosts often create files 0644).
     * @return list<string>
     */
    public static function hygiene(Config $config, string $root, string $docRoot): array
    {
        $w = [];
        $env = $root . '/.env';
        if ($config->strict && is_file($env) && ((fileperms($env) & 0044) !== 0)) $w[] = '.env is readable by group/others; run chmod 600';
        $log = @realpath($config->logDir);
        $doc = $docRoot !== '' ? @realpath($docRoot) : false;
        if ($log !== false && $doc !== false && ($log === $doc || str_starts_with($log . '/', rtrim($doc, '/') . '/'))) $w[] = 'LOG_DIR is inside the web root; move it above public_html';
        $cache = @realpath($config->cacheDir);
        if ($cache !== false && $doc !== false && ($cache === $doc || str_starts_with($cache . '/', rtrim($doc, '/') . '/'))) $w[] = 'CACHE_DIR is inside the web root; move it above public_html';
        if ($config->mail['transport'] === 'smtp') $w[] = 'MAIL_TRANSPORT=smtp is configured but no mail sender exists yet; nothing will be sent';
        $r = @realpath($root);
        if ($r !== false && $doc !== false && str_starts_with($r . '/', rtrim($doc, '/') . '/')) $w[] = 'application directory is inside the web root; only public/ may be web-accessible';
        return $w;
    }

    private static function emit(Response $r, bool $omitBody): void
    {
        if (headers_sent()) return;
        $r->send($omitBody);
    }

    private static function fallbackLogDir(string $root): string
    {
        return (getenv('LOG_DIR') ?: '') !== '' ? (string)getenv('LOG_DIR') : $root . '/storage/logs';
    }

    private static function installHandlers(Logger $logger, string $requestId): void
    {
        set_error_handler(static function (int $no, string $str, string $file, int $line) use ($logger): bool {
            if ($no === E_DEPRECATED || $no === E_USER_DEPRECATED) { $logger->warning('deprecated', ['message' => $str, 'where' => basename($file) . ':' . $line]); return true; }
            if (!(error_reporting() & $no)) return false;
            throw new \ErrorException($str, 0, $no, $file, $line);
        });
        set_exception_handler(static function (\Throwable $e) use ($logger, $requestId): void {
            $logger->error('uncaught exception', ['type' => $e::class, 'message' => $e->getMessage(), 'where' => basename($e->getFile()) . ':' . $e->getLine(), 'trace' => $e->getTraceAsString()]);
            self::emit(Response::error(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', ['Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff', 'X-Request-Id' => $requestId], ['requestId' => $requestId]), false);
        });
        register_shutdown_function(static function () use ($logger, $requestId): void {
            $e = error_get_last();
            if ($e === null || !in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;
            $logger->error('fatal error', ['message' => $e['message'], 'where' => basename($e['file']) . ':' . $e['line']]);
            if (!headers_sent()) self::emit(Response::error(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', ['Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff', 'X-Request-Id' => $requestId], ['requestId' => $requestId]), false);
        });
    }
}
