import { describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { mermaidBlock, parseFlowchart } from "../helpers/mermaid.ts";
import { createWorkspace, foremanIn, writeFileWithParents } from "../helpers/workspace.ts";

function project(name: string): string {
  return `  ${name}:\n    path: ../${name}\n    stack: [typescript]\n    baseRef: main\n    commands: { test: bun test }\n`;
}

function workspaceYaml(names: string[], edges: string[]): string {
  const edgeLines = edges.map((text) => `  - ${text}\n`).join("");
  return `schemaVersion: 1\nprojects:\n${names.map(project).join("")}edges:\n${edgeLines}`;
}

async function withGraph(text: string) {
  const workspace = await createWorkspace();
  const file = join(workspace.dir, "foreman", "workspace.yaml");
  await writeFileWithParents(file, text);
  return { workspace, file, graphFile: join(workspace.dir, "foreman", "graph.md") };
}

const CHAIN = workspaceYaml(
  ["base", "middle", "top", "unrelated"],
  [
    "{ from: middle, to: base, type: shares-lib, source: confirmed }",
    "{ from: top, to: middle, type: calls-api, source: confirmed }",
  ],
);

const DETECTED = "{ from: top, to: base, type: depends-on, source: detected }";
const HARD_CYCLE = [
  "{ from: base, to: top, type: depends-on, source: confirmed }",
  "{ from: top, to: base, type: shares-lib, source: confirmed }",
];
const SOFT_CYCLE = [
  "{ from: base, to: top, type: calls-api, source: confirmed }",
  "{ from: top, to: base, type: calls-api, source: confirmed }",
];

describe("foreman graph", () => {
  test("prints the graph and its order, and writes the same to graph.md", async () => {
    const { workspace, graphFile } = await withGraph(CHAIN);

    const { exitCode, stdout, stderr } = await foremanIn(workspace, "graph");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await readFile(graphFile, "utf8")).toBe(stdout);
    expect(stdout).toContain("## Order\n\n1. base\n2. middle\n3. top\n4. unrelated\n");
  });

  test("AC-74: graph.md is valid Mermaid and contains every Project and Edge", async () => {
    const { workspace, graphFile } = await withGraph(CHAIN);

    await foremanIn(workspace, "graph");

    const { projects, edges } = parseFlowchart(mermaidBlock(await readFile(graphFile, "utf8")));
    expect(projects.toSorted()).toEqual(["base", "middle", "top", "unrelated"]);
    expect(edges).toEqual([
      { upstream: "base", downstream: "middle", type: "shares-lib", dashed: false },
      { upstream: "middle", downstream: "top", type: "calls-api", dashed: false },
    ]);
  });

  test("gives byte-identical output and doesn't rewrite graph.md when nothing changed", async () => {
    const { workspace, graphFile } = await withGraph(CHAIN);

    const first = await foremanIn(workspace, "graph");
    const firstWrite = await stat(graphFile);
    const second = await foremanIn(workspace, "graph");

    expect(second.stdout).toBe(first.stdout);
    expect((await stat(graphFile)).ino).toBe(firstWrite.ino);
    expect((await stat(graphFile)).mtimeMs).toBe(firstWrite.mtimeMs);
  });

  test("regenerates a graph.md that was edited by hand", async () => {
    const { workspace, graphFile } = await withGraph(CHAIN);
    await writeFileWithParents(graphFile, "hand edit\n");

    const { stdout } = await foremanIn(workspace, "graph");

    expect(await readFile(graphFile, "utf8")).toBe(stdout);
  });

  test("an unconfirmed Edge is drawn, warned about on stderr, and leaves order alone", async () => {
    const { workspace } = await withGraph(
      workspaceYaml(["a", "z"], ["{ from: a, to: z, type: depends-on, source: detected }"]),
    );

    const { exitCode, stdout, stderr } = await foremanIn(workspace, "graph");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("p_z -.->");
    expect(stdout).toContain("1. a\n2. z\n");
    expect(stderr).toContain("warning: ");
    expect(stderr).toContain("a depends-on z");
  });

  test("finds the Workspace from --dir", async () => {
    const { workspace } = await withGraph(CHAIN);

    const { exitCode, stdout } = await foremanIn(
      { dir: workspace.root, env: workspace.env },
      "graph",
      "--dir",
      workspace.dir,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("p_base");
  });

  test("with no workspace.yaml, exits 2 naming the file and writes nothing", async () => {
    const workspace = await createWorkspace();
    const file = join(workspace.dir, "foreman", "workspace.yaml");

    const { exitCode, stderr, stdout } = await foremanIn(workspace, "graph");

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain(`${file}: missing`);
    expect(await Bun.file(join(workspace.dir, "foreman", "graph.md")).exists()).toBe(false);
  });

  test("with an invalid workspace.yaml, exits 2 and leaves graph.md as it was", async () => {
    const { workspace, graphFile, file } = await withGraph("schemaVersion: 1\nprojects: {}\nedgez: []\n");
    await writeFileWithParents(graphFile, "previous\n");

    const { exitCode, stderr } = await foremanIn(workspace, "graph");

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: edgez: unknown key`);
    expect(await readFile(graphFile, "utf8")).toBe("previous\n");
  });
});

describe("foreman graph impact", () => {
  test("prints the transitive Downstream, one Project per line, Upstream first", async () => {
    const { workspace } = await withGraph(CHAIN);

    const { exitCode, stdout, stderr } = await foremanIn(workspace, "graph", "impact", "base");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe("middle\ntop\n");
  });

  test("says so when a Project has no Downstream", async () => {
    const { workspace } = await withGraph(CHAIN);

    const { exitCode, stdout, stderr } = await foremanIn(workspace, "graph", "impact", "top");

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain('"top" has no Downstream');
  });

  test("doesn't follow an unconfirmed Edge, and warns about it", async () => {
    const { workspace } = await withGraph(workspaceYaml(["base", "top"], [DETECTED]));

    const { exitCode, stdout, stderr } = await foremanIn(workspace, "graph", "impact", "base");

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("warning: ");
    expect(stderr).toContain("top depends-on base");
  });

  test("doesn't write graph.md", async () => {
    const { workspace, graphFile } = await withGraph(CHAIN);

    await foremanIn(workspace, "graph", "impact", "base");

    expect(await Bun.file(graphFile).exists()).toBe(false);
  });

  test("an unknown Project exits 2 and names it", async () => {
    const { workspace } = await withGraph(CHAIN);

    const { exitCode, stderr } = await foremanIn(workspace, "graph", "impact", "nowhere");

    expect(exitCode).toBe(2);
    expect(stderr).toContain('no Project named "nowhere"');
  });
});

test.each([
  { argv: ["graph", "impact"], reason: "impact with no Project" },
  { argv: ["graph", "impact", "a", "b"], reason: "two Projects" },
  { argv: ["graph", "stray"], reason: "an unknown subcommand" },
  { argv: ["graph", "--bogus"], reason: "an unknown option" },
])("foreman graph with $reason is a usage error", async ({ argv }) => {
  const { workspace } = await withGraph(CHAIN);

  const { exitCode, stderr } = await foremanIn(workspace, ...argv);

  expect(exitCode).toBe(2);
  expect(stderr).not.toBe("");
});

describe("cycles", () => {
  test.each(["validate", "graph"])("AC-12: a depends-on or shares-lib cycle fails foreman %s", async (command) => {
    const { workspace, file } = await withGraph(workspaceYaml(["base", "top"], HARD_CYCLE));

    const { exitCode, stderr } = await foremanIn(workspace, command);

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${file}: edges: `);
    expect(stderr).toContain("base, top");
    expect(stderr).toContain("no build order exists");
  });

  test.each(["validate", "graph"])("AC-12: a calls-api cycle warns in foreman %s, and passes", async (command) => {
    const { workspace } = await withGraph(workspaceYaml(["base", "top"], SOFT_CYCLE));

    const { exitCode, stderr } = await foremanIn(workspace, command);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("warning: ");
    expect(stderr).toContain("base, top");
  });

  test("AC-12: an event cycle warns, and passes", async () => {
    const { workspace } = await withGraph(
      workspaceYaml(
        ["base", "top"],
        [
          "{ from: base, to: top, type: publishes-event, source: confirmed }",
          "{ from: top, to: base, type: publishes-event, source: confirmed }",
        ],
      ),
    );

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(0);
    expect(stderr).toContain("base, top");
  });
});

describe("foreman validate", () => {
  test("reports a valid Workspace Graph alongside Policy", async () => {
    const { workspace, file } = await withGraph(CHAIN);

    const { exitCode, stdout, stderr } = await foremanIn(workspace, "validate");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Policy is valid");
    expect(stdout).toContain("Workspace Graph is valid: 4 Projects, 2 Edges");
    expect(stdout).toContain(file);
  });

  test("warns about each unconfirmed Edge", async () => {
    const { workspace } = await withGraph(workspaceYaml(["base", "top"], [DETECTED]));

    const { exitCode, stderr } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(0);
    expect(stderr).toContain("top depends-on base");
    expect(stderr).toContain("unconfirmed");
  });

  test("says so when there is no workspace.yaml yet", async () => {
    const workspace = await createWorkspace();

    const { exitCode, stdout } = await foremanIn(workspace, "validate");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No Workspace Graph yet");
  });

  test("doesn't write graph.md", async () => {
    const { workspace, graphFile } = await withGraph(CHAIN);

    await foremanIn(workspace, "validate");

    expect(await Bun.file(graphFile).exists()).toBe(false);
  });
});
