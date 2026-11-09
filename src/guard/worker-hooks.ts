import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createGit } from "../worktrees/git.ts";

/**
 * The client-side hooks git runs. Each gets a wrapper in the Worker's hook directory that
 * runs the Project's own hook, so injecting `core.hooksPath` doesn't switch its hooks off.
 */
const CHAINED_HOOKS = [
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "pre-commit",
  "pre-merge-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "pre-rebase",
  "post-checkout",
  "post-merge",
  "pre-push",
  "pre-auto-gc",
  "post-rewrite",
  "reference-transaction",
  "post-index-change",
];

const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * Where the Project's own hooks are: the hook directory git would use in `worktree` with
 * the Worker's environment, before anything is injected. Undefined if it isn't a repository.
 */
export async function projectHooksDir(worktree: string, env: Record<string, string>): Promise<string | undefined> {
  const git = createGit(env, undefined, []);
  const configured = await git.try(worktree, ["config", "--get", "--type=path", "core.hooksPath"]);
  if (configured.exitCode === 0 && configured.stdout.trim() !== "") {
    return resolve(worktree, configured.stdout.trim());
  }
  const found = await git.try(worktree, ["rev-parse", "--git-path", "hooks"]);
  return found.exitCode === 0 ? resolve(worktree, found.stdout.trim()) : undefined;
}

export interface HookDirRequest {
  /** Where the wrappers go. */
  dir: string;
  /** The Project's own hook directory. With none, a chained hook does nothing. */
  chainTo: string | undefined;
  /** Hooks that fail instead of chaining, from `guard.git.workerRejectedHooks`. */
  rejected: readonly string[];
}

/** Writes a hook directory that rejects some hooks and chains every other one to the Project's. */
export async function writeHookDir({ dir, chainTo, rejected }: HookDirRequest): Promise<void> {
  await mkdir(dir, { recursive: true });
  const names = new Set([...CHAINED_HOOKS, ...rejected]);
  for (const name of names) {
    const script = rejected.includes(name)
      ? `#!/bin/sh\necho "Foreman: this Worker can't run ${name}. Pushing and similar actions go through Foreman's Approval flow." >&2\nexit 1\n`
      : chainTo === undefined
        ? "#!/bin/sh\nexit 0\n"
        : `#!/bin/sh\nhook=${shellQuote(join(chainTo, name))}\nif [ -x "$hook" ]; then exec "$hook" "$@"; fi\nexit 0\n`;
    const file = join(dir, name);
    await writeFile(file, script);
    await chmod(file, 0o755);
  }
}
