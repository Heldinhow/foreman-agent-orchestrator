import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type AppDeps, type Terminal } from "../../src/cli/app.ts";
import { createTestHumanChannel } from "./human-channel.ts";

/** The application seam with a captured terminal, a fixed clock and a test Human Channel. */
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
    humanChannel: createTestHumanChannel(),
    env: {},
    cwd: tmpdir(),
    policyDefaultsFile: join(import.meta.dir, "..", "..", "policy", "defaults.yaml"),
    ...overrides,
  });
  return { app, terminal: captured };
}
