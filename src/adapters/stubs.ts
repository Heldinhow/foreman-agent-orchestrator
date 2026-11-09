import type { Adapter } from "./contract.ts";

/** The Adapters that are declared but not built (spec: T3 Code, Claude Code, Codex, Pi). */
export const STUB_ADAPTER_TYPES = ["t3code", "claude-code", "codex", "pi"] as const;

export type StubAdapterType = (typeof STUB_ADAPTER_TYPES)[number];

export function isStubAdapterType(type: string): type is StubAdapterType {
  return (STUB_ADAPTER_TYPES as readonly string[]).includes(type);
}

/**
 * A stub can't enforce Policy, so it never starts anyway. It fails every call the same
 * way, so no Operator mistakes it for a working Adapter.
 */
export function createStubAdapter(type: StubAdapterType): Adapter {
  const notImplemented = (): Promise<never> =>
    Promise.reject(new Error(`The "${type}" Adapter is not implemented yet`));
  return {
    id: type,
    capabilities: { enforcesPolicy: false, resumableSessions: false, modelSelection: false, readOnly: false },
    start: notImplemented,
    send: notImplemented,
    status: notImplemented,
    diff: notImplemented,
    cancel: notImplemented,
  };
}
