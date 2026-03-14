using System.Text.Json;
using System.Text.Json.Serialization;

namespace MicroUI;

// ---------- Commands (stdin → MicroUI) ----------

/// <summary>Base record for all incoming commands.</summary>
public record Command
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = "";
}

/// <summary>Load HTML content into the window (base64-encoded).</summary>
public record HtmlCommand : Command
{
    [JsonPropertyName("html")]
    public string Html { get; init; } = "";
}

/// <summary>Evaluate JavaScript in the window.</summary>
public record EvalCommand : Command
{
    [JsonPropertyName("js")]
    public string Js { get; init; } = "";
}

/// <summary>Show the window (optionally update the title first).</summary>
public record ShowCommand : Command
{
    [JsonPropertyName("title")]
    public string? Title { get; init; }
}

// ---------- Events (stdout → Host) ----------

/// <summary>Fired once the window is ready.</summary>
public record ReadyEvent
{
    [JsonPropertyName("type")]
    public string Type { get; } = "ready";

    [JsonPropertyName("screen")]
    public ScreenInfo Screen { get; init; } = new();
}

public record ScreenInfo
{
    [JsonPropertyName("width")]
    public int Width { get; init; }

    [JsonPropertyName("height")]
    public int Height { get; init; }
}

/// <summary>Fired when the page sends a message via window.genesis.send().</summary>
public record MessageEvent
{
    [JsonPropertyName("type")]
    public string Type { get; } = "message";

    [JsonPropertyName("data")]
    public JsonElement? Data { get; init; }
}

/// <summary>Fired when the window closes.</summary>
public record ClosedEvent
{
    [JsonPropertyName("type")]
    public string Type { get; } = "closed";
}

// ---------- CLI Options ----------

public record CliOptions
{
    public int Width { get; init; } = 800;
    public int Height { get; init; } = 600;
    public string Title { get; init; } = "Genesis";
    public bool Frameless { get; init; } = false;
    public bool Floating { get; init; } = false;
    public bool Hidden { get; init; } = false;
    public bool AutoClose { get; init; } = false;
}

// ---------- JSON source-generation context (for NativeAOT / trimming) ----------

[JsonSerializable(typeof(Command))]
[JsonSerializable(typeof(HtmlCommand))]
[JsonSerializable(typeof(EvalCommand))]
[JsonSerializable(typeof(ShowCommand))]
[JsonSerializable(typeof(ReadyEvent))]
[JsonSerializable(typeof(MessageEvent))]
[JsonSerializable(typeof(ClosedEvent))]
[JsonSerializable(typeof(ScreenInfo))]
[JsonSerializable(typeof(JsonElement))]
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
public partial class MicroUIJsonContext : JsonSerializerContext { }
