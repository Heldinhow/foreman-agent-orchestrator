import fs from "node:fs";
import { basename, join } from "node:path";
import type { z } from "zod";
import { ConfigInvalidError, type ConfigIssue } from "../config/errors.ts";
import { isYamlMap, readYamlFile, type YamlMap } from "../config/yaml-file.ts";
import type { PolicyLayer } from "./merge.ts";
import { checkReferences } from "./references.ts";
import { FullLayerSchema, NAME_PATTERN, PolicySchema, ProjectLayerSchema } from "./schema.ts";

function pathToKey(path: readonly PropertyKey[]): string {
  return path.reduce<string>((key, part) => {
    if (typeof part === "number") return `${key}[${part}]`;
    return key === "" ? String(part) : `${key}.${String(part)}`;
  }, "");
}

/** Turns a zod error into issues naming the file, key and reason. */
export function issuesFrom(error: z.ZodError, file: string): ConfigIssue[] {
  return error.issues.flatMap((issue): ConfigIssue[] => {
    const key = pathToKey(issue.path);
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((name) => ({ file, key: pathToKey([...issue.path, name]), reason: "unknown key" }));
    }
    if (issue.code === "invalid_key") {
      return [{ file, key, reason: "not a valid name: use letters, digits, - and _" }];
    }
    const missing = issue.code === "invalid_type" && issue.message.endsWith("received undefined");
    return [{ file, key, reason: missing ? "required key is missing" : issue.message }];
  });
}

function requireMap(data: unknown, file: string): YamlMap {
  if (!isYamlMap(data)) throw new ConfigInvalidError([{ file, reason: "must be a YAML map" }]);
  return data;
}

function validated(schema: z.ZodType, data: unknown, file: string): YamlMap {
  const map = requireMap(data, file);
  const result = schema.safeParse(map);
  if (!result.success) throw new ConfigInvalidError(issuesFrom(result.error, file));
  return map;
}

/** The built-in layer has to be complete and consistent by itself. */
export function readBuiltInLayer(file: string): PolicyLayer {
  const data = readYamlFile(file);
  if (data === undefined) {
    throw new ConfigInvalidError([{ file, reason: "missing: Foreman can't run without its built-in Policy" }]);
  }
  const content = validated(PolicySchema, data, file);
  const problems = checkReferences(PolicySchema.parse(content));
  if (problems.length > 0) {
    throw new ConfigInvalidError(problems.map((problem) => ({ file, ...problem })));
  }
  return { name: "built-in", file, content };
}

/** Reads the Workspace or user-override layer, if the file exists. */
export function readFullLayer(name: "Workspace" | "user override", file: string): PolicyLayer | undefined {
  const data = readYamlFile(file);
  return data === undefined ? undefined : { name, file, content: validated(FullLayerSchema, data, file) };
}

function unknownKeysIn(schema: z.ZodType, data: YamlMap, file: string): Set<string | undefined> {
  const result = schema.safeParse(data);
  if (result.success) return new Set();
  return new Set(
    issuesFrom(result.error, file)
      .filter((issue) => issue.reason === "unknown key")
      .map((issue) => issue.key),
  );
}

export function readProjectLayer(project: string, file: string): PolicyLayer {
  const content = requireMap(readYamlFile(file), file);
  const issues: ConfigIssue[] = [];

  const result = ProjectLayerSchema.safeParse(content);
  if (!result.success) {
    const unknownEverywhere = unknownKeysIn(FullLayerSchema, content, file);
    for (const issue of issuesFrom(result.error, file)) {
      const validElsewhere = issue.reason === "unknown key" && !unknownEverywhere.has(issue.key);
      issues.push(
        validElsewhere ? { ...issue, reason: "not valid in a Project layer: set it in foreman/foreman.yaml" } : issue,
      );
    }
  }

  // Effective Policy is per Project, so a value for another Project's repository would do nothing.
  const { policies } = content;
  if (isYamlMap(policies) && isYamlMap(policies.repositories)) {
    for (const name of Object.keys(policies.repositories)) {
      if (name !== project) {
        issues.push({
          file,
          key: `policies.repositories.${name}`,
          reason: `the layer for Project "${project}" can only set its own repository`,
        });
      }
    }
  }

  if (issues.length > 0) throw new ConfigInvalidError(issues);
  return { name: "Project", project, file, content };
}

/** The Project layer files in a Workspace, as `[project, file]`, sorted by Project. */
export function projectLayerFiles(workspaceDir: string): { project: string; file: string }[] {
  const dir = join(workspaceDir, "foreman", "projects");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => ({ project: basename(name, ".yaml"), file: join(dir, name) }));
}

export function assertProjectName(project: string, file: string): void {
  if (!NAME_PATTERN.test(project)) {
    throw new ConfigInvalidError([{ file, reason: "the file name isn't a valid Project name" }]);
  }
}
