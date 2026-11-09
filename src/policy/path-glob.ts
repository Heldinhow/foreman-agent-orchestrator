import { posix } from "node:path";

/**
 * The glob form of a rule's `match.paths` and `except`, which follows gitignore:
 *
 * - With no slash, or only a trailing one, a pattern matches at any depth.
 * - With any other slash, it's anchored to the start of the path.
 * - `*` and `?` stay within one path segment, and `**` crosses them.
 *
 * Other glob syntax would silently match nothing here, leaving a deny rule with no
 * effect, so Policy can't hold it.
 */
export function globProblem(pattern: string): string | undefined {
  if (/[[\]{}]/.test(pattern) || pattern.startsWith("!")) {
    return "only *, ** and ? are wildcards, and a pattern can't be negated";
  }
  const segments = pattern.replace(/^\/|\/$/g, "").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "a pattern can't have an empty, . or .. segment";
  }
  return undefined;
}

const TOKENS = /\*\*\/|\*\*|\*|\?|[.+^$()|\\[\]{}]/g;

function translate(token: string): string {
  if (token === "**/") return "(?:.*/)?";
  if (token === "**") return ".*";
  if (token === "*") return "[^/]*";
  if (token === "?") return "[^/]";
  return `\\${token}`;
}

function toRegExp(pattern: string, options: { descendants: boolean; ignoreCase: boolean }): RegExp {
  const body = pattern.replace(/^\/|\/$/g, "");
  const anchored = pattern.replace(/\/$/, "").includes("/");
  const source = `${anchored ? "" : "(?:.*/)?"}${body.replace(TOKENS, translate)}${options.descendants ? "(?:/.*)?" : ""}`;
  // A path may hold a newline, and `.` has to cross it or the path would escape the rule.
  return new RegExp(`^${source}$`, options.ignoreCase ? "si" : "s");
}

/**
 * Whether a `match.paths` pattern covers a path. It leans towards covering, since this
 * usually decides what's denied: it ignores case, as `SERVER.KEY` is as secret as
 * `server.key`, and it covers everything under a matching directory.
 */
export function patternCovers(pattern: string, path: string): boolean {
  return toRegExp(pattern, { descendants: true, ignoreCase: true }).test(path);
}

/**
 * Whether an `except` pattern lifts a path out of a rule. It leans the other way: case
 * must match, and only a pattern with a trailing slash reaches under a directory, so
 * `.env.example/server.pem` isn't excepted by `.env.example`.
 */
export function patternExcepts(pattern: string, path: string): boolean {
  return toRegExp(pattern, { descendants: pattern.endsWith("/"), ignoreCase: false }).test(path);
}

/**
 * The canonical form of a path relative to its root, or undefined if it isn't one. Rules
 * are written against relative paths, so `./.env` and `src/../.env` have to reach them as
 * `.env`, and a path outside the root can't be judged at all.
 */
export function relativePath(path: string): string | undefined {
  if (path === "" || path.startsWith("/")) return undefined;
  const normalized = posix.normalize(path).replace(/\/$/, "");
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized;
}
