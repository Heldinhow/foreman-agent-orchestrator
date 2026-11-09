import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { comparePolicySets, deviationReport } from "../../src/policy/deviations.ts";
import { loadPolicySet, userOverrideFile } from "../../src/policy/policy-set.ts";
import { createWorkspace, foremanIn, type WorkspaceFixture } from "../helpers/workspace.ts";

const DEFAULTS = join(import.meta.dir, "..", "..", "policy", "defaults.yaml");
const PROJECT = "catalog-api";

const layer = (body: string) => `schemaVersion: 1\n${body}\n`;
const SANDBOX_ON = layer("policies: { sandbox: bwrap }");
const AGENT_MESSAGES = layer("approvals: { acceptAgentMessages: true }");
const AUTONOMOUS = layer("policies: { repositoryDefaults: { mode: autonomous } }");
const PROPOSE = layer("policies: { repositoryDefaults: { mode: propose } }");

async function policySet(fixture: WorkspaceFixture) {
  const workspace = await createWorkspace(fixture);
  return loadPolicySet({
    defaultsFile: DEFAULTS,
    workspaceDir: workspace.dir,
    overrideFile: userOverrideFile(workspace.env),
  });
}

/** Every difference between two Policy Sets, as `[project, key, effect]`. */
async function changes(before: WorkspaceFixture, after: WorkspaceFixture) {
  const scopes = comparePolicySets(await policySet(before), await policySet(after));
  return scopes.flatMap(({ project, differences }) =>
    differences.map(({ key, effect }) => [project ?? null, key, effect]),
  );
}

describe("classification compares the merged result of the Policy Layers (AC-94)", () => {
  test("a Relaxation in the user override is caught through the merged result", async () => {
    expect(await changes({}, { override: AGENT_MESSAGES })).toEqual([
      [null, "approvals.acceptAgentMessages", "relaxation"],
    ]);
  });

  test("a Relaxation in a Project layer is caught for that Project alone", async () => {
    expect(await changes({}, { projects: { [PROJECT]: AUTONOMOUS } })).toEqual([
      [PROJECT, "policies.repositoryDefaults.mode", "relaxation"],
    ]);
  });

  test("a Relaxation in the Workspace layer is reported once, not again for each Project", async () => {
    const before = { projects: { [PROJECT]: layer("limits: { maxRounds: 3 }") } };
    const after = { ...before, workspace: AGENT_MESSAGES };

    expect(await changes(before, after)).toEqual([[null, "approvals.acceptAgentMessages", "relaxation"]]);
  });

  test("a higher layer can't hide a Relaxation behind a tightening below it", async () => {
    const before = { workspace: layer("approvals: { expiryHours: 12 }") };
    const after = { workspace: layer("approvals: { expiryHours: 6 }"), override: layer("approvals: { expiryHours: 72 }") };

    expect(await changes(before, after)).toEqual([[null, "approvals.expiryHours", "relaxation"]]);
  });

  test.each([
    ["the Workspace layer to the user override", { workspace: AUTONOMOUS }, { override: AUTONOMOUS }],
    ["the user override to the Workspace layer", { override: AUTONOMOUS }, { workspace: AUTONOMOUS }],
    [
      "the Project layer to the user override",
      { projects: { [PROJECT]: AUTONOMOUS }, override: AUTONOMOUS },
      { projects: { [PROJECT]: layer("limits: { maxRounds: 3 }") }, override: AUTONOMOUS },
    ],
  ])("moving a value from %s, with no change to the result, isn't a change", async (_name, before, after) => {
    expect(await changes(before, after)).toEqual([]);
  });

  test("a Project layer undoing a Workspace Relaxation is a tightening for that Project", async () => {
    const before = { workspace: AUTONOMOUS, projects: { [PROJECT]: layer("limits: { maxRounds: 3 }") } };
    const after = { workspace: AUTONOMOUS, projects: { [PROJECT]: PROPOSE } };

    expect(await changes(before, after)).toEqual([
      [PROJECT, "policies.repositoryDefaults.mode", "tightening"],
    ]);
  });

  test("a Project layer that appears only on one side is compared with the general merge", async () => {
    expect(await changes({ projects: { [PROJECT]: AUTONOMOUS } }, {})).toEqual([
      [PROJECT, "policies.repositoryDefaults.mode", "tightening"],
    ]);
  });
});

describe("the deviations report", () => {
  test("names the layer of each difference, and a neutral value isn't a Safety Default", async () => {
    const set = await policySet({
      workspace: layer("locale: pt-BR\nlimits: { maxRounds: 9 }\npolicies: { sandbox: bwrap }"),
      override: AGENT_MESSAGES,
    });

    const [general, ...others] = deviationReport(set);

    expect(others).toEqual([]);
    expect(general?.project).toBeUndefined();
    expect(general?.deviations.map(({ key, effect, setBy }) => [key, effect, setBy.name])).toEqual([
      ["approvals.acceptAgentMessages", "relaxation", "user override"],
      ["policies.sandbox", "tightening", "Workspace"],
    ]);
  });
});

