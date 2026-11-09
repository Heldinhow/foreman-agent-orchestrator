import { expect, test } from "bun:test";
import { dlopen, FFIType } from "bun:ffi";
import { join } from "node:path";
import { procfs } from "../../src/approvals/local-channel.ts";
import { recordApprovalRequest, type NewApprovalRequest } from "../../src/approvals/requests.ts";
import { inspectAncestors } from "../../src/approvals/worker-check.ts";
import { openLedger } from "../../src/ledger/ledger.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";
import { buildTimeoutMs, builtCliPath, hermeticEnv, repoRoot, run } from "../helpers/process.ts";
import { scriptSkipReason, shellJoin, startInPty, startShellInPty, testUnless } from "../helpers/pty.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { createWorkspace } from "../helpers/workspace.ts";

const request: NewApprovalRequest = {
  runId: "run-1",
  taskId: "task-1",
  kind: "push",
  target: "origin refs/heads/topic",
  headSha: "a".repeat(40),
  diffSummary: "2 files changed, 10 insertions(+), 1 deletion(-)",
};

const NONCE_PROMPT = /nonce: ([0-9a-f]{8})\r?\n> /;

/** The check also reads this test process's ancestors, so they must be clear for a success. */
const chainSkipReason: string | undefined = (() => {
  const verdict = inspectAncestors(procfs).kind;
  return verdict === "clear" ? undefined : `this test run's own ancestors are ${verdict}`;
})();

const undumpableSkipReason: string | undefined = (() => {
  try {
    dlopen("libc.so.6", {
      prctl: { args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64], returns: FFIType.i32 },
    });
    return chainSkipReason;
  } catch {
    return "prctl can't be called through libc.so.6 here";
  }
})();

const needsPty = testUnless(scriptSkipReason ?? chainSkipReason);
const needsClearChain = testUnless(chainSkipReason);

const ledgerAt = (workspace: string) =>
  openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });

async function scenario() {
  const { dir: workspace } = await createWorkspace();
  const home = await makeTempDir();
  const ledger = ledgerAt(workspace);
  const actionId = recordApprovalRequest(ledger, request);
  return {
    workspace,
    ledger,
    actionId,
    options: { cwd: workspace, env: hermeticEnv(home) },
    cli: await builtCliPath(),
    decision: () => ledger.load().state.approvalRequests.get(actionId)?.decision,
  };
}

