export const ExitCode = {
  Success: 0,
  RuntimeError: 1,
  /** Usage error or invalid config. */
  Usage: 2,
  /** A normal result, so scripts can tell waiting apart from failing. */
  WaitingOnHuman: 3,
  RunHalted: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
