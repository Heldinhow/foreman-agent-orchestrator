import { test } from "bun:test";

/** Why PTY tests can't run here, or undefined if they can. Only util-linux `script` fits. */
export const scriptSkipReason: string | undefined = findScriptProblem();

function findScriptProblem(): string | undefined {
  if (Bun.which("script") === null) return "`script` isn't on PATH";
  const version = Bun.spawnSync(["script", "--version"], { stdin: "ignore", stderr: "pipe" });
  return version.stdout.toString().includes("util-linux")
    ? undefined
    : "`script` isn't the util-linux one";
}

/**
 * `test`, or a skip when `reason` is set. The reason is printed and put in the title, so a
 * skip never looks like a pass.
 */
export function testUnless(reason: string | undefined) {
  return (title: string, body: () => Promise<void>, timeoutMs?: number) => {
    if (reason === undefined) {
      test(title, body, timeoutMs);
      return;
    }
    console.warn(`SKIPPED: ${title}: ${reason}`);
    test.skip(`${title} [skipped: ${reason}]`, body, timeoutMs);
  };
}

/** Quotes words so a shell passes each one on unchanged. */
export function shellJoin(words: string[]): string {
  return words.map((word) => `'${word.replaceAll("'", `'\\''`)}'`).join(" ");
}

export interface PtySession {
  /** Waits for terminal output to match, and fails the test if it never does. */
  waitFor(pattern: RegExp): Promise<RegExpExecArray>;
  /** Types on the terminal, as a person at the keyboard would. */
  type(text: string): void;
  /** Waits for the command to end. `output` is everything the terminal showed. */
  finish(): Promise<{ exitCode: number; output: string }>;
}

const ptyTimeoutMs = 20_000;

/** Runs a shell command line on a real PTY of its own, as its controlling terminal. */
export function startShellInPty(
  commandLine: string,
  options: { cwd: string; env: Record<string, string> },
): PtySession {
  const child = Bun.spawn(["script", "-q", "-e", "-f", "-c", commandLine, "/dev/null"], {
    cwd: options.cwd,
    env: options.env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  let output = "";
  const decoder = new TextDecoder();
  const drained = (async () => {
    for await (const chunk of child.stdout) output += decoder.decode(chunk, { stream: true });
  })();

  function fail(problem: string): never {
    child.kill("SIGKILL");
    throw new Error(`${problem}. The terminal showed:\n${output}`);
  }

  return {
    async waitFor(pattern) {
      const deadline = Date.now() + ptyTimeoutMs;
      for (;;) {
        const match = pattern.exec(output);
        if (match !== null) return match;
        if (child.exitCode !== null) fail(`the command ended without showing ${pattern}`);
        if (Date.now() > deadline) fail(`timed out waiting for ${pattern}`);
        await Bun.sleep(5);
      }
    },
    type(text) {
      void child.stdin.write(text);
      void child.stdin.flush();
    },
    async finish() {
      const finished = await Promise.race([child.exited, Bun.sleep(ptyTimeoutMs).then(() => null)]);
      if (finished === null) fail("timed out waiting for the command to end");
      await drained;
      void child.stdin.end();
      return { exitCode: finished, output };
    },
  };
}

export function startInPty(
  command: string[],
  options: { cwd: string; env: Record<string, string> },
): PtySession {
  return startShellInPty(shellJoin(command), options);
}
