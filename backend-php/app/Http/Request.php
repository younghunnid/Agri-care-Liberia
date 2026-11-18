<?php
declare(strict_types=1);

namespace Agri\Http;

final class Request
{
    /** @var array<string,mixed> request-scoped values set by middleware (csrfToken, anonToken, pendingCookies, ...) */
    public array $attributes = [];
    private ?array $json = null;
    private bool $jsonParsed = false;

    /** @param array<string,string> $headers lower-case names; @param array<string,string> $cookies */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly string $queryString,
        public readonly array $headers,
        public readonly array $cookies,
        private readonly string $rawBody,
        public readonly string $clientIp,
        public readonly bool $isHttps,
        public readonly ?string $host,
    ) {}

    /** Builds a Request from PHP globals. Body size is enforced BEFORE any body byte is read. */
    public static function fromGlobals(int $maxBody, bool $trustProxy, ?string $input = null): self
    {
        $s = $_SERVER;
        $headers = [];
        foreach ($s as $k => $v) {
            if (!is_string($v)) continue;
            if (str_starts_with($k, 'HTTP_')) $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
            elseif ($k === 'CONTENT_TYPE' || $k === 'CONTENT_LENGTH') $headers[strtolower(str_replace('_', '-', $k))] = $v;
        }
        $method = strtoupper((string)($s['REQUEST_METHOD'] ?? 'GET'));
        $uri = (string)($s['REQUEST_URI'] ?? '/');
        $rawPath = (string)(parse_url($uri, PHP_URL_PATH) ?? '/');
        $path = rawurldecode($rawPath);
        if (preg_match('/[\x00-\x1f\x7f]/', $path) || !mb_check_encoding($path, 'UTF-8')) throw new HttpException(400, 'BAD_REQUEST', 'Malformed request path.');
        $query = (string)($s['QUERY_STRING'] ?? '');

        $cl = $headers['content-length'] ?? null;
        if ($cl !== null && (!ctype_digit($cl))) throw new HttpException(400, 'BAD_REQUEST', 'Invalid Content-Length.');
        if ($cl !== null && (int)$cl > $maxBody) throw new HttpException(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
        $body = '';
        if ($input !== null) $body = $input;
        elseif (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true) && ($cl !== '0')) {
            $h = fopen('php://input', 'rb');
            $body = $h ? (string)stream_get_contents($h, $maxBody + 1) : '';
            if ($h) fclose($h);
        }
        if (strlen($body) > $maxBody) throw new HttpException(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');

        $https = (!empty($s['HTTPS']) && strtolower((string)$s['HTTPS']) !== 'off')
            || ($trustProxy && strtolower(trim(explode(',', $headers['x-forwarded-proto'] ?? '')[0])) === 'https');
        $ip = (string)($s['REMOTE_ADDR'] ?? '');
        if ($trustProxy && !empty($headers['x-forwarded-for'])) {
            $cand = trim(explode(',', $headers['x-forwarded-for'])[0]);
            if (filter_var($cand, FILTER_VALIDATE_IP)) $ip = $cand;
        }
        return new self($method, $path, $query, $headers, self::parseCookies($headers['cookie'] ?? ''), $body, $ip, $https, $headers['host'] ?? null);
    }

    /** @return array<string,string> */
    public static function parseCookies(string $header): array
    {
        $out = [];
        foreach (explode(';', $header) as $part) {
            $eq = strpos($part, '=');
            if ($eq === false) continue;
            $k = trim(substr($part, 0, $eq));
            if ($k === '' || isset($out[$k])) continue; // first occurrence wins (like cookie-parser)
            $out[$k] = rawurldecode(trim(substr($part, $eq + 1), " \t\""));
        }
        return $out;
    }

    public function header(string $name): ?string { return $this->headers[strtolower($name)] ?? null; }
    public function cookie(string $name): ?string { return $this->cookies[$name] ?? null; }
    public function hasBody(): bool { return $this->rawBody !== ''; }

    /**
     * JSON body as an array (object or list). Empty body -> []. Wrong media type -> 415, invalid/oversized JSON -> 400.
     * @return array<mixed>
     */
    public function json(): array
    {
        if ($this->jsonParsed) return $this->json ?? [];
        $this->jsonParsed = true;
        if (trim($this->rawBody) === '') return $this->json = [];
        $ct = strtolower(trim(explode(';', $this->header('content-type') ?? '')[0]));
        if ($ct !== 'application/json') throw new HttpException(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
        try {
            $v = json_decode($this->rawBody, true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\JsonException) {
            throw new HttpException(400, 'INVALID_JSON', 'Request body is not valid JSON.');
        }
        if (!is_array($v)) throw new HttpException(400, 'INVALID_JSON', 'Request body must be a JSON object or array.');
        return $this->json = $v;
    }
}
