import fs from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ConfigError } from "./errors.ts";
import { isYamlMap, readYamlFile } from "./yaml-file.ts";

export const WORKSPACE_MARKER = join("foreman", "foreman.yaml");

export interface WorkspaceSearch {
  /** The `--dir` value, if given. */
  dir?: string;
  env: Record<string, string | undefined>;
  cwd: string;
}

function isWorkspace(dir: string): boolean {
  return fs.statSync(join(dir, WORKSPACE_MARKER), { throwIfNoEntry: false })?.isFile() ?? false;
}

function realPathOrSelf(path: string): string {
  try {
    return fs.realpathSync(path);
  } catch {
    return path;
  }
}

function isSameOrInside(path: string, dir: string): boolean {
  const fromDir = relative(dir, path);
  return fromDir === "" || (fromDir !== ".." && !fromDir.startsWith(`..${sep}`) && !isAbsolute(fromDir));
}

/** The real paths of the Projects that a Workspace's `workspace.yaml` declares. */
function declaredProjectPaths(workspace: string): string[] {
  const data = readYamlFile(join(workspace, "foreman", "workspace.yaml"));
  if (!isYamlMap(data) || !isYamlMap(data.projects)) return [];
  return Object.values(data.projects).flatMap((project) =>
    isYamlMap(project) && typeof project.path === "string"
      ? [realPathOrSelf(resolve(workspace, project.path))]
      : [],
  );
}

/**
 * The nearest ancestor holding a Workspace, skipping any that sits inside a Project
 * of a Workspace further up. A Project's repository is untrusted, so a Workspace
 * planted in one must not capture commands run from inside it.
 */
function nearestWorkspace(cwd: string): string | undefined {
  const found: string[] = [];
  for (let dir = realPathOrSelf(cwd); ; dir = dirname(dir)) {
    if (isWorkspace(dir)) found.push(dir);
    if (dir === dirname(dir)) break;
  }
  return found.find((candidate, index) =>
    found
      .slice(index + 1)
      .every((outer) => !declaredProjectPaths(outer).some((project) => isSameOrInside(candidate, project))),
  );
}

/** Finds the Workspace from `--dir`, then `FOREMAN_WORKSPACE`, then the nearest ancestor. */
export function findWorkspace({ dir, env, cwd }: WorkspaceSearch): string {
  const explicit = [
    { source: "--dir", value: dir },
    { source: "FOREMAN_WORKSPACE", value: env.FOREMAN_WORKSPACE },
  ].find(({ value }) => value !== undefined && value !== "");

  if (explicit !== undefined) {
    const path = resolve(cwd, explicit.value as string);
    if (!isWorkspace(path)) {
      throw new ConfigError(`no Workspace at ${path} (from ${explicit.source}): ${WORKSPACE_MARKER} is missing`);
    }
    return path;
  }

  const nearest = nearestWorkspace(cwd);
  if (nearest === undefined) {
    throw new ConfigError(
      `no Workspace found: use --dir or FOREMAN_WORKSPACE, or run from inside a directory holding ${WORKSPACE_MARKER}`,
    );
  }
  return nearest;
}
