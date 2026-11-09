import { expect, test } from "bun:test";
import { join } from "node:path";
import { buildTimeoutMs, builtCliPath, hermeticEnv, run } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { createWorkspace, writeFileWithParents } from "../helpers/workspace.ts";

/**
 * ADR-0064. A Workspace directory with a planted `bunfig.toml` preload, and a `.env` that
 * would make the command fail to find its Workspace if Bun loaded it.
 */
async function plantedWorkspace() {
  const workspace = await createWorkspace();
  const marker = join(workspace.dir, "preload-ran");
  await writeFileWithParents(join(workspace.dir, "preload.ts"), `await Bun.write(${JSON.stringify(marker)}, "ran");\n`);
  await writeFileWithParents(join(workspace.dir, "bunfig.toml"), 'preload = ["./preload.ts"]\n');
  await writeFileWithParents(join(workspace.dir, ".env"), "FOREMAN_WORKSPACE=/nonexistent-workspace\n");
  const home = join(workspace.root, "home");
  return { workspace, marker, options: { cwd: workspace.dir, env: hermeticEnv(home) } };
}

test(
  "the foreman command ignores a bunfig.toml preload and a .env in the current directory",
  async () => {
    const { marker, options } = await plantedWorkspace();
    const cli = await builtCliPath();

    // Control: run by Bun directly, the same planted files do take effect with this Bun version.
    const control = await run(["bun", cli, "policy", "show"], options);
    expect(await Bun.file(marker).exists()).toBe(true);
    expect(control.exitCode).not.toBe(0);
    expect(control.stderr).toContain("/nonexistent-workspace");
    await Bun.file(marker).delete();

    // The command as installed, started through its own launcher.
    const result = await run([cli, "policy", "show"], options);

    expect(await Bun.file(marker).exists()).toBe(false);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  },
  buildTimeoutMs,
);

test(
  "the foreman command also ignores them when started through a symlink on PATH",
  async () => {
    const { marker, options } = await plantedWorkspace();
    const bin = await makeTempDir();
    await Bun.$`ln -s ${await builtCliPath()} ${join(bin, "foreman")}`.quiet();

    const result = await run(["foreman", "policy", "show"], {
      ...options,
      env: { ...options.env, PATH: `${bin}:${options.env.PATH}` },
    });

    expect(await Bun.file(marker).exists()).toBe(false);
    expect(result.exitCode).toBe(0);
  },
  buildTimeoutMs,
);
