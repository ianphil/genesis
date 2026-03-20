// CRUD tools — cron_create, cron_list, cron_get, cron_update, cron_delete

import { nameToId, readJob, listJobs, writeJob, deleteJob, jobExists } from "../lib/store.mjs";
import { calculateNextRun, validateSchedule } from "../lib/scheduler.mjs";
import { getRecentHistory, deleteHistory } from "../lib/history.mjs";

function makeJob(name, id, schedule, payload) {
  return {
    id,
    name,
    status: "enabled",
    maxConcurrency: 1,
    createdAtUtc: new Date().toISOString(),
    createdFrom: process.cwd(),
    lastRunAtUtc: null,
    nextRunAtUtc: calculateNextRun(schedule),
    schedule,
    payload,
    backoff: null,
  };
}

function formatJobSummary(job) {
  const status = job.status === "enabled" ? "✅" : "⏸️";
  const next = job.nextRunAtUtc ? new Date(job.nextRunAtUtc).toLocaleString() : "none";
  const type = job.payload?.type || "unknown";
  return `${status} **${job.name}** (${job.id}) — ${type} | next: ${next}`;
}

export function createCrudTools(extDir, state) {
  return [
    {
      name: "cron_create",
      description: "Create a new scheduled cron job. Supports command jobs (run a shell command) and prompt jobs (send a prompt to the AI).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Human-readable job name (used to derive the job ID)" },
          scheduleType: {
            type: "string",
            enum: ["cron", "interval", "oneShot"],
            description: "Schedule type: 'cron' (cron expression), 'interval' (fixed ms), 'oneShot' (fire once)",
          },
          cronExpression: { type: "string", description: "Cron expression (5 or 6 field). Required when scheduleType is 'cron'." },
          timezone: { type: "string", description: "IANA timezone for cron (e.g. 'America/Chicago'). Defaults to UTC." },
          intervalMs: { type: "number", description: "Interval in milliseconds. Required when scheduleType is 'interval'." },
          fireAtUtc: { type: "string", description: "ISO 8601 UTC timestamp. Required when scheduleType is 'oneShot'." },
          payloadType: {
            type: "string",
            enum: ["command", "prompt"],
            description: "What to execute: 'command' (shell) or 'prompt' (AI)",
          },
          command: { type: "string", description: "Executable name or path. Required for command payloads." },
          arguments: { type: "string", description: "Command-line arguments. Optional for command payloads." },
          workingDirectory: { type: "string", description: "Working directory for command. Defaults to user home." },
          prompt: { type: "string", description: "The prompt to send to the LLM. Required for prompt payloads." },
          model: { type: "string", description: "Model override for prompt payloads (e.g. 'claude-sonnet-4.5')." },
          sessionId: { type: "string", description: "Custom session ID for prompt payloads. If provided, the Copilot session is created with this ID for tracking." },
          timeoutSeconds: { type: "number", description: "Timeout in seconds. Default: 300 for commands, 120 for prompts." },
        },
        required: ["name", "scheduleType", "payloadType"],
      },
      handler: async (args) => {
        const id = nameToId(args.name);
        if (!id) return "Error: name produces an empty ID.";
        if (jobExists(extDir, state.agentName, id)) return `Error: job '${id}' already exists. Use cron_update to modify it.`;

        // Build schedule
        const schedule = { type: args.scheduleType };
        if (args.scheduleType === "cron") {
          schedule.expression = args.cronExpression;
          schedule.timezone = args.timezone || null;
        } else if (args.scheduleType === "interval") {
          schedule.intervalMs = args.intervalMs;
        } else if (args.scheduleType === "oneShot") {
          schedule.fireAtUtc = args.fireAtUtc;
        }

        const validation = validateSchedule(schedule);
        if (!validation.valid) return `Error: ${validation.error}`;

        // Build payload
        const payload = { type: args.payloadType };
        if (args.payloadType === "command") {
          if (!args.command) return "Error: command is required for command payloads.";
          payload.command = args.command;
          payload.arguments = args.arguments || null;
          payload.workingDirectory = args.workingDirectory || null;
          payload.timeoutSeconds = args.timeoutSeconds || 300;
        } else if (args.payloadType === "prompt") {
          if (!args.prompt) return "Error: prompt is required for prompt payloads.";
          payload.prompt = args.prompt;
          payload.model = args.model || null;
          payload.sessionId = args.sessionId || null;
          payload.preloadToolNames = null;
          payload.timeoutSeconds = args.timeoutSeconds || 120;
        }

        const job = makeJob(args.name, id, schedule, payload);
        writeJob(extDir, state.agentName, job);

        return `Created job **${job.name}** (${job.id}).\n` +
          `Schedule: ${job.schedule.type}` +
          (job.schedule.expression ? ` \`${job.schedule.expression}\`` : "") +
          (job.schedule.intervalMs ? ` every ${job.schedule.intervalMs}ms` : "") +
          `\nNext run: ${job.nextRunAtUtc || "none"}\n` +
          `Payload: ${job.payload.type}` +
          (job.payload.command ? ` — \`${job.payload.command} ${job.payload.arguments || ""}\`` : "") +
          (job.payload.prompt ? ` — "${job.payload.prompt.slice(0, 80)}..."` : "");
      },
    },

    {
      name: "cron_list",
      description: "List all cron jobs with status and next run time.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["enabled", "disabled"],
            description: "Optional filter by job status.",
          },
        },
      },
      handler: async (args) => {
        let jobs = listJobs(extDir, state.agentName);
        if (args.status) {
          jobs = jobs.filter((j) => j.status === args.status);
        }
        if (jobs.length === 0) return "No cron jobs found.";

        // Sort by nextRunAtUtc
        jobs.sort((a, b) => {
          if (!a.nextRunAtUtc) return 1;
          if (!b.nextRunAtUtc) return -1;
          return new Date(a.nextRunAtUtc) - new Date(b.nextRunAtUtc);
        });

        const lines = jobs.map(formatJobSummary);
        return `**${jobs.length} job(s):**\n\n` + lines.join("\n");
      },
    },

    {
      name: "cron_get",
      description: "Get detailed information about a cron job including recent run history.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID (kebab-case)" },
        },
        required: ["jobId"],
      },
      handler: async (args) => {
        const job = readJob(extDir, state.agentName, args.jobId);
        if (!job) return `Error: job '${args.jobId}' not found.`;

        const recent = getRecentHistory(extDir, state.agentName, args.jobId, 5);
        const historyLines = recent.length > 0
          ? recent.map((r) =>
              `  ${r.outcome === "success" ? "✅" : "❌"} ${r.startedAtUtc} — ${r.durationMs}ms` +
              (r.errorMessage ? ` — ${r.errorMessage}` : "")
            ).join("\n")
          : "  No runs yet.";

        return `**${job.name}** (${job.id})\n` +
          `Status: ${job.status}\n` +
          `Schedule: ${job.schedule.type}` +
          (job.schedule.expression ? ` \`${job.schedule.expression}\`` : "") +
          (job.schedule.timezone ? ` (${job.schedule.timezone})` : "") +
          (job.schedule.intervalMs ? ` every ${job.schedule.intervalMs}ms` : "") +
          `\nNext run: ${job.nextRunAtUtc || "none"}\n` +
          `Last run: ${job.lastRunAtUtc || "never"}\n` +
          `Payload: ${job.payload.type}` +
          (job.payload.command ? ` — \`${job.payload.command} ${job.payload.arguments || ""}\`` : "") +
          (job.payload.prompt ? ` — "${job.payload.prompt.slice(0, 80)}"` : "") +
          `\nTimeout: ${job.payload.timeoutSeconds}s\n` +
          (job.backoff ? `Backoff: ${job.backoff.consecutiveFailures} failures, retry at ${job.backoff.nextRetryAtUtc}\n` : "") +
          `\n**Recent runs:**\n${historyLines}`;
      },
    },

    {
      name: "cron_update",
      description: "Update a cron job's name, schedule, payload, or timeout. Only provide fields you want to change.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to update" },
          name: { type: "string", description: "New job name" },
          scheduleType: { type: "string", enum: ["cron", "interval", "oneShot"], description: "New schedule type" },
          cronExpression: { type: "string", description: "New cron expression" },
          timezone: { type: "string", description: "New IANA timezone" },
          intervalMs: { type: "number", description: "New interval in milliseconds" },
          fireAtUtc: { type: "string", description: "New fire-at time (ISO 8601 UTC)" },
          command: { type: "string", description: "New command" },
          arguments: { type: "string", description: "New arguments" },
          workingDirectory: { type: "string", description: "New working directory" },
          prompt: { type: "string", description: "New prompt text" },
          model: { type: "string", description: "New model" },
          timeoutSeconds: { type: "number", description: "New timeout in seconds" },
        },
        required: ["jobId"],
      },
      handler: async (args) => {
        const job = readJob(extDir, state.agentName, args.jobId);
        if (!job) return `Error: job '${args.jobId}' not found.`;

        const changes = [];

        if (args.name !== undefined) {
          job.name = args.name;
          changes.push("name");
        }

        // Schedule updates
        let scheduleChanged = false;
        if (args.scheduleType !== undefined) {
          job.schedule.type = args.scheduleType;
          scheduleChanged = true;
        }
        if (args.cronExpression !== undefined) {
          job.schedule.expression = args.cronExpression;
          scheduleChanged = true;
        }
        if (args.timezone !== undefined) {
          job.schedule.timezone = args.timezone;
          scheduleChanged = true;
        }
        if (args.intervalMs !== undefined) {
          job.schedule.intervalMs = args.intervalMs;
          scheduleChanged = true;
        }
        if (args.fireAtUtc !== undefined) {
          job.schedule.fireAtUtc = args.fireAtUtc;
          scheduleChanged = true;
        }

        if (scheduleChanged) {
          const validation = validateSchedule(job.schedule);
          if (!validation.valid) return `Error: ${validation.error}`;
          job.nextRunAtUtc = calculateNextRun(job.schedule, job.lastRunAtUtc);
          changes.push("schedule");
        }

        // Payload updates
        if (args.command !== undefined) { job.payload.command = args.command; changes.push("command"); }
        if (args.arguments !== undefined) { job.payload.arguments = args.arguments; changes.push("arguments"); }
        if (args.workingDirectory !== undefined) { job.payload.workingDirectory = args.workingDirectory; changes.push("workingDirectory"); }
        if (args.prompt !== undefined) { job.payload.prompt = args.prompt; changes.push("prompt"); }
        if (args.model !== undefined) { job.payload.model = args.model; changes.push("model"); }
        if (args.timeoutSeconds !== undefined) { job.payload.timeoutSeconds = args.timeoutSeconds; changes.push("timeout"); }

        if (changes.length === 0) return "No changes specified.";

        writeJob(extDir, state.agentName, job);
        return `Updated **${job.name}** (${job.id}): ${changes.join(", ")}` +
          (scheduleChanged ? `\nNext run: ${job.nextRunAtUtc || "none"}` : "");
      },
    },

    {
      name: "cron_delete",
      description: "Delete a cron job and its run history.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to delete" },
        },
        required: ["jobId"],
      },
      handler: async (args) => {
        const job = readJob(extDir, state.agentName, args.jobId);
        if (!job) return `Error: job '${args.jobId}' not found.`;

        const name = job.name;
        deleteJob(extDir, state.agentName, args.jobId);
        deleteHistory(extDir, state.agentName, args.jobId);
        return `Deleted job **${name}** (${args.jobId}) and its run history.`;
      },
    },
  ];
}
