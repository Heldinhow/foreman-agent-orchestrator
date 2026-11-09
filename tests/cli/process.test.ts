import { expect, test } from "bun:test";
import { join } from "node:path";
import { makeTempDir } from "../helpers/temp.ts";
import { buildTimeoutMs, builtCliPath, hermeticEnv, repoRoot, run } from "../helpers/process.ts";

const { version } = await Bun.file(join(repoRoot, "package.json")).json();

async function inTempDir(command: string[]) {
  const dir = await makeTempDir();
  return run(command, { cwd: dir, env: hermeticEnv(dir) });
}

test("the source entry prints the version", async () => {
  const result = await inTempDir(["bun", join(repoRoot, "src", "main.ts"), "--version"]);

  expect(result.stdout).toBe(`${version}\n`);
  expect(result.exitCode).toBe(0);
});

test(
  "the built entry runs as an executable and prints the version",
  async () => {
    const result = await inTempDir([await builtCliPath(), "--version"]);

    expect(result.stdout).toBe(`${version}\n`);
    expect(result.exitCode).toBe(0);
  },
  buildTimeoutMs,
);

test(
  "the built entry exits with the usage code on an unknown command",
  async () => {
    const result = await inTempDir([await builtCliPath(), "frobnicate"]);

    expect(result.stderr).toContain("frobnicate");
    expect(result.exitCode).toBe(2);
  },
  buildTimeoutMs,
);
