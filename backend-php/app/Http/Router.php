<?php
declare(strict_types=1);

namespace Agri\Http;

final class Router
{
    /** @var list<array{string,string,callable,bool}> method, pattern, handler, implemented */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler, bool $implemented = true): void
    {
        $this->routes[] = [strtoupper($method), $pattern, $handler, $implemented];
    }

    /** @return array{0:callable,1:array<string,string>,2:bool} */
    public function dispatch(string $method, string $path): array
    {
        $path = strlen($path) > 1 ? rtrim($path, '/') : $path;
        $allowed = [];
        foreach ($this->routes as [$m, $pattern, $handler, $impl]) {
            $re = '#^' . preg_replace('#:([A-Za-z_][A-Za-z0-9_]*)#', '(?P<$1>[^/]+)', $pattern) . '$#';
            if (!preg_match($re, $path, $mm)) continue;
            $allowed[$m] = true;
            if ($m === $method || ($method === 'HEAD' && $m === 'GET')) {
                return [$handler, array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY), $impl];
            }
        }
        if ($allowed) {
            $list = array_keys($allowed);
            if (isset($allowed['GET'])) $list[] = 'HEAD';
            $list[] = 'OPTIONS';
            throw new HttpException(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', ['Allow' => implode(', ', array_unique($list))]);
        }
        throw new HttpException(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
}
