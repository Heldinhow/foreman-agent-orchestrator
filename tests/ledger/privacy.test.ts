import { expect, test } from "bun:test";
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { deriveActionId } from "../../src/ledger/action-id.ts";
import { LedgerPrivacyError, openLedger } from "../../src/ledger/ledger.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { fakeIdentity, fixedClock } from "../helpers/ledger.ts";

async function newLedger() {
  const workspace = await makeTempDir();
  const ledger = openLedger({ workspace, clock: fixedClock, identity: fakeIdentity });
  return { workspace, ledger, path: join(workspace, "memory", "ledger.jsonl") };
}

const headSha = "0123456789abcdef0123456789abcdef01234567";

test("AC-55: an absolute path inside the Workspace is stored relative to it", async () => {
  const { ledger, workspace, path } = await newLedger();

  ledger.append({
    type: "worktree.created",
    data: {
      worktree: join(workspace, "memory", "runs", "run-1"),
      nested: [{ note: `saved to ${join(workspace, "a.patch")} after the crash` }],
      root: workspace,
    },
  });

  const text = await readFile(path, "utf8");
  expect(text).not.toContain(workspace);
  expect(JSON.parse(text).data).toEqual({
    worktree: "memory/runs/run-1",
    nested: [{ note: "saved to a.patch after the crash" }],
    root: ".",
  });
});

test("AC-55: a path reached through a symlink to the Workspace is stored relative too", async () => {
  const realWorkspace = await makeTempDir();
  const link = join(await makeTempDir(), "workspace-link");
  await symlink(realWorkspace, link);
  const ledger = openLedger({ workspace: link, clock: fixedClock, identity: fakeIdentity });

  ledger.append({ type: "worktree.created", data: { worktree: join(realWorkspace, "a") } });

  expect(ledger.load().events[0]?.data).toEqual({ worktree: "a" });
});

test("actionId doesn't depend on whether the target was given as an absolute path", async () => {
  const { ledger, workspace } = await newLedger();
  const action = { runId: "run-1", taskId: "task-1", kind: "worktree", headSha };

  const pending = ledger.recordPending({ ...action, target: join(workspace, "memory", "wt") });

  expect(pending.target).toBe("memory/wt");
  expect(pending.actionId).toBe(deriveActionId({ ...action, target: "memory/wt" }));
});

test.each([
  ["a path outside the Workspace", () => "/etc/hosts"],
  ["a path after other text", () => "copied from /etc/hosts today"],
  ["a path after an equals sign", () => "path=/etc/hosts"],
  ["a path in the home directory's shorthand", () => "~/notes.txt"],
  ["a sibling that shares the Workspace's prefix", (workspace: string) => `${workspace}-other/file`],
  ["a longer path that merely contains the Workspace's", (workspace: string) => `/backup${workspace}/file`],
])("AC-55: %s is refused", async (_name, value) => {
  const { ledger, workspace, path } = await newLedger();

  expect(() => ledger.append({ type: "worktree.created", data: { path: value(workspace) } })).toThrow(
    LedgerPrivacyError,
  );
  expect(await Bun.file(path).exists()).toBe(false);
});

test.each([
  ["the username", "sentinel-user"],
  ["the username inside a ref", "refs/heads/sentinel-user/fix"],
  ["the hostname", "built on sentinel-host"],
  ["the hostname in another case", "SENTINEL-HOST"],
  ["the home directory", "/nonexistent/sentinel-home/file"],
])("AC-55: %s is refused", async (_name, value) => {
  const { ledger, path } = await newLedger();

  expect(() => ledger.append({ type: "run.started", data: { value } })).toThrow(LedgerPrivacyError);
  expect(await Bun.file(path).exists()).toBe(false);
});

test("AC-55: every field is checked, including keys and an action's outcome", async () => {
  const { ledger, path } = await newLedger();
  const action = { runId: "run-1", kind: "push", target: "refs/heads/a", headSha };
  const { actionId } = ledger.recordPending(action);
  const before = await readFile(path);

  expect(() => ledger.append({ type: "run.started", data: { "sentinel-user": 1 } })).toThrow(LedgerPrivacyError);
  expect(() => ledger.append({ type: "run.started", runId: "sentinel-host" })).toThrow(LedgerPrivacyError);
  expect(() => ledger.recordPending({ ...action, target: "refs/heads/sentinel-user" })).toThrow(LedgerPrivacyError);
  expect(() => ledger.recordDone(actionId, "sentinel-user")).toThrow(LedgerPrivacyError);
  expect(() => ledger.recordDone(actionId, "pushed", { by: "sentinel-host" })).toThrow(LedgerPrivacyError);

  expect((await readFile(path)).equals(before)).toBe(true);
});

test("a refusal names the field and doesn't repeat the value", async () => {
  const { ledger } = await newLedger();

  expect(() => ledger.append({ type: "run.started", data: { who: ["sentinel-user"] } })).toThrow(
    /data\.who\.0.*username/,
  );
  expect(() => ledger.append({ type: "run.started", data: { who: "sentinel-user" } })).not.toThrow(
    /sentinel-user/,
  );
});

test.each([
  ["a Workspace-relative path", "memory/runs/run-1/a.patch"],
  ["a git ref", "refs/heads/foreman/run-1"],
  ["a URL", "https://example.test/org/repo/pull/1"],
  ["a word with a slash around spaces", "either / or"],
  ["a word that only contains the username", "xsentinel-userx"],
])("%s is stored unchanged", async (_name, value) => {
  const { ledger } = await newLedger();

  ledger.append({ type: "run.started", data: { value } });

  expect(ledger.load().events[0]?.data).toEqual({ value });
});
