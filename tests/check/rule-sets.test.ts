import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { CHECKPOINTS } from "../../src/policy/checkpoints.ts";
import { createTestApp } from "../helpers/app.ts";
import { layerWithRules } from "../helpers/policy.ts";
import { repoRoot } from "../helpers/process.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { createWorkspace, foremanIn } from "../helpers/workspace.ts";

const RULES_KEY = "policies.guard.rules";

async function validateWith(fixture: Parameters<typeof createWorkspace>[0]) {
  const workspace = await createWorkspace(fixture);
  return { workspace, ...(await foremanIn(workspace, "validate")) };
}

async function shippedDefaults() {
  return parse(await Bun.file(join(repoRoot, "policy", "defaults.yaml")).text());
}

/** Runs `validate` with the given text as the built-in layer. */
async function validateWithDefaults(text: string) {
  const defaultsFile = join(await makeTempDir(), "defaults.yaml");
  await writeFile(defaultsFile, text);
  const workspace = await createWorkspace();
  const { app, terminal } = createTestApp({ env: workspace.env, cwd: workspace.dir, policyDefaultsFile: defaultsFile });
  return { defaultsFile, exitCode: await app.exec(["validate"]), stderr: terminal.stderr };
}

test.each(CHECKPOINTS)("the shipped defaults hold a rule set for %s", async (checkpoint) => {
  const defaults = await shippedDefaults();
  const rules: Record<string, { checkpoints: string[] }> = defaults.policies.guard.rules;
  for (const [id, rule] of Object.entries(rules)) {
    rule.checkpoints = rule.checkpoints.filter((name) => name !== checkpoint);
    if (rule.checkpoints.length === 0) delete rules[id];
  }

  const { defaultsFile, exitCode, stderr } = await validateWithDefaults(stringify(defaults));

  expect(exitCode).toBe(2);
  expect(stderr).toContain(`${defaultsFile}: ${RULES_KEY}: ${checkpoint} has no rule set`);
});

test("rules with conditions alone aren't a rule set, as they leave a decision implied", async () => {
  const defaults = await shippedDefaults();
  defaults.policies.guard.rules["deny-close-without-evidence"].match = { facts: { evidence: "missing" } };

  const { exitCode, stderr } = await validateWithDefaults(stringify(defaults));

  expect(exitCode).toBe(2);
  expect(stderr).toContain("task.close has no rule set");
});

test("a Workspace layer can't disable the only rule set of a checkpoint", async () => {
  const { workspace, exitCode, stderr } = await validateWith({
    workspace: layerWithRules({ "require-approval-merge": "{ enabled: false }" }),
  });

  expect(exitCode).toBe(2);
  expect(stderr).toContain(join(workspace.dir, "foreman", "foreman.yaml"));
  expect(stderr).toContain("outbound.merge has no rule set");
});

test("a user override can't move a checkpoint's only rule set away", async () => {
  const { exitCode, stderr } = await validateWith({
    override: layerWithRules({ "require-approval-deploy": "{ checkpoints: [outbound.merge] }" }),
  });

  expect(exitCode).toBe(2);
  expect(stderr).toContain("outbound.deploy has no rule set");
});

test("a layer can replace a rule set with its own, which is valid", async () => {
  const { exitCode, stderr } = await validateWith({
    workspace: layerWithRules({
      "require-approval-merge": "{ enabled: false }",
      "deny-merge": "{ checkpoints: [outbound.merge], effect: deny }",
    }),
  });

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test.each([
  [
    "a misspelled checkpoint",
    "{ checkpoints: [outbound.psuh], effect: deny }",
    `${RULES_KEY}.bad-rule.checkpoints[0]`,
    "Invalid option",
  ],
  [
    "a fact its checkpoint doesn't have",
    "{ checkpoints: [task.close], match: { facts: { evidance: missing } }, effect: deny }",
    `${RULES_KEY}.bad-rule.match.facts.evidance`,
    'task.close has no fact "evidance"',
  ],
  [
    "paths at a checkpoint with no path",
    "{ checkpoints: [outbound.push], match: { paths: ['*.md'] }, effect: deny }",
    `${RULES_KEY}.bad-rule.match.paths`,
    "outbound.push has no path to match",
  ],
  [
    "an except at a checkpoint with no path",
    "{ checkpoints: [outbound.push], except: ['*.md'], effect: deny }",
    `${RULES_KEY}.bad-rule.except`,
    "outbound.push has no path to match",
  ],
  [
    "brace syntax that would match nothing",
    "{ checkpoints: [diff.path], match: { paths: ['*.{pem,key}'] }, effect: deny }",
    `${RULES_KEY}.bad-rule.match.paths[0]`,
    "only *, ** and ? are wildcards",
  ],
  [
    "a character class that would match nothing",
    "{ checkpoints: [diff.path], match: { paths: ['id_[rd]sa'] }, effect: deny }",
    `${RULES_KEY}.bad-rule.match.paths[0]`,
    "only *, ** and ? are wildcards",
  ],
  [
    "a negated pattern",
    "{ checkpoints: [diff.path], match: { paths: ['*.pem'] }, except: ['!a.pem'], effect: deny }",
    `${RULES_KEY}.bad-rule.except[0]`,
    "only *, ** and ? are wildcards",
  ],
  [
    "a pattern no normalized path can reach",
    "{ checkpoints: [diff.path], match: { paths: ['./.env'] }, effect: deny }",
    `${RULES_KEY}.bad-rule.match.paths[0]`,
    "a pattern can't have an empty, . or .. segment",
  ],
])("a rule with %s is invalid Policy, so it can't silently do nothing", async (_title, rule, key, reason) => {
  const { exitCode, stderr } = await validateWith({ workspace: layerWithRules({ "bad-rule": rule }) });

  expect(exitCode).toBe(2);
  expect(stderr).toContain(`${key}: ${reason}`);
});

test("a missing policy/defaults.yaml stops Foreman with a clear error", async () => {
  const defaultsFile = join(await makeTempDir(), "defaults.yaml");
  const workspace = await createWorkspace();
  const { app, terminal } = createTestApp({ env: workspace.env, cwd: workspace.dir, policyDefaultsFile: defaultsFile });

  expect(await app.exec(["validate"])).toBe(2);
  expect(terminal.stderr).toContain(`${defaultsFile}: missing: Foreman can't run without its built-in Policy`);
});

test.each([
  ["isn't YAML", "policies: [", "invalid yaml"],
  ["has an unknown key", "schemaVersion: 1\nnope: 1\n", "nope: unknown key"],
  ["is incomplete", "schemaVersion: 1\n", "policies: required key is missing"],
])("a policy/defaults.yaml that %s stops Foreman with a clear error", async (_title, text, reason) => {
  const { defaultsFile, exitCode, stderr } = await validateWithDefaults(text);

  expect(exitCode).toBe(2);
  expect(stderr).toContain(defaultsFile);
  expect(stderr.toLowerCase()).toContain(reason);
});
