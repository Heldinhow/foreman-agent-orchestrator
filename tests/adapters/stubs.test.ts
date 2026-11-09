import { describe, expect, test } from "bun:test";
import { createStubAdapter, STUB_ADAPTER_TYPES } from "../../src/adapters/stubs.ts";

const handle = { adapterId: "x", sessionRef: "y" };

describe.each(STUB_ADAPTER_TYPES)("the %s stub Adapter", (type) => {
  test("declares enforcesPolicy: false", () => {
    expect(createStubAdapter(type).capabilities.enforcesPolicy).toBe(false);
  });

  test("fails every call with a clear not-implemented error", async () => {
    const adapter = createStubAdapter(type);
    const spec = { cwd: "/x", prompt: "", env: {}, policy: {}, readOnly: false } as never;

    const calls = [
      adapter.start(spec),
      adapter.send(handle, "hi"),
      adapter.status(handle),
      adapter.diff(handle),
      adapter.cancel(handle),
    ];

    for (const call of calls) {
      await expect(call).rejects.toThrow(`The "${type}" Adapter is not implemented yet`);
    }
  });
});
