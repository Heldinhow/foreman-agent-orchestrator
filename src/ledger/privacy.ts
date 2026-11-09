import fs from "node:fs";
import { hostname, userInfo } from "node:os";

/** The values of this machine that must never reach the Ledger (ADR-0030). */
export interface MachineIdentity {
  home: string | undefined;
  usernames: string[];
  hostname: string;
}

export function machineIdentity(env: NodeJS.ProcessEnv = process.env): MachineIdentity {
  const usernames = [env.USER, env.LOGNAME, accountName()];
  return {
    home: env.HOME,
    usernames: usernames.filter((name): name is string => Boolean(name)),
    hostname: hostname(),
  };
}

function accountName(): string | undefined {
  try {
    return userInfo().username;
  } catch {
    // A container's uid can have no account, and then there's no name to leak.
    return undefined;
  }
}

export class LedgerPrivacyError extends Error {
  override readonly name = "LedgerPrivacyError";

  /** Names the field, not the value: this message may be shown or logged. */
  constructor(field: string, problem: string) {
    super(`Ledger: refusing to record ${field}: it contains ${problem}`);
  }
}

/** An absolute path starts at the value's start or after a separator, so `a/b` isn't one. */
const ABSOLUTE_PATH = /(?:^|[\s"'`=:,;(\[{<])~?\/(?=[^\s/])/;

export type Scrub = <Fields extends object>(fields: Fields) => Fields;

/**
 * Makes fields safe to store, or refuses them. A path inside the Workspace becomes
 * relative. Any other absolute path, or a value of this machine's identity anywhere in
 * a field, is refused rather than altered, because a quietly altered value would no
 * longer say what happened.
 */
export function createScrub(workspace: string, identity: MachineIdentity): Scrub {
  const secrets = [
    { problem: "this machine's home directory", value: identity.home },
    ...identity.usernames.map((value) => ({ problem: "this machine's username", value })),
    { problem: "this machine's hostname", value: identity.hostname },
  ].flatMap(({ problem, value }) =>
    value && value !== "/" ? [{ problem, pattern: wholeValue(value) }] : [],
  );

  return (fields) => {
    const relativize = workspaceRelativizer(workspace);

    const clean = (value: unknown, field: string): unknown => {
      if (typeof value === "string") return cleanString(value, field);
      if (Array.isArray(value)) return value.map((item, index) => clean(item, `${field}.${index}`));
      if (typeof value === "object" && value !== null) return cleanObject(value, field);
      return value;
    };

    const cleanString = (value: string, field: string): string => {
      const relative = relativize(value);
      for (const { problem, pattern } of secrets) {
        if (pattern.test(relative)) throw new LedgerPrivacyError(field, problem);
      }
      if (ABSOLUTE_PATH.test(relative)) {
        throw new LedgerPrivacyError(field, "an absolute path outside the Workspace");
      }
      return relative;
    };

    const cleanObject = (value: object, field: string): object =>
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          const path = field === "" ? key : `${field}.${key}`;
          return [cleanString(key, path), clean(item, path)];
        }),
      );

    return cleanObject(JSON.parse(JSON.stringify(fields)), "") as typeof fields;
  };
}

/** Matches the value only where it stands alone, so `ann` doesn't match inside `annual`. */
function wholeValue(value: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`, "i");
}

function workspaceRelativizer(workspace: string): (value: string) => string {
  // Resolved on use: tools report the real path, and the Workspace can appear after opening.
  const roots = new Set([workspace, realPath(workspace)]);
  const alternatives = [...roots].map(escapeRegExp).join("|");
  const root = new RegExp(`(?<![\\w./-])(?:${alternatives})(/|(?![\\w.-]))`, "g");
  return (value) => value.replace(root, (_match, slash: string) => (slash === "/" ? "" : "."));
}

function realPath(path: string): string {
  try {
    return fs.realpathSync(path);
  } catch {
    return path;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}
