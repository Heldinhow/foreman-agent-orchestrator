import type { LedgerState } from "../ledger/reducer.ts";

/** What `foreman status` shows for Adapters that have run without enforcing the Guard Policy. */
export function unenforcedAdapterWarnings(state: LedgerState): string[] {
  return [...state.unenforcedAdapterStarts].map(
    ([name, starts]) =>
      `Adapter "${name}" doesn't enforce the Guard Policy and has started ${starts} Worker${starts === 1 ? "" : "s"} under allowUnenforced`,
  );
}
