#!/usr/bin/env php
<?php
declare(strict_types=1);
/** M3 unit tests (no network, no database). Usage: php backend-php/tests/m3_unit.php */
require __DIR__ . '/../app/autoload.php';

use Agri\Config\Config;
use Agri\Config\ConfigException;
use Agri\Http\Cookie;
use Agri\Http\HttpException;
use Agri\Http\Kernel;
use Agri\Http\Request;
use Agri\Http\Response;
use Agri\Http\Router;
use Agri\Support\Env;
use Agri\Support\Logger;

$root = dirname(__DIR__);
// Remove every scratch directory these tests create (only directories matching these exact prefixes in the system temp dir).
register_shutdown_function(static function (): void {
    foreach (glob(sys_get_temp_dir() . '/agri_{m3k,m3u,m3p,hyg,log}_*{,-logs}', GLOB_BRACE) ?: [] as $d) {
        if (!is_dir($d) || is_link($d)) continue;
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) { $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
        @rmdir($d);
    }
});
$pass = 0; $fail = 0;
function t(string $name, callable $fn): void
{
    global $pass, $fail;
    try { $fn(); $pass++; echo "  ok   $name\n"; } catch (Throwable $e) { $fail++; echo "  FAIL $name: " . $e->getMessage() . "\n"; }
}
function ok(bool $c, string $m = 'assertion failed'): void { if (!$c) throw new RuntimeException($m); }
function eq(mixed $a, mixed $b, string $m = ''): void { if ($a !== $b) throw new RuntimeException(($m ? "$m: " : '') . 'got ' . var_export($a, true) . ', expected ' . var_export($b, true)); }
function throws(callable $f, string $needle, string $class = Throwable::class): void
{
    try { $f(); } catch (Throwable $e) { if (!($e instanceof $class)) throw new RuntimeException('wrong exception ' . $e::class . ': ' . $e->getMessage()); if ($needle !== '' && !str_contains($e->getMessage() . json_encode($e instanceof ConfigException ? $e->problems : []), $needle)) throw new RuntimeException("message lacks '$needle': " . $e->getMessage()); return; }
    throw new RuntimeException('no exception thrown');
}

$strong = fn() => bin2hex(random_bytes(24));
$prod = fn(array $o = []) => $o + ['APP_ENV' => 'production', 'SESSION_SECRET' => $strong(), 'OWNER_KEY_HMAC_SECRET' => $strong(), 'DB_HOST' => 'db.internal', 'DB_NAME' => 'agri', 'DB_USER' => 'agri_app', 'DB_PASS' => $strong(), 'APP_URL' => 'https://agri.example.org', 'IP_HASH_SECRET' => $strong(), 'PASSWORD_HASH_SCHEME' => 'bcrypt', 'PASSWORD_REHASH_ENABLED' => '0'];
$load = fn(array $env) => Config::load(new Env(null, $env), '/srv/agri');

