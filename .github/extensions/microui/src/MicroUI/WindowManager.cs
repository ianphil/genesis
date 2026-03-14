using System.Text;
using System.Text.Json;

namespace MicroUI;

/// <summary>
/// Manages the Photino window lifecycle.
/// Owns the window instance and routes commands from the protocol loop.
/// </summary>
public sealed class WindowManager : IDisposable
{
    private readonly Photino.NET.PhotinoWindow _window;
    private readonly CliOptions _opts;
    private readonly Action<string> _emitEvent;
    private bool _disposed;

    public WindowManager(CliOptions opts, Action<string> emitEvent, string? initialHtml = null)
    {
        _opts = opts;
        _emitEvent = emitEvent;

        // Write initial HTML to a temp file — LoadRawString has cross-platform issues;
        // loading from file is more reliable with WebView2.
        string? tempHtmlPath = null;
        if (initialHtml is not null)
        {
            // Inject bridge script
            if (initialHtml.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            {
                initialHtml = initialHtml.Replace("</body>", $"<script>{BridgeScript.Source}</script>\n</body>",
                    StringComparison.OrdinalIgnoreCase);
            }
            else
            {
                initialHtml += $"\n<script>{BridgeScript.Source}</script>";
            }
            tempHtmlPath = Path.Combine(Path.GetTempPath(), $"microui-{Guid.NewGuid():N}.html");
            File.WriteAllText(tempHtmlPath, initialHtml);
        }

        _window = new Photino.NET.PhotinoWindow()
            .SetTitle(opts.Title)
            .SetSize(opts.Width, opts.Height)
            .SetUseOsDefaultLocation(true)
            .SetResizable(true)
            .SetChromeless(opts.Frameless)
            .SetTopMost(opts.Floating)
            .SetMinimized(opts.Hidden);

        if (tempHtmlPath is not null)
        {
            _window.Load(tempHtmlPath);
        }
        else
        {
            _window.LoadRawString("<html><body></body></html>");
        }

        // Register event handlers
        _window.RegisterWebMessageReceivedHandler(OnWebMessage);
        _window.RegisterWindowCreatedHandler(OnWindowCreated);
        _window.RegisterWindowClosingHandler(OnWindowClosing);
    }

    private void OnWindowCreated(object? sender, EventArgs e)
    {
        // Emit ready event with screen size
        var screenSize = _window.MainMonitor.WorkArea;
        var ready = new ReadyEvent
        {
            Screen = new ScreenInfo
            {
                Width = screenSize.Width,
                Height = screenSize.Height
            }
        };
        _emitEvent(JsonSerializer.Serialize(ready, MicroUIJsonContext.Default.ReadyEvent));
    }

    private bool OnWindowClosing(object sender, EventArgs e)
    {
        _emitEvent(JsonSerializer.Serialize(new ClosedEvent(), MicroUIJsonContext.Default.ClosedEvent));
        return false; // false = allow close
    }

    private void OnWebMessage(object? sender, string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;

        try
        {
            using var doc = JsonDocument.Parse(message);
            // Check for internal close signal
            if (doc.RootElement.TryGetProperty("__genesis_close", out var closeFlag) && closeFlag.GetBoolean())
            {
                _window.Close();
                return;
            }

            // Forward as a host message event
            var evt = new MessageEvent { Data = JsonSerializer.Deserialize<object>(message, MicroUIJsonContext.Default.Object) };
            _emitEvent(JsonSerializer.Serialize(evt, MicroUIJsonContext.Default.MessageEvent));

            if (_opts.AutoClose)
            {
                _window.Close();
            }
        }
        catch (JsonException)
        {
            // Non-JSON messages are ignored
        }
    }

    /// <summary>Load base64-encoded HTML into the window.</summary>
    public void LoadHtml(string base64Html)
    {
        var html = Encoding.UTF8.GetString(Convert.FromBase64String(base64Html));
        // Inject bridge before </body> if present, otherwise append
        if (html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
        {
            html = html.Replace("</body>", $"<script>{BridgeScript.Source}</script>\n</body>",
                StringComparison.OrdinalIgnoreCase);
        }
        else if (html.Contains("</html>", StringComparison.OrdinalIgnoreCase))
        {
            html = html.Replace("</html>", $"<script>{BridgeScript.Source}</script>\n</html>",
                StringComparison.OrdinalIgnoreCase);
        }
        else
        {
            html += $"\n<script>{BridgeScript.Source}</script>";
        }

        _window.LoadRawString(html);
    }

    /// <summary>Evaluate JavaScript in the window via the bridge.</summary>
    public void EvalJs(string js)
    {
        // Send the JS as a message; the bridge script's receiveMessage handler evals it.
        _window.SendWebMessage(js);
    }

    /// <summary>
    /// Restore a minimized (hidden) window, optionally updating the title.
    /// When started with --hidden, the window is minimized; this method restores it.
    /// </summary>
    public void Show(string? title = null)
    {
        if (title is not null)
        {
            _window.SetTitle(title);
        }
        // Restore if minimized (i.e., started with --hidden)
        if (_window.Minimized)
        {
            _window.SetMinimized(false);
        }
    }

    /// <summary>Close the window programmatically.</summary>
    public void Close()
    {
        _window.Close();
    }

    /// <summary>
    /// Block the calling thread running the Photino message pump.
    /// Returns when the window is closed.
    /// </summary>
    public void Run()
    {
        _window.WaitForClose();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        // PhotinoWindow does not implement IDisposable; Close() handles cleanup.
        try { _window.Close(); } catch { /* already closed */ }
    }
}

