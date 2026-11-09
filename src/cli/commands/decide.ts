import {
  awaitingRequest,
  recordGranted,
  recordRejected,
  renderRequest,
} from "../../approvals/requests.ts";
import { findWorkspace } from "../../config/workspace-location.ts";
import { openLedger } from "../../ledger/ledger.ts";
import { machineIdentity } from "../../ledger/privacy.ts";
import type { AppDeps, Command } from "../app.ts";
import { parseCommandArgs, UsageError } from "../errors.ts";
import { ExitCode } from "../exit-codes.ts";

/** `foreman approve`: needs the Human Channel's full confirmation. */
export const approveCommand: Command = (args, deps) => {
  deps.humanChannel.refuseWorker();
  const { ledger, actionId } = requestNamedBy("approve", args, deps);

  const { channel, displayHash } = deps.humanChannel.confirm(() =>
    renderRequest(awaitingRequest(ledger, actionId)),
  );

  recordGranted(ledger, awaitingRequest(ledger, actionId), channel, displayHash);
  deps.terminal.writeOut(`Approved ${actionId}\n`);
  return ExitCode.Success;
};

/** `foreman reject`: refuses a Worker, but stopping something needs no TTY or nonce. */
export const rejectCommand: Command = (args, deps) => {
  deps.humanChannel.refuseWorker();
  const { ledger, actionId } = requestNamedBy("reject", args, deps);

  recordRejected(ledger, awaitingRequest(ledger, actionId), deps.humanChannel.name);
  deps.terminal.writeOut(`Rejected ${actionId}\n`);
  return ExitCode.Success;
};

/** The parser is strict on purpose: an unknown option is refused, so no spelling can skip a check. */
function requestNamedBy(command: string, args: string[], deps: AppDeps) {
  const { values, positionals } = parseCommandArgs(args, { dir: { type: "string" } }, true);
  const [actionId, ...extra] = positionals;
  if (actionId === undefined || extra.length > 0) {
    throw new UsageError(`Usage: foreman ${command} [--dir <path>] <actionId>`);
  }

  const workspace = findWorkspace({ dir: values.dir, env: deps.env, cwd: deps.cwd });
  const identity = machineIdentity(deps.env);
  return { actionId, ledger: openLedger({ workspace, clock: deps.clock, identity }) };
}
