import fs from "node:fs";
import { isatty } from "node:tty";
import {
  confirmWithNonce,
  HumanChannelRefusal,
  type HumanChannel,
  type NonceTerminal,
} from "./human-channel.ts";
import { inspectAncestors, WORKER_MARKER, type ProcessTable } from "./worker-check.ts";

const CHANNEL_NAME = "local";
const MAX_LINE_BYTES = 4096;

/**
 * The real Human Channel (ADR-0039). It takes no options on purpose: how it authenticates is
 * mechanism (ADR-0053), so nothing the caller, a flag or the environment supplies can relax it.
 */
export function createLocalHumanChannel(): HumanChannel {
  function refuseWorker(): void {
    if (process.env[WORKER_MARKER] !== undefined) {
      throw new HumanChannelRefusal(`refusing: this command has the Worker marker ${WORKER_MARKER}`);
    }
    const ancestors = inspectAncestors(procfs);
    if (ancestors.kind === "marked") {
      throw new HumanChannelRefusal(
        `refusing: ancestor process ${ancestors.pid} has the Worker marker ${WORKER_MARKER}`,
      );
    }
    if (ancestors.kind === "uninspectable") {
      throw new HumanChannelRefusal(
        `refusing: ancestor process ${ancestors.pid} can't be inspected, so a Worker can't be ruled out`,
      );
    }
  }

  return {
    name: CHANNEL_NAME,
    refuseWorker,
    confirm(render) {
      refuseWorker();
      const tty = openControllingTerminal();
      try {
        return { channel: CHANNEL_NAME, displayHash: confirmWithNonce(terminalOn(tty), render) };
      } finally {
        fs.closeSync(tty);
      }
    },
  };
}

export const procfs: ProcessTable = {
  self: process.pid,
  info(pid) {
    const status = fs.readFileSync(`/proc/${pid}/status`, "latin1");
    const parent = /^PPid:\s+(\d+)\s*$/m.exec(status)?.[1];
    const uids = /^Uid:\s+(\d+(?:\s+\d+)*)\s*$/m.exec(status)?.[1];
    if (parent === undefined || uids === undefined) {
      throw new Error(`unexpected /proc/${pid}/status`);
    }
    return { parent: Number(parent), uids: uids.split(/\s+/).map(Number) };
  },
  environ: (pid) => fs.readFileSync(`/proc/${pid}/environ`, "latin1"),
};

/** The terminal itself rather than stdin or stdout, which a caller can redirect or capture. */
function openControllingTerminal(): number {
  const { O_RDWR, O_NOCTTY } = fs.constants;
  let tty: number;
  try {
    tty = fs.openSync("/dev/tty", O_RDWR | O_NOCTTY);
  } catch {
    throw new HumanChannelRefusal("refusing: this needs an interactive terminal, and there is none");
  }
  if (!isatty(tty)) {
    fs.closeSync(tty);
    throw new HumanChannelRefusal("refusing: this needs an interactive terminal, and there is none");
  }
  return tty;
}

function terminalOn(tty: number): NonceTerminal {
  return {
    write: (text) => void fs.writeSync(tty, text),
    readLine() {
      const chunk = Buffer.alloc(MAX_LINE_BYTES);
      let line = "";
      while (line.length < MAX_LINE_BYTES) {
        const bytes = fs.readSync(tty, chunk);
        if (bytes === 0) return line === "" ? undefined : line;
        line += chunk.toString("latin1", 0, bytes);
        const end = line.indexOf("\n");
        if (end !== -1) return line.slice(0, end);
      }
      return line;
    },
  };
}
