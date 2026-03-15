// Lifecycle tools — cron_pause, cron_resume

import { readJob, writeJob } from "../lib/store.mjs";
import { calculateNextRun } from "../lib/scheduler.mjs";

export function createLifecycleTools(extDir, state) {
  return [
    {
      name: "cron_pause",
      description: "Pause (disable) a cron job. The job definition is kept but it won't run until resumed.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to pause" },
        },
        required: ["jobId"],
      },
      handler: async (args) => {
        const job = readJob(extDir, state.agentName, args.jobId);
        if (!job) return `Error: job '${args.jobId}' not found.`;
        if (job.status === "disabled") return `Job **${job.name}** is already paused.`;

        job.status = "disabled";
        job.nextRunAtUtc = null;
        writeJob(extDir, state.agentName, job);
        return `Paused job **${job.name}** (${job.id}). Use cron_resume to re-enable.`;
      },
    },

    {
      name: "cron_resume",
      description: "Resume a paused cron job. Recalculates the next run time.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to resume" },
        },
        required: ["jobId"],
      },
      handler: async (args) => {
        const job = readJob(extDir, state.agentName, args.jobId);
        if (!job) return `Error: job '${args.jobId}' not found.`;
        if (job.status === "enabled") return `Job **${job.name}** is already running.`;

        job.status = "enabled";
        job.backoff = null;
        job.nextRunAtUtc = calculateNextRun(job.schedule, job.lastRunAtUtc);
        writeJob(extDir, state.agentName, job);
        return `Resumed job **${job.name}** (${job.id}).\nNext run: ${job.nextRunAtUtc || "none"}`;
      },
    },
  ];
}
