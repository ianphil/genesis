using System.Text.Json;
using MicroUI;

// ---------- Parse CLI arguments ----------

var opts = ParseArgs(args);

// ---------- Wire stdout emitter ----------

// All events go to stdout as JSON Lines.
void Emit(string json)
{
    Console.Out.WriteLine(json);
    Console.Out.Flush();
}

// ---------- Create window ----------

using var window = new WindowManager(opts, Emit);

// ---------- Stdin command loop (background thread) ----------

var cts = new CancellationTokenSource();

var stdinTask = Task.Run(async () =>
{
    try
    {
        while (!cts.Token.IsCancellationRequested)
        {
            var line = await Console.In.ReadLineAsync(cts.Token);
            if (line is null) break; // stdin closed
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                DispatchCommand(window, line);
            }
            catch (JsonException ex)
            {
                Console.Error.WriteLine($"microui: invalid command JSON — {ex.Message}");
            }
        }
    }
    catch (OperationCanceledException) { /* normal shutdown */ }
    finally
    {
        window.Close();
    }
}, cts.Token);

// ---------- Run the window (blocks until closed) ----------

window.Run();
cts.Cancel();

// Wait for the stdin loop to finish
try { await stdinTask; } catch (OperationCanceledException) { /* ok */ }

// ---------- Helpers ----------

static void DispatchCommand(WindowManager window, string line)
{
    using var doc = JsonDocument.Parse(line);
    var type = doc.RootElement.GetProperty("type").GetString() ?? "";

    switch (type)
    {
        case "html":
        {
            var cmd = JsonSerializer.Deserialize(line, MicroUIJsonContext.Default.HtmlCommand);
            if (cmd is not null && !string.IsNullOrEmpty(cmd.Html))
            {
                window.LoadHtml(cmd.Html);
            }
            break;
        }
        case "eval":
        {
            var cmd = JsonSerializer.Deserialize(line, MicroUIJsonContext.Default.EvalCommand);
            if (cmd is not null && !string.IsNullOrEmpty(cmd.Js))
            {
                window.EvalJs(cmd.Js);
            }
            break;
        }
        case "show":
        {
            var cmd = JsonSerializer.Deserialize(line, MicroUIJsonContext.Default.ShowCommand);
            window.Show(cmd?.Title);
            break;
        }
        case "close":
        {
            window.Close();
            break;
        }
        default:
            Console.Error.WriteLine($"microui: unknown command type '{type}'");
            break;
    }
}

static CliOptions ParseArgs(string[] args)
{
    int width = 800;
    int height = 600;
    string title = "Genesis";
    bool frameless = false;
    bool floating = false;
    bool hidden = false;
    bool autoClose = false;

    for (int i = 0; i < args.Length; i++)
    {
        switch (args[i])
        {
            case "--width" when i + 1 < args.Length:
                width = int.TryParse(args[++i], out var w) ? w : width;
                break;
            case "--height" when i + 1 < args.Length:
                height = int.TryParse(args[++i], out var h) ? h : height;
                break;
            case "--title" when i + 1 < args.Length:
                title = args[++i];
                break;
            case "--frameless":
                frameless = true;
                break;
            case "--floating":
                floating = true;
                break;
            case "--hidden":
                hidden = true;
                break;
            case "--auto-close":
                autoClose = true;
                break;
        }
    }

    return new CliOptions
    {
        Width = width,
        Height = height,
        Title = title,
        Frameless = frameless,
        Floating = floating,
        Hidden = hidden,
        AutoClose = autoClose,
    };
}
