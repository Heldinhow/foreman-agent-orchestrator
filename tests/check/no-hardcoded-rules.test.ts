import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findHardcodedRules } from "../helpers/hardcoded-rules.ts";
import { repoRoot } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { writeFileWithParents } from "../helpers/workspace.ts";

const FIXTURES = join(repoRoot, "tests", "fixtures", "hardcoded-rules");

test("AC-87: source code holds no deny glob, credential name, secret pattern or default Mode", async () => {
  expect(await findHardcodedRules(join(repoRoot, "src"))).toEqual([]);
});

test.each([
  ["deny-glob.ts", "deny glob", [".env", ".pem"]],
  ["deny-regex.ts", "deny glob", [".env", ".key"]],
  ["credential-name.ts", "credential name", ["GITHUB_TOKEN", "SSH_AUTH_SOCK"]],
  ["secret-pattern.ts", "secret pattern", ["-----BEGIN", "ghp_"]],
  ["default-mode.ts", "default Mode", ['"propose"']],
  ["schema-default.ts", "schema default", [".default("]],
] as const)("the static test fails against a planted rule in %s", async (file, kind, matches) => {
  const findings = await findHardcodedRules(join(FIXTURES, "planted"));

  const found = findings.filter((finding) => finding.file === file && finding.kind === kind);
  expect(found.map((finding) => finding.match)).toEqual(expect.arrayContaining([...matches]));
});

test("a glob only the defaults file names is found too, so a new deny rule is covered at once", async () => {
  const root = await makeTempDir();
  const defaultsFile = join(root, "defaults.yaml");
  await writeFile(
    defaultsFile,
    "policies: { guard: { rules: { deny-vault: { match: { paths: ['*.vaultfile'] }, except: ['open.vaultdoc'] } } } }\n",
  );
  await writeFileWithParents(
    join(root, "src", "planted.ts"),
    'export const denied = [path.endsWith(".vaultfile"), "open.vaultdoc"];\n',
  );

  const findings = await findHardcodedRules(join(root, "src"), defaultsFile);

  expect(findings).toEqual([
    { file: "planted.ts", kind: "deny glob", match: ".vaultfile" },
    { file: "planted.ts", kind: "deny glob", match: "open.vaultdoc" },
  ]);
});

test("code that reads Policy and names no rule isn't flagged", async () => {
  expect(await findHardcodedRules(join(FIXTURES, "mechanism"))).toEqual([]);
});

test("AC-41: the Check Engine's own code reads nothing but its arguments", async () => {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const code = transpiler.transformSync(await Bun.file(join(repoRoot, "src", "check", "engine.ts")).text());

  expect(code).not.toMatch(/\b(?:process|Bun|fetch|globalThis|Date|Math)\b|\brequire\(|["']node:/);
});
