<?php
declare(strict_types=1);

namespace Agri\Config;

/** Carries only the NAMES of invalid settings and a rule description; never a value. */
final class ConfigException extends \RuntimeException
{
    /** @param list<string> $problems */
    public function __construct(public readonly array $problems)
    {
        parent::__construct('Invalid configuration: ' . implode('; ', $problems));
    }
}