describe("foreman policy show --deviations (AC-95)", () => {
  test("says so when nothing differs from the Safety Defaults", async () => {
    const workspace = await createWorkspace();

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("No differences from the Safety Defaults.\n");
    expect(result.exitCode).toBe(0);
  });

  test("lists a Relaxation and a tightening, with before, after and the layer that set each", async () => {
    const workspace = await createWorkspace({ workspace: AUTONOMOUS, override: SANDBOX_ON });

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        `RELAXATION policies.repositoryDefaults.mode: "propose" -> "autonomous"`,
        `  set by: Workspace (${join(workspace.dir, "foreman", "foreman.yaml")})`,
        `tightening policies.sandbox: "none" -> "bwrap"`,
        `  set by: user override (${workspace.overrideFile})`,
        "",
      ].join("\n"),
    );
  });

  test("a value equal to the Safety Default is no difference, whichever layer states it", async () => {
    const workspace = await createWorkspace({ workspace: AUTONOMOUS, override: PROPOSE });

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stdout).toBe("No differences from the Safety Defaults.\n");
  });

  test("a Relaxation that only a Project layer holds is listed under that Project", async () => {
    const workspace = await createWorkspace({ projects: { [PROJECT]: AUTONOMOUS } });

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stdout).toBe(
      [
        `# Project ${PROJECT}`,
        `RELAXATION policies.repositoryDefaults.mode: "propose" -> "autonomous"`,
        `  set by: Project (${join(workspace.dir, "foreman", "projects", `${PROJECT}.yaml`)})`,
        "",
      ].join("\n"),
    );
  });

  test("Workspace-wide differences come first, and a Project lists only what it adds", async () => {
    const workspace = await createWorkspace({
      workspace: AGENT_MESSAGES,
      projects: { [PROJECT]: AUTONOMOUS, "orders-api": layer("limits: { maxRounds: 3 }") },
    });

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stdout).toBe(
      [
        "# All Projects",
        "RELAXATION approvals.acceptAgentMessages: false -> true",
        `  set by: Workspace (${join(workspace.dir, "foreman", "foreman.yaml")})`,
        `# Project ${PROJECT}`,
        `RELAXATION policies.repositoryDefaults.mode: "propose" -> "autonomous"`,
        `  set by: Project (${join(workspace.dir, "foreman", "projects", `${PROJECT}.yaml`)})`,
        "",
      ].join("\n"),
    );
  });

  test("--project shows that Project's whole merged result, with no heading", async () => {
    const workspace = await createWorkspace({
      workspace: AGENT_MESSAGES,
      projects: { [PROJECT]: AUTONOMOUS },
    });

    const result = await foremanIn(workspace, "policy", "show", "--deviations", "--project", PROJECT);

    expect(result.stdout).toBe(
      [
        "RELAXATION approvals.acceptAgentMessages: false -> true",
        `  set by: Workspace (${join(workspace.dir, "foreman", "foreman.yaml")})`,
        `RELAXATION policies.repositoryDefaults.mode: "propose" -> "autonomous"`,
        `  set by: Project (${join(workspace.dir, "foreman", "projects", `${PROJECT}.yaml`)})`,
        "",
      ].join("\n"),
    );
  });

  test("a difference inside a replaced list is attributed to the layer that replaced the list", async () => {
    const workspace = await createWorkspace({
      override: layer(`pipeline:
  steps:
    - { id: spec, scope: run, access: read-only, prompt: spec, produces: spec }
    - { id: tickets, scope: run, access: read-only, prompt: tickets, produces: tasks }
    - { id: implement, scope: task, access: write, prompt: implement, gates: [{ type: evidence }, { type: diff-check }] }
    - { id: review, scope: task, access: read-only, prompt: review, role: reviewer, gates: [{ type: review-verdict }] }
    - { id: retro, scope: run, access: read-only, prompt: retro, phase: after-completion }`),
    });

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        `RELAXATION pipeline.steps.tickets.gates: [{"type":"human"}] -> (absent)`,
        `  set by: user override (${workspace.overrideFile})`,
        "",
      ].join("\n"),
    );
  });

  test("a disabled Safety Default is attributed to the layer that disabled it, not a later edit", async () => {
    const workspace = await createWorkspace({
      workspace: layer("policies: { guard: { rules: { deny-secret-files: { enabled: false } } } }"),
      override: layer("policies: { guard: { rules: { deny-secret-files: { except: [.env.local] } } } }"),
    });

    const result = await foremanIn(workspace, "policy", "show", "--deviations");

    expect(result.stdout).toBe(
      [
        "RELAXATION policies.guard.rules.deny-secret-files.enabled: (absent) -> false",
        `  set by: Workspace (${join(workspace.dir, "foreman", "foreman.yaml")})`,
        "",
      ].join("\n"),
    );
  });

  test.each([{ flags: ["--effective"] }, { flags: ["--explain", "locale"] }])(
    "refuses to combine with $flags, which would silently win",
    async ({ flags }) => {
      const workspace = await createWorkspace();

      const result = await foremanIn(workspace, "policy", "show", "--deviations", ...flags);

      expect(result.stderr).toContain("--deviations");
      expect(result.exitCode).toBe(2);
    },
  );
});

test("removing the outbound Gate shows as a Relaxation (AC-40)", async () => {
  const workspace = await createWorkspace({
    workspace: layer("pipeline: { completion: [{ type: integration }] }"),
  });

  const result = await foremanIn(workspace, "policy", "show", "--deviations");

  expect(result.stdout).toContain("RELAXATION pipeline.completion:");
});
