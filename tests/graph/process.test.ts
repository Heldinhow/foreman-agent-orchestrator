import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTimeoutMs, builtCliPath, hermeticEnv, run } from "../helpers/process.ts";
import { createWorkspace, writeFileWithParents } from "../helpers/workspace.ts";

const WORKSPACE_YAML = `schemaVersion: 1
projects:
  catalog-api:
    path: ../catalog-api
    stack: [typescript]
    baseRef: main
    commands: { test: bun test }
  orders-api:
    path: ../orders-api
    stack: [python]
    baseRef: main
    commands: { verify: ./verify.sh }
edges:
  - { from: orders-api, to: catalog-api, type: calls-api, source: confirmed }
`;

test(
  "the built CLI prints the graph, writes graph.md and prints impact",
  async () => {
    const workspace = await createWorkspace();
    await writeFileWithParents(join(workspace.dir, "foreman", "workspace.yaml"), WORKSPACE_YAML);
    const home = join(workspace.root, "home");
    await mkdir(home, { recursive: true });
    const cli = await builtCliPath();
    const options = { cwd: workspace.dir, env: hermeticEnv(home) };

    const graph = await run([cli, "graph"], options);
    const impact = await run([cli, "graph", "impact", "catalog-api"], options);

    expect(graph.stderr).toBe("");
    expect(graph.exitCode).toBe(0);
    expect(await readFile(join(workspace.dir, "foreman", "graph.md"), "utf8")).toBe(graph.stdout);
    expect(impact.stdout).toBe("orders-api\n");
    expect(impact.exitCode).toBe(0);
  },
  buildTimeoutMs,
);
