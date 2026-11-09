import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createBareRepo, createTempRepo } from "./git.ts";
import { makeTempDir } from "./temp.ts";

test("each temp directory is new and exists during the test", async () => {
  const first = await makeTempDir();
  const second = await makeTempDir();

  expect(first).not.toBe(second);
  expect(existsSync(first)).toBe(true);
  expect(existsSync(second)).toBe(true);
});

let dirFromEarlierTest: string | undefined;

test("a temp directory is created", async () => {
  dirFromEarlierTest = await makeTempDir();
  expect(existsSync(dirFromEarlierTest)).toBe(true);
});

test("a temp directory is removed once its test ends", () => {
  expect(dirFromEarlierTest).toBeDefined();
  expect(existsSync(dirFromEarlierTest!)).toBe(false);
});

test("a temp repository can commit and push to the bare repository", async () => {
  const bare = await createBareRepo();
  const repo = await createTempRepo();

  const sha = await repo.commitFile("README.md", "hello\n", "first commit");
  await repo.git("remote", "add", "origin", bare.path);
  await repo.git("push", "origin", "main");

  expect(await bare.git("rev-parse", "refs/heads/main")).toBe(sha);
  expect(await bare.git("show", "main:README.md")).toBe("hello");
});

test("a temp repository commits with a placeholder identity, not the machine's", async () => {
  const repo = await createTempRepo();

  await repo.commitFile("a.txt", "a\n", "commit");

  expect(await repo.git("log", "-1", "--format=%an <%ae> / %cn <%ce>")).toBe(
    "Test Author <author@example.invalid> / Test Author <author@example.invalid>",
  );
});

test("a failing git command rejects with git's error output", async () => {
  const repo = await createTempRepo();

  await expect(repo.git("rev-parse", "refs/heads/does-not-exist")).rejects.toThrow("does-not-exist");
});
