import { join } from "node:path";
import { loadPolicySet } from "../../src/policy/policy-set.ts";
import { repoRoot } from "./process.ts";
import { createWorkspace, type WorkspaceFixture } from "./workspace.ts";

/** The effective Policy of a temp Workspace, read through the real Policy path. */
export async function policySnapshot(fixture: WorkspaceFixture = {}, project?: string) {
  const workspace = await createWorkspace(fixture);
  return loadPolicySet({
    defaultsFile: join(repoRoot, "policy", "defaults.yaml"),
    workspaceDir: workspace.dir,
    overrideFile: workspace.overrideFile,
  }).effective(project);
}

/** A Workspace layer holding only the given guard rules, written as YAML flow maps. */
export function layerWithRules(rules: Record<string, string>): string {
  const lines = Object.entries(rules).map(([id, rule]) => `      ${id}: ${rule}`);
  return ["schemaVersion: 1", "policies:", "  guard:", "    rules:", ...lines, ""].join("\n");
}
