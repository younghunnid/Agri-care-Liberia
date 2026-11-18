<?php
declare(strict_types=1);

namespace Agri\Http;

/** An error that is safe to show to the client: status, stable code and a fixed message. */
final class HttpException extends \RuntimeException
{
    /** @param array<string,string> $headers */
    public function __construct(public readonly int $status, public readonly string $errorCode, string $publicMessage, public readonly array $headers = [])
    {
        parent::__construct($publicMessage);
    }
}
