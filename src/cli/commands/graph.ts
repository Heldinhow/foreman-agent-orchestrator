import { findWorkspace } from "../../config/workspace-location.ts";
import { renderGraphDocument } from "../../graph/mermaid.ts";
import { loadWorkspace, writeGraphDocument } from "../../graph/workspace.ts";
import type { Command, Terminal } from "../app.ts";
import { parseCommandArgs, UsageError } from "../errors.ts";
import { ExitCode } from "../exit-codes.ts";

const GRAPH_USAGE = "usage: foreman graph [impact <project>] [--dir <path>]";

export function writeGraphWarnings(warnings: readonly string[], terminal: Terminal): void {
  for (const warning of warnings) terminal.writeErr(`warning: ${warning}\n`);
}

export const graphCommand: Command = (args, deps) => {
  const { values, positionals } = parseCommandArgs(args, { dir: { type: "string" } }, true);
  const [subcommand, project, ...stray] = positionals;
  const printsGraph = subcommand === undefined;
  if (!printsGraph && (subcommand !== "impact" || project === undefined || stray.length > 0)) {
    throw new UsageError(GRAPH_USAGE);
  }

  const { file, graph } = loadWorkspace(findWorkspace({ dir: values.dir, env: deps.env, cwd: deps.cwd }));
  writeGraphWarnings(graph.warnings, deps.terminal);

  if (printsGraph) {
    const document = renderGraphDocument(graph);
    writeGraphDocument(file, document);
    deps.terminal.writeOut(document);
    return ExitCode.Success;
  }

  const name = project as string;
  if (!graph.projects.includes(name)) throw new UsageError(`no Project named "${name}" in ${file}`);

  const impact = graph.impactOf(name);
  if (impact.length === 0) deps.terminal.writeErr(`"${name}" has no Downstream Projects\n`);
  for (const downstream of impact) deps.terminal.writeOut(`${downstream}\n`);
  return ExitCode.Success;
};
