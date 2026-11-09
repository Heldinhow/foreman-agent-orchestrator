import { findWorkspace } from "../../config/workspace-location.ts";
import { loadPolicySet, userOverrideFile, type PolicySet } from "../../policy/policy-set.ts";
import type { AppDeps } from "../app.ts";

/** Finds the Workspace and loads its Policy Set, which throws if any of it is invalid. */
export function policySetFor(dir: string | undefined, deps: AppDeps): { set: PolicySet; overrideFile: string } {
  const overrideFile = userOverrideFile(deps.env);
  const workspaceDir = findWorkspace({ dir, env: deps.env, cwd: deps.cwd });
  return {
    set: loadPolicySet({ defaultsFile: deps.policyDefaultsFile, workspaceDir, overrideFile }),
    overrideFile,
  };
}
