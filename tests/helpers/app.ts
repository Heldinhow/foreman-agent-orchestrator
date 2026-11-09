import { createApp, type AppDeps, type Terminal } from "../../src/cli/app.ts";

/** The application seam with a captured terminal and a fixed clock. */
export function createTestApp(overrides: Partial<AppDeps> = {}) {
  const captured = { stdout: "", stderr: "" };
  const terminal: Terminal = {
    writeOut: (text) => {
      captured.stdout += text;
    },
    writeErr: (text) => {
      captured.stderr += text;
    },
  };
  const app = createApp({
    clock: { now: () => new Date("2026-01-01T00:00:00.000Z") },
    terminal,
    ...overrides,
  });
  return { app, terminal: captured };
}
