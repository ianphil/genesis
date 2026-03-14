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
    private readonly bool _isUrlMode;
    private readonly string? _tempHtmlPath;
    private bool _disposed;

    public WindowManager(CliOptions opts, Action<string> emitEvent, string? initialHtml = null, string? url = null)
    {
        _opts = opts;
        _emitEvent = emitEvent;
        _isUrlMode = !string.IsNullOrWhiteSpace(url);

        _window = new Photino.NET.PhotinoWindow()
            .SetTitle(opts.Title)
            .SetSize(opts.Width, opts.Height)
            .SetUseOsDefaultLocation(!opts.Fullscreen && !opts.Maximized)
            .SetResizable(true)
            .SetChromeless(opts.Frameless)
            .SetTopMost(opts.Floating)
            .SetMinimized(opts.Hidden)
            .SetFullScreen(opts.Fullscreen)
            .SetMaximized(opts.Maximized);

        if (_isUrlMode)
        {
            _window.Load(url!);
        }
        else
        {
            var html = InjectBridge(initialHtml ?? "<html><body></body></html>");
            _tempHtmlPath = Path.Combine(Path.GetTempPath(), $"microui-{Guid.NewGuid():N}.html");
            File.WriteAllText(_tempHtmlPath, html);
            _window.Load(_tempHtmlPath);
        }

        _window.RegisterWebMessageReceivedHandler(OnWebMessage);
        _window.RegisterWindowCreatedHandler(OnWindowCreated);
        _window.RegisterWindowClosingHandler(OnWindowClosing);
    }

    private static string InjectBridge(string html)
    {
        if (html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
        {
            return html.Replace("</body>", $"<script>{BridgeScript.Source}</script>\n</body>",
                StringComparison.OrdinalIgnoreCase);
        }

        if (html.Contains("</html>", StringComparison.OrdinalIgnoreCase))
        {
            return html.Replace("</html>", $"<script>{BridgeScript.Source}</script>\n</html>",
                StringComparison.OrdinalIgnoreCase);
        }

        return html + $"\n<script>{BridgeScript.Source}</script>";
    }

    private void OnWindowCreated(object? sender, EventArgs e)
    {
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
        return false;
    }

    private void OnWebMessage(object? sender, string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;

        try
        {
            using var doc = JsonDocument.Parse(message);
            if (doc.RootElement.TryGetProperty("__genesis_close", out var closeFlag) && closeFlag.GetBoolean())
            {
                _window.Close();
                return;
            }

            var evt = new MessageEvent { Data = doc.RootElement.Clone() };
            _emitEvent(JsonSerializer.Serialize(evt, MicroUIJsonContext.Default.MessageEvent));

            if (_opts.AutoClose)
            {
                _window.Close();
            }
        }
        catch (JsonException)
        {
        }
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

        try { _window.Close(); } catch { }

        if (_tempHtmlPath is not null)
        {
            try { File.Delete(_tempHtmlPath); } catch { }
        }
    }
}
