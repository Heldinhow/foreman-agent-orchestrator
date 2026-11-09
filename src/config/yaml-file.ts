import fs from "node:fs";
import { parse } from "yaml";
import { ConfigInvalidError } from "./errors.ts";

export type YamlMap = Record<string, unknown>;

export function isYamlMap(value: unknown): value is YamlMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Zod's record parsing skips this key, so it has to be refused before validation. */
export function hasProtoKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) => key === "__proto__" || hasProtoKey(child, seen),
  );
}

/**
 * Reads one YAML file. Returns `undefined` if the file doesn't exist, and throws
 * `ConfigInvalidError` naming the file if it can't be read or isn't valid YAML.
 */
export function readYamlFile(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new ConfigInvalidError([{ file, reason: `can't be read: ${(error as Error).message}` }]);
  }

  let data: unknown;
  try {
    data = parse(text);
  } catch (error) {
    throw new ConfigInvalidError([{ file, reason: `invalid YAML: ${(error as Error).message}` }]);
  }
  if (hasProtoKey(data)) {
    throw new ConfigInvalidError([{ file, key: "__proto__", reason: "this key isn't allowed" }]);
  }
  return data;
}
