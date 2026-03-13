import * as tunnel from "../lib/tunnel.mjs";

export function createTunnelTools() {
  return [
    {
      name: "tunnel_start",
      description:
        "Start a dev tunnel to expose a local port over the internet via Microsoft Dev Tunnels. " +
        "Requires `devtunnel` CLI installed and `devtunnel user login` completed. " +
        "Default port is 15210 (the Responses API server).",
      parameters: {
        type: "object",
        properties: {
          port: {
            type: "number",
            description: "Local port to expose. Defaults to 15210.",
          },
          access: {
            type: "string",
            description:
              'Access level: "tenant" (Entra ID login required, default) or "anonymous" (open to anyone).',
            enum: ["tenant", "anonymous"],
          },
        },
      },
      handler: async (args) => {
        try {
          const result = await tunnel.start({
            port: args.port || 15210,
            access: args.access || "tenant",
          });

          if (result.message === "Tunnel already running") {
            return [
              "Tunnel is already running.",
              "",
              `  Tunnel ID:  ${result.tunnelId}`,
              `  Public URL: ${result.publicUrl}`,
              `  Local port: ${result.port}`,
            ].join("\n");
          }

          return [
            "Tunnel started successfully.",
            "",
            `  Tunnel ID:  ${result.tunnelId}`,
            `  Public URL: ${result.publicUrl}`,
            `  Local port: ${result.port}`,
            "",
            "External clients can now reach the local server at the public URL.",
          ].join("\n");
        } catch (err) {
          return `Failed to start tunnel: ${err.message}`;
        }
      },
    },

    {
      name: "tunnel_stop",
      description: "Stop the running dev tunnel and kill the host process.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        try {
          const result = await tunnel.stop();
          if (result.previousUrl) {
            return `Tunnel stopped. Was serving at ${result.previousUrl}`;
          }
          return result.message;
        } catch (err) {
          return `Failed to stop tunnel: ${err.message}`;
        }
      },
    },

    {
      name: "tunnel_status",
      description:
        "Get the current status of the dev tunnel — running state, tunnel ID, public URL, and port.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const status = tunnel.getStatus();

        if (!status.isRunning) {
          const lines = ["Tunnel is not running."];
          if (status.tunnelId) {
            lines.push(`  Last tunnel ID: ${status.tunnelId}`);
          }
          if (status.error) {
            lines.push(`  Last error: ${status.error}`);
          }
          return lines.join("\n");
        }

        return [
          "Tunnel is running.",
          "",
          `  Tunnel ID:  ${status.tunnelId}`,
          `  Public URL: ${status.publicUrl}`,
          `  Local port: ${status.port}`,
        ].join("\n");
      },
    },
  ];
}
