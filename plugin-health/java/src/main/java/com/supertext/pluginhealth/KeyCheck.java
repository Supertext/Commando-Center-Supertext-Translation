package com.supertext.pluginhealth;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * The result of the Supertext SDK's API key check, as the reporter stores and reports it. A plugin
 * converts the SDK's {@code ApiKeyCheck} in one line:
 * {@code new KeyCheck(c.getStatus().value(), c.getCheckedAt(), c.getHttpStatus(), c.getErrorCode(), c.getFingerprint())}.
 *
 * @param status      {@code ok}, {@code invalid}, {@code missing}, {@code unreachable} or {@code error} (the SDK's statuses)
 * @param checkedAt   when the check ran: UTC ISO 8601 without fractions ({@code 2026-10-13T08:00:00Z})
 * @param httpStatus  the HTTP status Supertext answered with; {@code null} without an answer
 * @param errorCode   Supertext's {@code error_code}; {@code null} if none
 * @param fingerprint SHA-256 of the key, to notice a changed key; kept locally, never sent; {@code ""} for a
 *                    blank key ({@code null} becomes {@code ""})
 */
public record KeyCheck(String status, String checkedAt, Integer httpStatus, String errorCode, String fingerprint) {

    private static final DateTimeFormatter ISO_SECONDS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC);

    public KeyCheck {
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(checkedAt, "checkedAt");
        fingerprint = fingerprint == null ? "" : fingerprint;
    }

    /** {@code 2026-10-13T08:00:00Z}: UTC, fractions of a second dropped. */
    public static String isoSeconds(Instant instant) {
        return ISO_SECONDS.format(instant.truncatedTo(ChronoUnit.SECONDS));
    }

    /** The stored form: {@code status}, {@code checkedAt}, {@code httpStatus}, {@code errorCode}, {@code fingerprint}. */
    Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("status", status);
        map.put("checkedAt", checkedAt);
        map.put("httpStatus", httpStatus);
        map.put("errorCode", errorCode);
        map.put("fingerprint", fingerprint);
        return map;
    }

    /** The stored form back; {@code null} when it isn't a check (no string {@code status} and {@code checkedAt}). */
    static KeyCheck fromMap(Object value) {
        if (!(value instanceof Map)) {
            return null;
        }
        Map<?, ?> map = (Map<?, ?>) value;
        Object status = map.get("status");
        Object checkedAt = map.get("checkedAt");
        if (!(status instanceof String) || !(checkedAt instanceof String)) {
            return null;
        }
        Object httpStatus = map.get("httpStatus");
        Object errorCode = map.get("errorCode");
        Object fingerprint = map.get("fingerprint");
        return new KeyCheck((String) status, (String) checkedAt,
                httpStatus instanceof Number ? Integer.valueOf(((Number) httpStatus).intValue()) : null,
                errorCode instanceof String ? (String) errorCode : null,
                fingerprint instanceof String ? (String) fingerprint : "");
    }

    @Override
    public String toString() {
        return "KeyCheck{status=" + status + ", checkedAt=" + checkedAt + ", httpStatus=" + httpStatus + ", errorCode=" + errorCode + "}";
    }
}
