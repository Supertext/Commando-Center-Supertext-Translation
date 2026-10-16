<?php

declare(strict_types=1);

namespace Supertext\PluginHealth;

/**
 * What a plugin stores between requests for the InstallationReporter (../spec/reporter.json → scenarios).
 *
 * Store $state->toJson() as it is and read it back with ReporterState::fromJson() (or from(), which takes
 * anything). The JSON is {"reportedVersions", "reportedKeyStatus", "lastFailureAt", "keyCheck": {...}},
 * the same in every language and the same the Supertext SDK 0.1–0.2 reporter stored.
 */
final class ReporterState implements \JsonSerializable
{
    /**
     * @param string|null   $reportedVersions  "<plugin>|<system>|<runtime>" versions last reported successfully
     * @param string|null   $reportedKeyStatus the key status last reported successfully
     * @param string|null   $lastFailureAt     when the last report failed (no new attempt for an hour)
     * @param KeyCheck|null $keyCheck          the latest key check
     */
    public function __construct(
        public readonly ?string $reportedVersions = null,
        public readonly ?string $reportedKeyStatus = null,
        public readonly ?string $lastFailureAt = null,
        public readonly ?KeyCheck $keyCheck = null,
    ) {
    }

    public static function empty(): self
    {
        return new self();
    }

    /**
     * A stored state: a JSON string, a decoded array or object, or a ReporterState. Anything unknown or
     * broken becomes the empty state, so a lost or corrupted setting just means "never reported".
     */
    public static function from(mixed $value): self
    {
        if ($value instanceof self) {
            return $value;
        }
        if (\is_string($value)) {
            return self::fromJson($value);
        }

        return self::fromArray($value);
    }

    /** A state stored as JSON (toJson()); broken or missing JSON gives the empty state. */
    public static function fromJson(?string $json): self
    {
        if ($json === null || $json === '') {
            return new self();
        }
        try {
            $value = json_decode($json, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return new self();
        }

        return self::fromArray($value);
    }

    /** A decoded state (array or stdClass); anything else gives the empty state. */
    public static function fromArray(mixed $value): self
    {
        if ($value instanceof \stdClass) {
            $value = (array) $value;
        }
        if (!\is_array($value)) {
            return new self();
        }
        $string = static fn (mixed $v): ?string => \is_string($v) ? $v : null;
        $keyCheck = $value['keyCheck'] ?? null;

        return new self(
            $string($value['reportedVersions'] ?? null),
            $string($value['reportedKeyStatus'] ?? null),
            $string($value['lastFailureAt'] ?? null),
            \is_array($keyCheck) || $keyCheck instanceof \stdClass ? KeyCheck::from($keyCheck) : null,
        );
    }

    /** The same state with another key check. */
    public function withKeyCheck(?KeyCheck $keyCheck): self
    {
        return new self($this->reportedVersions, $this->reportedKeyStatus, $this->lastFailureAt, $keyCheck);
    }

    /**
     * @return array{reportedVersions: string|null, reportedKeyStatus: string|null, lastFailureAt: string|null, keyCheck: array{status: string, checkedAt: string, httpStatus: int|null, errorCode: string|null, fingerprint: string}|null}
     */
    public function toArray(): array
    {
        return [
            'reportedVersions' => $this->reportedVersions,
            'reportedKeyStatus' => $this->reportedKeyStatus,
            'lastFailureAt' => $this->lastFailureAt,
            'keyCheck' => $this->keyCheck?->toArray(),
        ];
    }

    /** The stored form, as JSON. */
    public function toJson(): string
    {
        return json_encode($this->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    }

    /**
     * @return array{reportedVersions: string|null, reportedKeyStatus: string|null, lastFailureAt: string|null, keyCheck: array{status: string, checkedAt: string, httpStatus: int|null, errorCode: string|null, fingerprint: string}|null}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
