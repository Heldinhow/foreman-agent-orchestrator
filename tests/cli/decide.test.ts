import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { recordApprovalRequest, type NewApprovalRequest } from "../../src/approvals/requests.ts";
import { openLedger } from "../../src/ledger/ledger.ts";
import { createTestApp } from "../helpers/app.ts";
import { createTestHumanChannel, type TestHumanChannelOptions } from "../helpers/human-channel.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";
import { createWorkspace } from "../helpers/workspace.ts";

const request: NewApprovalRequest = {
  runId: "run-1",
  taskId: "task-1",
  kind: "push",
  target: "origin refs/heads/topic",
  headSha: "a".repeat(40),
  diffSummary: "2 files changed, 10 insertions(+), 1 deletion(-)",
};

const makeWorkspace = async () => (await createWorkspace()).dir;

const ledgerAt = (workspace: string) =>
  openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });

async function workspaceWithRequest(overrides: Partial<NewApprovalRequest> = {}) {
  const workspace = await makeWorkspace();
  const ledger = ledgerAt(workspace);
  const actionId = recordApprovalRequest(ledger, { ...request, ...overrides });
  return { workspace, ledger, actionId };
}

function appWith(
  options: TestHumanChannelOptions = {},
  deps: { env?: Record<string, string>; cwd?: string } = {},
) {
  const humanChannel = createTestHumanChannel(options);
  return { ...createTestApp({ humanChannel, ...deps }), humanChannel };
}

const decisions = (workspace: string) =>
  ledgerAt(workspace)
    .load()
    .events.filter((event) => event.type === "approval.granted" || event.type === "approval.rejected");

const decisionOf = (workspace: string, actionId: string) =>
  ledgerAt(workspace).load().state.approvalRequests.get(actionId)?.decision;

test("approve shows what's being approved and records the Approval against that display", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app, terminal, humanChannel } = appWith();

  const exitCode = await app.exec(["approve", "--dir", workspace, actionId]);

  expect(terminal.stderr).toBe("");
  expect(exitCode).toBe(0);
  const shown = humanChannel.screen.join("");
  expect(shown).toContain(actionId);
  expect(shown).toContain("push");
  expect(shown).toContain("origin refs/heads/topic");
  expect(shown).toContain("a".repeat(40));
  expect(shown).toContain("2 files changed, 10 insertions(+), 1 deletion(-)");

  const [granted, ...others] = decisions(workspace);
  expect(others).toEqual([]);
  expect(granted).toMatchObject({
    type: "approval.granted",
    actionId,
    runId: "run-1",
    taskId: "task-1",
    data: { channel: "test" },
  });
  expect(granted?.data?.displayHash).toMatch(/^[0-9a-f]{64}$/);
  expect(decisionOf(workspace, actionId)).toBe("approved");
});

test("approve refuses a wrong nonce and records nothing", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app, terminal } = appWith({ type: (nonce) => `${nonce}0` });

  expect(await app.exec(["approve", "--dir", workspace, actionId])).toBe(1);

  expect(terminal.stderr).toContain("nonce");
  expect(decisions(workspace)).toEqual([]);
});

test("approve refuses when the terminal gives no answer", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app } = appWith({ type: () => undefined });

  expect(await app.exec(["approve", "--dir", workspace, actionId])).toBe(1);

  expect(decisions(workspace)).toEqual([]);
});

test("the nonce differs per invocation on the same request", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const nonces: string[] = [];
  const { app } = appWith({
    type: (nonce) => {
      nonces.push(nonce);
      return "wrong";
    },
  });

  await app.exec(["approve", "--dir", workspace, actionId]);
  await app.exec(["approve", "--dir", workspace, actionId]);

  expect(nonces).toHaveLength(2);
  expect(nonces[0]).not.toBe(nonces[1]);
});

