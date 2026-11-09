/**
 * Git use for Foreman and for reading a repository. A Worker can edit a repository's shared
 * config, so Foreman's own commands pass the `guard.git.overrides` settings from Policy with
 * `-c`, which beat any config file: settings that would run code with Foreman's privileges.
 */

export interface GitIdentity {
  name: string;
  email: string;
}

export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  constructor(args: readonly string[], result: GitResult) {
    super(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
  }
}

export interface Git {
  /** Runs git in `cwd` and returns the result, whether it succeeded or not. */
  try(cwd: string, args: readonly string[]): Promise<GitResult>;
  /** Runs git in `cwd` and returns stdout, throwing `GitError` on failure. */
  run(cwd: string, args: readonly string[]): Promise<string>;
}

/**
 * `env` is used as given, so the caller decides what git can see of the machine. With no
 * identity, none is set, which suits reads. `overrides` are `name=value` config settings.
 */
export function createGit(
  env: Record<string, string>,
  identity: GitIdentity | undefined,
  overrides: readonly string[],
): Git {
  const fullEnv = {
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    ...(identity === undefined
      ? {}
      : {
          GIT_AUTHOR_NAME: identity.name,
          GIT_AUTHOR_EMAIL: identity.email,
          GIT_COMMITTER_NAME: identity.name,
          GIT_COMMITTER_EMAIL: identity.email,
        }),
  };
  const settings = overrides.flatMap((setting) => ["-c", setting]);

  async function tryGit(cwd: string, args: readonly string[]): Promise<GitResult> {
    const child = Bun.spawn(["git", ...settings, ...args], {
      cwd,
      env: fullEnv,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  }

  return {
    try: tryGit,
    async run(cwd, args) {
      const result = await tryGit(cwd, args);
      if (result.exitCode !== 0) throw new GitError(args, result);
      return result.stdout;
    },
  };
}
