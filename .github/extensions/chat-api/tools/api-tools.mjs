/**
 * Tools exposed to the agent for managing the chat API server.
 */
export function createApiTools(server) {
  return [
    {
      name: "chat_api_status",
      description:
        "Get the status of the external chat API server, including its port and whether it is running.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const running = server.isRunning();
        const port = server.getPort();
        if (!running) {
          return "Chat API server is not running.";
        }
        return [
          `Chat API server is running on http://127.0.0.1:${port}`,
          "",
          "Endpoints:",
          `  POST http://127.0.0.1:${port}/chat          — send a message, get a response`,
          `  GET  http://127.0.0.1:${port}/chat/stream   — SSE stream (query: ?prompt=...)`,
          `  GET  http://127.0.0.1:${port}/history        — conversation history`,
          `  GET  http://127.0.0.1:${port}/health         — health check`,
        ].join("\n");
      },
    },
    {
      name: "chat_api_restart",
      description:
        "Restart the external chat API server. Use if the server becomes unresponsive.",
      parameters: {
        type: "object",
        properties: {
          port: {
            type: "number",
            description:
              "Port to bind to. Omit or set to 0 for a random available port.",
          },
        },
      },
      handler: async (args) => {
        if (server.isRunning()) {
          await server.stop();
        }
        const actualPort = await server.start(args.port || 0);
        return `Chat API server restarted on http://127.0.0.1:${actualPort}`;
      },
    },
  ];
}
