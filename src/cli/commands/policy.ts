import { stringify } from "yaml";
import type { PolicyLayer } from "../../policy/merge.ts";
import { NAME_PATTERN } from "../../policy/schema.ts";
import type { Command } from "../app.ts";
import { parseCommandArgs, UsageError } from "../errors.ts";
import { ExitCode } from "../exit-codes.ts";
import { policySetFor } from "./policy-set.ts";

function layerLabel(layer: PolicyLayer): string {
  return `${layer.name} (${layer.file})`;
}

const showCommand: Command = (args, deps) => {
  const { values } = parseCommandArgs(args, {
    dir: { type: "string" },
    effective: { type: "boolean" },
    explain: { type: "string" },
    project: { type: "string" },
  });
  if (values.project !== undefined && !NAME_PATTERN.test(values.project)) {
    throw new UsageError(`"${values.project}" isn't a valid Project name`);
  }

  const { set, overrideFile } = policySetFor(values.dir, deps);
  const effective = set.effective(values.project);
  const { writeOut } = deps.terminal;

  if (values.explain !== undefined) {
    const key = values.explain;
    const explanations = effective.explain(key);
    if (explanations.length === 0) throw new UsageError(`no Policy layer sets "${key}"`);

    for (const { key: leaf, value, setBy, overrides } of explanations) {
      writeOut(`${leaf} = ${JSON.stringify(value)}\n  set by: ${layerLabel(setBy)}\n`);
      if (overrides.length > 0) writeOut(`  overrides: ${overrides.map(layerLabel).join(", ")}\n`);
      if (values.project === undefined) {
        const others = set.projects.filter((layer) => {
          const [entry] = set.effective(layer.project).explain(leaf);
          return entry !== undefined && [entry.setBy, ...entry.overrides].includes(layer);
        });
        if (others.length > 0) {
          writeOut(`  also set for Project: ${others.map((layer) => layer.project).join(", ")}\n`);
        }
      }
    }
    return ExitCode.Success;
  }

  if (values.effective) {
    writeOut(stringify(effective.policy));
    return ExitCode.Success;
  }

  const printLayer = (layer: PolicyLayer) => {
    const name = layer.project === undefined ? layer.name : `${layer.name} ${layer.project}`;
    writeOut(`# ${name}: ${layer.file}\n${stringify(layer.content)}\n`);
  };
  printLayer(set.builtIn);
  if (set.workspace !== undefined) printLayer(set.workspace);
  set.projects.forEach(printLayer);
  if (set.override === undefined) {
    writeOut(`# user override: absent (${overrideFile})\n`);
  } else {
    printLayer(set.override);
  }
  return ExitCode.Success;
};

const subcommands = new Map<string, Command>([["show", showCommand]]);

export const policyCommand: Command = (args, deps) => {
  const [name, ...rest] = args;
  const subcommand = name === undefined ? undefined : subcommands.get(name);
  if (subcommand === undefined) {
    throw new UsageError("Usage: foreman policy show [--effective] [--explain <key>] [--project <name>] [--dir <path>]");
  }
  return subcommand(rest, deps);
};
