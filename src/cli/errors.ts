import { parseArgs, type ParseArgsConfig } from "node:util";

/** The command line itself is wrong. */
export class UsageError extends Error {}

/** `node:util`'s strict parser, reporting its failures as usage errors. */
export function parseCommandArgs<const Options extends NonNullable<ParseArgsConfig["options"]>>(
  args: string[],
  options: Options,
) {
  try {
    return parseArgs({ args, options, strict: true, allowPositionals: false });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}
