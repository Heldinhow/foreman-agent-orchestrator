import type { z } from "zod";
import { hasProtoKey } from "../config/yaml-file.ts";
import type { WorkerStatus } from "./contract.ts";

const RESULT_BLOCK = "foreman-result";
const QUESTION_BLOCK = "foreman-question";

interface FencedBlock {
  name: string;
  body: string;
  closed: boolean;
  /** Index of the first line after the block. */
  end: number;
}

const OPENING_FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/**
 * The top-level fenced blocks of a message, following CommonMark's rules, so a block
 * quoted inside another fence isn't mistaken for a real one.
 */
function fencedBlocks(lines: readonly string[]): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = OPENING_FENCE.exec(lines[index] as string);
    if (opening === null) continue;
    const [, indent, fence, info] = opening as unknown as [string, string, string, string];
    if (fence.startsWith("`") && info.includes("`")) continue;

    const closing = new RegExp(`^ {0,3}${fence.charAt(0)}{${fence.length},}[ \\t]*$`);
    const dropIndent = new RegExp(`^ {0,${indent.length}}`);
    let end = index + 1;
    while (end < lines.length && !closing.test(lines[end] as string)) end++;

    const closed = end < lines.length;
    const body = lines.slice(index + 1, end).map((line) => line.replace(dropIndent, ""));
    blocks.push({ name: info.trim(), body: body.join("\n"), closed, end: end + 1 });
    index = end;
  }
  return blocks;
}

function linesOf(message: string): string[] {
  return message.split(/\r?\n/);
}

export type ParsedResult<Value> = { ok: true; value: Value } | { ok: false; reason: string };

/**
 * Reads the Step's result from a Worker's final message. Worker output is untrusted, so
 * anything but exactly one complete, schema-valid block is refused, and two blocks are
 * refused rather than choosing one. `reason` is for the corrective message to the Worker.
 * It can hold key names from the Worker's output, so treat it as untrusted too.
 */
export function parseForemanResult<Value>(message: string, schema: z.ZodType<Value>): ParsedResult<Value> {
  const refuse = (reason: string) => ({ ok: false, reason }) as const;

  const blocks = fencedBlocks(linesOf(message)).filter((block) => block.name === RESULT_BLOCK);
  const [block, ...others] = blocks;
  if (block === undefined) return refuse(`no ${RESULT_BLOCK} block in the final message`);
  if (others.length > 0) return refuse(`more than one ${RESULT_BLOCK} block in the final message`);
  if (!block.closed) return refuse(`the ${RESULT_BLOCK} block never closes`);

  let data: unknown;
  try {
    data = JSON.parse(block.body);
    if (hasProtoKey(data)) return refuse(`the ${RESULT_BLOCK} block holds the key "__proto__"`);
  } catch {
    return refuse(`the ${RESULT_BLOCK} block isn't valid JSON`);
  }

  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
  );
  return refuse(`the ${RESULT_BLOCK} block doesn't match the Step's schema: ${issues.join("; ")}`);
}

/** The question a message ends with. A question counts only as the last thing the Worker says. */
function finalQuestion(message: string): string | undefined {
  const lines = linesOf(message);
  const last = fencedBlocks(lines).at(-1);
  if (last === undefined || last.name !== QUESTION_BLOCK || !last.closed) return undefined;
  if (lines.slice(last.end).some((line) => line.trim() !== "")) return undefined;
  return last.body.trim() || undefined;
}

/** How an Adapter reports a finished turn, given the Worker's final message. */
export function statusFromFinalMessage(message: string): WorkerStatus {
  const question = finalQuestion(message);
  return question === undefined ? { state: "completed", output: message } : { state: "waiting_input", question };
}