test(
  "AC-32: approve refuses with no TTY and shows no nonce",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const result = await run([cli, "approve", "--dir", workspace, actionId], {
      ...options,
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("interactive terminal");
    expect(result.stdout + result.stderr).not.toContain("nonce");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

needsPty(
  "AC-33: approve succeeds with a real PTY and the right nonce",
  async () => {
    const { cli, workspace, ledger, actionId, options, decision } = await scenario();

    const pty = startInPty([cli, "approve", "--dir", workspace, actionId], options);
    const [, nonce] = await pty.waitFor(NONCE_PROMPT);
    pty.type(`${nonce}\n`);
    const { exitCode, output } = await pty.finish();

    expect(exitCode).toBe(0);
    expect(output).toContain(actionId);
    expect(output).toContain("origin refs/heads/topic");
    expect(output).toContain("a".repeat(40));
    expect(output).toContain("2 files changed, 10 insertions(+), 1 deletion(-)");
    expect(decision()).toBe("approved");
    expect(ledger.load().events.at(-1)).toMatchObject({
      type: "approval.granted",
      actionId,
      data: { channel: "local" },
    });
  },
  buildTimeoutMs,
);

needsPty(
  "AC-32: approve refuses a wrong nonce on a real PTY",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const pty = startInPty([cli, "approve", "--dir", workspace, actionId], options);
    const [, nonce] = await pty.waitFor(NONCE_PROMPT);
    pty.type(`${nonce === "00000000" ? "00000001" : "00000000"}\n`);
    const { exitCode, output } = await pty.finish();

    expect(exitCode).toBe(1);
    expect(output).toContain("wrong nonce");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

needsPty(
  "the nonce is random per invocation",
  async () => {
    const { cli, workspace, actionId, options } = await scenario();

    const nonces: (string | undefined)[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const pty = startInPty([cli, "approve", "--dir", workspace, actionId], options);
      nonces.push((await pty.waitFor(NONCE_PROMPT))[1]);
      pty.type("wrong\n");
      expect((await pty.finish()).exitCode).toBe(1);
    }

    expect(nonces[0]).not.toBe(nonces[1]);
  },
  buildTimeoutMs,
);

needsPty(
  "the nonce is read from the terminal, not stdin",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const approve = shellJoin([cli, "approve", "--dir", workspace, actionId]);
    const pty = startShellInPty(`echo not-the-nonce | ${approve}`, options);
    const [, nonce] = await pty.waitFor(NONCE_PROMPT);
    pty.type(`${nonce}\n`);

    expect((await pty.finish()).exitCode).toBe(0);
    expect(decision()).toBe("approved");
  },
  buildTimeoutMs,
);

needsPty(
  "the nonce is shown on the terminal alone, so captured output can't reveal it",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const captured = join(await makeTempDir(), "captured");

    const approve = shellJoin([cli, "approve", "--dir", workspace, actionId]);
    const pty = startShellInPty(`${approve} > ${shellJoin([captured])} 2>&1`, options);
    const [, nonce] = await pty.waitFor(NONCE_PROMPT);
    pty.type(`${nonce}\n`);

    expect((await pty.finish()).exitCode).toBe(0);
    expect(decision()).toBe("approved");
    expect(await Bun.file(captured).text()).toBe(`Approved ${actionId}\n`);
  },
  buildTimeoutMs,
);

needsPty(
  "the nonce is bound to what's displayed: a change after the display refuses it",
  async () => {
    const { cli, workspace, ledger, actionId, options, decision } = await scenario();

    const pty = startInPty([cli, "approve", "--dir", workspace, actionId], options);
    const [, nonce] = await pty.waitFor(NONCE_PROMPT);
    recordApprovalRequest(ledger, { ...request, diffSummary: "99 files changed" });
    pty.type(`${nonce}\n`);
    const { exitCode, output } = await pty.finish();

    expect(exitCode).toBe(1);
    expect(output).toContain("changed after it was shown");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

testUnless(scriptSkipReason)(
  "AC-32: approve refuses under the Worker marker, even with a real PTY",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const pty = startInPty([cli, "approve", "--dir", workspace, actionId], {
      ...options,
      env: { ...options.env, FOREMAN_WORKER: "1" },
    });
    const { exitCode, output } = await pty.finish();

    expect(exitCode).toBe(1);
    expect(output).toContain("Worker marker");
    expect(output).not.toContain("nonce");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

test(
  "AC-32: an empty Worker marker still counts",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const result = await run([cli, "approve", "--dir", workspace, actionId], {
      ...options,
      env: { ...options.env, FOREMAN_WORKER: "" },
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Worker marker");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

/** A shell line that stays alive as the command's parent: the `exit` stops it from exec'ing. */
const asParent = (commandLine: string) => `${commandLine}; exit $?`;

needsClearChain(
  "AC-32: env -u from a marked parent refuses, because only the ancestor has the marker",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const envU = ["env", "-u", "FOREMAN_WORKER", cli, "approve", "--dir", workspace, actionId];

    const result = await run(["sh", "-c", asParent(shellJoin(envU))], {
      ...options,
      env: { ...options.env, FOREMAN_WORKER: "1" },
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("has the Worker marker");
    expect(result.stderr).toContain("ancestor");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

needsPty(
  "AC-32: env -u from a marked parent refuses on a real PTY, and shows no nonce",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const envU = ["env", "-u", "FOREMAN_WORKER", cli, "approve", "--dir", workspace, actionId];
    const markedParent = shellJoin(["env", "FOREMAN_WORKER=1", "sh", "-c", asParent(shellJoin(envU))]);

    const pty = startShellInPty(asParent(markedParent), options);
    const { exitCode, output } = await pty.finish();

    expect(exitCode).toBe(1);
    expect(output).toContain("has the Worker marker");
    expect(output).not.toContain("nonce");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

needsPty(
  "the same command line from an unmarked parent reaches the nonce",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const envU = ["env", "-u", "FOREMAN_WORKER", cli, "approve", "--dir", workspace, actionId];
    const parent = shellJoin(["env", "UNRELATED=1", "sh", "-c", asParent(shellJoin(envU))]);

    const pty = startShellInPty(asParent(parent), options);
    const [, nonce] = await pty.waitFor(NONCE_PROMPT);
    pty.type(`${nonce}\n`);

    expect((await pty.finish()).exitCode).toBe(0);
    expect(decision()).toBe("approved");
  },
  buildTimeoutMs,
);

needsClearChain(
  "AC-32: a marked grandparent is found through clean processes in between",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const envU = ["env", "-u", "FOREMAN_WORKER", cli, "approve", "--dir", workspace, actionId];
    const cleanParent = shellJoin(["env", "-u", "FOREMAN_WORKER", "sh", "-c", asParent(shellJoin(envU))]);

    const result = await run(["sh", "-c", asParent(cleanParent)], {
      ...options,
      env: { ...options.env, FOREMAN_WORKER: "1" },
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("has the Worker marker");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

testUnless(undumpableSkipReason)(
  "approve and reject refuse when an ancestor can't be inspected",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const helper = join(repoRoot, "tests", "helpers", "undumpable-parent.ts");

    for (const command of ["approve", "reject"]) {
      const result = await run(["bun", helper, cli, command, "--dir", workspace, actionId], {
        ...options,
        noTerminal: true,
      });

      expect(result.stderr).toContain("can't be inspected");
      expect(result.exitCode).toBe(1);
    }
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

needsClearChain(
  "reject succeeds with no TTY",
  async () => {
    const { cli, workspace, ledger, actionId, options, decision } = await scenario();

    const result = await run([cli, "reject", "--dir", workspace, actionId], {
      ...options,
      noTerminal: true,
    });

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(decision()).toBe("rejected");
    expect(ledger.load().events.at(-1)).toMatchObject({
      type: "approval.rejected",
      actionId,
      data: { channel: "local" },
    });
  },
  buildTimeoutMs,
);

test(
  "reject refuses under the Worker marker",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const result = await run([cli, "reject", "--dir", workspace, actionId], {
      ...options,
      env: { ...options.env, FOREMAN_WORKER: "1" },
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Worker marker");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

needsClearChain(
  "reject refuses when only an ancestor has the marker",
  async () => {
    const { cli, workspace, actionId, options, decision } = await scenario();
    const envU = ["env", "-u", "FOREMAN_WORKER", cli, "reject", "--dir", workspace, actionId];

    const result = await run(["sh", "-c", asParent(shellJoin(envU))], {
      ...options,
      env: { ...options.env, FOREMAN_WORKER: "1" },
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("has the Worker marker");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

test.each([
  ["FOREMAN_TEST", "1"],
  ["FOREMAN_HUMAN_CHANNEL", "test"],
  ["FOREMAN_SKIP_HUMAN_CHANNEL", "1"],
  ["FOREMAN_NONCE", "00000000"],
  ["NODE_ENV", "test"],
  ["BUN_ENV", "test"],
  ["CI", "true"],
])(
  "AC-85: %s=%s doesn't let the built CLI approve without a terminal",
  async (name, value) => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const result = await run([cli, "approve", "--dir", workspace, actionId], {
      ...options,
      env: { ...options.env, [name]: value },
      noTerminal: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("interactive terminal");
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);

test.each(["--yes", "--force", "--no-tty", "--test", "--nonce=00000000", "--channel=test", "-y"])(
  "AC-85: the built CLI has no %s option",
  async (flag) => {
    const { cli, workspace, actionId, options, decision } = await scenario();

    const result = await run([cli, "approve", flag, "--dir", workspace, actionId], {
      ...options,
      noTerminal: true,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(flag.split("=")[0] as string);
    expect(decision()).toBe("awaiting");
  },
  buildTimeoutMs,
);
