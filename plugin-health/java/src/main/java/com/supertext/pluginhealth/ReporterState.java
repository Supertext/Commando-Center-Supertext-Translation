package com.supertext.pluginhealth;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * What a plugin stores between requests for the {@link InstallationReporter}: store {@link #toJson()}
 * as it is and load it with {@link #fromJson(String)}. Immutable.
 *
 * <p>JSON shape (plugin-health/spec/reporter.json): {@code {"reportedVersions":…,"reportedKeyStatus":…,"lastFailureAt":…,
 * "keyCheck":{"status","checkedAt","httpStatus","errorCode","fingerprint"}}}. It is the state the
 * Supertext SDK 0.1–0.2 reporter stored, so a plugin that switches keeps its history.</p>
 */
public final class ReporterState {

    /** Nothing reported, no check yet. */
    public static final ReporterState EMPTY = new ReporterState(null, null, null, null);

    private final String reportedVersions;
    private final String reportedKeyStatus;
    private final String lastFailureAt;
    private final KeyCheck keyCheck;

    /**
     * @param reportedVersions  {@code <plugin>|<system>|<runtime>} versions last reported successfully
     * @param reportedKeyStatus the key status last reported successfully
     * @param lastFailureAt     when the last report failed (no new attempt for an hour)
     * @param keyCheck          the latest key check
     */
    public ReporterState(String reportedVersions, String reportedKeyStatus, String lastFailureAt, KeyCheck keyCheck) {
        this.reportedVersions = reportedVersions;
        this.reportedKeyStatus = reportedKeyStatus;
        this.lastFailureAt = lastFailureAt;
        this.keyCheck = keyCheck;
    }

    /** A stored state; {@code null}, broken JSON or unknown values become {@link #EMPTY} (or empty fields). */
    public static ReporterState fromJson(String json) {
        if (json == null) {
            return EMPTY;
        }
        Object value;
        try {
            value = Json.parse(json);
        } catch (IllegalArgumentException e) {
            return EMPTY;
        }
        if (!(value instanceof Map)) {
            return EMPTY;
        }
        Map<?, ?> map = (Map<?, ?>) value;
        return new ReporterState(string(map.get("reportedVersions")), string(map.get("reportedKeyStatus")),
                string(map.get("lastFailureAt")), KeyCheck.fromMap(map.get("keyCheck")));
    }

    /** The form to store (compact JSON, every field present). */
    public String toJson() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("reportedVersions", reportedVersions);
        map.put("reportedKeyStatus", reportedKeyStatus);
        map.put("lastFailureAt", lastFailureAt);
        map.put("keyCheck", keyCheck == null ? null : keyCheck.toMap());
        return Json.write(map);
    }

    public String getReportedVersions() {
        return reportedVersions;
    }

    public String getReportedKeyStatus() {
        return reportedKeyStatus;
    }

    public String getLastFailureAt() {
        return lastFailureAt;
    }

    /** The latest key check, or {@code null}. */
    public KeyCheck getKeyCheck() {
        return keyCheck;
    }

    /** A copy with another key check. */
    public ReporterState withKeyCheck(KeyCheck check) {
        return new ReporterState(reportedVersions, reportedKeyStatus, lastFailureAt, check);
    }

    private static String string(Object value) {
        return value instanceof String ? (String) value : null;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ReporterState)) {
            return false;
        }
        ReporterState other = (ReporterState) o;
        return Objects.equals(reportedVersions, other.reportedVersions) && Objects.equals(reportedKeyStatus, other.reportedKeyStatus)
                && Objects.equals(lastFailureAt, other.lastFailureAt) && Objects.equals(keyCheck, other.keyCheck);
    }

    @Override
    public int hashCode() {
        return Objects.hash(reportedVersions, reportedKeyStatus, lastFailureAt, keyCheck);
    }

    @Override
    public String toString() {
        return "ReporterState{reportedVersions=" + reportedVersions + ", reportedKeyStatus=" + reportedKeyStatus
                + ", lastFailureAt=" + lastFailureAt + ", keyCheck=" + keyCheck + "}";
    }
}
