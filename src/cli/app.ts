import { version } from "../../package.json";
import type { HumanChannel } from "../approvals/human-channel.ts";
import { ConfigError } from "../config/errors.ts";
import { approveCommand, rejectCommand } from "./commands/decide.ts";
import { policyCommand } from "./commands/policy.ts";
import { validateCommand } from "./commands/validate.ts";
import { UsageError } from "./errors.ts";
import { ExitCode } from "./exit-codes.ts";

export interface Clock {
  now(): Date;
}

export interface Terminal {
  writeOut(text: string): void;
  writeErr(text: string): void;
}

export interface AppDeps {
  clock: Clock;
  terminal: Terminal;
  humanChannel: HumanChannel;
  env: Record<string, string | undefined>;
  cwd: string;
  /** The shipped `policy/defaults.yaml`, the built-in Policy Layer. */
  policyDefaultsFile: string;
}

export interface App {
  /** Runs one command. `argv` excludes the runtime and script path. */
  exec(argv: string[]): Promise<ExitCode>;
}

export type Command = (args: string[], deps: AppDeps) => ExitCode | Promise<ExitCode>;

const commands = new Map<string, Command>([
  [
    "--version",
    (_args, { terminal }) => {
      terminal.writeOut(`${version}\n`);
      return ExitCode.Success;
    },
  ],
  ["approve", approveCommand],
  ["reject", rejectCommand],
  ["policy", policyCommand],
  ["validate", validateCommand],
]);

const USAGE = "Usage: foreman <command>\n";

export function createApp(deps: AppDeps): App {
  return {
    async exec(argv) {
      const [name, ...args] = argv;
      if (name === undefined) {
        deps.terminal.writeErr(USAGE);
        return ExitCode.Usage;
      }

      const command = commands.get(name);
      if (command === undefined) {
        deps.terminal.writeErr(`foreman: unknown command "${name}"\n${USAGE}`);
        return ExitCode.Usage;
      }

      try {
        return await command(args, deps);
      } catch (error) {
        if (error instanceof UsageError || error instanceof ConfigError) {
          deps.terminal.writeErr(`foreman: ${error.message}\n`);
          return ExitCode.Usage;
        }
        const reason = error instanceof Error ? error.message : String(error);
        deps.terminal.writeErr(`foreman: ${reason}\n`);
        return ExitCode.RuntimeError;
      }
    },
  };
}
