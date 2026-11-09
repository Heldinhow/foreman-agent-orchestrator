import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parse } from "yaml";
import { createWorkspace, foremanIn, writeFileWithParents, type WorkspaceFixture } from "../helpers/workspace.ts";

const PROJECT = "catalog-api";

/** The three merge shapes, each given a value per layer. */
const shapes = [
  {
    shape: "a map",
    key: "limits.maxRounds",
    layer: (value: number) => `limits: { maxRounds: ${value} }`,
    builtIn: 3,
    values: [4, 5, 6],
    untouched: { key: "limits.workerTimeoutMinutes", value: 60 },
  },
  {
    shape: "a named rule",
    key: "policies.guard.rules.deny-secret-files.effect",
    layer: (value: string) => `policies: { guard: { rules: { deny-secret-files: { effect: ${value} } } } }`,
    builtIn: "deny",
    values: ["flag", "require-approval", "allow"],
    untouched: {
      key: "policies.guard.rules.deny-secret-files.checkpoints",
      value: ["worktree.copy", "worktree.tracked", "scan.read", "adapter.render", "diff.path"],
    },
  },
  {
    shape: "a plain list",
    key: "policies.repositoryDefaults.allow",
    layer: (value: string[]) =>
      `policies: { repositoryDefaults: { allow: ${JSON.stringify(value)} } }`,
    builtIn: [],
    values: [["push"], ["draft-pr"], ["merge", "deploy"]],
    untouched: { key: "policies.repositoryDefaults.mode", value: "propose" },
  },
] as const;

function layerText(shape: (typeof shapes)[number], value: unknown) {
  return `schemaVersion: 1\n${(shape.layer as (v: unknown) => string)(value)}\n`;
}

async function effective(workspace: Awaited<ReturnType<typeof createWorkspace>>) {
  const result = await foremanIn(workspace, "policy", "show", "--effective", "--project", PROJECT);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  return parse(result.stdout);
}

function valueAt(policy: unknown, key: string): unknown {
  return key.split(".").reduce((node, part) => (node as Record<string, unknown>)[part], policy);
}

describe.each(shapes)("$shape", (shape) => {
  const [workspaceValue, projectValue, overrideValue] = shape.values;
  const cases: { layer: string; expected: unknown; fixture: WorkspaceFixture }[] = [
    { layer: "built-in", expected: shape.builtIn, fixture: {} },
    {
      layer: "Workspace",
      expected: workspaceValue,
      fixture: { workspace: layerText(shape, workspaceValue) },
    },
    {
      layer: "Project",
      expected: projectValue,
      fixture: {
        workspace: layerText(shape, workspaceValue),
        projects: { [PROJECT]: layerText(shape, projectValue) },
      },
    },
    {
      layer: "user override",
      expected: overrideValue,
      fixture: {
        workspace: layerText(shape, workspaceValue),
        projects: { [PROJECT]: layerText(shape, projectValue) },
        override: layerText(shape, overrideValue),
      },
    },
  ];

  test.each(cases)("the $layer layer sets it and --explain names that layer", async ({ layer, expected, fixture }) => {
    const workspace = await createWorkspace(fixture);

    const policy = await effective(workspace);
    expect(valueAt(policy, shape.key)).toEqual(expected);
    expect(valueAt(policy, shape.untouched.key)).toEqual(shape.untouched.value);

    const explained = await foremanIn(workspace, "policy", "show", "--explain", shape.key, "--project", PROJECT);
    expect(explained.exitCode).toBe(0);
    expect(explained.stdout).toContain(`${shape.key} = ${JSON.stringify(expected)}`);
    expect(explained.stdout).toContain(`set by: ${layer}`);
  });
});

test("named rules merge by ID, so a layer can add one rule without restating the others", async () => {
  const workspace = await createWorkspace({
    workspace: [
      "schemaVersion: 1",
      "policies:",
      "  guard:",
      "    rules:",
      "      flag-large-files: { checkpoints: [diff.path], match: { paths: ['*.bin'] }, effect: flag }",
      "",
    ].join("\n"),
  });

  const policy = await effective(workspace);

  expect(policy.policies.guard.rules["flag-large-files"].effect).toBe("flag");
  expect(policy.policies.guard.rules["deny-secret-files"].effect).toBe("deny");
});

test("--explain lists what a higher layer replaced", async () => {
  const workspace = await createWorkspace({
    workspace: "schemaVersion: 1\nlimits: { maxRounds: 4 }\n",
    override: "schemaVersion: 1\nlimits: { maxRounds: 2 }\n",
  });

  const { stdout } = await foremanIn(workspace, "policy", "show", "--explain", "limits.maxRounds");

  expect(stdout).toContain("set by: user override");
  expect(stdout).toContain("overrides: Workspace");
  expect(stdout).toContain("built-in");
});

test("--explain on a map names the layer of each key under it", async () => {
  const workspace = await createWorkspace({
    workspace: "schemaVersion: 1\nlimits: { maxRounds: 4 }\n",
  });

  const { stdout, exitCode } = await foremanIn(workspace, "policy", "show", "--explain", "limits");

  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/limits\.maxRounds = 4\n\s+set by: Workspace/);
  expect(stdout).toMatch(/limits\.workerTimeoutMinutes = 60\n\s+set by: built-in/);
});

