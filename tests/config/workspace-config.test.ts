import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { worktreeEnvName } from "../../src/config/workspace-config.ts";
import { createWorkspace, foremanIn, writeFileWithParents, type WorkspaceFixture } from "../helpers/workspace.ts";

const API = `  catalog-api:
    path: ../catalog-api
    stack: [typescript]
    baseRef: main
    commands: { test: bun test }
`;
const ORDERS = `  orders-api:
    repo: git@example.invalid:placeholder/orders-api.git
    stack: [python]
    baseRef: trunk
    commands: { verify: ./verify.sh }
`;

const TWO_PROJECTS = `schemaVersion: 1\nprojects:\n${API}${ORDERS}`;

async function validate(text: string, fixture: WorkspaceFixture = {}) {
  const workspace = await createWorkspace(fixture);
  const file = join(workspace.dir, "foreman", "workspace.yaml");
  await writeFileWithParents(file, text);
  return { file, workspace, ...(await foremanIn(workspace, "validate")) };
}

function withProject(body: string): string {
  return `schemaVersion: 1\nprojects:\n  catalog-api:\n${body}\n`;
}

const BASE_PROJECT = "    stack: []\n    baseRef: main";
const PATH = "    path: ../catalog-api";
const COMMANDS = "    commands: { test: bun test }";
const VALID_PROJECT = `${PATH}\n${BASE_PROJECT}\n${COMMANDS}`;

function withEdge(edge: string): string {
  return `${TWO_PROJECTS}edges:\n  - ${edge}\n`;
}

const NONE_DECLARED = "declare at least one verification command: build, test or verify";

const invalidCases = [
  {
    name: "an unknown top-level key",
    text: `${TWO_PROJECTS}edgez: []\n`,
    key: "edgez",
    reason: "unknown key",
  },
  {
    name: "an unknown key on a Project",
    text: withProject(`${VALID_PROJECT}\n    sandbox: none`),
    key: "projects.catalog-api.sandbox",
    reason: "unknown key",
  },
  {
    name: "an unknown command",
    text: withProject(`${PATH}\n${BASE_PROJECT}\n    commands: { test: bun test, lint: x }`),
    key: "projects.catalog-api.commands.lint",
    reason: "unknown key",
  },
  {
    name: "an unknown key on an Edge",
    text: withEdge("{ from: orders-api, to: catalog-api, type: calls-api, source: confirmed, weight: 1 }"),
    key: "edges[0].weight",
    reason: "unknown key",
  },
  {
    name: "a missing schemaVersion",
    text: `projects:\n${API}`,
    key: "schemaVersion",
    reason: "",
  },
  {
    name: "an unsupported schemaVersion",
    text: `schemaVersion: 2\nprojects:\n${API}`,
    key: "schemaVersion",
    reason: "",
  },
  {
    name: "a missing projects map",
    text: "schemaVersion: 1\n",
    key: "projects",
    reason: "required key is missing",
  },
  {
    name: "a wrong type on a Project key",
    text: withProject(`${PATH}\n    stack: typescript\n    baseRef: main\n${COMMANDS}`),
    key: "projects.catalog-api.stack",
    reason: "Invalid input: expected array, received string",
  },
  {
    name: "a missing baseRef",
    text: withProject(`${PATH}\n    stack: []\n${COMMANDS}`),
    key: "projects.catalog-api.baseRef",
    reason: "required key is missing",
  },
  {
    name: "a missing stack",
    text: withProject(`${PATH}\n    baseRef: main\n${COMMANDS}`),
    key: "projects.catalog-api.stack",
    reason: "required key is missing",
  },
  {
    name: "a Project name that isn't valid",
    text: `schemaVersion: 1\nprojects:\n  "bad.name":\n${VALID_PROJECT}\n`,
    key: "projects.bad.name",
    reason: "not a valid name",
  },
  {
    name: "neither path nor repo",
    text: withProject(`${BASE_PROJECT}\n${COMMANDS}`),
    key: "projects.catalog-api",
    reason: "declare exactly one of path or repo",
  },
  {
    name: "both path and repo",
    text: withProject(`${VALID_PROJECT}\n    repo: git@example.invalid:placeholder/x.git`),
    key: "projects.catalog-api",
    reason: "declare exactly one of path or repo",
  },
  {
    name: "an absolute path",
    text: withProject(`    path: /srv/catalog-api\n${BASE_PROJECT}\n${COMMANDS}`),
    key: "projects.catalog-api.path",
    reason: "must be relative to the Workspace",
  },
  {
    name: "a home-relative path",
    text: withProject(`    path: ~/catalog-api\n${BASE_PROJECT}\n${COMMANDS}`),
    key: "projects.catalog-api.path",
    reason: "must be relative to the Workspace",
  },
  {
    name: "no commands key",
    text: withProject(`${PATH}\n${BASE_PROJECT}`),
    key: "projects.catalog-api.commands",
    reason: NONE_DECLARED,
  },
  {
    name: "an empty commands map",
    text: withProject(`${PATH}\n${BASE_PROJECT}\n    commands: {}`),
    key: "projects.catalog-api.commands",
    reason: NONE_DECLARED,
  },
  {
    name: "a blank verification command, which would verify nothing",
    text: withProject(`${PATH}\n${BASE_PROJECT}\n    commands: { test: "   " }`),
    key: "projects.catalog-api.commands.test",
    reason: "a command can't be blank",
  },
  {
    name: "a blank integration command",
    text: `${TWO_PROJECTS}integration: { verify: ["  "] }\n`,
    key: "integration.verify[0]",
    reason: "a command can't be blank",
  },
  {
    name: "an Edge to an unknown Project",
    text: withEdge("{ from: orders-api, to: catalogue, type: calls-api, source: confirmed }"),
    key: "edges[0].to",
    reason: 'no Project named "catalogue"',
  },
  {
    name: "an Edge from an unknown Project",
    text: withEdge("{ from: ordrs, to: catalog-api, type: calls-api, source: confirmed }"),
    key: "edges[0].from",
    reason: 'no Project named "ordrs"',
  },
  {
    name: "an unknown Edge type",
    text: withEdge("{ from: orders-api, to: catalog-api, type: uses, source: confirmed }"),
    key: "edges[0].type",
    reason: "Invalid option",
  },
  {
    name: "an unknown Edge source",
    text: withEdge("{ from: orders-api, to: catalog-api, type: calls-api, source: guessed }"),
    key: "edges[0].source",
    reason: "Invalid option",
  },
  {
    name: "an Edge with no source, which would be neither confirmed nor unconfirmed",
    text: withEdge("{ from: orders-api, to: catalog-api, type: calls-api }"),
    key: "edges[0].source",
    reason: 'Invalid option: expected one of "detected"|"confirmed"',
  },
  {
    name: "Edges that aren't a list",
    text: `${TWO_PROJECTS}edges: { a: 1 }\n`,
    key: "edges",
    reason: "Invalid input: expected array, received object",
  },
  {
    name: "an unknown key in Edge evidence",
    text: withEdge(
      "{ from: orders-api, to: catalog-api, type: calls-api, source: detected, evidence: [{ file: a.ts, signal: s, why: x }] }",
    ),
    key: "edges[0].evidence[0].why",
    reason: "unknown key",
  },
  {
    name: "an unknown key in deploy",
    text: withProject(`${VALID_PROJECT}\n    deploy: { command: ./d.sh, token: x }`),
    key: "projects.catalog-api.deploy.token",
    reason: "unknown key",
  },
];

