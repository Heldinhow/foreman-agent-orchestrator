import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createTestApp } from "../helpers/app.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { createWorkspace, foremanIn, writeFileWithParents, type WorkspaceFixture } from "../helpers/workspace.ts";

const PROJECT = "catalog-api";

type Fixture = Awaited<ReturnType<typeof createWorkspace>>;

const fileOf = {
  workspace: (fixture: Fixture) => join(fixture.dir, "foreman", "foreman.yaml"),
  project: (fixture: Fixture) => join(fixture.dir, "foreman", "projects", `${PROJECT}.yaml`),
  override: (fixture: Fixture) => fixture.overrideFile,
};

const placeIn: Record<keyof typeof fileOf, (text: string) => WorkspaceFixture> = {
  workspace: (text) => ({ workspace: text }),
  project: (text) => ({ projects: { [PROJECT]: text } }),
  override: (text) => ({ override: text }),
};

const invalidValues = [
  {
    kind: "an unknown key",
    text: "limits: { maxRoundz: 9 }",
    key: "limits.maxRoundz",
    reason: "unknown key",
  },
  {
    kind: "an unknown key at the top level",
    text: "safetyOff: true",
    key: "safetyOff",
    reason: "unknown key",
  },
  {
    kind: "a wrong type",
    text: 'limits: { maxRounds: "three" }',
    key: "limits.maxRounds",
    reason: "expected number, received string",
  },
  {
    kind: "a bad value in a named rule",
    text: "policies: { guard: { rules: { deny-secret-files: { effect: ignore } } } }",
    key: "policies.guard.rules.deny-secret-files.effect",
    reason: "Invalid option",
  },
  {
    kind: "a list where a map belongs",
    text: "limits: [1, 2]",
    key: "limits",
    reason: "expected object, received array",
  },
];

