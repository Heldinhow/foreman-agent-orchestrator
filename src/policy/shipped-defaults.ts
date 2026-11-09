import { basename, join } from "node:path";

/**
 * Where the shipped `policy/defaults.yaml` is, given the directory of the entry point.
 * A build copies it next to `dist/main.js`, and from source it's at the repository root.
 */
export function shippedDefaultsFile(entryDir: string): string {
  const root = basename(entryDir) === "src" ? join(entryDir, "..") : entryDir;
  return join(root, "policy", "defaults.yaml");
}
