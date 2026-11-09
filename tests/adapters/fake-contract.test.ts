import createFakeAdapter, { fakeWorkerAlive, fakeWorkerPid, readObservation } from "../fixtures/adapters/fake/adapter.ts";
import { fakeWorkerSpec, writeFakeScenario } from "../helpers/fake-adapter.ts";
import { createTempRepo } from "../helpers/git.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { describeAdapterContract, type ContractBehaviour } from "./contract-suite.ts";

const result = { result: { summary: "done" } };

describeAdapterContract("fake", async () => {
  const workspaceDir = await makeTempDir();
  await writeFakeScenario(workspaceDir, {
    enforcesPolicy: true,
    workers: [
      { match: { prompt: "contract:result" }, turns: [[result]] },
      { match: { prompt: "contract:ask-then-result" }, turns: [[{ ask: "Which option?" }], [result]] },
      { match: { prompt: "contract:bad-then-result" }, turns: [[{ badOutput: "not a block" }], [result]] },
      {
        match: { prompt: "contract:fail" },
        turns: [[{ fail: { category: "provider_unavailable", message: "The provider is down" } }]],
      },
      { match: { prompt: "contract:hang" }, turns: [[{ hang: true }]] },
      {
        match: { prompt: "contract:edit" },
        turns: [[{ edit: { path: "contract-edit.txt", content: "edited\n" } }, result]],
      },
    ],
  });

  return {
    createAdapter: async () => createFakeAdapter({ name: "fake", workspaceDir }),
    workerSpec: async (behaviour: ContractBehaviour, overrides) => {
      const repo = await createTempRepo();
      await repo.commitFile("README.md", "fixture\n", "Initial commit");
      return fakeWorkerSpec(repo.path, { prompt: `contract:${behaviour}`, ...overrides });
    },
    observe: async (handle) => readObservation(workspaceDir, handle),
    workerAlive: async (handle) => fakeWorkerAlive(workspaceDir, handle),
    killWorker: async (handle) => {
      process.kill(fakeWorkerPid(workspaceDir, handle), "SIGKILL");
    },
  };
});
