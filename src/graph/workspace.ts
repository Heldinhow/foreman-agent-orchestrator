import fs from "node:fs";
import { dirname, join } from "node:path";
import { ConfigInvalidError } from "../config/errors.ts";
import {
  readWorkspaceConfig,
  workspaceConfigFile,
  workspaceProblems,
  type WorkspaceConfig,
} from "../config/workspace-config.ts";
import { createWorkspaceGraph, type WorkspaceGraph } from "./workspace-graph.ts";

export interface LoadedWorkspace {
  file: string;
  config: WorkspaceConfig;
  graph: WorkspaceGraph;
}

/**
 * Loads `workspace.yaml` if it exists, and throws `ConfigInvalidError` listing everything
 * wrong with it. Only a confirmed cycle fails here, as an unconfirmed Edge affects no order.
 */
export function loadDeclaredWorkspace(workspaceDir: string): LoadedWorkspace | undefined {
  const file = workspaceConfigFile(workspaceDir);
  const config = readWorkspaceConfig(file);
  if (config === undefined) return undefined;

  const graph = createWorkspaceGraph({ projects: Object.keys(config.projects), edges: config.edges ?? [] });
  const issues = [
    ...workspaceProblems(config).map((problem) => ({ file, ...problem })),
    ...graph.hardCycles.map((cycle) => ({
      file,
      key: "edges",
      reason: `cycle of depends-on or shares-lib Edges through ${cycle.join(", ")}: no build order exists`,
    })),
  ];
  if (issues.length > 0) throw new ConfigInvalidError(issues);

  return { file, config, graph };
}

/** As `loadDeclaredWorkspace`, for commands that can't do anything without the file. */
export function loadWorkspace(workspaceDir: string): LoadedWorkspace {
  const workspace = loadDeclaredWorkspace(workspaceDir);
  if (workspace === undefined) {
    throw new ConfigInvalidError([
      { file: workspaceConfigFile(workspaceDir), reason: "missing: this file declares the Projects and Edges" },
    ]);
  }
  return workspace;
}

/**
 * Writes `graph.md` beside `workspace.yaml`, replacing rather than following whatever is
 * there, and leaves a file that's already current untouched.
 */
export function writeGraphDocument(workspaceFile: string, content: string): void {
  const file = join(dirname(workspaceFile), "graph.md");
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;

  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
