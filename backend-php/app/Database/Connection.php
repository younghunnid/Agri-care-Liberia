<?php
declare(strict_types=1);

namespace Agri\Database;

use PDO;
use RuntimeException;

/** Single place that opens PDO connections with an identical, explicit session configuration on MySQL 8 and MariaDB. */
final class Connection
{
    public const SQL_MODE = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

    /** @param array{host:string,port:int,name:?string,user:string,pass:string,socket?:?string} $cfg */
    public static function open(array $cfg): PDO
    {
        $dsn = 'mysql:' . (!empty($cfg['socket']) ? 'unix_socket=' . $cfg['socket'] : 'host=' . $cfg['host'] . ';port=' . $cfg['port'])
            . (($cfg['name'] ?? '') !== '' ? ';dbname=' . $cfg['name'] : '') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET SESSION sql_mode = '" . self::SQL_MODE . "'");
        return $pdo;
    }

    /** Reads connection settings from the environment only (never from argv, never defaulted to a production host). */
    public static function configFromEnv(): array
    {
        $host = getenv('DB_HOST') ?: '127.0.0.1';
        if (getenv('DB_USER') === false) {
            throw new RuntimeException('DB_USER is not set. Database credentials must be supplied explicitly through the environment.');
        }
        return [
            'host' => $host,
            'port' => (int)(getenv('DB_PORT') ?: 3306),
            'name' => getenv('DB_NAME') !== false ? (string)getenv('DB_NAME') : null,
            'user' => (string)getenv('DB_USER'),
            'pass' => (string)(getenv('DB_PASS') !== false ? getenv('DB_PASS') : ''),
            'socket' => getenv('DB_SOCKET') ?: null,
        ];
    }
}
