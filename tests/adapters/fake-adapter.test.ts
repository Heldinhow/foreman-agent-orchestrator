import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, WorkerHandle, WorkerStatus } from "../../src/adapters/contract.ts";
import { parseForemanResult } from "../../src/adapters/worker-output.ts";
import { z } from "zod";
import createFakeAdapter, { readObservation, type FakeScenario } from "../fixtures/adapters/fake/adapter.ts";
import { fakeWorkerSpec, writeFakeScenario } from "../helpers/fake-adapter.ts";
import { createTempRepo, type TempRepo } from "../helpers/git.ts";
import { makeTempDir } from "../helpers/temp.ts";

type Turns = NonNullable<FakeScenario["workers"]>[number]["turns"];

async function settled(adapter: Adapter, handle: WorkerHandle): Promise<WorkerStatus> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const status = await adapter.status(handle);
    if (status.state !== "running") return status;
    await Bun.sleep(10);
  }
  throw new Error("the Worker never settled");
}

async function playing(turns: Turns, options: { enforcesPolicy?: boolean; misreportDiff?: string } = {}) {
  const workspaceDir = await makeTempDir();
  const { enforcesPolicy = true, misreportDiff } = options;
  await writeFakeScenario(workspaceDir, { enforcesPolicy, workers: [{ misreportDiff, turns }] });
  const repo = await createTempRepo();
  await repo.commitFile("README.md", "fixture\n", "Initial commit");
  const adapter = createFakeAdapter({ name: "fake", workspaceDir });
  const spec = await fakeWorkerSpec(repo.path);
  const handle = await adapter.start(spec);
  return { workspaceDir, repo, adapter, spec, handle, status: () => settled(adapter, handle) };
}

const changedFiles = (repo: TempRepo) => repo.git("status", "--porcelain");

