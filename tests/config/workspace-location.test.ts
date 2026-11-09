import { expect, test } from "bun:test";
import { join, relative } from "node:path";
import { createTestApp } from "../helpers/app.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { createWorkspace, writeFileWithParents } from "../helpers/workspace.ts";

const MARKER = "schemaVersion: 1\nlimits: { maxRounds: 7 }\n";

async function secondWorkspace() {
  const dir = join(await makeTempDir(), "other");
  await writeFileWithParents(join(dir, "foreman", "foreman.yaml"), MARKER);
  return dir;
}

async function validate(options: { cwd: string; env: Record<string, string>; dir?: string }) {
  const { app, terminal } = createTestApp({ cwd: options.cwd, env: options.env });
  const argv = options.dir === undefined ? ["validate"] : ["validate", "--dir", options.dir];
  return { exitCode: await app.exec(argv), ...terminal };
}

const workspaceFile = (dir: string) => join(dir, "foreman", "foreman.yaml");

test("--dir wins over FOREMAN_WORKSPACE and the nearest ancestor", async () => {
  const nearest = await createWorkspace();
  const fromEnv = await secondWorkspace();
  const fromDir = await secondWorkspace();

  const { stdout } = await validate({
    cwd: nearest.dir,
    env: { ...nearest.env, FOREMAN_WORKSPACE: fromEnv },
    dir: fromDir,
  });

  expect(stdout).toContain(workspaceFile(fromDir));
});

test("FOREMAN_WORKSPACE wins over the nearest ancestor", async () => {
  const nearest = await createWorkspace();
  const fromEnv = await secondWorkspace();

  const { stdout } = await validate({
    cwd: nearest.dir,
    env: { ...nearest.env, FOREMAN_WORKSPACE: fromEnv },
  });

  expect(stdout).toContain(workspaceFile(fromEnv));
});

test("an empty FOREMAN_WORKSPACE counts as unset", async () => {
  const nearest = await createWorkspace();

  const { stdout } = await validate({ cwd: nearest.dir, env: { ...nearest.env, FOREMAN_WORKSPACE: "" } });

  expect(stdout).toContain(workspaceFile(nearest.dir));
});

test("the nearest ancestor holding foreman/foreman.yaml is found from a subdirectory", async () => {
  const workspace = await createWorkspace();
  const deep = join(workspace.dir, "a", "b");
  await writeFileWithParents(join(deep, "file"), "");

  const { stdout } = await validate({ cwd: deep, env: workspace.env });

  expect(stdout).toContain(workspaceFile(workspace.dir));
});

test("a Workspace nested in another, but not one of its Projects, is the nearest", async () => {
  const outer = await createWorkspace();
  const inner = join(outer.dir, "nested");
  await writeFileWithParents(workspaceFile(inner), MARKER);

  const { stdout } = await validate({ cwd: inner, env: outer.env });

  expect(stdout).toContain(workspaceFile(inner));
});

test("a relative --dir resolves against the working directory", async () => {
  const workspace = await createWorkspace();

  const { stdout } = await validate({
    cwd: workspace.root,
    env: workspace.env,
    dir: relative(workspace.root, workspace.dir),
  });

  expect(stdout).toContain(workspaceFile(workspace.dir));
});

test.each([
  { source: "--dir", dirFor: (path: string) => path, envFor: () => ({}) },
  { source: "FOREMAN_WORKSPACE", dirFor: () => undefined, envFor: (path: string) => ({ FOREMAN_WORKSPACE: path }) },
])("$source naming no Workspace is an error and doesn't fall through", async ({ source, dirFor, envFor }) => {
  const nearest = await createWorkspace();
  const empty = await makeTempDir();

  const { exitCode, stderr, stdout } = await validate({
    cwd: nearest.dir,
    dir: dirFor(empty),
    env: { ...nearest.env, ...envFor(empty) },
  });

  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
  expect(stderr).toContain(empty);
  expect(stderr).toContain(source);
});

test("with no Workspace anywhere the error says how to name one", async () => {
  const { env } = await createWorkspace();

  const { exitCode, stderr } = await validate({ cwd: await makeTempDir(), env });

  expect(exitCode).toBe(2);
  expect(stderr).toContain("no Workspace found");
  expect(stderr).toContain("--dir");
});

test("a malformed outer workspace.yaml stops discovery rather than trusting the inner Workspace", async () => {
  const outer = await createWorkspace();
  const inner = join(outer.dir, "repo");
  await writeFileWithParents(workspaceFile(inner), MARKER);
  await writeFileWithParents(join(outer.dir, "foreman", "workspace.yaml"), "projects: {\n");

  const { exitCode, stderr } = await validate({ cwd: inner, env: outer.env });

  expect(exitCode).toBe(2);
  expect(stderr).toContain("workspace.yaml");
});
