/**
 * Tools exposed to the agent for managing the Responses API server.
 */
export function createApiTools(server, defaultPort = 15210) {
  return [
    {
      name: "responses_status",
      description:
        "Get the status of the Responses API server, including its port and whether it is running.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const running = server.isRunning();
        const port = server.getPort();
        if (!running) {
          return "Responses API server is not running.";
        }
        return [
          `Responses API server is running on http://127.0.0.1:${port}`,
          "",
          "Endpoints:",
          `  POST http://127.0.0.1:${port}/v1/responses  — OpenAI Responses API (compatible)`,
          `  POST http://127.0.0.1:${port}/chat          — send a message, get a response`,
          `  GET  http://127.0.0.1:${port}/chat/stream   — SSE stream (query: ?prompt=...)`,
          `  GET  http://127.0.0.1:${port}/history        — conversation history`,
          `  GET  http://127.0.0.1:${port}/health         — health check`,
        ].join("\n");
      },
    },
    {
      name: "responses_restart",
      description:
        "Restart the Responses API server. Use if the server becomes unresponsive.",
      parameters: {
        type: "object",
        properties: {
          port: {
            type: "number",
            description:
              `Port to bind to. Defaults to ${defaultPort}.`,
          },
        },
      },
      handler: async (args) => {
        if (server.isRunning()) {
          await server.stop();
        }
        const actualPort = await server.start(args.port || defaultPort);
        return `Responses API server restarted on http://127.0.0.1:${actualPort}`;
      },
    },
  ];
}
