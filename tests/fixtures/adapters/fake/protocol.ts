/**
 * The files the fake Adapter and its Worker process share, in one session directory.
 * This file imports nothing, because the Worker process loads it with no dependencies.
 */

export type Action =
  | { edit: { path: string; content: string } }
  | { commit: string }
  | { say: string }
  | { result: unknown }
  | { ask: string }
  | { fail: { category: string; message: string } }
  | { badOutput: string }
  | { hang: true }
  | { read: { path: string; denied: boolean } }
  | { echoLastMessage: true };

export interface WorkerPlan {
  /** Where the Worker works. Bun reads config and `.env` from where it starts, so it starts elsewhere. */
  cwd: string;
  /** One list of actions per turn. */
  turns: Action[][];
  model?: string;
  readOnly: boolean;
}

export type TurnOutcome =
  | { state: "finished"; message: string }
  | { state: "failed"; category: string; message: string };

export interface TurnObservation {
  env: Record<string, string>;
  cwd: string;
  model?: string;
  readOnly: boolean;
}

export const PLAN_FILE = "plan.json";
export const MESSAGES_FILE = "messages.json";

export function turnFile(turn: number, kind: "pid" | "outcome" | "observed"): string {
  return `turn-${turn}.${kind}.json`;
}