echo "Config / environment\n";
t('valid production configuration loads', function () use ($prod, $load) { $c = $load($prod()); ok($c->strict && !$c->devFeaturesAllowed() && $c->env === 'production'); });
foreach (['SESSION_SECRET', 'OWNER_KEY_HMAC_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'APP_URL', 'APP_ENV'] as $k) {
    t("production fails closed when $k is missing", function () use ($prod, $load, $k) { $e = $prod(); unset($e[$k]); throws(fn() => $load($e), $k, ConfigException::class); });
}
t('APP_ENV unset is validated as production, never lenient', function () use ($load) { throws(fn() => $load(['SESSION_SECRET' => str_repeat('a1', 16)]), 'APP_ENV', ConfigException::class); });
t('unknown APP_ENV is rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['APP_ENV' => 'prod'])), 'APP_ENV', ConfigException::class); });
t('short session secret rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['SESSION_SECRET' => 'abc123'])), 'SESSION_SECRET', ConfigException::class); });
t('placeholder session secret rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['SESSION_SECRET' => 'change-me-change-me-change-me-12345'])), 'placeholder', ConfigException::class); });
t('low-variety secret rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['OWNER_KEY_HMAC_SECRET' => str_repeat('ab', 20)])), 'OWNER_KEY_HMAC_SECRET', ConfigException::class); });
t('owner key secret has no silent dev fallback', function () use ($prod, $load) { $e = $prod(); unset($e['OWNER_KEY_HMAC_SECRET']); throws(fn() => $load($e + ['APP_ENV' => 'development']), 'OWNER_KEY_HMAC_SECRET', ConfigException::class); });
t('Node dev constant refused in production unless explicitly allowed', function () use ($prod, $load) {
    throws(fn() => $load($prod(['OWNER_KEY_HMAC_SECRET' => Config::DEV_OWNER_KEY_CONSTANT])), 'development constant', ConfigException::class);
    $c = $load($prod(['OWNER_KEY_HMAC_SECRET' => Config::DEV_OWNER_KEY_CONSTANT, 'ALLOW_LEGACY_OWNER_KEY_SECRET' => '1'])); ok($c->ownerKeySecret === Config::DEV_OWNER_KEY_CONSTANT);
});
t('production refuses root DB user and empty DB password', function () use ($prod, $load) { throws(fn() => $load($prod(['DB_USER' => 'root'])), 'root', ConfigException::class); throws(fn() => $load($prod(['DB_PASS' => ''])), 'DB_PASS', ConfigException::class); });
t('production requires an https APP_URL', function () use ($prod, $load) { throws(fn() => $load($prod(['APP_URL' => 'http://agri.example.org'])), 'APP_URL', ConfigException::class); });
t('wildcard CORS origin rejected in every environment', function () use ($prod, $load) {
    foreach (['*', 'https://*.example.org', 'https://ok.example.org,*'] as $o) { throws(fn() => $load($prod(['CORS_ALLOWED_ORIGINS' => $o])), 'wildcard', ConfigException::class); throws(fn() => $load($prod(['APP_ENV' => 'development', 'CORS_ALLOWED_ORIGINS' => $o])), 'wildcard', ConfigException::class); }
});
t('CORS origins must be bare https origins in production', function () use ($prod, $load) {
    throws(fn() => $load($prod(['CORS_ALLOWED_ORIGINS' => 'http://staging.example.org'])), 'https://', ConfigException::class);
    throws(fn() => $load($prod(['CORS_ALLOWED_ORIGINS' => 'https://staging.example.org/path'])), 'invalid origin', ConfigException::class);
    $c = $load($prod(['CORS_ALLOWED_ORIGINS' => 'https://staging.example.org'])); eq($c->allowedOrigins, ['https://staging.example.org', 'https://agri.example.org']);
});
t('localhost dev origins exist only outside production', function () use ($prod, $load) { ok(!in_array('http://localhost:3000', $load($prod())->allowedOrigins, true)); ok(in_array('http://localhost:3000', $load($prod(['APP_ENV' => 'development']))->allowedOrigins, true)); });
t('cross_site cookies refused in production, allowed in development', function () use ($prod, $load) { throws(fn() => $load($prod(['COOKIE_MODE' => 'cross_site'])), 'COOKIE_MODE', ConfigException::class); eq($load($prod(['APP_ENV' => 'development', 'COOKIE_MODE' => 'cross_site']))->cookieMode, 'cross_site'); });
foreach (['TEST_FIXTURE_TOKEN' => 'x1x1x1x1x1x1x1x1x1', 'APP_DEBUG' => '1', 'ENABLE_TEST_FIXTURES' => 'true', 'ENABLE_DEMO_SEED' => '1', 'AGRI_DISPOSABLE_DB_OK' => '1', 'DEMO_FARMER_PASSWORD' => 'whatever-demo-pass'] as $k => $v) {
    t("$k cannot be set in production or staging", function () use ($prod, $load, $k, $v) { throws(fn() => $load($prod([$k => $v])), $k, ConfigException::class); throws(fn() => $load($prod([$k => $v, 'APP_ENV' => 'staging'])), $k, ConfigException::class); });
}
t('APP_DEBUG works only in development/test', function () use ($prod, $load) { ok($load($prod(['APP_ENV' => 'development', 'APP_DEBUG' => '1']))->debug); ok(!$load($prod(['APP_ENV' => 'development']))->debug); });
t('ConfigException lists names and never values', function () use ($prod, $load) { $s = 'SuperSecretValue' . bin2hex(random_bytes(8)); try { $load($prod(['SESSION_SECRET' => 'x', 'DB_PASS' => $s, 'APP_URL' => 'http://x', 'OWNER_KEY_HMAC_SECRET' => $s . 'a'])); } catch (ConfigException $e) { ok(!str_contains($e->getMessage() . json_encode($e->problems), $s), 'secret value leaked'); return; } throw new RuntimeException('expected failure'); });
t('summary() contains no secrets', function () use ($prod, $load) { $c = $load($prod()); $j = json_encode($c->summary()); ok(!str_contains($j, $c->sessionSecret) && !str_contains($j, $c->db['pass']) && !str_contains($j, $c->ownerKeySecret)); });
t('MAX_BODY_BYTES bounds enforced', function () use ($prod, $load) { throws(fn() => $load($prod(['MAX_BODY_BYTES' => '99999999999'])), 'MAX_BODY_BYTES', ConfigException::class); eq($load($prod())->maxBodyBytes, 4194304); });
t('real environment variables win over the .env file', function () { $f = tempnam(sys_get_temp_dir(), 'env'); file_put_contents($f, "A_TEST_KEY_X=fromfile\nB_TEST_KEY_X='quoted value'\n# c\n"); putenv('A_TEST_KEY_X=fromenv'); $e = new Env($f); eq($e->get('A_TEST_KEY_X'), 'fromenv'); eq($e->get('B_TEST_KEY_X'), 'quoted value'); putenv('A_TEST_KEY_X'); eq($e->get('A_TEST_KEY_X'), 'fromfile'); unlink($f); });

echo "Cookies\n";
t('first_party over http: Lax, no Secure (development)', function () { $c = Cookie::build('agri_csrf', 'abc', false, false, false, 'first_party', 1000); ok(str_contains($c, 'SameSite=Lax') && !str_contains($c, 'Secure') && !str_contains($c, 'HttpOnly') && str_contains($c, 'Max-Age=604800') && str_contains($c, 'Path=/')); });
t('first_party over https: Lax + Secure, no SameSite=None/Partitioned', function () { $c = Cookie::build('agri_anon', 'abc', true, true, true, 'first_party', 1000); ok(str_contains($c, 'Secure') && str_contains($c, 'SameSite=Lax') && str_contains($c, 'HttpOnly') && !str_contains($c, 'None') && !str_contains($c, 'Partitioned')); });
t('production is always Secure even if https was not detected', function () { ok(str_contains(Cookie::build('x', 'y', true, false, true, 'first_party', 1), 'Secure')); });
t('cross_site over https equals the Node preview cookie', function () { $c = Cookie::build('agri_csrf', 'abc', false, true, false, 'cross_site', 1); ok(str_contains($c, 'SameSite=None') && str_contains($c, 'Secure') && str_contains($c, 'Partitioned')); });
t('cookie values are URL-encoded', function () { ok(str_contains(Cookie::build('n', 'a b;c', true, false, false, 'first_party', 1), 'n=a%20b%3Bc')); });

echo "Request\n";
$mkReq = fn(string $method = 'POST', array $h = [], string $body = '', string $path = '/api/v1/x') => new Request($method, $path, '', $h, [], $body, '127.0.0.1', false, 'h.test');
t('cookie header parsing (first value wins, decoded)', function () { eq(Request::parseCookies('a=1; b=hello%20world; a=2; broken'), ['a' => '1', 'b' => 'hello world']); });
t('empty body is []', fn() => eq($mkReq()->json(), []));
t('valid JSON object parsed', fn() => eq($mkReq('POST', ['content-type' => 'application/json; charset=utf-8'], '{"a":1}')->json(), ['a' => 1]));
t('malformed JSON -> 400 INVALID_JSON', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'application/json'], '{bad')->json(); } catch (HttpException $e) { eq([$e->status, $e->errorCode], [400, 'INVALID_JSON']); return; } throw new RuntimeException('no exception'); });
t('scalar JSON -> 400', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'application/json'], '"x"')->json(); } catch (HttpException $e) { eq($e->status, 400); return; } throw new RuntimeException('no exception'); });
t('wrong media type -> 415', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'text/plain'], '{}')->json(); } catch (HttpException $e) { eq($e->status, 415); return; } throw new RuntimeException('no exception'); });
t('excessive JSON depth rejected', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'application/json'], str_repeat('[', 100) . str_repeat(']', 100))->json(); } catch (HttpException $e) { eq($e->status, 400); return; } throw new RuntimeException('no exception'); });
t('Content-Length above the limit -> 413 before the body is read', function () { $_SERVER = ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/v1/x', 'CONTENT_LENGTH' => '5000', 'CONTENT_TYPE' => 'application/json']; try { Request::fromGlobals(1024, null, ''); } catch (HttpException $e) { eq($e->status, 413); return; } throw new RuntimeException('no exception'); });
t('actual body above the limit -> 413 (no Content-Length)', function () { $_SERVER = ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/v1/x']; try { Request::fromGlobals(1024, null, str_repeat('a', 2000)); } catch (HttpException $e) { eq($e->status, 413); return; } throw new RuntimeException('no exception'); });
t('invalid Content-Length / control chars in path rejected', function () { $_SERVER = ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/v1/x', 'CONTENT_LENGTH' => '-1']; try { Request::fromGlobals(1024, null, ''); throw new RuntimeException('cl accepted'); } catch (HttpException) {} $_SERVER = ['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/api/%00x']; try { Request::fromGlobals(1024, null, ''); throw new RuntimeException('nul accepted'); } catch (HttpException) {} });
// (forwarded-header behaviour is covered by the M3.1 section below)

echo "Router\n";
$r = new Router();
$r->add('GET', '/api/v1/a', fn() => 'a'); $r->add('POST', '/api/v1/a', fn() => 'a2'); $r->add('GET', '/api/v1/items/:id', fn($q, $p) => $p['id']);
t('static, param and trailing-slash matching', function () use ($r) { [$h, $p] = $r->dispatch('GET', '/api/v1/items/42/'); eq($h(null, $p), '42'); [$h2] = $r->dispatch('GET', '/api/v1/a'); eq($h2(), 'a'); });
t('HEAD maps to GET', function () use ($r) { [$h] = $r->dispatch('HEAD', '/api/v1/a'); eq($h(), 'a'); });
t('unknown path -> 404', function () use ($r) { try { $r->dispatch('GET', '/api/v1/zzz'); } catch (HttpException $e) { eq($e->status, 404); return; } throw new RuntimeException('no exception'); });
t('wrong method -> 405 with Allow', function () use ($r) { try { $r->dispatch('DELETE', '/api/v1/a'); } catch (HttpException $e) { eq($e->status, 405); ok(str_contains($e->headers['Allow'], 'GET') && str_contains($e->headers['Allow'], 'POST') && str_contains($e->headers['Allow'], 'OPTIONS')); return; } throw new RuntimeException('no exception'); });
t('param does not span slashes', function () use ($r) { try { $r->dispatch('GET', '/api/v1/items/1/2'); } catch (HttpException $e) { eq($e->status, 404); return; } throw new RuntimeException('no exception'); });

echo "Route table\n";
t('manifest holds all 61 Node routes; only health and csrf-token are implemented', function () use ($root) {
    $m = require $root . '/config/route_manifest.php'; eq(count($m), 61); ok(in_array(['GET', '/api/v1/health'], $m, true) && in_array(['GET', '/api/v1/csrf-token'], $m, true));
    $logDir = sys_get_temp_dir() . '/agri_m3u_' . bin2hex(random_bytes(3));
    $cfg = Config::load(new Env(null, ['APP_ENV' => 'development', 'SESSION_SECRET' => bin2hex(random_bytes(16)), 'OWNER_KEY_HMAC_SECRET' => bin2hex(random_bytes(16)), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'u', 'LOG_DIR' => $logDir]), $root);
    $app = new Agri\Http\App($cfg, new Logger($logDir), fn() => throw new RuntimeException('no DB in unit tests')); $router = new Router(); (require $root . '/config/routes.php')($router, $app, $root);
    $kernel = Kernel::make($cfg, $router, new Logger($logDir));
    $csrf = bin2hex(random_bytes(24)); $implemented = 0;
    foreach ($m as [$method, $path]) {
        $url = preg_replace('#:[A-Za-z_]+#', '1', $path);
        $req = new Request($method, $url, '', ['cookie' => "agri_csrf=$csrf", 'x-csrf-token' => $csrf], ['agri_csrf' => $csrf], '', '127.0.0.1', false, 'h');
        $res = $kernel->handle($req, 'rid');
        if ($res->status !== 501) { $implemented++; ok(in_array($path, ['/api/v1/health', '/api/v1/csrf-token'], true), "$method $path answered {$res->status} but must not be implemented in M3"); }
    }
    eq($implemented, 2, 'implemented routes');
});

echo "Kernel: CORS, CSRF, errors, headers\n";
$kernelFor = function (array $over = [], ?Closure $extra = null) use ($root) {
    $logDir = sys_get_temp_dir() . '/agri_m3k_' . bin2hex(random_bytes(3));
    $env = $over + ['APP_ENV' => 'development', 'SESSION_SECRET' => bin2hex(random_bytes(16)), 'OWNER_KEY_HMAC_SECRET' => bin2hex(random_bytes(16)), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'u', 'LOG_DIR' => $logDir, 'CORS_ALLOWED_ORIGINS' => 'https://app.example.org'];
    $cfg = Config::load(new Env(null, $env), $root);
    $router = new Router(); $router->add('GET', '/api/v1/boom', function () { throw new RuntimeException('SQLSTATE[HY000] password=hunter2 at /srv/secret/path.php'); });
    $router->add('POST', '/api/v1/echo', fn(Request $q) => Response::json(200, $q->json()));
    if ($extra) $extra($router);
    return [Kernel::make($cfg, $router, new Logger($logDir)), $logDir, $cfg];
};
$req = fn(string $m, string $p, array $h = [], string $body = '', bool $https = false, array $cookies = []) => new Request($m, $p, '', array_change_key_case($h, CASE_LOWER), $cookies, $body, '127.0.0.1', $https, 'h.test');
t('unhandled exception -> generic 500, trace only in the log, secrets redacted', function () use ($kernelFor, $req) {
    [$k, $logDir] = $kernelFor(); $res = $k->handle($req('GET', '/api/v1/boom'), 'rid123');
    eq($res->status, 500); $b = (string)$res->body; ok(str_contains($b, 'INTERNAL_ERROR') && str_contains($b, 'rid123'));
    foreach (['hunter2', 'SQLSTATE', '/srv/secret', '.php', 'Stack', '#0', 'RuntimeException'] as $bad) ok(!str_contains($b, $bad), "response leaks $bad");
    $log = (string)file_get_contents(glob($logDir . '/app-*.log')[0]); ok(str_contains($log, 'RuntimeException') && str_contains($log, 'rid123') && !str_contains($log, 'hunter2'), 'log should hold detail but not the password');
});
t('APP_DEBUG adds type/message in development only, still no trace', function () use ($kernelFor, $req) { [$k] = $kernelFor(['APP_DEBUG' => '1']); $b = (string)$k->handle($req('GET', '/api/v1/boom'), 'r')->body; ok(str_contains($b, '"debug"') && !str_contains($b, 'hunter2') && !str_contains($b, '#0')); });
t('security headers on success, errors and 404', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); foreach ([$req('GET', '/api/v1/boom'), $req('GET', '/api/v1/none'), $req('GET', '/nope'), $req('OPTIONS', '/api/v1/x')] as $q) {
        $res = $k->handle($q, 'r'); foreach (['X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'strict-origin-when-cross-origin', 'X-Frame-Options' => 'DENY'] as $h => $v) eq($res->getHeader($h), $v, "$h on {$q->path}");
        ok($res->getHeader('X-Request-Id') === 'r' && $res->getHeader('Cache-Control') === 'no-store');
    }
});
t('HSTS only over https and when configured', function () use ($kernelFor, $req) { [$k] = $kernelFor(['HSTS_MAX_AGE' => '31536000']); ok($k->handle($req('GET', '/api/v1/none', [], '', true), 'r')->getHeader('Strict-Transport-Security') === 'max-age=31536000'); ok($k->handle($req('GET', '/api/v1/none'), 'r')->getHeader('Strict-Transport-Security') === null); [$k2] = $kernelFor(); ok($k2->handle($req('GET', '/api/v1/none', [], '', true), 'r')->getHeader('Strict-Transport-Security') === null); });
t('CORS: allow-listed origin echoed with credentials; never *', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); $res = $k->handle($req('OPTIONS', '/api/v1/x', ['Origin' => 'https://app.example.org']), 'r');
    eq($res->status, 204); eq($res->getHeader('Access-Control-Allow-Origin'), 'https://app.example.org'); eq($res->getHeader('Access-Control-Allow-Credentials'), 'true'); ok(str_contains((string)$res->getHeader('Access-Control-Allow-Headers'), 'X-CSRF-Token')); ok($res->getHeader('Vary') === 'Origin');
});
t('CORS: unknown origin, "null" origin and look-alikes get no CORS headers (also on GET)', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); foreach (['https://evil.example', 'null', 'https://app.example.org.evil.example', 'http://app.example.org', 'https://APP.example.org.'] as $o) foreach (['OPTIONS', 'GET'] as $m) {
        $res = $k->handle($req($m, '/api/v1/none', ['Origin' => $o]), 'r'); ok($res->getHeader('Access-Control-Allow-Origin') === null && $res->getHeader('Access-Control-Allow-Credentials') === null, "origin $o got CORS headers");
    }
});
t('CORS: same-host origin allowed (Node parity)', function () use ($kernelFor, $req) { [$k] = $kernelFor(); eq($k->handle($req('GET', '/api/v1/none', ['Origin' => 'http://h.test']), 'r')->getHeader('Access-Control-Allow-Origin'), 'http://h.test'); });
t('OPTIONS never needs CSRF and issues no cookies', function () use ($kernelFor, $req) { [$k] = $kernelFor(); $res = $k->handle($req('OPTIONS', '/api/v1/echo'), 'r'); eq($res->status, 204); eq($res->cookies, []); });
t('session cookies issued once; valid existing cookies are kept', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); $res = $k->handle($req('GET', '/api/v1/none'), 'r'); eq(count($res->cookies), 2);
    $anon = bin2hex(random_bytes(16)); $csrf = bin2hex(random_bytes(24)); $res2 = $k->handle($req('GET', '/api/v1/none', [], '', false, ['agri_anon' => $anon, 'agri_csrf' => $csrf]), 'r'); eq($res2->cookies, []);
    $res3 = $k->handle($req('GET', '/api/v1/none', [], '', false, ['agri_anon' => 'not-hex!', 'agri_csrf' => 'short']), 'r'); eq(count($res3->cookies), 2, 'invalid cookies are replaced');
});
t('CSRF: missing, mismatched and valid tokens', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); $tok = bin2hex(random_bytes(24));
    $a = $k->handle($req('POST', '/api/v1/echo'), 'r'); eq($a->status, 403); ok(str_contains((string)$a->body, 'Invalid or missing CSRF token.'));
    $b = $k->handle($req('POST', '/api/v1/echo', ['x-csrf-token' => 'other-token-of-some-length'], '', false, ['agri_csrf' => $tok]), 'r'); eq($b->status, 403); ok(str_contains((string)$b->body, 'CSRF token mismatch.'));
    $c = $k->handle($req('POST', '/api/v1/echo', ['x-csrf-token' => $tok, 'content-type' => 'application/json'], '{"a":1}', false, ['agri_csrf' => $tok]), 'r'); eq($c->status, 200); eq((string)$c->body, '{"a":1}');
    $d = $k->handle($req('POST', '/api/v1/echo', ['x-csrf-token' => 'short'], '', false, ['agri_csrf' => 'short']), 'r'); eq($d->status, 403, 'tokens shorter than 16 are never valid');
    foreach (['PATCH', 'DELETE'] as $m) eq($k->handle($req($m, '/api/v1/echo'), 'r')->status, 403, "$m needs CSRF");
});
t('malformed JSON is rejected before any cookie is issued', function () use ($kernelFor, $req) { [$k] = $kernelFor(); $res = $k->handle($req('POST', '/api/v1/echo', ['content-type' => 'application/json'], '{nope'), 'r'); eq($res->status, 400); eq($res->cookies, []); ok(str_contains((string)$res->body, 'INVALID_JSON')); });
t('unsupported method TRACE/CONNECT -> 405', function () use ($kernelFor, $req) { [$k] = $kernelFor(); foreach (['TRACE', 'CONNECT', 'PROPFIND'] as $m) eq($k->handle($req($m, '/api/v1/echo'), 'r')->status, 405); });
t('paths outside /api and traversal-looking paths -> 404 JSON', function () use ($kernelFor, $req) { [$k] = $kernelFor(); foreach (['/', '/index.html', '/.env', '/api/../.env', '/apix/v1/health'] as $p) { $r = $k->handle($req('GET', $p), 'r'); eq($r->status, 404, $p); ok(str_contains((string)$r->getHeader('Content-Type'), 'application/json')); } });
t('HEAD returns no body', function () use ($kernelFor, $req) { [$k] = $kernelFor(); $r = $k->handle($req('HEAD', '/api/v1/none'), 'r'); ok($r->body === null); });
t('production kernel always marks cookies Secure', function () use ($root, $req) {
    $logDir = sys_get_temp_dir() . '/agri_m3p_' . bin2hex(random_bytes(3)); $s = fn() => bin2hex(random_bytes(24));
    $cfg = Config::load(new Env(null, ['APP_ENV' => 'production', 'SESSION_SECRET' => $s(), 'OWNER_KEY_HMAC_SECRET' => $s(), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'app', 'DB_PASS' => $s(), 'APP_URL' => 'https://agri.example.org', 'LOG_DIR' => $logDir, 'IP_HASH_SECRET' => $s(), 'PASSWORD_HASH_SCHEME' => 'bcrypt', 'PASSWORD_REHASH_ENABLED' => '0']), $root);
    $k = Kernel::make($cfg, new Router(), new Logger($logDir)); $res = $k->handle($req('GET', '/api/v1/none'), 'r'); eq(count($res->cookies), 2); foreach ($res->cookies as $c) ok(str_contains($c, 'Secure') && str_contains($c, 'SameSite=Lax'), $c);
});

