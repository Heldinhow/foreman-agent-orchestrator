// Code that names no rule, though it looks close. A comment can say .env, *.pem or GH_TOKEN.
import { z } from "zod";

export const Mode = z.enum(["propose", "autonomous"]);

export function describeIssue(
  issue: { key?: string },
  parent?: { key: string },
  env: Record<string, string | undefined> = process.env,
) {
  const key = issue?.key ?? parent?.key;
  return `${key}: ${env.TERM} ${(() => issue)().key}`;
}

export const isAutonomous = (mode: string) => mode === "autonomous";

export const Message = "Ledger memory/ledger.jsonl can't be trusted, and neither can a stray .env file";

export const ledgerFile = (workspace: string) => [workspace, "memory", "ledger.jsonl"].join("/");
