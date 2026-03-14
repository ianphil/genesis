using System.Text;
using System.Text.Json;

namespace MicroUI;

class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        var opts = ParseArgs(args);

        void Emit(string json)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }

        string? initialHtml = null;
        if (string.IsNullOrWhiteSpace(opts.Url))
        {
            initialHtml = ReadInitialHtml();
            if (initialHtml is null)
            {
                return;
            }
        }

        using var window = new WindowManager(opts, Emit, initialHtml, opts.Url);

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
            catch { }
            finally { window.Close(); }
        });
        stdinThread.IsBackground = true;
        stdinThread.Start();

        window.Run();
        cts.Cancel();
    }

    static string? ReadInitialHtml()
    {
        while (true)
        {
            var line = Console.In.ReadLine();
            if (line is null)
            {
                Console.Error.WriteLine("microui: stdin closed before receiving html command");
                return null;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                var type = root.GetProperty("type").GetString() ?? string.Empty;
                if (type == "html")
                {
                    if (root.TryGetProperty("html", out var htmlProperty))
                    {
                        var base64Html = htmlProperty.GetString();
                        if (!string.IsNullOrEmpty(base64Html))
                        {
                            return Encoding.UTF8.GetString(Convert.FromBase64String(base64Html));
                        }
                    }
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
    }

    static void DispatchCommand(WindowManager window, string line)
    {
        using var doc = JsonDocument.Parse(line);
        var type = doc.RootElement.GetProperty("type").GetString() ?? string.Empty;

        switch (type)
        {
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
        string? url = null;
        bool frameless = false, floating = false, hidden = false, autoClose = false;
        bool fullscreen = false, maximized = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--width" when i + 1 < args.Length: width = int.TryParse(args[++i], out var w) ? w : width; break;
                case "--height" when i + 1 < args.Length: height = int.TryParse(args[++i], out var h) ? h : height; break;
                case "--title" when i + 1 < args.Length: title = args[++i]; break;
                case "--url" when i + 1 < args.Length: url = args[++i]; break;
                case "--frameless": frameless = true; break;
                case "--floating": floating = true; break;
                case "--hidden": hidden = true; break;
                case "--auto-close": autoClose = true; break;
                case "--fullscreen": fullscreen = true; break;
                case "--maximized": maximized = true; break;
            }
        }

        return new CliOptions
        {
            Width = width,
            Height = height,
            Title = title,
            Url = url,
            Frameless = frameless,
            Floating = floating,
            Hidden = hidden,
            AutoClose = autoClose,
            Fullscreen = fullscreen,
            Maximized = maximized,
        };
    }
}
