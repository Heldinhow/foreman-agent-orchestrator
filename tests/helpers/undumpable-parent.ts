import { dlopen, FFIType } from "bun:ffi";

/**
 * Makes this process's environment unreadable to its own user, as a Worker could, then runs
 * the given command as its child and exits with the child's code.
 */
const PR_SET_DUMPABLE = 4;

const { symbols } = dlopen("libc.so.6", {
  prctl: {
    args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64],
    returns: FFIType.i32,
  },
});
if (symbols.prctl(PR_SET_DUMPABLE, 0n, 0n, 0n, 0n) !== 0) {
  throw new Error("prctl(PR_SET_DUMPABLE) failed");
}

const child = Bun.spawn(process.argv.slice(2), {
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
});
process.exitCode = await child.exited;
