# Tunnel Extension

Expose any local port over the internet via [Microsoft Dev Tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview).
Stopped by default ...  start it when you need remote access.

## Prerequisites

1. Install the [Dev Tunnels CLI](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started)
2. Run `devtunnel user login`

## Agent Tools

| Tool | Description |
|------|-------------|
| `tunnel_start` | Start a tunnel (optional: port, access level) |
| `tunnel_stop` | Stop the running tunnel |
| `tunnel_status` | Check tunnel state, URL, port |

## Usage

```
> Start a tunnel to expose the responses API
> Stop the tunnel
> What's the tunnel status?
```

### Parameters

**`tunnel_start`**:
- `port` (number, default: 15210) ...  local port to expose
- `access` ("tenant" or "anonymous", default: "tenant") ...  Entra tenant-scoped or open

## How It Works

```
External Client (anywhere)
    ↓ HTTPS (Entra auth if tenant-scoped)
Microsoft Dev Tunnels Cloud Relay
    ↓ Local port forwarding
localhost:15210
    ↓
Responses API Server → Copilot Agent
```

### Lifecycle

1. **`tunnel_start`**: Resolves or creates tunnel ID → sets access → registers port → spawns `devtunnel host` → parses public URL from stdout
2. **`tunnel_stop`**: Kills host process (SIGTERM → SIGKILL after 5s)
3. **Session end**: Auto-cleanup kills any running tunnel

### Persistence

Tunnel ID is saved to `data/tunnel-config.json` so restarts reuse the same tunnel (same URL).

## Security

- Default access is **tenant-scoped** ...  only members of your Entra tenant can connect
- Use `access: "anonymous"` only for testing or public demos
- The tunnel exposes whatever is running on the local port ...  ensure that service has its own auth if needed

### Programmatic Access (no browser)

Browser clients get Entra SSO automatically. For scripts and API calls, generate a **tunnel connect token**:

```powershell
# Generate a connect token (valid 24h)
$TOKEN = (devtunnel token <tunnel-id> --scope connect | Select-String "^Token:").ToString().Replace("Token: ", "")

# Call the API through the tunnel
Invoke-RestMethod -Uri "https://<tunnel-url>/health" -Headers @{ "X-Tunnel-Authorization" = "tunnel $TOKEN" }

# Send a chat message through the tunnel
Invoke-RestMethod -Uri "https://<tunnel-url>/v1/responses" -Method POST -Headers @{
    "X-Tunnel-Authorization" = "tunnel $TOKEN"
    "Content-Type" = "application/json"
} -Body '{"model":"copilot","input":"Hello from the tunnel!"}'
```

Key details:
- Use `devtunnel token <id> --scope connect` ...  **not** `az account get-access-token`
- Header is `X-Tunnel-Authorization: tunnel <jwt>` ...  **not** `Authorization: Bearer`
- Tokens are valid for 24 hours by default
