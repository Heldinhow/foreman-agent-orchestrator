import { expect, test } from "bun:test";
import { evaluate } from "../../src/check/engine.ts";
import { comparePolicies } from "../../src/policy/classification.ts";
import type { Checkpoint } from "../../src/policy/checkpoints.ts";
import { layerWithRules, policySnapshot } from "../helpers/policy.ts";

const FILE_CHECKPOINTS: Checkpoint[] = ["worktree.copy", "worktree.tracked", "scan.read", "adapter.render", "diff.path"];

test("AC-45: .env.example stays available at every file checkpoint, and .env stays denied", async () => {
  const snapshot = await policySnapshot();

  for (const checkpoint of FILE_CHECKPOINTS) {
    for (const path of [".env.example", ".env.sample", ".env.template"]) {
      expect(evaluate(checkpoint, { path }, snapshot).effect).toBe("allow");
    }
    expect(evaluate(checkpoint, { path: ".env" }, snapshot).effect).toBe("deny");
    expect(evaluate(checkpoint, { path: ".env.local" }, snapshot).effect).toBe("deny");
  }
});

test("AC-45: .env is allowed only by a Policy edit that is classified as a Relaxation, which needs confirming", async () => {
  const shipped = await policySnapshot();
  const edited = await policySnapshot({ override: layerWithRules({ "deny-secret-files": "{ enabled: false }" }) });

  expect(evaluate("worktree.copy", { path: ".env" }, edited).effect).toBe("allow");
  const differences = comparePolicies(shipped.policy, edited.policy);
  expect(differences.map((difference) => difference.effect)).toContain("relaxation");
  expect(differences.every((difference) => difference.effect !== "tightening")).toBe(true);
});
