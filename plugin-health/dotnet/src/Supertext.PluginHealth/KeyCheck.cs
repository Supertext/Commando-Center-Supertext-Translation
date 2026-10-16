namespace Supertext.PluginHealth;

/// <summary>The values of <see cref="KeyCheck.Status"/> (the Supertext SDK's statuses).</summary>
public static class KeyCheckStatus
{
    /// <summary>Supertext accepted the key.</summary>
    public const string Ok = "ok";

    /// <summary>Supertext rejected the key (HTTP 401/403).</summary>
    public const string Invalid = "invalid";

    /// <summary>No key configured; nothing was sent.</summary>
    public const string Missing = "missing";

    /// <summary>No HTTP answer, or HTTP 5xx.</summary>
    public const string Unreachable = "unreachable";

    /// <summary>Any other answer, or the checker failed.</summary>
    public const string Error = "error";
}

/// <summary>
/// The result of the Supertext SDK's API key check, as the reporter stores and reports it. Never contains the key.
/// Convert the SDK's <c>ApiKeyCheck</c> with <c>c =&gt; new KeyCheck(c.Status, c.CheckedAt, c.HttpStatus, c.ErrorCode, c.Fingerprint)</c>.
/// </summary>
/// <param name="Status">One of <see cref="KeyCheckStatus"/>.</param>
/// <param name="CheckedAt">When the check ran: UTC ISO 8601 without fractions (<c>2026-10-13T08:00:00Z</c>).</param>
/// <param name="HttpStatus">The HTTP status Supertext answered with; null without an answer.</param>
/// <param name="ErrorCode">Supertext's <c>error_code</c>; null if none.</param>
/// <param name="Fingerprint">SHA-256 of the key, to notice a changed key. Kept locally, never sent. Empty for a blank key.</param>
public sealed record KeyCheck(string Status, string CheckedAt, int? HttpStatus, string? ErrorCode, string Fingerprint);

/// <summary>
/// How the reporter checks the API key. Plugins pass the Supertext SDK's check and fingerprint, e.g. with
/// <see cref="KeyChecker.FromDelegates"/>.
/// </summary>
public interface IKeyChecker
{
    /// <summary>Checks the key against Supertext (the SDK's <c>CheckApiKeyAsync</c>).</summary>
    Task<KeyCheck> CheckAsync(string? apiKey, CancellationToken cancellationToken);

    /// <summary>The key's fingerprint (the SDK's <c>ApiKeyCheck.FingerprintOf</c>); empty for a blank key.</summary>
    string Fingerprint(string? apiKey);
}

/// <summary>Builds an <see cref="IKeyChecker"/> from two functions.</summary>
public static class KeyChecker
{
    /// <summary>
    /// A key checker from the SDK's functions, e.g.
    /// <c>KeyChecker.FromDelegates(async (key, ct) =&gt; { var c = await new SupertextClient(key).CheckApiKeyAsync(ct); return new KeyCheck(c.Status, c.CheckedAt, c.HttpStatus, c.ErrorCode, c.Fingerprint); }, ApiKeyCheck.FingerprintOf)</c>.
    /// </summary>
    public static IKeyChecker FromDelegates(Func<string?, CancellationToken, Task<KeyCheck>> check, Func<string?, string> fingerprint)
    {
        ArgumentNullException.ThrowIfNull(check);
        ArgumentNullException.ThrowIfNull(fingerprint);
        return new DelegateKeyChecker(check, fingerprint);
    }

    private sealed class DelegateKeyChecker(Func<string?, CancellationToken, Task<KeyCheck>> check, Func<string?, string> fingerprint) : IKeyChecker
    {
        public Task<KeyCheck> CheckAsync(string? apiKey, CancellationToken cancellationToken) => check(apiKey, cancellationToken);

        public string Fingerprint(string? apiKey) => fingerprint(apiKey);
    }
}
