<?php
declare(strict_types=1);

namespace Agri\Http;

/**
 * Explicit list of proxy addresses (single IPs or CIDR ranges) that are allowed to supply X-Forwarded-For / X-Forwarded-Proto.
 *
 * Forwarded headers are honoured ONLY when the TCP peer (REMOTE_ADDR) is one of these proxies, and X-Forwarded-For is verified from the
 * right: every hop that is itself a trusted proxy is skipped, the first untrusted address is the client. Anything the client wrote to the
 * left of that address is never consulted. A malformed or oversized chain is ignored as a whole (the peer address is used), never repaired.
 * Without configuration (the default) no header is trusted. The address list is never assumed: it must be supplied by the operator.
 */
final class TrustedProxies
{
    public const MAX_HEADER = 512;   // bytes of X-Forwarded-For examined
    public const MAX_HOPS = 10;

    /** @param list<array{0:string,1:int}> $ranges packed binary address + prefix length */
    private function __construct(private array $ranges) {}

    /** @return list<string> problems (empty = valid)  @param-out TrustedProxies|null $out */
    public static function parse(string $list, ?self &$out): array
    {
        $out = null;
        $problems = [];
        $ranges = [];
        foreach (array_filter(array_map('trim', explode(',', $list)), static fn($s) => $s !== '') as $item) {
            $r = self::range($item);
            if (is_string($r)) { $problems[] = $r; continue; }
            $ranges[] = $r;
        }
        if (!$ranges && !$problems) $problems[] = 'TRUSTED_PROXY_CIDRS is empty';
        if (!$problems) $out = new self($ranges);
        return $problems;
    }

    /** @return array{0:string,1:int}|string */
    private static function range(string $item): array|string
    {
        $parts = explode('/', $item);
        if (count($parts) > 2) return 'TRUSTED_PROXY_CIDRS contains an invalid entry';
        $bin = self::pack($parts[0]);
        if ($bin === null) return 'TRUSTED_PROXY_CIDRS contains an invalid address';
        $bits = strlen($bin) * 8;
        $prefix = $bits;
        if (count($parts) === 2) {
            if (!ctype_digit($parts[1])) return 'TRUSTED_PROXY_CIDRS contains an invalid prefix length';
            $prefix = (int)$parts[1];
            if ($prefix > $bits) return 'TRUSTED_PROXY_CIDRS contains an invalid prefix length';
        }
        // Refuse "trust (almost) everyone": that is exactly the forged-header hole this class exists to close.
        if ($prefix < ($bits === 32 ? 8 : 32)) return 'TRUSTED_PROXY_CIDRS contains a range that is too wide to be a proxy list';
        return [$bin, $prefix];
    }

    /** Normalises an IP literal to packed form; IPv4-mapped IPv6 becomes IPv4. null when not an IP. */
    public static function pack(string $ip): ?string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) return null;
        $b = @inet_pton($ip);
        if ($b === false) return null;
        if (strlen($b) === 16 && str_starts_with($b, "\0\0\0\0\0\0\0\0\0\0\xff\xff")) return substr($b, 12);
        return $b;
    }

    public function contains(string $ip): bool
    {
        $b = self::pack($ip);
        if ($b === null) return false;
        foreach ($this->ranges as [$net, $prefix]) {
            if (strlen($net) !== strlen($b)) continue;
            $full = intdiv($prefix, 8);
            if ($full > 0 && substr($net, 0, $full) !== substr($b, 0, $full)) continue;
            $rem = $prefix % 8;
            if ($rem > 0) {
                $mask = (0xFF << (8 - $rem)) & 0xFF;
                if ((ord($net[$full]) & $mask) !== (ord($b[$full]) & $mask)) continue;
            }
            return true;
        }
        return false;
    }

    /**
     * Client address as seen through a verified proxy chain.
     * @param string $peer REMOTE_ADDR  @param string|null $xff raw X-Forwarded-For value (null when absent)
     */
    public function clientIp(string $peer, ?string $xff): string
    {
        if (!$this->contains($peer) || $xff === null || $xff === '' || strlen($xff) > self::MAX_HEADER) return $peer;
        $hops = array_map('trim', explode(',', $xff));
        if (count($hops) > self::MAX_HOPS) return $peer;
        foreach ($hops as $h) if (self::pack($h) === null) return $peer;      // one bad entry poisons the chain: do not guess
        for ($i = count($hops) - 1; $i >= 0; $i--) {
            if (!$this->contains($hops[$i])) return $hops[$i];                // first untrusted hop from the right = the client
        }
        return $peer;                                                          // every hop is a proxy: no client address to trust
    }

    /** True only for a trusted peer whose nearest hop says https. Only the rightmost (proxy-added) value counts. */
    public function isHttps(string $peer, ?string $proto): bool
    {
        if (!$this->contains($peer) || $proto === null || strlen($proto) > 64) return false;
        $vals = array_map(static fn($v) => strtolower(trim($v)), explode(',', $proto));
        foreach ($vals as $v) if ($v !== 'http' && $v !== 'https') return false;
        return end($vals) === 'https';
    }
}
