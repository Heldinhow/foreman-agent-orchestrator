/** The environment variable every Worker is given. Its presence, whatever its value, marks one. */
export const WORKER_MARKER = "FOREMAN_WORKER";

export interface ProcessInfo {
  parent: number;
  uids: number[];
}

/** What the check reads about running processes. Both reads throw when they can't answer. */
export interface ProcessTable {
  self: number;
  info(pid: number): ProcessInfo;
  /** The raw environment block, `NAME=value` entries each ended by a NUL. */
  environ(pid: number): string;
}

export type AncestorVerdict =
  | { kind: "clear" }
  | { kind: "marked"; pid: number }
  | { kind: "uninspectable"; pid: number };

/**
 * Walks every ancestor looking for the Worker marker, because `env -u` only clears it from
 * the command's own environment. This fails closed (ADR-0039), with one exception.
 *
 * On a normal system init and `systemd --user` can't be read by the user they serve, so
 * refusing on every unreadable ancestor would refuse every human. A Worker can make its own
 * process unreadable too, so being unreadable proves nothing by itself. What a Worker can't
 * do is have another account start a process for it without a setuid helper, so an unreadable
 * ancestor passes only if the kernel or another account started it. Then the walk carries
 * on upwards. A setuid helper started by this user is refused, whichever account it runs as.
 */
export function inspectAncestors(table: ProcessTable): AncestorVerdict {
  const seen = new Set([table.self]);
  let pid = table.self;

  try {
    const self = table.info(table.self);
    pid = self.parent;
    while (pid !== 0) {
      if (seen.has(pid)) return { kind: "uninspectable", pid };
      seen.add(pid);

      const { parent } = table.info(pid);
      const environ = readEnviron(table, pid);
      if (environ === undefined) {
        if (!startedFromOutside(table, parent, self.uids)) return { kind: "uninspectable", pid };
      } else if (hasWorkerMarker(environ)) {
        return { kind: "marked", pid };
      }
      pid = parent;
    }
  } catch {
    return { kind: "uninspectable", pid };
  }
  return { kind: "clear" };
}

function readEnviron(table: ProcessTable, pid: number): string | undefined {
  try {
    return table.environ(pid);
  } catch {
    return undefined;
  }
}

function startedFromOutside(table: ProcessTable, parent: number, ownUids: number[]): boolean {
  if (parent === 0) return true;
  return !table.info(parent).uids.some((uid) => ownUids.includes(uid));
}

function hasWorkerMarker(environ: string): boolean {
  return environ
    .split("\0")
    .some((entry) => entry === WORKER_MARKER || entry.startsWith(`${WORKER_MARKER}=`));
}
