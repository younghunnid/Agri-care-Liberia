<?php
declare(strict_types=1);

namespace Agri\Http;

use Agri\Config\Config;
use Agri\Database\Connection;
use Agri\Support\Logger;
use PDO;

/** Tiny service holder (no framework): configuration, logger and a lazily opened PDO. */
final class App
{
    private ?PDO $pdo = null;

    public function __construct(public readonly Config $config, public readonly Logger $logger, private ?\Closure $pdoFactory = null) {}

    public function pdo(): PDO
    {
        return $this->pdo ??= ($this->pdoFactory ? ($this->pdoFactory)() : Connection::open($this->config->db));
    }
}
