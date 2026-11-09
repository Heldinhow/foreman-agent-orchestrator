import { join } from "node:path";
import { stringify } from "yaml";
import type { GuardPolicy, WorkerSpec } from "../../src/adapters/contract.ts";
import { loadPolicySet } from "../../src/policy/policy-set.ts";
import { SCENARIO_FILE, type FakeScenario } from "../fixtures/adapters/fake/adapter.ts";
import { repoRoot, hermeticEnv } from "./process.ts";
import { makeTempDir } from "./temp.ts";
import { writeFileWithParents } from "./workspace.ts";

/** The module path that a Workspace's Policy names to use the fake Adapter. */
export const FAKE_ADAPTER_MODULE = join(repoRoot, "tests", "fixtures", "adapters", "fake", "adapter.ts");

/** Writes the fake Adapter's scenario into a Workspace. */
export async function writeFakeScenario(workspaceDir: string, scenario: FakeScenario): Promise<void> {
  await writeFileWithParents(join(workspaceDir, SCENARIO_FILE), stringify(scenario));
}

/** The shipped Guard Policy, as a real caller hands it to an Adapter. */
export async function shippedGuardPolicy(): Promise<GuardPolicy> {
  const workspaceDir = await makeTempDir();
  await writeFileWithParents(join(workspaceDir, "foreman", "foreman.yaml"), "schemaVersion: 1\n");
  const set = loadPolicySet({
    defaultsFile: join(repoRoot, "policy", "defaults.yaml"),
    workspaceDir,
    overrideFile: join(workspaceDir, "no-override.yaml"),
  });
  return set.effective().policy.policies.guard;
}

/** A spec for a fake Worker, with a built environment holding only what a test gave it. */
export async function fakeWorkerSpec(cwd: string, overrides: Partial<WorkerSpec> = {}): Promise<WorkerSpec> {
  return {
    cwd,
    prompt: "work",
    env: hermeticEnv(await makeTempDir()),
    policy: await shippedGuardPolicy(),
    readOnly: false,
    ...overrides,
  };
}
