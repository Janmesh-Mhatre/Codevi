/**
 * Minimal structured logger.
 *
 * Everything routes through `console` today. The entry points are kept
 * narrow on purpose (`debug/info/warn/error`, one `scope()` factory) so
 * that later phases can point this at a file/Tauri-log-plugin sink
 * without touching every call site — see README.md → "Future extension
 * points".
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, ...details: unknown[]) => void;
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, ...details: unknown[]) => void;
}

const consoleMethod: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

function resolveThreshold(): LogLevel {
  const configured = import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined;
  return configured && LEVEL_ORDER.includes(configured) ? configured : "debug";
}

const threshold = resolveThreshold();

function write(scope: string, level: LogLevel, message: string, details: unknown[]) {
  if (LEVEL_ORDER.indexOf(level) < LEVEL_ORDER.indexOf(threshold)) return;
  const timestamp = new Date().toISOString();
  consoleMethod[level](`[${timestamp}] [${scope}] ${message}`, ...details);
}

/** Creates a logger tagged with a scope, e.g. `scope("editor")`, so log
 * lines can be traced back to the layer that produced them. */
export function scope(name: string): Logger {
  return {
    debug: (message, ...details) => write(name, "debug", message, details),
    info: (message, ...details) => write(name, "info", message, details),
    warn: (message, ...details) => write(name, "warn", message, details),
    error: (message, ...details) => write(name, "error", message, details),
  };
}

/** Default, unscoped logger for quick/one-off use. Prefer `scope(...)`
 * inside a specific module. */
export const logger = scope("app");
