import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ConfigError } from "../../src/config/errors.ts";
import { loadAdapterModule } from "../../src/adapters/local-module.ts";
import { resolveAdapter } from "../../src/adapters/registry.ts";
import { FAKE_ADAPTER_MODULE, writeFakeScenario } from "../helpers/fake-adapter.ts";
import { makeTempDir } from "../helpers/temp.ts";
import { writeFileWithParents } from "../helpers/workspace.ts";

const validModule = `
const no = async () => { throw new Error("unused"); };
export default ({ name }) => ({
  id: name,
  capabilities: { enforcesPolicy: false, resumableSessions: false, modelSelection: false, readOnly: false },
  start: no, send: no, status: no, diff: no, cancel: no,
});
`;

async function moduleWith(source: string) {
  const dir = await makeTempDir();
  const file = join(dir, "adapter.ts");
  await writeFileWithParents(file, source);
  return { dir, file };
}

describe("an Adapter loaded from a local module", () => {
  test("loads from an explicit absolute path", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, { enforcesPolicy: false });

    const adapter = await loadAdapterModule("fake", FAKE_ADAPTER_MODULE, workspaceDir);

    expect(adapter.capabilities.enforcesPolicy).toBe(false);
  });

  test("loads from a path relative to the Workspace, not to where Foreman runs", async () => {
    const { dir } = await moduleWith(validModule);

    const adapter = await loadAdapterModule("mine", "./adapter.ts", dir);

    expect(adapter.id).toBe("mine");
  });

  test("a Policy's adapter entry with a module resolves through the registry", async () => {
    const workspaceDir = await makeTempDir();
    await writeFakeScenario(workspaceDir, { enforcesPolicy: true });

    const adapter = await resolveAdapter("fake", { type: "fake", module: FAKE_ADAPTER_MODULE }, workspaceDir);

    expect(adapter.capabilities.enforcesPolicy).toBe(true);
  });

  test("a built-in stub type resolves without a module, and an unknown type is refused", async () => {
    const workspaceDir = await makeTempDir();

    expect((await resolveAdapter("c", { type: "claude-code" }, workspaceDir)).id).toBe("claude-code");
    await expect(resolveAdapter("x", { type: "fake" }, workspaceDir)).rejects.toThrow(ConfigError);
  });

  test("a missing module is refused, naming the Adapter", async () => {
    const dir = await makeTempDir();

    await expect(loadAdapterModule("ghost", "./nope.ts", dir)).rejects.toThrow(/Adapter "ghost".*doesn't exist/);
  });

  test("a bare package name is refused, so nothing is looked up or downloaded", async () => {
    const dir = await makeTempDir();

    await expect(loadAdapterModule("pkg", "some-package", dir)).rejects.toThrow(/isn't a local path/);
  });

  test.each([
    ["no default export", "export const x = 1;", /must have a default export/],
    ["a default export that isn't a function", "export default 42;", /must have a default export/],
    ["a factory that throws", `export default () => { throw new Error("boom"); };`, /failed to create its Adapter: boom/],
    ["a syntax error", "export default (", /can't be loaded/],
    ["an object that isn't an Adapter", "export default () => ({ id: 'x' });", /didn't return a valid Adapter.*capabilities/],
    [
      "an enforcesPolicy that isn't a boolean",
      validModule.replace("enforcesPolicy: false", "enforcesPolicy: 'yes'"),
      /enforcesPolicy/,
    ],
  ])("an invalid module is refused: %s", async (_name, source, message) => {
    const { dir, file } = await moduleWith(source);

    const error = await loadAdapterModule("bad", file, dir).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toMatch(message);
  });
});