test("the nonce is bound to the display: a change after it's shown refuses the right nonce", async () => {
  const { workspace, ledger, actionId } = await workspaceWithRequest();
  const { app, terminal } = appWith({
    beforeTyping: () =>
      void recordApprovalRequest(ledger, { ...request, diffSummary: "99 files changed" }),
  });

  expect(await app.exec(["approve", "--dir", workspace, actionId])).toBe(1);

  expect(terminal.stderr).toContain("changed");
  expect(decisions(workspace)).toEqual([]);
});

test("a request rejected while the nonce is on screen can't then be approved", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app: otherApp } = appWith();
  let rejection: Promise<unknown> = Promise.resolve();
  const { app } = appWith({
    beforeTyping: () => {
      rejection = otherApp.exec(["reject", "--dir", workspace, actionId]);
    },
  });

  const exitCode = await app.exec(["approve", "--dir", workspace, actionId]);
  await rejection;

  expect(exitCode).toBe(1);
  expect(decisionOf(workspace, actionId)).toBe("rejected");
  expect(decisions(workspace)).toHaveLength(1);
});

test("control sequences in a recorded value can't reach the Operator's terminal", async () => {
  const { workspace, actionId } = await workspaceWithRequest({
    diffSummary: "1 file changed\u001b[2K\rnothing to see\u202e\u009b",
  });
  const { app, humanChannel } = appWith();

  expect(await app.exec(["approve", "--dir", workspace, actionId])).toBe(0);

  const shown = humanChannel.screen.join("");
  expect(shown).toContain("1 file changed");
  expect(shown).not.toMatch(/[\u001b\r\u202e\u009b]/);
});

test("approve refuses an unknown request and records nothing", async () => {
  const workspace = await makeWorkspace();
  const { app, terminal, humanChannel } = appWith();

  expect(await app.exec(["approve", "--dir", workspace, "no-such-action"])).toBe(1);

  expect(terminal.stderr).toContain("no-such-action");
  expect(humanChannel.screen).toEqual([]);
  expect(decisions(workspace)).toEqual([]);
});

test("approve refuses a request already decided", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app } = appWith();
  await app.exec(["approve", "--dir", workspace, actionId]);

  const again = appWith();
  expect(await again.app.exec(["approve", "--dir", workspace, actionId])).toBe(1);
  expect(await again.app.exec(["reject", "--dir", workspace, actionId])).toBe(1);

  expect(again.terminal.stderr).toContain("already approved");
  expect(decisions(workspace)).toHaveLength(1);
});

test("approve refuses a request already rejected", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  await appWith().app.exec(["reject", "--dir", workspace, actionId]);

  const again = appWith();
  expect(await again.app.exec(["approve", "--dir", workspace, actionId])).toBe(1);

  expect(again.terminal.stderr).toContain("already rejected");
  expect(decisionOf(workspace, actionId)).toBe("rejected");
});

test("approve under the Worker marker refuses before reading anything", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app, terminal, humanChannel } = appWith({ worker: true });

  expect(await app.exec(["approve", "--dir", workspace, actionId])).toBe(1);

  expect(terminal.stderr).toContain("Worker");
  expect(humanChannel.screen).toEqual([]);
  expect(decisions(workspace)).toEqual([]);
});

test("under the Worker marker even a malformed command is refused as a Worker", async () => {
  const { app, terminal } = appWith({ worker: true });

  expect(await app.exec(["approve"])).toBe(1);

  expect(terminal.stderr).toContain("Worker");
});

test("approve refuses with no terminal", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app, terminal } = appWith({ noTerminal: true });

  expect(await app.exec(["approve", "--dir", workspace, actionId])).toBe(1);

  expect(terminal.stderr).toContain("terminal");
  expect(decisions(workspace)).toEqual([]);
});

test("reject records the rejection without a terminal or a nonce", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app, terminal, humanChannel } = appWith({ noTerminal: true });

  const exitCode = await app.exec(["reject", "--dir", workspace, actionId]);

  expect(terminal.stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(humanChannel.screen).toEqual([]);
  expect(decisions(workspace)).toMatchObject([
    { type: "approval.rejected", actionId, runId: "run-1", data: { channel: "test" } },
  ]);
  expect(decisionOf(workspace, actionId)).toBe("rejected");
});

