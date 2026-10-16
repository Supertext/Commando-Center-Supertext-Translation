<?php

declare(strict_types=1);

namespace Supertext\PluginHealth\Tests;

/**
 * Stand-ins for what a plugin's bundled (and renamed) Supertext SDK provides: its ApiKeyCheck and
 * Protocol::apiKeyFingerprint().
 */
final class SdkLike
{
    public function __construct(
        public readonly string $status,
        public readonly string $checkedAt,
        public readonly ?int $httpStatus = null,
        public readonly ?string $errorCode = null,
        public readonly string $fingerprint = '',
        private readonly string $secret = 'not-public',
    ) {
    }

    /** Like the SDK's Protocol::apiKeyFingerprint(). */
    public static function apiKeyFingerprint(#[\SensitiveParameter] ?string $apiKey): string
    {
        $key = trim((string) preg_replace('/^\s*Supertext-Auth-Key(?:\s+|$)/i', '', $apiKey ?? ''));

        return $key === '' ? '' : hash('sha256', $key);
    }

    public function secret(): string
    {
        return $this->secret;
    }
}