echo "Logger\n";
t('redaction by key and by value shape', function () {
    $r = Logger::redact(['password' => 'p', 'api_key' => 'k', 'nested' => ['Authorization' => 'Bearer x', 'ok' => 'fine'], 'msg' => 'login failed password=abc123 for u', 'h' => 'a' . str_repeat('b', 31) . ':' . str_repeat('c', 128)]);
    eq($r['password'], '[redacted]'); eq($r['api_key'], '[redacted]'); eq($r['nested']['Authorization'], '[redacted]'); eq($r['nested']['ok'], 'fine'); ok(!str_contains($r['msg'], 'abc123')); ok(str_contains($r['h'], 'redacted-hash'), $r['h']);
});
t('log files are private (0600) and JSON lines', function () { $d = sys_get_temp_dir() . '/agri_log_' . bin2hex(random_bytes(3)); (new Logger($d, 'rq1'))->error('x', ['a' => 1]); $f = glob($d . '/app-*.log')[0]; eq(substr(sprintf('%o', fileperms($f)), -4), '0600'); $j = json_decode(trim((string)file_get_contents($f)), true); eq($j['request_id'], 'rq1'); });

echo "Deployment hygiene\n";
t('hygiene flags a world-readable .env, a log dir and an app dir inside the web root', function () use ($prod, $load) {
    $d = sys_get_temp_dir() . '/agri_hyg_' . bin2hex(random_bytes(3)); mkdir($d . '/app/logs', 0700, true); file_put_contents($d . '/.env', 'X=1'); chmod($d . '/.env', 0644);
    $cfg = $load($prod(['LOG_DIR' => $d . '/app/logs']));
    $w = implode('|', Agri\Bootstrap::hygiene($cfg, $d, $d));
    ok(str_contains($w, '.env is readable') && str_contains($w, 'LOG_DIR is inside the web root') && str_contains($w, 'application directory is inside'), $w);
    chmod($d . '/.env', 0600); $ok = Agri\Bootstrap::hygiene($cfg, $d, $d . '/elsewhere'); ok(!str_contains(implode('|', $ok), '.env is readable'), 'chmod 600 .env must pass');
    $cfgDev = $load($prod(['APP_ENV' => 'development', 'LOG_DIR' => $d . '/app/logs'])); chmod($d . '/.env', 0644); ok(!str_contains(implode('|', Agri\Bootstrap::hygiene($cfgDev, $d, '')), '.env is readable'), 'development is not nagged');
});
t('front controller refuses PHP < 8.2 with a clean JSON error', function () use ($root) { $src = (string)file_get_contents($root . '/public/index.php'); ok(str_contains($src, 'PHP_VERSION_ID < 80200') && strpos($src, 'PHP_VERSION_ID') < strpos($src, 'autoload.php')); });
t('httpoxy variable is removed at boot', function () use ($root) { $src = (string)file_get_contents($root . '/app/Bootstrap.php'); ok(str_contains($src, "putenv('HTTP_PROXY')")); $ht = (string)file_get_contents($root . '/public/.htaccess'); ok(preg_match('/^\s*RequestHeader\s+unset\s+Proxy\s*$/m', $ht) === 1 && !preg_match('/unset\s+Proxy\s+early/', $ht), 'the early flag is ineffective in .htaccess and must not be used'); });

