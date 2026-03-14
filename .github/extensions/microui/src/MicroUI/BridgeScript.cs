namespace MicroUI;

/// <summary>
/// JavaScript bridge injected into file-based pages loaded by MicroUI.
/// Provides window.genesis.send() and window.genesis.close().
/// </summary>
public static class BridgeScript
{
    public const string Source = """
        (function () {
          if (window.__genesisBridgeInstalled) return;
          window.__genesisBridgeInstalled = true;

          window.genesis = {
            /**
             * Send a message to the host process.
             * @param {object} data - Any JSON-serializable value.
             */
            send: function (data) {
              window.external.sendMessage(JSON.stringify(data));
            },

            /**
             * Ask the host to close this window.
             */
            close: function () {
              window.external.sendMessage(JSON.stringify({ __genesis_close: true }));
            }
          };
        })();
        """;
}
