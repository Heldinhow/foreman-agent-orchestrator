import { ConfigInvalidError } from "../../config/errors.ts";
import { loadDeclaredWorkspace } from "../../graph/workspace.ts";
import { checkProjectReferences } from "../../policy/references.ts";
import type { Command } from "../app.ts";
import { parseCommandArgs } from "../errors.ts";
import { ExitCode } from "../exit-codes.ts";
import { writeGraphWarnings } from "./graph.ts";
import { policySetFor } from "./policy-set.ts";

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export const validateCommand: Command = (args, deps) => {
  const { values } = parseCommandArgs(args, { dir: { type: "string" } });
  const { set, workspaceDir } = policySetFor(values.dir, deps);

  const workspace = loadDeclaredWorkspace(workspaceDir);
  if (workspace !== undefined) {
    const issues = checkProjectReferences(set, new Set(workspace.graph.projects));
    if (issues.length > 0) throw new ConfigInvalidError(issues);
  }

  const layers = [set.builtIn, set.workspace, ...set.projects, set.override].flatMap((layer) =>
    layer === undefined ? [] : [`  ${layer.name}${layer.project ? ` ${layer.project}` : ""}: ${layer.file}\n`],
  );
  deps.terminal.writeOut(`Policy is valid\n${layers.join("")}`);

  if (workspace === undefined) {
    deps.terminal.writeOut("No Workspace Graph yet: foreman/workspace.yaml is missing, so no Projects are checked\n");
    return ExitCode.Success;
  }
  const { projects, edges } = workspace.graph;
  deps.terminal.writeOut(
    `Workspace Graph is valid: ${counted(projects.length, "Project")}, ${counted(edges.length, "Edge")}\n  ${workspace.file}\n`,
  );
  writeGraphWarnings(workspace.graph.warnings, deps.terminal);
  return ExitCode.Success;
};