test("reject refuses under the Worker marker", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app, terminal } = appWith({ worker: true });

  expect(await app.exec(["reject", "--dir", workspace, actionId])).toBe(1);

  expect(terminal.stderr).toContain("Worker");
  expect(decisions(workspace)).toEqual([]);
});

test("reject refuses an unknown request", async () => {
  const workspace = await makeWorkspace();
  const { app, terminal } = appWith();

  expect(await app.exec(["reject", "--dir", workspace, "no-such-action"])).toBe(1);

  expect(terminal.stderr).toContain("no-such-action");
});

test("a request recorded again after a decision awaits a new one", async () => {
  const { workspace, ledger, actionId } = await workspaceWithRequest();
  await appWith().app.exec(["reject", "--dir", workspace, actionId]);

  expect(recordApprovalRequest(ledger, request)).toBe(actionId);

  expect(decisionOf(workspace, actionId)).toBe("awaiting");
  expect(await appWith().app.exec(["approve", "--dir", workspace, actionId])).toBe(0);
});

test.each([
  [["approve"]],
  [["reject"]],
  [["approve", "--dir"]],
  [["approve", "one", "two"]],
  [["reject", "one", "two"]],
])("%j is a usage error", async (argv) => {
  const { app, terminal } = appWith();

  expect(await app.exec(argv)).toBe(2);

  expect(terminal.stderr).not.toBe("");
});

test.each(["--yes", "--force", "--no-tty", "--nonce=abc", "-y"])(
  "approve has no %s option",
  async (flag) => {
    const { workspace, actionId } = await workspaceWithRequest();
    const { app, terminal, humanChannel } = appWith();

    expect(await app.exec(["approve", "--dir", workspace, actionId, flag])).toBe(2);

    expect(terminal.stderr).toContain(flag.split("=")[0] as string);
    expect(humanChannel.screen).toEqual([]);
    expect(decisions(workspace)).toEqual([]);
  },
);

test("the Workspace can come from --dir=<path>", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app } = appWith();

  expect(await app.exec(["reject", `--dir=${workspace}`, actionId])).toBe(0);

  expect(decisionOf(workspace, actionId)).toBe("rejected");
});

test("--dir that isn't a Workspace is refused, and no Ledger is created there", async () => {
  const { workspace } = await workspaceWithRequest();
  const notAWorkspace = join(workspace, "foreman");
  const { app, terminal } = appWith();

  expect(await app.exec(["reject", "--dir", notAWorkspace, "some-action"])).toBe(2);

  expect(terminal.stderr).toContain("Workspace");
  expect(await Bun.file(join(notAWorkspace, "memory", "ledger.jsonl")).exists()).toBe(false);
});

test("the Workspace can come from FOREMAN_WORKSPACE", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app } = appWith({}, { env: { FOREMAN_WORKSPACE: workspace } });

  expect(await app.exec(["reject", actionId])).toBe(0);

  expect(decisionOf(workspace, actionId)).toBe("rejected");
});

test("--dir wins over FOREMAN_WORKSPACE", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const { app } = appWith({}, { env: { FOREMAN_WORKSPACE: await makeWorkspace() } });

  expect(await app.exec(["reject", "--dir", workspace, actionId])).toBe(0);

  expect(decisionOf(workspace, actionId)).toBe("rejected");
});

test("the Workspace can come from the nearest ancestor holding foreman/foreman.yaml", async () => {
  const { workspace, actionId } = await workspaceWithRequest();
  const nested = join(workspace, "some", "where");
  await mkdir(nested, { recursive: true });
  const { app } = appWith({}, { cwd: nested });

  expect(await app.exec(["reject", actionId])).toBe(0);

  expect(decisionOf(workspace, actionId)).toBe("rejected");
});
