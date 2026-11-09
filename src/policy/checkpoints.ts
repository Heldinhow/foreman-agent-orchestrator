/**
 * Every point where code asks the Check Engine, with the facts its caller must give.
 * This is mechanism, not rules: what happens at a checkpoint is only in Policy. A ticket
 * adding a checkpoint adds it here, with its Safety Default in `policy/defaults.yaml`.
 */
export const CHECKPOINT_FACTS = {
  "worktree.copy": ["path"],
  "worktree.tracked": ["path"],
  "scan.read": ["path"],
  "adapter.render": ["path"],
  "diff.path": ["path"],
  /** The `path` is a variable name, judged as a one-segment path so that rules can glob it. */
  "env.passthrough": ["path"],
  "task.close": ["evidence"],
  "outbound.push": [],
  "outbound.pr": [],
  "outbound.draft-pr": [],
  "outbound.merge": [],
  "outbound.deploy": [],
} as const satisfies Record<string, readonly string[]>;

export type Checkpoint = keyof typeof CHECKPOINT_FACTS;

export const CHECKPOINTS = Object.keys(CHECKPOINT_FACTS) as [Checkpoint, ...Checkpoint[]];

/** The facts a checkpoint's caller must give, and the only ones a rule there can test. */
export function factsAt(checkpoint: Checkpoint): readonly string[] {
  return CHECKPOINT_FACTS[checkpoint];
}
