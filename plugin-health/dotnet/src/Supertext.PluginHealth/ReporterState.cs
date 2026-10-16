using System.Text;
using System.Text.Json;

namespace Supertext.PluginHealth;

/// <summary>
/// What the plugin stores between requests. Store <see cref="ToJson"/> as it is and load it with
/// <see cref="FromJson(string?)"/>. Same JSON as the Supertext SDK 0.1–0.2 reporter stored.
/// </summary>
/// <param name="ReportedVersions"><c>&lt;plugin&gt;|&lt;system&gt;|&lt;runtime&gt;</c> versions last reported successfully.</param>
/// <param name="ReportedKeyStatus">The key status last reported successfully.</param>
/// <param name="LastFailureAt">When the last report failed (no new attempt for an hour).</param>
/// <param name="KeyCheck">The latest key check.</param>
public sealed record ReporterState(string? ReportedVersions, string? ReportedKeyStatus, string? LastFailureAt, KeyCheck? KeyCheck)
{
    /// <summary>Nothing reported, nothing checked.</summary>
    public static ReporterState Empty { get; } = new(null, null, null, null);

    /// <summary>The state as JSON: <c>{"reportedVersions":…,"reportedKeyStatus":…,"lastFailureAt":…,"keyCheck":{…}|null}</c>.</summary>
    public string ToJson()
    {
        using var stream = new MemoryStream();
        using (var w = new Utf8JsonWriter(stream))
        {
            w.WriteStartObject();
            WriteString(w, "reportedVersions", ReportedVersions);
            WriteString(w, "reportedKeyStatus", ReportedKeyStatus);
            WriteString(w, "lastFailureAt", LastFailureAt);
            if (KeyCheck is { } k)
            {
                w.WriteStartObject("keyCheck");
                w.WriteString("status", k.Status);
                w.WriteString("checkedAt", k.CheckedAt);
                if (k.HttpStatus is { } httpStatus)
                {
                    w.WriteNumber("httpStatus", httpStatus);
                }
                else
                {
                    w.WriteNull("httpStatus");
                }
                WriteString(w, "errorCode", k.ErrorCode);
                w.WriteString("fingerprint", k.Fingerprint);
                w.WriteEndObject();
            }
            else
            {
                w.WriteNull("keyCheck");
            }
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    /// <summary>A stored state; null, broken JSON or unknown values give an empty state (or fields).</summary>
    public static ReporterState FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Empty;
        }
        try
        {
            using var doc = JsonDocument.Parse(json);
            return FromJson(doc.RootElement);
        }
        catch (JsonException)
        {
            return Empty;
        }
    }

    /// <summary>A stored state from parsed JSON; anything but an object gives an empty state.</summary>
    public static ReporterState FromJson(JsonElement json)
    {
        if (json.ValueKind != JsonValueKind.Object)
        {
            return Empty;
        }
        KeyCheck? keyCheck = null;
        if (json.TryGetProperty("keyCheck", out var k) && k.ValueKind == JsonValueKind.Object
            && Str(k, "status") is { } status && Str(k, "checkedAt") is { } checkedAt)
        {
            int? httpStatus = k.TryGetProperty("httpStatus", out var h) && h.ValueKind == JsonValueKind.Number && h.TryGetInt32(out var n) ? n : null;
            keyCheck = new KeyCheck(status, checkedAt, httpStatus, Str(k, "errorCode"), Str(k, "fingerprint") ?? string.Empty);
        }
        return new ReporterState(Str(json, "reportedVersions"), Str(json, "reportedKeyStatus"), Str(json, "lastFailureAt"), keyCheck);
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static void WriteString(Utf8JsonWriter w, string name, string? value)
    {
        if (value is null)
        {
            w.WriteNull(name);
        }
        else
        {
            w.WriteString(name, value);
        }
    }
}