echo "\nM3.1: trusted proxies and forwarded headers\n";
use Agri\Http\TrustedProxies;
use Agri\Http\App;
use Agri\Controllers\HealthController;
use Agri\Support\FileStore;
$tp = function (string $list): TrustedProxies { $out = null; $pr = TrustedProxies::parse($list, $out); if ($pr) throw new RuntimeException(implode(';', $pr)); return $out; };
$reqFor = function (array $server, ?TrustedProxies $px) { $_SERVER = $server + ['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/']; return Request::fromGlobals(1024, $px, ''); };
t('default (no proxy list): X-Forwarded-For and -Proto are ignored', function () use ($reqFor) { $r = $reqFor(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '203.0.113.9', 'HTTP_X_FORWARDED_PROTO' => 'https'], null); eq($r->clientIp, '10.0.0.1'); ok(!$r->isHttps); });
t('trusted proxy: client is the address the proxy appended', function () use ($reqFor, $tp) { $r = $reqFor(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '198.51.100.7'], $tp('10.0.0.1')); eq($r->clientIp, '198.51.100.7'); });
t('FORGED leftmost entry is ignored: rightmost untrusted hop wins', function () use ($reqFor, $tp) { $r = $reqFor(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '1.2.3.4, 198.51.100.7'], $tp('10.0.0.1')); eq($r->clientIp, '198.51.100.7'); });
t('forged header from an UNTRUSTED peer is ignored', function () use ($reqFor, $tp) { $r = $reqFor(['REMOTE_ADDR' => '192.0.2.50', 'HTTP_X_FORWARDED_FOR' => '1.2.3.4', 'HTTP_X_FORWARDED_PROTO' => 'https'], $tp('10.0.0.0/24')); eq($r->clientIp, '192.0.2.50'); ok(!$r->isHttps); });
t('verified chain: trusted hops are skipped from the right', function () use ($reqFor, $tp) { $r = $reqFor(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '9.9.9.9, 198.51.100.7, 10.0.0.2'], $tp('10.0.0.0/24')); eq($r->clientIp, '198.51.100.7'); });
t('every hop trusted -> peer address (no client to believe)', function () use ($reqFor, $tp) { $r = $reqFor(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '10.0.0.2, 10.0.0.3'], $tp('10.0.0.0/24')); eq($r->clientIp, '10.0.0.1'); });
t('malformed / oversized / too long chains are ignored whole', function () use ($reqFor, $tp) {
    $px = $tp('10.0.0.1');
    foreach (['198.51.100.7, unknown', '198.51.100.7, <script>', '198.51.100.7,,', 'for=198.51.100.7', str_repeat('1.1.1.1, ', 11) . '1.1.1.1', str_repeat('a', 600), "198.51.100.7\r\nX-Evil: 1"] as $bad)
        eq($reqFor(['REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_FOR' => $bad], $px)->clientIp, '10.0.0.1', substr($bad, 0, 20));
});
t('IPv6 clients, IPv6 proxies and IPv4-mapped peers', function () use ($reqFor, $tp) {
    $px = $tp('10.0.0.1, 2001:db8:aa::/48');
    eq($reqFor(['REMOTE_ADDR' => '2001:db8:aa::5', 'HTTP_X_FORWARDED_FOR' => '2001:db8:ffff::9'], $px)->clientIp, '2001:db8:ffff::9');
    eq($reqFor(['REMOTE_ADDR' => '::ffff:10.0.0.1', 'HTTP_X_FORWARDED_FOR' => '198.51.100.7'], $px)->clientIp, '198.51.100.7');
    eq($reqFor(['REMOTE_ADDR' => '2001:db8:ab::5', 'HTTP_X_FORWARDED_FOR' => '1.2.3.4'], $px)->clientIp, '2001:db8:ab::5');
});
t('CIDR boundaries are exact', function () use ($tp) { $px = $tp('10.0.0.0/30'); ok($px->contains('10.0.0.3')); ok(!$px->contains('10.0.0.4')); $p2 = $tp('172.16.0.0/12'); ok($p2->contains('172.31.255.255')); ok(!$p2->contains('172.32.0.0')); ok(!$p2->contains('not-an-ip')); });
t('X-Forwarded-Proto: only a trusted peer, only http/https, rightmost value decides', function () use ($reqFor, $tp) {
    $px = $tp('10.0.0.1');
    $h = fn(string $v, string $peer = '10.0.0.1') => $reqFor(['REMOTE_ADDR' => $peer, 'HTTP_X_FORWARDED_PROTO' => $v], $px)->isHttps;
    ok($h('https')); ok($h('HTTPS')); ok($h('http, https')); ok(!$h('https, http')); ok(!$h('http')); ok(!$h('javascript')); ok(!$h('https, javascript')); ok(!$h('https', '192.0.2.9')); ok(!$h(str_repeat('https,', 20)));
});
t('direct TLS (HTTPS server variable) still counts without any proxy', function () use ($reqFor) { ok($reqFor(['REMOTE_ADDR' => '203.0.113.1', 'HTTPS' => 'on'], null)->isHttps); ok(!$reqFor(['REMOTE_ADDR' => '203.0.113.1', 'HTTPS' => 'off'], null)->isHttps); });
t('unparsable REMOTE_ADDR never reaches rate-limit keys', function () use ($reqFor) { eq($reqFor(['REMOTE_ADDR' => 'garbage'], null)->clientIp, '0.0.0.0'); eq($reqFor([], null)->clientIp, '0.0.0.0'); });
t('proxy list parser refuses too-wide, malformed and empty lists', function () {
    foreach (['0.0.0.0/0', '::/0', '10.0.0.0/7', '2001:db8::/31', '10.0.0.0/33', '10.0.0.0/x', '10.0.0/24', 'abc', '10.0.0.1/24/1', ',', ' '] as $bad) { $o = null; ok(count(TrustedProxies::parse($bad, $o)) > 0 && $o === null, "accepted '$bad'"); }
});

