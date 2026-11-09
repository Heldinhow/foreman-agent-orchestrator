import type { Command } from "../app.ts";
import { parseCommandArgs } from "../errors.ts";
import { ExitCode } from "../exit-codes.ts";
import { policySetFor } from "./policy-set.ts";

export const validateCommand: Command = (args, deps) => {
  const { values } = parseCommandArgs(args, { dir: { type: "string" } });
  const { set } = policySetFor(values.dir, deps);

  const layers = [set.builtIn, set.workspace, ...set.projects, set.override].flatMap((layer) =>
    layer === undefined ? [] : [`  ${layer.name}${layer.project ? ` ${layer.project}` : ""}: ${layer.file}\n`],
  );
  deps.terminal.writeOut(`Policy is valid\n${layers.join("")}`);
  return ExitCode.Success;
};
