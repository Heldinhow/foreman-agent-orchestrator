import { expect, test } from "bun:test";
import { join } from "node:path";
import { ExitCode } from "../../src/cli/exit-codes.ts";
import { createTestApp } from "../helpers/app.ts";

const packageJsonPath = join(import.meta.dir, "..", "..", "package.json");

test("--version prints the package version and succeeds", async () => {
  const { version } = await Bun.file(packageJsonPath).json();
  const { app, terminal } = createTestApp();

  const exitCode = await app.exec(["--version"]);

  expect(exitCode).toBe(0);
  expect(terminal.stdout).toBe(`${version}\n`);
  expect(terminal.stderr).toBe("");
});

test("an unknown command returns the usage exit code and names the command", async () => {
  const { app, terminal } = createTestApp();

  const exitCode = await app.exec(["frobnicate"]);

  expect(exitCode).toBe(2);
  expect(terminal.stderr).toContain("frobnicate");
  expect(terminal.stdout).toBe("");
});

test("a name inherited from Object is still an unknown command", async () => {
  const { app } = createTestApp();

  expect(await app.exec(["constructor"])).toBe(2);
});

test("no command returns the usage exit code", async () => {
  const { app, terminal } = createTestApp();

  const exitCode = await app.exec([]);

  expect(exitCode).toBe(2);
  expect(terminal.stderr).toContain("Usage");
});

test("a command that fails unexpectedly returns the runtime error exit code", async () => {
  const errors: string[] = [];
  const { app } = createTestApp({
    terminal: {
      writeOut: () => {
        throw new Error("stdout is closed");
      },
      writeErr: (text) => {
        errors.push(text);
      },
    },
  });

  const exitCode = await app.exec(["--version"]);

  expect(exitCode).toBe(1);
  expect(errors.join("")).toContain("stdout is closed");
});

test("exit codes match the spec", () => {
  expect(ExitCode).toEqual({
    Success: 0,
    RuntimeError: 1,
    Usage: 2,
    WaitingOnHuman: 3,
    RunHalted: 4,
  });
});