describe.each(Object.keys(fileOf) as (keyof typeof fileOf)[])("in the %s layer", (layer) => {
  test.each(invalidValues)("$kind names the file, key and reason", async ({ text, key, reason }) => {
    const workspace = await createWorkspace(placeIn[layer](`schemaVersion: 1\n${text}\n`));

    const { exitCode, stderr, stdout } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain(`${fileOf[layer](workspace)}: ${key}: `);
    expect(stderr).toContain(reason);
  });

  test("a missing schemaVersion is reported", async () => {
    const workspace = await createWorkspace(placeIn[layer]("limits: { maxRounds: 4 }\n"));

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${fileOf[layer](workspace)}: schemaVersion: `);
  });

  test("a schemaVersion Foreman doesn't know is reported", async () => {
    const workspace = await createWorkspace(placeIn[layer]("schemaVersion: 2\n"));

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${fileOf[layer](workspace)}: schemaVersion: `);
  });

  test("YAML that doesn't parse names the file", async () => {
    const workspace = await createWorkspace(placeIn[layer]("limits: {\n"));

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(fileOf[layer](workspace));
    expect(stderr).toContain("invalid YAML");
  });

  test("a document that isn't a map names the file", async () => {
    const workspace = await createWorkspace(placeIn[layer]("- not\n- a map\n"));

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${fileOf[layer](workspace)}: must be a YAML map`);
  });

  test("a __proto__ key is refused and pollutes nothing", async () => {
    const workspace = await createWorkspace(
      placeIn[layer]("schemaVersion: 1\nlimits: { __proto__: { polluted: true } }\n"),
    );

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain("__proto__");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("a YAML alias that refers to itself is refused without hanging", async () => {
    const workspace = await createWorkspace(placeIn[layer]("schemaVersion: 1\nroles: &self { loop: *self }\n"));

    const { exitCode } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
  });
});

test.each([
  {
    kind: "a Role naming an Adapter that doesn't exist",
    text: "roles: { backend: { adapter: ghost, tools: [read] } }",
    key: "roles.backend.adapter",
    reason: 'no Adapter named "ghost"',
  },
  {
    kind: "a Pipeline Step naming a Role that doesn't exist",
    text: [
      "pipeline:",
      "  steps:",
      "    - { id: tickets, scope: run, access: read-only, prompt: tickets, produces: tasks }",
      "    - { id: review, scope: task, access: read-only, prompt: review, role: ghost }",
    ].join("\n"),
    key: "pipeline.steps[1].role",
    reason: 'no Role named "ghost"',
  },
  {
    kind: "a Model Assignment for a Step that doesn't exist",
    text: 'models: { steps: { ghost: { model: "provider/model" } } }',
    key: "models.steps.ghost",
    reason: 'no Step named "ghost"',
  },
  {
    kind: "a Model Assignment for a Role that doesn't exist",
    text: 'models: { roles: { ghost: { model: "provider/model" } } }',
    key: "models.roles.ghost",
    reason: 'no Role named "ghost"',
  },
  {
    kind: "a default Model Assignment naming an Adapter that doesn't exist",
    text: 'models: { default: { adapter: ghost, model: "provider/model" } }',
    key: "models.default.adapter",
    reason: 'no Adapter named "ghost"',
  },
  {
    kind: "an override naming a Step that doesn't exist",
    text: 'models: { overrides: [{ step: ghost, role: reviewer, model: "provider/model" }] }',
    key: "models.overrides[0].step",
    reason: 'no Step named "ghost"',
  },
])("$kind is a bad reference naming the file, key and reason", async ({ text, key, reason }) => {
  const workspace = await createWorkspace({ workspace: `schemaVersion: 1\n${text}\n` });

  const { exitCode, stderr } = await foremanIn(workspace, "validate");

  expect(exitCode).toBe(2);
  expect(stderr).toContain(`${fileOf.workspace(workspace)}: ${key}: ${reason}`);
});

test("a bad reference from the user override names the user override's file", async () => {
  const workspace = await createWorkspace({
    override: "schemaVersion: 1\nroles: { reviewer: { adapter: ghost } }\n",
  });

  const { stderr } = await foremanIn(workspace, "validate");

  expect(stderr).toContain(`${workspace.overrideFile}: roles.reviewer.adapter: no Adapter named "ghost"`);
});

test("a system Step can be assigned a model without being in the Pipeline", async () => {
  const workspace = await createWorkspace({
    workspace: 'schemaVersion: 1\nmodels: { steps: { routing: { model: "provider/model" } } }\n',
  });

  expect((await foremanIn(workspace, "validate")).exitCode).toBe(0);
});

test("a Pipeline with no Step that produces Tasks is invalid", async () => {
  const workspace = await createWorkspace({
    workspace: [
      "schemaVersion: 1",
      "pipeline:",
      "  steps:",
      "    - { id: grill, scope: run, access: read-only, prompt: grill }",
      "",
    ].join("\n"),
  });

  const { exitCode, stderr } = await foremanIn(workspace, "validate");

  expect(exitCode).toBe(2);
  expect(stderr).toContain(`${fileOf.workspace(workspace)}: pipeline.steps: exactly one Step`);
});

test("a new rule left incomplete is reported against the layer that added it", async () => {
  const workspace = await createWorkspace({
    workspace: "schemaVersion: 1\npolicies: { guard: { rules: { half-rule: { effect: deny } } } }\n",
  });

  const { exitCode, stderr } = await foremanIn(workspace, "validate");

  expect(exitCode).toBe(2);
  expect(stderr).toContain(
    `${fileOf.workspace(workspace)}: policies.guard.rules.half-rule.checkpoints: required key is missing`,
  );
});

test("a higher layer can complete a rule that a lower layer started", async () => {
  const workspace = await createWorkspace({
    workspace: "schemaVersion: 1\npolicies: { guard: { rules: { split-rule: { effect: flag } } } }\n",
    override: "schemaVersion: 1\npolicies: { guard: { rules: { split-rule: { checkpoints: [diff.path] } } } }\n",
  });

  expect((await foremanIn(workspace, "validate")).exitCode).toBe(0);
});

test("a higher layer can't hide a lower layer's invalid value", async () => {
  const workspace = await createWorkspace({
    workspace: 'schemaVersion: 1\nlimits: { maxRounds: "three" }\n',
    override: "schemaVersion: 1\nlimits: { maxRounds: 3 }\n",
  });

  const { exitCode, stderr } = await foremanIn(workspace, "validate");

  expect(exitCode).toBe(2);
  expect(stderr).toContain(`${fileOf.workspace(workspace)}: limits.maxRounds: `);
});

test("every invalid file is reported in one run", async () => {
  const workspace = await createWorkspace({
    workspace: "schemaVersion: 1\nnope: 1\n",
    projects: { [PROJECT]: "schemaVersion: 1\nalsoNope: 1\n" },
    override: "schemaVersion: 1\nstillNope: 1\n",
  });

  const { stderr } = await foremanIn(workspace, "validate");

  expect(stderr).toContain(`${fileOf.workspace(workspace)}: nope: unknown key`);
  expect(stderr).toContain(`${fileOf.project(workspace)}: alsoNope: unknown key`);
  expect(stderr).toContain(`${workspace.overrideFile}: stillNope: unknown key`);
});

test("policy show refuses invalid Policy as a whole, even for another Project's layer", async () => {
  const workspace = await createWorkspace({
    projects: { "orders-api": "schemaVersion: 1\nnope: 1\n" },
  });

  const { exitCode, stdout, stderr } = await foremanIn(workspace, "policy", "show", "--effective", "--project", PROJECT);

  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
  expect(stderr).toContain("orders-api.yaml: nope: unknown key");
});

describe("a Project layer's limits", () => {
  test.each([
    { text: "roles: { backend: { tools: [read] } }", key: "roles" },
    { text: "pipeline: { completion: [] }", key: "pipeline" },
    { text: "limits: { maxActiveWorkers: 9 }", key: "limits.maxActiveWorkers" },
  ])("$key is valid elsewhere but not in a Project layer", async ({ text, key }) => {
    const workspace = await createWorkspace({ projects: { [PROJECT]: `schemaVersion: 1\n${text}\n` } });

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${fileOf.project(workspace)}: ${key}: not valid in a Project layer`);
  });

  test("it can set its own repository's Mode", async () => {
    const workspace = await createWorkspace({
      projects: { [PROJECT]: `schemaVersion: 1\npolicies: { repositories: { ${PROJECT}: { mode: autonomous } } }\n` },
    });

    expect((await foremanIn(workspace, "validate")).exitCode).toBe(0);
  });

  test("it can't set another Project's repository", async () => {
    const workspace = await createWorkspace({
      projects: { [PROJECT]: "schemaVersion: 1\npolicies: { repositories: { orders-api: { mode: autonomous } } }\n" },
    });

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${fileOf.project(workspace)}: policies.repositories.orders-api: `);
  });

  test("a layer file whose name can't be a Project name is reported", async () => {
    const workspace = await createWorkspace({ projects: { "bad.name": "schemaVersion: 1\n" } });

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(2);
    expect(stderr).toContain("bad.name.yaml: the file name isn't a valid Project name");
  });
});

describe("the built-in layer", () => {
  async function withDefaults(file: string) {
    const workspace = await createWorkspace();
    const { app, terminal } = createTestApp({ env: workspace.env, cwd: workspace.dir, policyDefaultsFile: file });
    return { exitCode: await app.exec(["validate"]), ...terminal };
  }

  test("a missing policy/defaults.yaml stops Foreman with a clear error", async () => {
    const file = join(await makeTempDir(), "defaults.yaml");

    const { exitCode, stderr } = await withDefaults(file);

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: missing`);
  });

  test("an invalid policy/defaults.yaml stops Foreman, naming the key", async () => {
    const file = join(await makeTempDir(), "defaults.yaml");
    await writeFileWithParents(file, "schemaVersion: 1\nlocale: en\n");

    const { exitCode, stderr } = await withDefaults(file);

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: limits: required key is missing`);
  });

  test("a higher layer can't make up for an incomplete policy/defaults.yaml", async () => {
    const shipped = await Bun.file(join(import.meta.dir, "..", "..", "policy", "defaults.yaml")).text();
    const file = join(await makeTempDir(), "defaults.yaml");
    await writeFileWithParents(file, shipped.replace(/^limits:\n(  .*\n)+/m, ""));
    const workspace = await createWorkspace({
      workspace: "schemaVersion: 1\nlimits: { maxActiveWorkers: 1, maxRounds: 1, workerTimeoutMinutes: 1 }\n",
    });
    const { app, terminal } = createTestApp({ env: workspace.env, cwd: workspace.dir, policyDefaultsFile: file });

    expect(await app.exec(["validate"])).toBe(2);
    expect(terminal.stderr).toContain(`${file}: limits: required key is missing`);
  });
});
