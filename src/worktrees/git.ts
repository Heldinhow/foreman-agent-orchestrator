/**
 * Foreman's own git use. A Worker can edit a repository's shared config, so every command
 * overrides the settings that would run code from it with Foreman's privileges: hooks,
 * the file system monitor, the pager and the ssh command.
 */
const EXEC_CAPABLE_CONFIG = [
  "core.hooksPath=/dev/null",
  "core.fsmonitor=false",
  "core.pager=cat",
  "core.sshCommand=ssh",
];

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

/** `env` is used as given, so the caller decides what git can see of the machine. */
export function createGit(env: Record<string, string>, identity: GitIdentity): Git {
  const fullEnv = {
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
  const overrides = EXEC_CAPABLE_CONFIG.flatMap((setting) => ["-c", setting]);

  async function tryGit(cwd: string, args: readonly string[]): Promise<GitResult> {
    const child = Bun.spawn(["git", ...overrides, ...args], {
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
