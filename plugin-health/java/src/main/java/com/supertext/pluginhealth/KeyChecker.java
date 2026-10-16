package com.supertext.pluginhealth;

import java.util.Objects;
import java.util.function.Function;

/**
 * How the reporter checks the API key. Plugins pass the Supertext SDK's check and fingerprint:
 *
 * <pre>{@code
 * KeyChecker checker = KeyChecker.of(
 *         key -> toKeyCheck(SupertextClient.builder(key).build().checkApiKey()),
 *         ApiKeyCheck::fingerprint);
 * }</pre>
 *
 * <p>If {@link #check} throws or returns {@code null}, the reporter records an {@code error} check.</p>
 */
public interface KeyChecker {

    /** Checks the key against Supertext (the SDK's {@code checkApiKey()}). */
    KeyCheck check(String apiKey);

    /** SHA-256 of the key as the SDK computes it ({@code ApiKeyCheck.fingerprint}); {@code ""} for a blank key. */
    String fingerprint(String apiKey);

    /** A checker from two functions. */
    static KeyChecker of(Function<String, KeyCheck> check, Function<String, String> fingerprint) {
        Objects.requireNonNull(check, "check");
        Objects.requireNonNull(fingerprint, "fingerprint");
        return new KeyChecker() {
            @Override
            public KeyCheck check(String apiKey) {
                return check.apply(apiKey);
            }

            @Override
            public String fingerprint(String apiKey) {
                return fingerprint.apply(apiKey);
            }
        };
    }
}
