import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../helpers/process.ts";

test("the shipped source has no built-in fake Adapter and doesn't import test fixtures", () => {
  const files = readdirSync(join(repoRoot, "src"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));

  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    expect(file).not.toMatch(/fake/i);
    expect(readFileSync(file, "utf8")).not.toMatch(/fixtures\/|fake adapter/i);
  }
});
