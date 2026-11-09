import { expect, test } from "bun:test";
import { copyFile, mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildTimeoutMs, builtCliPath, hermeticEnv, repoRoot, run } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { createWorkspace, writeFileWithParents } from "../helpers/workspace.ts";

async function fixture() {
  const workspace = await createWorkspace({ workspace: "schemaVersion: 1\nlimits: { maxRounds: 4 }\n" });
  const home = join(workspace.root, "home");
  await mkdir(home, { recursive: true });
  return { workspace, env: hermeticEnv(home) };
}

const EXPLAIN = ["policy", "show", "--explain", "limits.maxRounds"];

test("the source entry finds the shipped defaults and the Workspace from FOREMAN_WORKSPACE", async () => {
  const { workspace, env } = await fixture();

  const result = await run(["bun", join(repoRoot, "src", "main.ts"), ...EXPLAIN], {
    cwd: workspace.root,
    env: { ...env, FOREMAN_WORKSPACE: workspace.dir },
  });

  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("limits.maxRounds = 4");
  expect(result.stdout).toContain("overrides: built-in");
  expect(result.exitCode).toBe(0);
});

test(
  "the build copies policy/defaults.yaml next to the entry point, and the built entry uses that copy",
  async () => {
    const { workspace, env } = await fixture();
    const cli = await builtCliPath();
    const copied = join(dirname(cli), "policy", "defaults.yaml");

    expect(await Bun.file(copied).text()).toBe(await Bun.file(join(repoRoot, "policy", "defaults.yaml")).text());

    const result = await run([cli, "validate", "--dir", workspace.dir], { cwd: workspace.dir, env });

    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`built-in: ${copied}`);
    expect(result.exitCode).toBe(0);
  },
  buildTimeoutMs,
);

test(
  "the built entry reached through a symlink, as bun link makes, still finds its defaults",
  async () => {
    const { workspace, env } = await fixture();
    const link = join(await makeTempDir(), "foreman");
    await symlink(await builtCliPath(), link);

    const result = await run([link, "validate"], { cwd: workspace.dir, env });

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  },
  buildTimeoutMs,
);

test(
  "the built entry stops with a clear error if its defaults are missing, and doesn't use another copy",
  async () => {
    const { workspace, env } = await fixture();
    const installed = join(await makeTempDir(), "dist", "main.js");
    await mkdir(dirname(installed), { recursive: true });
    await copyFile(await builtCliPath(), installed);
    // A policy file above the installation must not stand in for the missing one.
    await writeFileWithParents(join(dirname(installed), "..", "policy", "defaults.yaml"), "schemaVersion: 1\n");

    const result = await run(["bun", installed, "validate"], { cwd: workspace.dir, env });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(join(dirname(installed), "policy", "defaults.yaml"));
    expect(result.stderr).toContain("missing");
  },
  buildTimeoutMs,
);

test("an invalid layer exits with the invalid-config code from a real process", async () => {
  const { workspace, env } = await fixture();
  await writeFileWithParents(join(workspace.dir, "foreman", "foreman.yaml"), "schemaVersion: 1\nnope: 1\n");

  const result = await run(["bun", join(repoRoot, "src", "main.ts"), "validate", "--dir", workspace.dir], {
    cwd: workspace.root,
    env,
  });

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("nope: unknown key");
});
