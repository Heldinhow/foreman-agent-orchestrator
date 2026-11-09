import { expect, test } from "bun:test";
import { join } from "node:path";
import { createWorkspace, foremanIn, writeFileWithParents } from "../helpers/workspace.ts";

const PROJECT = "catalog-api";
const RELAXING = "schemaVersion: 1\napprovals: { acceptAgentMessages: true }\n";

/** Correctly formatted policy files in every place a Project might try to supply one. */
async function plantPolicyFiles(repository: string) {
  for (const path of [
    ["foreman", "foreman.yaml"],
    ["foreman", "projects", `${PROJECT}.yaml`],
    ["foreman", "override.yaml"],
    ["policy", "defaults.yaml"],
    [".foreman.yaml"],
    [".foreman", "foreman.yaml"],
    [".config", "foreman", "override.yaml"],
  ]) {
    await writeFileWithParents(join(repository, ...path), RELAXING);
  }
}

function acceptAgentMessages(result: { stdout: string }) {
  return result.stdout.includes("approvals.acceptAgentMessages = true");
}

const EXPLAIN = ["policy", "show", "--explain", "approvals.acceptAgentMessages", "--project", PROJECT];

test("a policy file in a Project next to the Workspace is ignored", async () => {
  const workspace = await createWorkspace();
  const repository = join(workspace.root, PROJECT);
  await plantPolicyFiles(repository);
  await writeFileWithParents(
    join(workspace.dir, "foreman", "workspace.yaml"),
    `schemaVersion: 1\nprojects:\n  ${PROJECT}: { path: ../${PROJECT} }\n`,
  );

  const result = await foremanIn(workspace, ...EXPLAIN, "--dir", workspace.dir);

  expect(result.exitCode).toBe(0);
  expect(acceptAgentMessages(result)).toBe(false);
  expect(result.stdout).toContain("set by: built-in");
});

test("a policy file in a Project inside the Workspace can't capture a command run from that Project", async () => {
  const workspace = await createWorkspace();
  const repository = join(workspace.dir, "repos", PROJECT);
  await plantPolicyFiles(repository);
  await writeFileWithParents(
    join(workspace.dir, "foreman", "workspace.yaml"),
    `schemaVersion: 1\nprojects:\n  ${PROJECT}: { path: repos/${PROJECT} }\n`,
  );
  const insideProject = join(repository, "src");
  await writeFileWithParents(join(insideProject, "index.ts"), "");

  const result = await foremanIn({ dir: insideProject, env: workspace.env }, ...EXPLAIN);

  expect(result.exitCode).toBe(0);
  expect(acceptAgentMessages(result)).toBe(false);
  expect(result.stdout).toContain("set by: built-in");
});

test("the same content in a real layer does apply, so the tests above prove something", async () => {
  const workspace = await createWorkspace({ override: RELAXING });

  const result = await foremanIn(workspace, ...EXPLAIN);

  expect(acceptAgentMessages(result)).toBe(true);
});
