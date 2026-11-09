import { expect, test } from "bun:test";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "./helpers/git.ts";
import { repoRoot } from "./helpers/process.ts";

test("LICENSE is MIT with the required copyright", async () => {
  const license = await Bun.file(join(repoRoot, "LICENSE")).text();

  expect(license).toStartWith("MIT License");
  expect(license).toMatch(/^Copyright \(c\) \d{4} Foreman contributors$/m);
  expect(license).toContain("Permission is hereby granted, free of charge");
});

async function isIgnored(repo: TempRepo, path: string) {
  const result = await repo.tryGit("check-ignore", "--no-index", path);
  return result.exitCode === 0;
}

test.each([
  "foreman/foreman.yaml",
  "foreman/workspace.yaml",
  "config/foreman.yaml",
  "memory/ledger.jsonl",
  ".env",
  ".env.local",
  "dist/main.js",
  "node_modules/typescript/package.json",
])(".gitignore covers %s", async (path) => {
  const repo = await createTempRepo();
  await cp(join(repoRoot, ".gitignore"), join(repo.path, ".gitignore"));

  expect(await isIgnored(repo, path)).toBe(true);
});

test.each([
  ".env.example",
  "config/foreman.example.yaml",
  "config/workspace.example.yaml",
  "config/lessons.example.jsonl",
  "policy/defaults.yaml",
  "src/main.ts",
  "bun.lock",
])(".gitignore leaves %s committable", async (path) => {
  const repo = await createTempRepo();
  await cp(join(repoRoot, ".gitignore"), join(repo.path, ".gitignore"));

  expect(await isIgnored(repo, path)).toBe(false);
});
