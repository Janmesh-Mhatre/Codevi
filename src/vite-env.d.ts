/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Minimum level written to the console by src/utils/logger.ts.
   * One of "debug" | "info" | "warn" | "error". Defaults to "debug". */
  readonly VITE_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
