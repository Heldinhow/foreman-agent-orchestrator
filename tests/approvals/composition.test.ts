import { expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";
import { createLocalHumanChannel } from "../../src/approvals/local-channel.ts";
import { buildTimeoutMs, builtCliPath, repoRoot } from "../helpers/process.ts";

const srcRoot = join(repoRoot, "src");

/** Comments are dropped, so explaining a rule in prose can't trip the check on that rule. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function sources() {
  const paths = await Array.fromAsync(new Glob("**/*.ts").scan({ cwd: srcRoot }));
  return Promise.all(
    paths.map(async (path) => ({ path, text: code(await Bun.file(join(srcRoot, path)).text()) })),
  );
}

const compositionRoot = async () => code(await Bun.file(join(srcRoot, "main.ts")).text());

test("AC-85: the composition root wires the real Human Channel", async () => {
  expect(await compositionRoot()).toContain("humanChannel: createLocalHumanChannel()");
});

test("AC-85: the composition root has no switch: no branch, and it hands the environment over", async () => {
  const root = await compositionRoot();

  expect(root).not.toMatch(/\b(if|switch|else)\b|\?\?|\|\||&&|\?\s|Bun\.env|import\(/);
  expect(root.match(/process\.env\S*/g)).toEqual(["process.env,"]);
  expect(root).toContain("env: process.env,");
  expect(root.match(/process\.argv/g)).toEqual(["process.argv"]);
  expect(root).toContain("app.exec(process.argv.slice(2))");
});

test("AC-85: the real Human Channel takes no options", () => {
  expect(createLocalHumanChannel.length).toBe(0);
});

test("AC-85: only the composition root creates a Human Channel", async () => {
  const creators = (await sources())
    .filter(({ text }) => /createLocalHumanChannel\(\)/.test(text))
    .filter(({ path }) => path !== "approvals/local-channel.ts")
    .map(({ path }) => path);

  expect(creators).toEqual(["main.ts"]);
});

test("AC-85: only the local channel implements a Human Channel in shipped code", async () => {
  const implementers = (await sources())
    .filter(({ text }) => /:\s*HumanChannel\b(?!\s*;)|implements\s+HumanChannel\b/.test(text))
    .map(({ path }) => path);

  expect(implementers).toEqual(["approvals/local-channel.ts"]);
});

test("AC-85: shipped code never imports from the test suite", async () => {
  const importers = (await sources())
    .filter(({ text }) => /from\s+["'][^"']*tests?\//.test(text))
    .map(({ path }) => path);

  expect(importers).toEqual([]);
});

test("AC-85: the Human Channel reads one environment variable, the Worker marker", async () => {
  const channel = (await sources()).filter(({ path }) => path.startsWith("approvals/"));
  const reads = channel.flatMap(({ text }) => text.match(/process\.env[^\s;)]*|Bun\.env[^\s;)]*/g) ?? []);

  expect(reads).toEqual(["process.env[WORKER_MARKER]"]);
});

test("AC-85: the Human Channel reads no command-line arguments", async () => {
  const channel = (await sources()).filter(({ path }) => path.startsWith("approvals/"));

  expect(channel.filter(({ text }) => /process\.argv|Bun\.argv/.test(text))).toEqual([]);
});

test("AC-85: shipped code names only the FOREMAN_ variables the spec defines", async () => {
  const defined = /^FOREMAN_(WORKER|WORKSPACE|RUN_ID|TASK_ID|GITHUB_TOKEN|WORKTREE_[A-Z0-9_]*)$/;

  const named = (await sources()).flatMap(({ text }) => text.match(/FOREMAN_[A-Z0-9_]*/g) ?? []);

  expect(named.filter((name) => !defined.test(name))).toEqual([]);
});

test(
  "AC-85: the built CLI contains the real channel and no test one",
  async () => {
    const bundle = await Bun.file(await builtCliPath()).text();

    expect(bundle).toContain("createLocalHumanChannel");
    expect(bundle).not.toContain("createTestHumanChannel");
    expect(bundle).not.toContain("test channel");
  },
  buildTimeoutMs,
);
