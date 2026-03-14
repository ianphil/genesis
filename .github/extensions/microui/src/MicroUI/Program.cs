using System.Text;
using System.Text.Json;

namespace MicroUI;

class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        // Check for --chat mode
        if (args.Contains("--chat"))
        {
            RunChat(args);
            return;
        }

        var opts = ParseArgs(args);

        void Emit(string json)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }

        // Read first HTML command synchronously before creating window
        string? initialHtml = null;
        while (initialHtml is null)
        {
            var line = Console.In.ReadLine();
            if (line is null) { Console.Error.WriteLine("microui: stdin closed before receiving html command"); return; }
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                using var doc = JsonDocument.Parse(line);
                var type = doc.RootElement.GetProperty("type").GetString() ?? "";
                if (type == "html")
                {
                    var cmd = JsonSerializer.Deserialize(line, MicroUIJsonContext.Default.HtmlCommand);
                    if (cmd is not null && !string.IsNullOrEmpty(cmd.Html))
                        initialHtml = Encoding.UTF8.GetString(Convert.FromBase64String(cmd.Html));
                }
                else
                {
                    Console.Error.WriteLine($"microui: ignoring pre-window command '{type}' — send html first");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"microui: invalid initial command — {ex.Message}");
            }
        }

        using var window = new WindowManager(opts, Emit, initialHtml);

        // Stdin command loop on background thread
        var cts = new CancellationTokenSource();
        var stdinThread = new Thread(() =>
        {
            try
            {
                while (!cts.Token.IsCancellationRequested)
                {
                    var line = Console.In.ReadLine();
                    if (line is null) break;
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    try { DispatchCommand(window, line); }
                    catch (JsonException ex) { Console.Error.WriteLine($"microui: invalid command JSON — {ex.Message}"); }
                }
            }
            catch { /* shutdown */ }
            finally { window.Close(); }
        });
        stdinThread.IsBackground = true;
        stdinThread.Start();

        // Block on UI message pump (must be STA main thread)
        window.Run();
        cts.Cancel();
    }

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
                    window.LoadHtml(cmd.Html);
                break;
            }
            case "eval":
            {
                var cmd = JsonSerializer.Deserialize(line, MicroUIJsonContext.Default.EvalCommand);
                if (cmd is not null && !string.IsNullOrEmpty(cmd.Js))
                    window.EvalJs(cmd.Js);
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
        int width = 800, height = 600;
        string title = "Genesis";
        bool frameless = false, floating = false, hidden = false, autoClose = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--width" when i + 1 < args.Length: width = int.TryParse(args[++i], out var w) ? w : width; break;
                case "--height" when i + 1 < args.Length: height = int.TryParse(args[++i], out var h) ? h : height; break;
                case "--title" when i + 1 < args.Length: title = args[++i]; break;
                case "--frameless": frameless = true; break;
                case "--floating": floating = true; break;
                case "--hidden": hidden = true; break;
                case "--auto-close": autoClose = true; break;
            }
        }

        return new CliOptions
        {
            Width = width, Height = height, Title = title,
            Frameless = frameless, Floating = floating,
            Hidden = hidden, AutoClose = autoClose,
        };
    }

    static void RunChat(string[] args)
    {
        // Parse --port
        int port = 15210;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--port" && i + 1 < args.Length)
                port = int.TryParse(args[++i], out var p) ? p : port;
        }

        // Load embedded chat HTML and inject the port
        var assembly = typeof(Program).Assembly;
        string html;
        using (var stream = assembly.GetManifestResourceStream("MicroUI.chat.html"))
        {
            if (stream is null) { Console.Error.WriteLine("microui: embedded chat.html not found"); return; }
            using var reader = new System.IO.StreamReader(stream);
            html = reader.ReadToEnd();
        }

        // Inject the actual port into the HTML
        html = html.Replace("var API_PORT = 15210;", $"var API_PORT = {port};");

        // Write to temp file for loading
        var tempPath = Path.Combine(Path.GetTempPath(), $"microui-chat-{Guid.NewGuid():N}.html");
        File.WriteAllText(tempPath, html);

        var window = new Photino.NET.PhotinoWindow()
            .SetTitle("Copilot Agent Chat")
            .SetSize(500, 650)
            .SetUseOsDefaultLocation(true)
            .SetResizable(true)
            .SetTopMost(true)
            .Load(tempPath);

        window.RegisterWindowCreatedHandler((sender, e) =>
        {
            Console.Error.WriteLine($"microui-chat: ready, talking directly to responses API on port {port}");
        });

        window.WaitForClose();

        // Cleanup
        try { File.Delete(tempPath); } catch { }
    }
}
