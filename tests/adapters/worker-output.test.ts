import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseForemanResult, statusFromFinalMessage } from "../../src/adapters/worker-output.ts";

const Schema = z.strictObject({ summary: z.string() });
const fence = "```";

function result(body: string): string {
  return `${fence}foreman-result\n${body}\n${fence}`;
}

describe("a foreman-result block in Worker output", () => {
  test("is parsed and validated against the Step's schema", () => {
    const message = `All done.\n\n${result('{"summary":"added the endpoint"}')}\n\nThanks.`;

    expect(parseForemanResult(message, Schema)).toEqual({ ok: true, value: { summary: "added the endpoint" } });
  });

  test("may use a longer fence, a tilde fence, an indent and CRLF line endings", () => {
    for (const message of [
      `${fence}${fence}foreman-result\n{"summary":"x"}\n${fence}${fence}`,
      `~~~foreman-result\n{"summary":"x"}\n~~~`,
      `   ${fence}foreman-result\n   {"summary":"x"}\n   ${fence}`,
      `${fence}foreman-result\r\n{"summary":"x"}\r\n${fence}\r\n`,
    ]) {
      expect(parseForemanResult(message, Schema)).toEqual({ ok: true, value: { summary: "x" } });
    }
  });

  test.each([
    ["no block at all", "I finished the work.", "no foreman-result block"],
    ["a block with another name", `${fence}foreman-results\n{"summary":"x"}\n${fence}`, "no foreman-result block"],
    ["a block quoted inside another fence", `${fence}${fence}text\n${result('{"summary":"x"}')}\n${fence}${fence}`, "no foreman-result block"],
    ["an indented code block", `    ${fence}foreman-result\n    {"summary":"x"}\n    ${fence}`, "no foreman-result block"],
    ["a block that never closes", `${fence}foreman-result\n{"summary":"x"}`, "never closes"],
    ["two blocks", `${result('{"summary":"a"}')}\n${result('{"summary":"b"}')}`, "more than one"],
    ["malformed JSON", result('{"summary":'), "isn't valid JSON"],
    ["an empty block", result(""), "isn't valid JSON"],
    ["a value the schema refuses", result('{"summary":3}'), "summary"],
    ["a key the schema doesn't know", result('{"summary":"x","extra":1}'), "doesn't match"],
    ["a key that could reach an object's prototype", result('{"summary":"x","__proto__":{"admin":true}}'), "__proto__"],
  ])("is refused with %s", (_case, message, reason) => {
    const parsed = parseForemanResult(message, Schema);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(reason);
  });

  test("a deeply nested value is refused, not thrown", () => {
    const deep = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;

    expect(parseForemanResult(result(deep), Schema).ok).toBe(false);
  });
});

describe("a Worker's final message", () => {
  test("that ends with a foreman-question block is waiting_input", () => {
    const message = `I need a decision.\n\n${fence}foreman-question\nWhich database?\nPick one.\n${fence}\n`;

    expect(statusFromFinalMessage(message)).toEqual({
      state: "waiting_input",
      question: "Which database?\nPick one.",
    });
  });

  test.each([
    ["no block", "All done."],
    ["a question followed by more text", `${fence}foreman-question\nWhich?\n${fence}\nNever mind, done.`],
    ["a question followed by a result", `${fence}foreman-question\nWhich?\n${fence}\n${result('{"summary":"x"}')}`],
    ["an empty question", `${fence}foreman-question\n\n${fence}`],
    ["a question that never closes", `${fence}foreman-question\nWhich?`],
    ["a question quoted inside another fence", `${fence}${fence}\n${fence}foreman-question\nWhich?\n${fence}\n${fence}${fence}`],
  ])("with %s is completed, keeping the whole message", (_case, message) => {
    expect(statusFromFinalMessage(message)).toEqual({ state: "completed", output: message });
  });
});
