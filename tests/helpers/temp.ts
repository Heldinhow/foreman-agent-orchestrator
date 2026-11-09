import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const created: string[] = [];

/** A fresh directory for the current test, removed when the test ends. */
export async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "foreman-test-"));
  created.push(dir);
  return dir;
}

/** Runs after every test, from the preload in `setup.ts`. */
export async function removeTempDirs(): Promise<void> {
  const dirs = created.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
}
