import { expect, test } from "bun:test";
import { inspectAncestors, type ProcessTable } from "../../src/approvals/worker-check.ts";

const OPERATOR = 1000;
const OTHER_ACCOUNT = 0;

interface FakeProcess {
  parent: number;
  uid?: number;
  /** The raw environment block, or absent when the kernel refuses to show it. */
  environ?: string;
}

/** Process 100 is the running command. Ancestors are listed by the test. */
function table(processes: Record<number, FakeProcess>): ProcessTable {
  return {
    self: 100,
    info(pid) {
      const found = processes[pid];
      if (found === undefined) throw new Error(`no process ${pid}`);
      return { parent: found.parent, uids: [found.uid ?? OPERATOR] };
    },
    environ(pid) {
      const environ = processes[pid]?.environ;
      if (environ === undefined) throw new Error(`EACCES reading process ${pid}`);
      return environ;
    },
  };
}

const self: FakeProcess = { parent: 50, environ: "PATH=/bin\0" };

test("a chain of readable, unmarked ancestors is clear", () => {
  const chain = table({
    100: self,
    50: { parent: 1, environ: "PATH=/bin\0SHELL=/bin/sh\0" },
    1: { parent: 0, uid: OTHER_ACCOUNT, environ: "" },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "clear" });
});

test("a marked parent is found", () => {
  const chain = table({
    100: self,
    50: { parent: 1, environ: "PATH=/bin\0FOREMAN_WORKER=1\0" },
    1: { parent: 0, uid: OTHER_ACCOUNT, environ: "" },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "marked", pid: 50 });
});

test("a marked ancestor is found past clean ones", () => {
  const chain = table({
    100: self,
    50: { parent: 40, environ: "PATH=/bin\0" },
    40: { parent: 30, environ: "" },
    30: { parent: 1, environ: "FOREMAN_WORKER=1\0" },
    1: { parent: 0, uid: OTHER_ACCOUNT, environ: "" },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "marked", pid: 30 });
});

test("the marker counts whatever its value is, even when empty", () => {
  const chain = table({
    100: self,
    50: { parent: 0, environ: "FOREMAN_WORKER=\0" },
  });

  expect(inspectAncestors(chain).kind).toBe("marked");
});

test.each(["FOREMAN_WORKER_X=1", "XFOREMAN_WORKER=1", "NOTE=FOREMAN_WORKER=1"])(
  "%s isn't the marker",
  (variable) => {
    const chain = table({
      100: self,
      50: { parent: 0, environ: `${variable}\0` },
    });

    expect(inspectAncestors(chain)).toEqual({ kind: "clear" });
  },
);

test("an ancestor of this user that can't be read, started by this user, can't be inspected", () => {
  const chain = table({
    100: self,
    50: { parent: 40 },
    40: { parent: 1, environ: "" },
    1: { parent: 0, uid: OTHER_ACCOUNT },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "uninspectable", pid: 50 });
});

test("a setuid helper between a Worker and the command can't hide it", () => {
  const chain = table({
    100: self,
    50: { parent: 40, uid: OTHER_ACCOUNT },
    40: { parent: 1, environ: "FOREMAN_WORKER=1\0" },
    1: { parent: 0, uid: OTHER_ACCOUNT },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "uninspectable", pid: 50 });
});

test("the login path is clear: init and a user manager started by it can't be read", () => {
  const chain = table({
    100: self,
    50: { parent: 40, environ: "PATH=/bin\0" },
    40: { parent: 1 },
    1: { parent: 0, uid: OTHER_ACCOUNT },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "clear" });
});

test("a marked ancestor above an unreadable, other-account process is still found", () => {
  const chain = table({
    100: self,
    50: { parent: 40, environ: "PATH=/bin\0" },
    40: { parent: 30, uid: OTHER_ACCOUNT },
    30: { parent: 1, uid: OTHER_ACCOUNT, environ: "FOREMAN_WORKER=1\0" },
    1: { parent: 0, uid: OTHER_ACCOUNT },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "marked", pid: 30 });
});

test("an ancestor with an unreadable parent can't be inspected", () => {
  const chain = table({
    100: self,
    50: { parent: 40 },
  });

  expect(inspectAncestors(chain)).toEqual({ kind: "uninspectable", pid: 50 });
});

test("a process table that isn't there can't be inspected", () => {
  const chain: ProcessTable = {
    self: 100,
    info() {
      throw new Error("no /proc");
    },
    environ() {
      throw new Error("no /proc");
    },
  };

  expect(inspectAncestors(chain).kind).toBe("uninspectable");
});

test("a parent loop can't be inspected", () => {
  const chain = table({
    100: self,
    50: { parent: 40, environ: "" },
    40: { parent: 50, environ: "" },
  });

  expect(inspectAncestors(chain).kind).toBe("uninspectable");
});
