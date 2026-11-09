import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hermeticEnv, run, type RunResult } from "./process.ts";
import { makeTempDir } from "./temp.ts";

const IDENTITY = { name: "Test Author", email: "author@example.invalid" };

export interface BareRepo {
  path: string;
  /** Runs real git here and returns its trimmed stdout, rejecting on failure. */
  git(...args: string[]): Promise<string>;
}

export interface TempRepo extends BareRepo {
  /** Runs real git here and returns the result, whether it succeeded or not. */
  tryGit(...args: string[]): Promise<RunResult>;
  /** Writes a file, commits it and returns the new commit's SHA. */
  commitFile(path: string, content: string, message: string): Promise<string>;
}

/** A real, empty repository on branch `main`, in its own temp directory. */
export async function createTempRepo(): Promise<TempRepo> {
  const path = await makeTempDir();
  const handle = await openRepo(path);
  await handle.git("init", "--quiet", "--initial-branch=main");
  return {
    ...handle,
    async commitFile(file, content, message) {
      const target = join(path, file);
      await mkdir(dirname(target), { recursive: true });
      await Bun.write(target, content);
      await handle.git("add", "--", file);
      await handle.git("commit", "--quiet", "--message", message);
      return handle.git("rev-parse", "HEAD");
    },
  };
}

/** A real bare repository to act as a push target, in its own temp directory. */
export async function createBareRepo(): Promise<BareRepo> {
  const path = await makeTempDir();
  const handle = await openRepo(path);
  await handle.git("init", "--quiet", "--bare", "--initial-branch=main");
  return { path, git: handle.git };
}

async function openRepo(path: string) {
  const env = {
    ...hermeticEnv(await makeTempDir()),
    GIT_AUTHOR_NAME: IDENTITY.name,
    GIT_AUTHOR_EMAIL: IDENTITY.email,
    GIT_COMMITTER_NAME: IDENTITY.name,
    GIT_COMMITTER_EMAIL: IDENTITY.email,
  };
  const tryGit = (...args: string[]) => run(["git", ...args], { cwd: path, env });
  const git = async (...args: string[]) => {
    const result = await tryGit(...args);
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
    }
    return result.stdout.trim();
  };
  return { path, git, tryGit };
}
