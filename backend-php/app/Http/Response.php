<?php
declare(strict_types=1);

namespace Agri\Http;

final class Response
{
    /** @var array<string,string> */
    public array $headers = [];
    /** @var list<string> */
    public array $cookies = [];

    public function __construct(public int $status = 200, public ?string $body = null) {}

    public static function json(int $status, mixed $data, array $headers = []): self
    {
        $r = new self($status, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $r->headers = ['Content-Type' => 'application/json; charset=utf-8'] + $headers;
        return $r;
    }

    public static function error(int $status, string $code, string $message, array $headers = [], array $extra = []): self
    {
        return self::json($status, ['error' => ['code' => $code, 'message' => $message]] + $extra, $headers);
    }

    public function header(string $name, string $value): self { $this->headers[$name] = $value; return $this; }

    /** @return array<string,string> headers with canonical case-insensitive lookup helper for tests */
    public function getHeader(string $name): ?string
    {
        foreach ($this->headers as $k => $v) if (strcasecmp($k, $name) === 0) return $v;
        return null;
    }

    public function send(bool $omitBody = false): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $k => $v) header("$k: $v", true);
        foreach ($this->cookies as $c) header('Set-Cookie: ' . $c, false);
        if (!$omitBody && $this->body !== null) echo $this->body;
    }
}
