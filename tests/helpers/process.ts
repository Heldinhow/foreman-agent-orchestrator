import { dirname, join } from "node:path";
import { makeTempDir } from "./temp.ts";

export const repoRoot = join(import.meta.dir, "..", "..");

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * An environment built from nothing, so a child process can't see the real home,
 * git config, credentials or provider keys. Only `PATH` is inherited.
 */
export function hermeticEnv(home: string): Record<string, string> {
  return {
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_CACHE_HOME: join(home, ".cache"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

export async function run(
  command: string[],
  options: { cwd: string; env: Record<string, string> },
): Promise<RunResult> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

let build: Promise<string> | undefined;

/**
 * The path of the built CLI, from a real `bun run build` in this checkout.
 * It builds once per test process. Call it inside a test with `buildTimeoutMs`.
 */
export function builtCliPath(): Promise<string> {
  build ??= buildCli();
  return build;
}

export const buildTimeoutMs = 120_000;

async function buildCli(): Promise<string> {
  const result = await run(["bun", "run", "build"], {
    cwd: repoRoot,
    env: hermeticEnv(await makeTempDir()),
  });
  if (result.exitCode !== 0) {
    throw new Error(`bun run build failed:\n${result.stdout}${result.stderr}`);
  }
  return join(repoRoot, "dist", "main.js");
}
