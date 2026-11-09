import { expect, test } from "bun:test";
import { parse } from "yaml";
import { createWorkspace, foremanIn } from "../helpers/workspace.ts";

async function shippedPolicy() {
  const workspace = await createWorkspace();
  const { exitCode, stdout, stderr } = await foremanIn(workspace, "policy", "show", "--effective");
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return parse(stdout);
}

type Rule = { checkpoints: string[]; effect: string; match?: { paths?: string[] }; except?: string[]; enabled?: boolean };

function rulesAt(policy: { policies: { guard: { rules: Record<string, Rule> } } }, checkpoint: string) {
  return Object.values(policy.policies.guard.rules).filter(
    (rule) => rule.checkpoints.includes(checkpoint) && rule.enabled !== false,
  );
}

test("the shipped defaults are valid by themselves", async () => {
  const workspace = await createWorkspace();

  expect((await foremanIn(workspace, "validate")).exitCode).toBe(0);
});

test("the shipped defaults hold Propose Mode for every repository", async () => {
  const policy = await shippedPolicy();

  expect(policy.policies.repositoryDefaults).toEqual({ mode: "propose", allow: [] });
  expect(policy.policies.repositories).toEqual({});
});

test.each(["push", "pr", "draft-pr", "merge", "deploy"])(
  "the shipped defaults require an Approval before %s",
  async (kind) => {
    const rules = rulesAt(await shippedPolicy(), `outbound.${kind}`);

    expect(rules.map((rule) => rule.effect)).toEqual(["require-approval"]);
  },
);

test("the shipped defaults deny .env and except .env.example", async () => {
  const policy = await shippedPolicy();
  const rule = policy.policies.guard.rules["deny-secret-files"];

  expect(rule.effect).toBe("deny");
  expect(rule.match.paths).toEqual(
    expect.arrayContaining([".env", ".env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", ".netrc", ".npmrc", ".pypirc", "memory/"]),
  );
  expect(rule.except).toEqual([".env.example", ".env.sample", ".env.template"]);
  expect(rule.checkpoints).toEqual(["worktree.copy", "worktree.tracked", "scan.read", "adapter.render", "diff.path"]);
});

test("the shipped defaults need Evidence to close a Task", async () => {
  const policy = await shippedPolicy();

  expect(rulesAt(policy, "task.close").map((rule) => rule.effect)).toEqual(["deny"]);
  const implement = policy.pipeline.steps.find((step: { id: string }) => step.id === "implement");
  expect(implement.gates).toContainEqual({ type: "evidence" });
});

test("the shipped defaults don't count agent messages as Approval", async () => {
  expect((await shippedPolicy()).approvals.acceptAgentMessages).toBe(false);
});

test("the shipped Pipeline is the spec's, in order", async () => {
  const { pipeline } = await shippedPolicy();

  expect(pipeline.steps.map((step: { id: string }) => step.id)).toEqual([
    "grill",
    "spec",
    "tickets",
    "implement",
    "review",
    "retro",
  ]);
  expect(pipeline.completion).toEqual([{ type: "integration" }, { type: "outbound", actions: ["push", "draft-pr"] }]);
});

test("the spec's example foreman.yaml is a valid Workspace layer", async () => {
  const workspace = await createWorkspace({
    workspace: `
schemaVersion: 1
locale: en
adapters:
  opencode:
    type: opencode
    allowUnenforced: false
    env: { passthrough: [EXAMPLE_PROVIDER_API_KEY] }
models:
  default: { adapter: opencode, model: "provider/model#variant", fallbacks: [] }
  steps: { implement: { model: "provider/model" } }
  roles: { reviewer: { model: "provider/model" } }
  overrides: [{ step: review, role: reviewer, model: "provider/model" }]
roles:
  backend:
    adapter: opencode
    prompts: [role-backend]
    tools: [read, edit, bash]
    projects: [catalog-api, orders-api]
    paths: { allow: ["**"], forbid: ["infra/**"] }
policies:
  guard:
    rules:
      deny-secret-files: { except: [".env.example", "tests/fixtures/*.pem"] }
  sandbox: none
  repositories:
    catalog-api: { mode: propose }
    orders-api: { mode: autonomous, allow: [push, draft-pr] }
approvals:
  ownerAlias: operator
  expiryHours: 24
  github:
    enabled: false
    allowlist: [{ alias: approver-1, login: example-human-login, policyOwner: false }]
remote: { type: github, apiBaseUrl: "https://api.github.com" }
polling: { enabled: false, intervalSeconds: 300 }
lessons: { topK: 5, tokenCap: 1500, minOccurrences: 2 }
router: { answerFromDecisions: false, decisionFiles: [] }
limits: { maxActiveWorkers: 3, maxRounds: 3, workerTimeoutMinutes: 60 }
`,
  });

  const { exitCode, stderr } = await foremanIn(workspace, "validate");

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