describe("the fake Adapter plays a scenario through a real child process", () => {
  test("an edit it commits is in the repository's history, in real git", async () => {
    const { repo, status } = await playing([
      [{ edit: { path: "src/new.txt", content: "new\n" } }, { commit: "Add new" }, { say: "Done" }],
    ]);

    expect(await status()).toEqual({ state: "completed", output: "Done" });

    expect(await repo.git("log", "-1", "--format=%s")).toBe("Add new");
    expect(await repo.git("show", "HEAD:src/new.txt")).toBe("new");
    expect(await changedFiles(repo)).toBe("");
  });

  test("an edit it doesn't commit is left uncommitted", async () => {
    const { repo, status } = await playing([[{ edit: { path: "README.md", content: "changed\n" } }]]);

    await status();

    expect(await repo.git("log", "--format=%s")).toBe("Initial commit");
    expect(await changedFiles(repo)).toBe("M README.md");
  });

  test("a commit with nothing to commit fails the turn", async () => {
    const { status } = await playing([[{ commit: "Nothing here" }]]);

    expect(await status()).toEqual({
      state: "failed",
      category: "worker_error",
      message: expect.stringContaining("git commit failed"),
    });
  });

  test("a question is asked, and the answer is what it says next", async () => {
    const { adapter, handle, status } = await playing([[{ ask: "Which one?" }], [{ echoLastMessage: true }]]);

    expect(await status()).toEqual({ state: "waiting_input", question: "Which one?" });

    await adapter.send(handle, "The second.");

    expect(await status()).toEqual({ state: "completed", output: "The second." });
  });

  test.each(["provider_unavailable", "rate_limited", "auth", "worker_error"] as const)(
    "a failure is reported with the category %s",
    async (category) => {
      const { status } = await playing([[{ fail: { category, message: "It broke" } }]]);

      expect(await status()).toEqual({ state: "failed", category, message: "It broke" });
    },
  );

  test("bad output comes back as it is, and is refused as a result", async () => {
    const bad = "```foreman-result\n{not json\n```";
    const { status } = await playing([[{ badOutput: bad }]]);

    const finished = await status();

    expect(finished).toEqual({ state: "completed", output: bad });
    const parsed = parseForemanResult(finished.state === "completed" ? finished.output : "", z.unknown());
    expect(parsed.ok).toBe(false);
  });

  test("a Worker that hangs keeps running", async () => {
    const { adapter, handle } = await playing([[{ hang: true }]]);
    try {
      await Bun.sleep(100);

      expect(await adapter.status(handle)).toEqual({ state: "running" });
    } finally {
      await adapter.cancel(handle);
    }
  });

  test("a turn the scenario doesn't have fails the Worker", async () => {
    const { adapter, handle, status } = await playing([[{ say: "Only turn" }]]);
    await status();

    await adapter.send(handle, "Again");

    expect(await status()).toEqual({
      state: "failed",
      category: "worker_error",
      message: expect.stringContaining("no turn 1"),
    });
  });

  test("a misreported diff says what the scenario says, while git shows what really changed", async () => {
    const { repo, adapter, handle, status } = await playing(
      [[{ edit: { path: "README.md", content: "really changed\n" } }]],
      { misreportDiff: "diff --git a/other.txt b/other.txt\n" },
    );
    await status();

    expect(await adapter.diff(handle)).toBe("diff --git a/other.txt b/other.txt\n");
    expect(await repo.git("diff", "--name-only")).toBe("README.md");
  });

  test("an honest diff covers commits, uncommitted edits and new files since the Worker started", async () => {
    const { adapter, handle, status } = await playing([
      [
        { edit: { path: "committed.txt", content: "one\n" } },
        { commit: "Add one" },
        { edit: { path: "README.md", content: "two\n" } },
        { edit: { path: "untracked.txt", content: "three\n" } },
      ],
    ]);
    await status();

    const diff = await adapter.diff(handle);

    for (const file of ["committed.txt", "README.md", "untracked.txt"]) expect(diff).toContain(file);
  });

  test("a Worker's attempt to read .env succeeds under an Adapter that doesn't enforce Policy", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, { enforcesPolicy: false, workers: [{ turns: [[{ read: ".env" }]] }] });
    const repo = await createTempRepo();
    await writeFile(join(repo.path, ".env"), "SENTINEL=canary-env-value\n");
    const adapter = createFakeAdapter({ name: "fake", workspaceDir });

    const handle = await adapter.start(await fakeWorkerSpec(repo.path));

    expect(await settled(adapter, handle)).toEqual({
      state: "completed",
      output: expect.stringContaining("canary-env-value"),
    });
  });

  test("a Worker's attempt to read .env is stopped by the shipped Policy under one that enforces it", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, {
      enforcesPolicy: true,
      workers: [{ turns: [[{ read: ".env" }, { read: ".env.example" }]] }],
    });
    const repo = await createTempRepo();
    await writeFile(join(repo.path, ".env"), "SENTINEL=canary-env-value\n");
    await writeFile(join(repo.path, ".env.example"), "SENTINEL=example-value\n");
    const adapter = createFakeAdapter({ name: "fake", workspaceDir });

    const handle = await adapter.start(await fakeWorkerSpec(repo.path));
    const finished = await settled(adapter, handle);

    expect(finished.state).toBe("completed");
    const output = finished.state === "completed" ? finished.output : "";
    expect(output).toContain("read .env: denied");
    expect(output).toContain("example-value");
    expect(output).not.toContain("canary-env-value");
  });

  test("a .env in the Worker's cwd isn't loaded into its environment by the runtime", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, { enforcesPolicy: true, workers: [{ turns: [[{ say: "Done" }]] }] });
    const repo = await createTempRepo();
    await writeFile(join(repo.path, ".env"), "SENTINEL=canary-env-value\n");
    const adapter = createFakeAdapter({ name: "fake", workspaceDir });
    const spec = await fakeWorkerSpec(repo.path);

    const handle = await adapter.start(spec);
    await settled(adapter, handle);

    expect(readObservation(workspaceDir, handle).env).toEqual(spec.env);
  });

  test("the scenario picks a Worker by its prompt and its Task", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, {
      enforcesPolicy: true,
      workers: [
        { match: { prompt: "review", task: "task-1" }, turns: [[{ say: "review of task 1" }]] },
        { match: { prompt: "review" }, turns: [[{ say: "any other review" }]] },
        { match: { prompt: "implement" }, turns: [[{ say: "implementing" }]] },
      ],
    });
    const { path } = await createTempRepo();
    const adapter = createFakeAdapter({ name: "fake", workspaceDir });
    const said = async (prompt: string, task?: string) => {
      const base = await fakeWorkerSpec(path, { prompt });
      const env = task === undefined ? base.env : { ...base.env, FOREMAN_TASK_ID: task };
      const handle = await adapter.start({ ...base, env });
      return settled(adapter, handle);
    };

    expect(await said("Step: review", "task-1")).toEqual({ state: "completed", output: "review of task 1" });
    expect(await said("Step: review", "task-2")).toEqual({ state: "completed", output: "any other review" });
    expect(await said("Step: implement", "task-1")).toEqual({ state: "completed", output: "implementing" });
    await expect(said("Step: spec")).rejects.toThrow("no scenario matches");
  });

  test("it can declare enforcesPolicy either way", async () => {
    for (const enforcesPolicy of [true, false]) {
      const workspaceDir = await makeTempDir();
      await writeFakeScenario(workspaceDir, { enforcesPolicy });

      const adapter = createFakeAdapter({ name: "fake", workspaceDir });

      expect(adapter.capabilities.enforcesPolicy).toBe(enforcesPolicy);
    }
  });

  test("an invalid scenario is refused", async () => {
    const workspaceDir = await makeTempDir();
    await writeFile(join(workspaceDir, "fake-adapter.yaml"), "enforcesPolicy: maybe\n");

    expect(() => createFakeAdapter({ name: "fake", workspaceDir })).toThrow();
  });

  test("a model and read-only flag reach the Worker as given", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, { enforcesPolicy: true, workers: [{ turns: [[{ say: "Done" }]] }] });
    const { path } = await createTempRepo();
    const adapter = createFakeAdapter({ name: "fake", workspaceDir });

    const handle = await adapter.start(
      await fakeWorkerSpec(path, { model: "provider/model#variant", readOnly: true }),
    );
    await settled(adapter, handle);

    expect(readObservation(workspaceDir, handle)).toMatchObject({ model: "provider/model#variant", readOnly: true });
  });
});