test("--explain without --project says which Project layers also set the key", async () => {
  const workspace = await createWorkspace({
    projects: { [PROJECT]: "schemaVersion: 1\nlimits: { maxRounds: 9 }\n" },
  });

  const { stdout } = await foremanIn(workspace, "policy", "show", "--explain", "limits.maxRounds");

  expect(stdout).toContain("limits.maxRounds = 3");
  expect(stdout).toContain("set by: built-in");
  expect(stdout).toContain(`also set for Project: ${PROJECT}`);
});

test("--explain still names the Project layer when the user override is on top of it", async () => {
  const workspace = await createWorkspace({
    projects: { [PROJECT]: "schemaVersion: 1\nlimits: { maxRounds: 9 }\n" },
    override: "schemaVersion: 1\nlimits: { maxRounds: 2 }\n",
  });

  const { stdout } = await foremanIn(workspace, "policy", "show", "--explain", "limits.maxRounds");

  expect(stdout).toContain("set by: user override");
  expect(stdout).toContain(`also set for Project: ${PROJECT}`);
});

test("a Project layer applies only to its own Project", async () => {
  const workspace = await createWorkspace({
    projects: { [PROJECT]: "schemaVersion: 1\nlimits: { maxRounds: 9 }\n" },
  });

  const other = await foremanIn(workspace, "policy", "show", "--explain", "limits.maxRounds", "--project", "orders-api");

  expect(other.stdout).toContain("limits.maxRounds = 3");
});

test("--explain on a key no layer sets is a usage error naming the key", async () => {
  const workspace = await createWorkspace();

  const { exitCode, stderr } = await foremanIn(workspace, "policy", "show", "--explain", "limits.nope");

  expect(exitCode).toBe(2);
  expect(stderr).toContain("limits.nope");
});

test("a key named like an Object member isn't found through the prototype", async () => {
  const workspace = await createWorkspace();

  const { exitCode } = await foremanIn(workspace, "policy", "show", "--explain", "limits.constructor");

  expect(exitCode).toBe(2);
});

test("plain policy show prints each layer with its file, and says when one is absent", async () => {
  const workspace = await createWorkspace({
    workspace: "schemaVersion: 1\nlimits: { maxRounds: 4 }\n",
    projects: { [PROJECT]: "schemaVersion: 1\nlimits: { maxRounds: 9 }\n" },
  });

  const { stdout, exitCode } = await foremanIn(workspace, "policy", "show");

  expect(exitCode).toBe(0);
  expect(stdout).toContain("# built-in:");
  expect(stdout).toContain(`# Workspace: ${join(workspace.dir, "foreman", "foreman.yaml")}`);
  expect(stdout).toContain(`# Project ${PROJECT}: ${join(workspace.dir, "foreman", "projects", `${PROJECT}.yaml`)}`);
  expect(stdout).toContain(`# user override: absent (${workspace.overrideFile})`);
  expect(stdout).toContain("maxRounds: 9");
});

test("the user override comes from ~/.config when XDG_CONFIG_HOME is unset", async () => {
  const workspace = await createWorkspace();
  const home = workspace.env.HOME;
  await writeFileWithParents(
    join(home, ".config", "foreman", "override.yaml"),
    "schemaVersion: 1\nlimits: { maxRounds: 8 }\n",
  );

  const result = await foremanIn(
    { dir: workspace.dir, env: { HOME: home } },
    "policy", "show", "--explain", "limits.maxRounds",
  );

  expect(result.stdout).toContain("limits.maxRounds = 8");
  expect(result.stdout).toContain("set by: user override");
});

test("an empty or relative XDG_CONFIG_HOME falls back to ~/.config, as the XDG spec says", async () => {
  const workspace = await createWorkspace();
  const home = workspace.env.HOME;
  await writeFileWithParents(
    join(home, ".config", "foreman", "override.yaml"),
    "schemaVersion: 1\nlimits: { maxRounds: 8 }\n",
  );

  for (const xdg of ["", "relative/path"]) {
    const result = await foremanIn(
      { dir: workspace.dir, env: { HOME: home, XDG_CONFIG_HOME: xdg } },
      "policy", "show", "--explain", "limits.maxRounds",
    );
    expect(result.stdout).toContain("limits.maxRounds = 8");
  }
});

test("Policy fails rather than guessing when neither XDG_CONFIG_HOME nor HOME is set", async () => {
  const workspace = await createWorkspace();

  const { exitCode, stderr } = await foremanIn({ dir: workspace.dir, env: {} }, "validate");

  expect(exitCode).toBe(2);
  expect(stderr).toContain("user override");
});

test("foreman validate accepts a valid Policy Set and lists the layers it read", async () => {
  const workspace = await createWorkspace({
    projects: { [PROJECT]: "schemaVersion: 1\nlimits: { maxRounds: 9 }\n" },
  });

  const { stdout, stderr, exitCode } = await foremanIn(workspace, "validate");

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Policy is valid");
  expect(stdout).toContain(`Project ${PROJECT}`);
});

test.each([
  { argv: ["policy"], reason: "no subcommand" },
  { argv: ["policy", "frobnicate"], reason: "an unknown subcommand" },
  { argv: ["policy", "show", "--nope"], reason: "an unknown flag" },
  { argv: ["policy", "show", "--explain"], reason: "a flag missing its value" },
  { argv: ["policy", "show", "--project", "../escape"], reason: "a Project name that could leave foreman/projects" },
  { argv: ["validate", "stray"], reason: "a stray argument" },
])("$reason is a usage error", async ({ argv }) => {
  const workspace = await createWorkspace();

  const { exitCode, stderr } = await foremanIn(workspace, ...argv);

  expect(exitCode).toBe(2);
  expect(stderr).not.toBe("");
});
