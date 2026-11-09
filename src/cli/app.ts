import { version } from "../../package.json";
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
}

export interface App {
  /** Runs one command. `argv` excludes the runtime and script path. */
  exec(argv: string[]): Promise<ExitCode>;
}

type Command = (args: string[], deps: AppDeps) => ExitCode | Promise<ExitCode>;

const commands = new Map<string, Command>([
  [
    "--version",
    (_args, { terminal }) => {
      terminal.writeOut(`${version}\n`);
      return ExitCode.Success;
    },
  ],
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
        const reason = error instanceof Error ? error.message : String(error);
        deps.terminal.writeErr(`foreman: ${reason}\n`);
        return ExitCode.RuntimeError;
      }
    },
  };
}