describe("AC-75: an invalid workspace.yaml names the file, key and reason", () => {
  test.each(invalidCases)("$name", async ({ text, key, reason }) => {
    const { exitCode, stderr, stdout, file } = await validate(text);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain(`${file}: ${key}: ${reason}`);
  });

  test("a file that isn't valid YAML names the file", async () => {
    const { exitCode, stderr, file } = await validate("projects: {\n");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: invalid YAML`);
  });

  test.each([
    ["empty", ""],
    ["a list", "- a\n- b\n"],
  ])("a file that is %s names the file", async (_name, text) => {
    const { exitCode, stderr, file } = await validate(text);

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: must be a YAML map`);
  });

  test("every problem is reported at once", async () => {
    const { exitCode, stderr, file } = await validate(
      `schemaVersion: 1
projects:
  catalog-api:
${PATH}
${BASE_PROJECT}
  catalog_api:
    path: ../other
${BASE_PROJECT}
${COMMANDS}
edges:
  - { from: catalog-api, to: nowhere, type: calls-api, source: confirmed }
  - { from: catalog-api, to: catalog-api, type: depends-on, source: confirmed }
`,
    );

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: projects.catalog-api.commands: ${NONE_DECLARED}`);
    expect(stderr).toContain(`${file}: projects.catalog_api: `);
    expect(stderr).toContain(`${file}: edges[0].to: no Project named "nowhere"`);
    expect(stderr).toContain(`${file}: edges: `);
  });
});

describe("a valid workspace.yaml", () => {
  test("the spec's full example shape is accepted", async () => {
    const { exitCode, stderr, stdout } = await validate(`schemaVersion: 1
projects:
  catalog-api:
    path: ../catalog-api
    stack: [typescript]
    commands:
      build: bun run build
      test: bun test
      verify: bun run contract:check
    baseRef: main
    link: bun link
    copyFiles: [fixtures/local.json]
    deploy:
      command: ./scripts/deploy.sh
      check: ./scripts/deploy-status.sh
      credentialEnv: [EXAMPLE_DEPLOY_TOKEN]
    owners: [team-placeholder]
  orders-api:
    repo: git@example.invalid:placeholder/orders-api.git
    stack: [python]
    commands: { verify: ./verify.sh }
    baseRef: main
edges:
  - from: orders-api
    to: catalog-api
    type: calls-api
    source: confirmed
    contract: openapi/catalog.yaml
    evidence:
      - { file: src/catalog-client.ts, line: 12, signal: http-client-env-url }
integration:
  verify:
    - bun run integration:test
`);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("2 Projects, 1 Edge\n");
  });

  test.each(["build", "test", "verify"])("a single %s command is enough to verify a Project", async (command) => {
    const { exitCode } = await validate(withProject(`${PATH}\n${BASE_PROJECT}\n    commands: { ${command}: ./x.sh }`));

    expect(exitCode).toBe(0);
  });

  test("a Project named like a built-in object member is accepted", async () => {
    const { exitCode, stderr } = await validate(
      `schemaVersion: 1\nprojects:\n  constructor:\n${VALID_PROJECT}\n  toString:\n${VALID_PROJECT}\n`,
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("edges and integration are optional", async () => {
    const { exitCode } = await validate(TWO_PROJECTS);

    expect(exitCode).toBe(0);
  });
});

describe("FOREMAN_WORKTREE_<PROJECT> names", () => {
  test.each([
    ["catalog-api", "FOREMAN_WORKTREE_CATALOG_API"],
    ["catalog_api", "FOREMAN_WORKTREE_CATALOG_API"],
    ["Catalog-Api2", "FOREMAN_WORKTREE_CATALOG_API2"],
    ["1st", "FOREMAN_WORKTREE_1ST"],
  ])("%s normalizes to %s", (project, name) => {
    expect(worktreeEnvName(project)).toBe(name);
  });

  test.each([
    ["catalog-api", "catalog_api"],
    ["catalog-api", "CATALOG-API"],
    ["Catalog_Api", "catalog-api"],
  ])("%s and %s collide", async (one, other) => {
    const { exitCode, stderr, file } = await validate(
      `schemaVersion: 1\nprojects:\n  ${one}:\n${VALID_PROJECT}\n  ${other}:\n${VALID_PROJECT}\n`,
    );

    expect(exitCode).toBe(2);
    expect(stderr).toContain(file);
    expect(stderr).toContain("FOREMAN_WORKTREE_CATALOG_API");
    expect(stderr).toContain(one);
    expect(stderr).toContain(other);
  });

  test("three Projects sharing a name produce one problem per later Project", async () => {
    const { stderr, file } = await validate(
      `schemaVersion: 1\nprojects:\n  a-b:\n${VALID_PROJECT}\n  a_b:\n${VALID_PROJECT}\n  A-B:\n${VALID_PROJECT}\n`,
    );

    expect(stderr).toContain(`${file}: projects.a-b: `);
    expect(stderr).toContain(`${file}: projects.a_b: `);
  });
});

describe("Policy that names a Project resolves against workspace.yaml", () => {
  test("a Role's Project", async () => {
    const workspaceLayer = "schemaVersion: 1\nroles:\n  backend:\n    tools: [read]\n    projects: [catalog-api, nowhere]\n";

    const { exitCode, stderr, workspace } = await validate(TWO_PROJECTS, { workspace: workspaceLayer });

    expect(exitCode).toBe(2);
    expect(stderr).toContain(
      `${join(workspace.dir, "foreman", "foreman.yaml")}: roles.backend.projects[1]: no Project named "nowhere"`,
    );
  });

  test("a repository entry", async () => {
    const workspaceLayer = "schemaVersion: 1\npolicies: { repositories: { nowhere: { mode: propose } } }\n";

    const { exitCode, stderr, workspace } = await validate(TWO_PROJECTS, { workspace: workspaceLayer });

    expect(exitCode).toBe(2);
    expect(stderr).toContain(
      `${join(workspace.dir, "foreman", "foreman.yaml")}: policies.repositories.nowhere: no Project named "nowhere"`,
    );
  });

  test("names the user override when that's where the bad name is", async () => {
    const override = "schemaVersion: 1\nroles:\n  backend:\n    tools: [read]\n    projects: [nowhere]\n";

    const { exitCode, stderr, workspace } = await validate(TWO_PROJECTS, { override });

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${workspace.overrideFile}: roles.backend.projects[0]: no Project named "nowhere"`);
  });

  test("a Project layer file", async () => {
    const { exitCode, stderr, workspace } = await validate(TWO_PROJECTS, {
      projects: { nowhere: "schemaVersion: 1\nlimits: { maxRounds: 2 }\n" },
    });

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${join(workspace.dir, "foreman", "projects", "nowhere.yaml")}: no Project named "nowhere"`);
  });

  test("every name that resolves passes", async () => {
    const { exitCode, stderr } = await validate(TWO_PROJECTS, {
      workspace:
        "schemaVersion: 1\nroles:\n  backend:\n    tools: [read]\n    projects: [catalog-api]\npolicies: { repositories: { orders-api: { mode: propose } } }\n",
      projects: { "catalog-api": "schemaVersion: 1\nlimits: { maxRounds: 2 }\n" },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });
});
