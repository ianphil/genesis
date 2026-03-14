// Script runner — execute LLM-authored JS in a sandboxed vm context.
//
// Scripts get `callTool(server, tool, params)` as their only external API.
// No filesystem, network, or process access. Console output is captured
// and returned alongside the script's return value.

import vm from "node:vm";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

/**
 * Run a JavaScript script body in a sandboxed vm context.
 *
 * The script is wrapped in an async IIFE so `await` and `return` work at
 * the top level. The only injected async function is `callTool`.
 *
 * @param {string} scriptBody - JavaScript function body (can use await/return)
 * @param {object} options
 * @param {(server: string, tool: string, params?: object) => Promise<any>} options.callTool
 * @param {number} [options.timeoutSeconds=30]
 * @returns {Promise<{ result: any, logs: string[] }>}
 */
export async function runScript(scriptBody, { callTool, timeoutSeconds = 30 }) {
  const timeoutMs = Math.min(
    Math.max(timeoutSeconds, 1) * 1000,
    MAX_TIMEOUT_MS
  );

  // Capture console output
  const logs = [];
  const captureConsole = {
    log: (...args) => logs.push(args.map(String).join(" ")),
    warn: (...args) => logs.push(`[warn] ${args.map(String).join(" ")}`),
    error: (...args) => logs.push(`[error] ${args.map(String).join(" ")}`),
  };

  // Sandbox context — only safe globals + callTool
  const context = {
    callTool,
    console: captureConsole,
    JSON,
    Array,
    Object,
    Map,
    Set,
    Date,
    Math,
    RegExp,
    Promise,
    URL,
    URLSearchParams,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
  };

  vm.createContext(context);

  // Wrap in async IIFE so await/return work at top level
  const wrappedScript = `(async () => {\n${scriptBody}\n})()`;

  try {
    const script = new vm.Script(wrappedScript, {
      filename: "execute_script",
      lineOffset: -1, // adjust for the IIFE wrapper line
    });

    const resultPromise = script.runInContext(context, {
      timeout: timeoutMs,
      breakOnSigint: true,
    });

    // The script returns a Promise (from async IIFE). Await it with timeout.
    const result = await Promise.race([
      resultPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Script timed out after ${timeoutSeconds}s`)), timeoutMs)
      ),
    ]);

    return { result, logs };
  } catch (err) {
    // Rethrow with cleaner message for common cases
    if (err.message?.includes("timed out")) {
      throw new ScriptTimeoutError(timeoutSeconds, logs);
    }
    throw new ScriptExecutionError(err, logs);
  }
}

/**
 * Error thrown when a script exceeds its timeout.
 */
export class ScriptTimeoutError extends Error {
  constructor(timeoutSeconds, logs) {
    super(`Script timed out after ${timeoutSeconds}s`);
    this.name = "ScriptTimeoutError";
    this.logs = logs;
  }
}

/**
 * Error thrown when a script encounters a runtime error.
 */
export class ScriptExecutionError extends Error {
  constructor(cause, logs) {
    const msg = cause?.message || String(cause);
    super(msg);
    this.name = "ScriptExecutionError";
    this.cause = cause;
    this.logs = logs;

    // Extract line number from the vm stack if available
    if (cause?.stack) {
      const match = cause.stack.match(/execute_script:(\d+)/);
      if (match) {
        this.scriptLine = parseInt(match[1], 10);
      }
    }
  }
}
