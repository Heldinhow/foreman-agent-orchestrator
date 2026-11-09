import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTestApp } from "./app.ts";
import { makeTempDir } from "./temp.ts";

export interface WorkspaceFixture {
  /** Written to `foreman/foreman.yaml`. A bare `schemaVersion: 1` if omitted. */
  workspace?: string;
  /** Written to `foreman/projects/<project>.yaml`. */
  projects?: Record<string, string>;
  /** Written to the user override under the temp `XDG_CONFIG_HOME`. */
  override?: string;
}

export async function writeFileWithParents(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/** A temp Workspace and a temp config directory, so no test reads the real home. */
export async function createWorkspace(fixture: WorkspaceFixture = {}) {
  const root = await makeTempDir();
  const dir = join(root, "workspace");
  const xdgConfigHome = join(root, "xdg");
  const overrideFile = join(xdgConfigHome, "foreman", "override.yaml");

  await writeFileWithParents(
    join(dir, "foreman", "foreman.yaml"),
    fixture.workspace ?? "schemaVersion: 1\n",
  );
  for (const [project, content] of Object.entries(fixture.projects ?? {})) {
    await writeFileWithParents(join(dir, "foreman", "projects", `${project}.yaml`), content);
  }
  if (fixture.override !== undefined) {
    await writeFileWithParents(overrideFile, fixture.override);
  }

  return {
    root,
    dir,
    overrideFile,
    env: { HOME: join(root, "home"), XDG_CONFIG_HOME: xdgConfigHome },
  };
}

/** Runs a command against the Workspace through the application seam. */
export async function foremanIn(
  workspace: { dir: string; env: Record<string, string> },
  ...argv: string[]
) {
  const { app, terminal } = createTestApp({ env: workspace.env, cwd: workspace.dir });
  const exitCode = await app.exec(argv);
  return { exitCode, stdout: terminal.stdout, stderr: terminal.stderr };
}
