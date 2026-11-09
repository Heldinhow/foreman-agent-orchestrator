import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./process.ts";

/**
 * AC-87's static check: finds behaviour rules written into source code rather than Policy.
 * It reads the source as it would run, so comments and types can't trip it, and it looks
 * for rule values in the forms code holds them. It catches a mistake, not an adversary.
 */
export type RuleKind = "deny glob" | "credential name" | "secret pattern" | "default Mode" | "schema default";

export interface Finding {
  /** Relative to the scanned directory. */
  file: string;
  kind: RuleKind;
  match: string;
}

/** The spec's names, which later tickets move into Policy, so a test can't lose them with a rule. */
const DENY_GLOBS = [".env", ".env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", ".netrc", ".npmrc", ".pypirc", "memory/"];

const PATTERNS: readonly (readonly [RuleKind, RegExp])[] = [
  ["credential name", /\b(?:[A-Z][A-Z0-9]*_)+(?:TOKEN|API_KEY|SECRET|SECRET_KEY|ACCESS_KEY|PASSWORD|AUTH_SOCK)\b/g],
  [
    "secret pattern",
    /\b(?:gh[pousr]_|github_pat_|glpat-|sk-ant-|xox[abprs]-|AKIA(?=[A-Z0-9[]))|-----BEGIN|BEGIN [A-Z[\]\s*]*PRIVATE KEY/g,
  ],
  ["default Mode", /(["'`])(?:propose|autonomous)\1|\bmode:\s*(?:propose|autonomous)\b/g],
  ["schema default", /\.default\(/g],
];

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * A glob's fixed text, where code holds it: in a literal, a regex or a glob. Reading `?.key`
 * or `).key` as a rule would be wrong, so it must follow a quote, wildcard, slash or anchor.
 */
function globPattern(glob: string): RegExp {
  const text = glob.replace(/^\*+|\*+$/g, "");
  const boundary = /\w$/.test(text) ? "(?![A-Za-z0-9_])" : "";
  return new RegExp(`(?<=["'\`*/^(|])${escaped(text)}${boundary}`, "g");
}

/** Every path pattern in a rule of the shipped defaults, so a new one is covered at once. */
async function shippedGlobs(defaultsFile: string): Promise<string[]> {
  const defaults = parse(await Bun.file(defaultsFile).text());
  const rules: { match?: { paths?: string[] }; except?: string[] }[] = Object.values(defaults.policies.guard.rules);
  return rules.flatMap((rule) => [...(rule.match?.paths ?? []), ...(rule.except ?? [])]);
}

/** What the type system and comparisons need of a Mode's name, which sets no default. */
function withoutModeMechanism(code: string): string {
  return code
    .replace(/z\.enum\(\[[^\]]*\]\)/g, "")
    .replace(/(?:[!=]==|\bcase)\s*(["'`])(?:propose|autonomous)\1/g, "");
}

/** A Policy key's own path, such as `adapters.*.env.passthrough`, names a setting and isn't a glob. */
function withoutPolicyKeys(code: string): string {
  return code.replace(/\badapters\.\*\.env\.\w+/g, "");
}

export async function findHardcodedRules(
  directory: string,
  defaultsFile = join(repoRoot, "policy", "defaults.yaml"),
): Promise<Finding[]> {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const globs = [...new Set([...DENY_GLOBS, ...(await shippedGlobs(defaultsFile))])];
  const findings: Finding[] = [];

  for await (const file of new Bun.Glob("**/*.ts").scan(directory)) {
    const code = transpiler.transformSync(await Bun.file(join(directory, file)).text());
    const unescaped = code.replace(/\\/g, "");
    const report = (kind: RuleKind, pattern: RegExp, text: string) => {
      for (const [match] of text.matchAll(pattern)) findings.push({ file, kind, match });
    };

    for (const glob of globs) report("deny glob", globPattern(glob), withoutPolicyKeys(unescaped));
    for (const [kind, pattern] of PATTERNS) report(kind, pattern, withoutModeMechanism(unescaped));
  }
  return findings.sort((a, b) => `${a.file}${a.match}`.localeCompare(`${b.file}${b.match}`));
}