echo "\nM3.1: authentication, mail, session and IP-hash configuration (fail closed)\n";
$must = fn(array $over, string $needle) => throws(fn() => $load($prod($over)), $needle, ConfigException::class);
$mailOk = fn(array $o = []) => $o + ['MAIL_TRANSPORT' => 'smtp', 'MAIL_HOST' => 'smtp.example.org', 'MAIL_PORT' => '587', 'MAIL_ENCRYPTION' => 'starttls', 'MAIL_USERNAME' => 'mailer', 'MAIL_PASSWORD' => 'pw-' . bin2hex(random_bytes(6)), 'MAIL_FROM_ADDRESS' => 'no-reply@example.org', 'MAIL_FROM_NAME' => 'Agri Advisory'];
t('proxy flags: TRUST_PROXY without list, list without flag and flag typos are errors', function () use ($must, $prod, $load) {
    $must(['TRUST_PROXY' => '1'], 'TRUSTED_PROXY_CIDRS'); $must(['TRUSTED_PROXY_CIDRS' => '10.0.0.1'], 'TRUST_PROXY'); $must(['TRUST_PROXY' => 'ye', 'TRUSTED_PROXY_CIDRS' => '10.0.0.1'], 'TRUST_PROXY must be');
    $must(['TRUST_PROXY' => '1', 'TRUSTED_PROXY_CIDRS' => '0.0.0.0/0'], 'too wide');
    $c = $load($prod(['TRUST_PROXY' => '1', 'TRUSTED_PROXY_CIDRS' => '10.0.0.0/24'])); ok($c->trustedProxies !== null); ok($load($prod())->trustedProxies === null, 'default must be no trust');
});
t('IP_HASH_SECRET: required in production, strong, distinct', function () use ($must, $prod, $load, $strong) {
    $e = $prod(); unset($e['IP_HASH_SECRET']); throws(fn() => $load($e), 'IP_HASH_SECRET', ConfigException::class);
    $must(['IP_HASH_SECRET' => 'short'], 'IP_HASH_SECRET'); $must(['IP_HASH_SECRET' => 'change-me-change-me-change-me-12345'], 'IP_HASH_SECRET');
    $x = $strong(); $must(['SESSION_SECRET' => $x, 'IP_HASH_SECRET' => $x], 'must differ');
    $d = $load(['APP_ENV' => 'development', 'SESSION_SECRET' => $strong(), 'OWNER_KEY_HMAC_SECRET' => $strong(), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'u']); ok($d->ipHashSecret === null, 'optional outside production');
});
t('session windows: defaults, bounds, ordering, typos', function () use ($must, $prod, $load) {
    $c = $load($prod()); eq($c->session, ['idleMinutes' => 720, 'absoluteHours' => 168, 'adminIdleMinutes' => 30, 'adminAbsoluteHours' => 8]);
    foreach ([['SESSION_IDLE_MINUTES', '0'], ['SESSION_IDLE_MINUTES', '99999'], ['SESSION_IDLE_MINUTES', '12h'], ['SESSION_IDLE_MINUTES', '-5'], ['SESSION_ABSOLUTE_HOURS', '0'], ['SESSION_ABSOLUTE_HOURS', '721'], ['SESSION_IDLE_MINUTES_ADMIN', '121'], ['SESSION_ABSOLUTE_HOURS_ADMIN', '25']] as [$k, $v]) $must([$k => $v], $k);
    $must(['SESSION_IDLE_MINUTES' => '1000', 'SESSION_ABSOLUTE_HOURS' => '10'], 'must not exceed');
    $must(['SESSION_IDLE_MINUTES_ADMIN' => '60', 'SESSION_IDLE_MINUTES' => '30'], 'administrator session windows');
    $must(['SESSION_ABSOLUTE_HOURS_ADMIN' => '12', 'SESSION_ABSOLUTE_HOURS' => '10'], 'administrator session windows');
});
t('password policy: explicit in production, typos, contradictions, cost bounds', function () use ($must, $prod, $load) {
    foreach (['PASSWORD_HASH_SCHEME', 'PASSWORD_REHASH_ENABLED'] as $k) { $e = $prod(); unset($e[$k]); throws(fn() => $load($e), $k, ConfigException::class); }
    $must(['PASSWORD_HASH_SCHEME' => 'argon2'], 'PASSWORD_HASH_SCHEME'); $must(['PASSWORD_HASH_SCHEME' => 'md5'], 'PASSWORD_HASH_SCHEME'); $must(['PASSWORD_REHASH_ENABLED' => 'maybe'], 'PASSWORD_REHASH_ENABLED');
    $must(['PASSWORD_HASH_SCHEME' => 'legacy', 'PASSWORD_REHASH_ENABLED' => '1'], 'contradicts');
    $must(['PASSWORD_BCRYPT_COST' => '4'], 'PASSWORD_BCRYPT_COST'); $must(['PASSWORD_ARGON2_MEMORY_KIB' => '1024'], 'PASSWORD_ARGON2_MEMORY_KIB'); $must(['PASSWORD_ARGON2_TIME' => '0'], 'PASSWORD_ARGON2_TIME');
    ok($load($prod(['PASSWORD_HASH_SCHEME' => 'legacy']))->password['scheme'] === 'legacy'); ok($load($prod(['PASSWORD_HASH_SCHEME' => 'bcrypt', 'PASSWORD_REHASH_ENABLED' => '1']))->password['rehash'] === true);
    if (defined('PASSWORD_ARGON2ID')) ok($load($prod(['PASSWORD_HASH_SCHEME' => 'argon2id']))->password['scheme'] === 'argon2id');
});
t('mail: default null and inactive; test transports only outside production; smtp must be complete', function () use ($must, $prod, $load, $mailOk) {
    $c = $load($prod()); eq($c->mail['transport'], 'null'); ok($c->mailActive() === false);
    $must(['MAIL_TRANSPORT' => 'capture'], 'test-only'); $must(['MAIL_TRANSPORT' => 'log'], 'test-only'); $must(['MAIL_TRANSPORT' => 'sendmail'], 'MAIL_TRANSPORT must be');
    $d = $load($prod(['APP_ENV' => 'development', 'MAIL_TRANSPORT' => 'capture', 'APP_URL' => 'http://localhost:3000'])); eq($d->mail['transport'], 'capture');
    foreach (['MAIL_HOST', 'MAIL_PORT', 'MAIL_ENCRYPTION', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_FROM_ADDRESS'] as $k) { $m = $mailOk(); unset($m[$k]); throws(fn() => $load($prod($m)), 'MAIL_', ConfigException::class); }
    foreach ([['MAIL_ENCRYPTION', 'none'], ['MAIL_ENCRYPTION', ''], ['MAIL_PORT', '0'], ['MAIL_PORT', '99999'], ['MAIL_PORT', 'smtp'], ['MAIL_HOST', 'bad host'], ['MAIL_HOST', 'localhost'], ['MAIL_HOST', '10.0.0.5'], ['MAIL_FROM_ADDRESS', 'not-an-email'], ['MAIL_FROM_ADDRESS', "a@b.org\r\nBcc: x@y.z"], ['MAIL_FROM_NAME', "Evil\r\nBcc: x"], ['MAIL_FROM_NAME', 'A<b>'], ['MAIL_VERIFY_PEER', '0'], ['MAIL_VERIFY_PEER', 'false']] as [$k, $v]) throws(fn() => $load($prod($mailOk([$k => $v]))), 'MAIL_', ConfigException::class);
    $ok = $load($prod($mailOk())); eq($ok->mail['transport'], 'smtp'); ok($ok->mailActive() === false, 'SMTP must stay inactive'); ok($load($prod($mailOk(['MAIL_VERIFY_PEER' => '1']))) instanceof Config);
});
t('mail credentials and other secrets never appear in errors or the summary', function () use ($prod, $load, $mailOk) {
    $pw = 'MailPw' . bin2hex(random_bytes(8)); $tok = 'Tok' . bin2hex(random_bytes(16));
    try { $load($prod($mailOk(['MAIL_PASSWORD' => $pw, 'MAIL_PORT' => 'x', 'HEALTH_DEEP_TOKEN' => $tok, 'SESSION_IDLE_MINUTES' => 'q']))); throw new RuntimeException('should fail'); }
    catch (ConfigException $e) { $m = $e->getMessage() . json_encode($e->problems); ok(!str_contains($m, $pw) && !str_contains($m, $tok), 'secret value leaked'); }
    $s = json_encode($load($prod($mailOk(['MAIL_PASSWORD' => $pw, 'HEALTH_DEEP_TOKEN' => $tok])))->summary()); ok(!str_contains($s, $pw) && !str_contains($s, $tok) && !str_contains($s, 'smtp.example.org'), 'summary leaks');
});
t('health settings: cache must stay on in production, token strength and distinctness', function () use ($must, $prod, $load, $strong) {
    $must(['HEALTH_CACHE_TTL_SECONDS' => '0'], 'HEALTH_CACHE_TTL_SECONDS'); $must(['HEALTH_CACHE_TTL_SECONDS' => '61'], 'HEALTH_CACHE_TTL_SECONDS'); $must(['HEALTH_DEEP_TOKEN' => 'short'], 'HEALTH_DEEP_TOKEN');
    $x = $strong(); $must(['SESSION_SECRET' => $x, 'HEALTH_DEEP_TOKEN' => $x], 'must differ'); $must(['HEALTH_DEEP_RATE_PER_MINUTE' => '0'], 'HEALTH_DEEP_RATE_PER_MINUTE');
    $c = $load($prod()); eq($c->health['ttl'], 15); eq($c->health['failTtl'], 3); ok($c->health['deepToken'] === null);
});

echo "\nM3.1: health cache, deep check, file rate limiter\n";
$cdir = fn() => sys_get_temp_dir() . '/agri_m3u_' . bin2hex(random_bytes(4));
$mkApp = function (array $extra, int &$dbCalls, bool $dbDown = false) use ($load, $prod, $cdir) {
    $cache = $extra['CACHE_DIR'] ?? $cdir();
    $cfg = Config::load(new Env(null, $extra + ['APP_ENV' => 'development', 'SESSION_SECRET' => bin2hex(random_bytes(16)), 'OWNER_KEY_HMAC_SECRET' => bin2hex(random_bytes(16)), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'u', 'CACHE_DIR' => $cache, 'LOG_DIR' => $cache . '-logs']), '/srv/agri');
    $factory = function () use (&$dbCalls, &$dbDown): PDO {
        $dbCalls++;
        if ($dbDown) throw new PDOException('SQLSTATE[HY000] [1045] Access denied for user \'secretuser\'@\'secret-host\' (using password: YES)');
        $p = new PDO('sqlite::memory:'); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $p->exec("CREATE TABLE schema_migrations (version TEXT, applied_at TEXT); INSERT INTO schema_migrations VALUES ('001_schema','2026-01-01'); CREATE TABLE agricultural_guides (is_published INT, review_status TEXT); INSERT INTO agricultural_guides VALUES (1,'approved'),(1,'approved'),(0,'approved')");
        return $p;
    };
    // like production, every request gets a fresh App (and therefore a fresh database connection attempt)
    $fresh = fn() => new HealthController(new App($cfg, new Logger($cache . '-logs', 'rid'), $factory));
    return [$fresh, $cache];
};
$get = function (Closure $h, string $qs = '', array $headers = [], string $ip = '127.0.0.1') {
    try { return $h()(new Request('GET', '/api/v1/health', $qs, $headers, [], '', $ip, false, null)); }
    catch (HttpException $e) { return Response::error($e->status, $e->errorCode, $e->getMessage(), $e->headers); }
};
$contractKeys = ['status', 'service', 'apiVersion', 'database', 'latestMigration', 'publishedGuides', 'aiConfigured', 'timestamp'];
t('public health: contract fields/order unchanged; 50 polls cost one database check', function () use ($mkApp, $get, $contractKeys) {
    $calls = 0; [$h] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '15'], $calls);
    for ($i = 0; $i < 50; $i++) { $r = $get($h, '_=' . $i); eq($r->status, 200); $j = json_decode((string)$r->body, true); eq(array_keys($j), $contractKeys); eq($j['publishedGuides'], 2); eq($j['database'], 'connected'); eq($j['latestMigration'], '001_schema'); }
    eq($calls, 1, 'database connections');
});
t('cached responses carry a fresh timestamp and the cache-buster is ignored', function () use ($mkApp, $get) {
    $calls = 0; [$h] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '15'], $calls); $a = json_decode((string)$get($h, '_=1')->body, true)['timestamp']; usleep(30000); $b = json_decode((string)$get($h, '_=2')->body, true)['timestamp'];
    ok($a !== $b && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/', $b) === 1, "$a vs $b");
});
t('cache expires: a second check happens after the TTL', function () use ($mkApp, $get) {
    $calls = 0; [$h] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '1'], $calls); $get($h); sleep(2); $get($h); eq($calls, 2);
});
t('failures: generic body, never any database text, cached briefly, recover after the fail TTL', function () use ($mkApp, $get) {
    $calls = 0; $down = true; $cache = sys_get_temp_dir() . '/agri_m3u_' . bin2hex(random_bytes(4));
    [$h] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '15', 'HEALTH_FAIL_CACHE_TTL_SECONDS' => '1', 'CACHE_DIR' => $cache], $calls, true);
    for ($i = 0; $i < 5; $i++) { $r = $get($h); eq($r->status, 500); eq(json_decode((string)$r->body, true), ['status' => 'error', 'error' => ['code' => 'HEALTH_CHECK_FAILED', 'message' => 'Database error']]); ok(!preg_match('/secret|SQLSTATE|Access denied|password/i', (string)$r->body)); }
    eq($calls, 1, 'failure was not cached'); sleep(2);
    $calls2 = 0; [$h2] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '15', 'HEALTH_FAIL_CACHE_TTL_SECONDS' => '1', 'CACHE_DIR' => $cache], $calls2, false);
    eq($get($h2)->status, 200, 'did not recover after the fail TTL'); eq($calls2, 1);
});
t('corrupt, forged-future and tampered cache files are not trusted', function () use ($mkApp, $get, $contractKeys) {
    $calls = 0; [$h, $cache] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '15'], $calls); $get($h); $f = glob($cache . '/health-*.json')[0];
    file_put_contents($f, '{not json'); $get($h); eq($calls, 2, 'corrupt');
    file_put_contents($f, json_encode(['t' => time() + 3600, 'ok' => true, 'data' => ['status' => 'ok']])); $get($h); eq($calls, 3, 'future');
    file_put_contents($f, json_encode(['t' => time(), 'ok' => true, 'data' => ['status' => 'ok', 'service' => 'agri-advisory-liberia-api', 'apiVersion' => 'v1', 'database' => 'connected', 'latestMigration' => 'x', 'publishedGuides' => 5, 'aiConfigured' => false, 'secret' => 'LEAK', 'path' => '/etc']]));
    $r = $get($h); $j = json_decode((string)$r->body, true); eq(array_keys($j), $contractKeys); ok(!str_contains((string)$r->body, 'LEAK'));
});
t('unwritable cache directory falls back to live checks (no failure)', function () use ($mkApp, $get) {
    $file = sys_get_temp_dir() . '/agri_m3u_' . bin2hex(random_bytes(4)); file_put_contents($file, 'x'); $calls = 0; [$h] = $mkApp(['HEALTH_CACHE_TTL_SECONDS' => '15', 'CACHE_DIR' => $file . '/sub'], $calls);
    eq($get($h)->status, 200); eq($get($h)->status, 200); eq($calls, 2); unlink($file);
});
t('deep check: does not exist without a configured token (404, no hint)', function () use ($mkApp, $get) { $calls = 0; [$h] = $mkApp([], $calls); $r = $get($h, 'deep=1', ['x-health-token' => 'anything']); eq($r->status, 404); eq($calls, 0); });
t('deep check: token required, header only, constant-time compare, never in the URL', function () use ($mkApp, $get) {
    $tok = bin2hex(random_bytes(20)); $calls = 0; [$h] = $mkApp(['HEALTH_DEEP_TOKEN' => $tok], $calls);
    eq($get($h, 'deep=1')->status, 403); eq($get($h, 'deep=1', ['x-health-token' => 'wrong'])->status, 403); eq($get($h, 'deep=1&token=' . $tok)->status, 403); eq($get($h, 'deep=1&x-health-token=' . $tok)->status, 403); eq($calls, 0, 'database touched before authorisation');
    $r = $get($h, 'deep=1', ['x-health-token' => $tok]); eq($r->status, 200); $j = json_decode((string)$r->body, true);
    ok($j['deep'] === true && isset($j['dbLatencyMs'], $j['appliedMigrations']) && $j['cacheDirWritable'] === true); ok(!str_contains((string)$r->body, $tok)); eq($r->getHeader('Cache-Control'), 'no-store');
    ok(!preg_match('#/tmp|/var|/srv|\.php|localhost|PHP/|sqlite#i', (string)$r->body), 'deep body discloses paths or versions');
});
t('deep check bypasses the cache and public health stays cached', function () use ($mkApp, $get) {
    $tok = bin2hex(random_bytes(20)); $calls = 0; [$h] = $mkApp(['HEALTH_DEEP_TOKEN' => $tok, 'HEALTH_CACHE_TTL_SECONDS' => '15'], $calls); $get($h); $get($h); eq($calls, 1);
    $get($h, 'deep=1', ['x-health-token' => $tok]); $get($h, 'deep=1', ['x-health-token' => $tok]); eq($calls, 3);
});
t('deep check is rate limited per client, bad tokens count too, other clients unaffected', function () use ($mkApp, $get) {
    $tok = bin2hex(random_bytes(20)); $calls = 0; [$h] = $mkApp(['HEALTH_DEEP_TOKEN' => $tok, 'HEALTH_DEEP_RATE_PER_MINUTE' => '5'], $calls);
    for ($i = 0; $i < 5; $i++) eq($get($h, 'deep=1', ['x-health-token' => 'guess' . $i], '198.51.100.1')->status, 403);
    $r = $get($h, 'deep=1', ['x-health-token' => $tok], '198.51.100.1');
    ok($r->status === 429 && $r->getHeader('Retry-After') === '60', 'correct token must not bypass the limiter');
    eq($get($h, 'deep=1', ['x-health-token' => $tok], '198.51.100.2')->status, 200);
    eq($calls, 1, 'rate-limited and refused requests must not touch the database');
});
t('deep failure body is generic too', function () use ($mkApp, $get) {
    $tok = bin2hex(random_bytes(20)); $calls = 0; [$h] = $mkApp(['HEALTH_DEEP_TOKEN' => $tok], $calls, true); $r = $get($h, 'deep=1', ['x-health-token' => $tok]); eq($r->status, 500); ok(!preg_match('/secret|SQLSTATE|Access denied/i', (string)$r->body));
});
t('file rate limiter: window, limit, expiry, key cap and fail-closed behaviour', function () use ($cdir) {
    $d = $cdir(); $now = 1000;
    for ($i = 0; $i < 3; $i++) ok(FileStore::rateHit($d, 'x', 'k', 3, 60, $now), "hit $i"); ok(!FileStore::rateHit($d, 'x', 'k', 3, 60, $now + 1), 'over limit'); ok(FileStore::rateHit($d, 'x', 'other', 3, 60, $now), 'other key');
    ok(FileStore::rateHit($d, 'x', 'k', 3, 60, $now + 61), 'window expired');
    for ($i = 0; $i < 4; $i++) FileStore::rateHit($d, 'cap', "k$i", 5, 60, $now, 4); ok(!FileStore::rateHit($d, 'cap', 'k-new', 5, 60, $now, 4), 'table full -> deny');
    ok(!FileStore::rateHit('/proc/nonexistent/x', 'x', 'k', 3, 60, $now), 'unwritable -> deny');
    ok(((fileperms(glob($d . '/rl-x.json')[0]) & 0777) === 0600), 'file mode');
});
t('FileStore atomic write leaves no temp files and reads back', function () use ($cdir) { $d = $cdir(); FileStore::ensureDir($d); ok(FileStore::writeAtomic("$d/a.json", '{"a":1}')); eq(FileStore::readJson("$d/a.json"), ['a' => 1]); eq(glob("$d/*.tmp"), []); eq(FileStore::readJson("$d/missing.json"), null); });

echo "\nM3 unit tests: $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
