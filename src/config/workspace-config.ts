import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { EDGE_SOURCES, EDGE_TYPES } from "../graph/workspace-graph.ts";
import { issuesFrom } from "../policy/layer-files.ts";
import { NAME_PATTERN } from "../policy/schema.ts";
import { ConfigInvalidError, type ConfigIssue } from "./errors.ts";
import { isYamlMap, readYamlFile } from "./yaml-file.ts";

const Name = z.string().regex(NAME_PATTERN);
const Text = z.string().min(1);
const Texts = z.array(Text);
/** A blank command would run and succeed, which would verify nothing. */
const Command = z.string().regex(/\S/, "a command can't be blank");

const RelativePath = Text.refine(
  (path) => !isAbsolute(path) && !path.startsWith("~"),
  "must be relative to the Workspace",
);

const ProjectSchema = z.strictObject({
  path: RelativePath.optional(),
  repo: Text.optional(),
  stack: Texts,
  commands: z
    .strictObject({ build: Command.optional(), test: Command.optional(), verify: Command.optional() })
    .optional(),
  baseRef: Text,
  link: Command.optional(),
  copyFiles: Texts.optional(),
  deploy: z
    .strictObject({
      command: Command,
      check: Command.optional(),
      credentialEnv: z
        .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be an environment variable name"))
        .optional(),
    })
    .optional(),
  owners: Texts.optional(),
});

const EdgeSchema = z.strictObject({
  from: Name,
  to: Name,
  type: z.enum(EDGE_TYPES),
  source: z.enum(EDGE_SOURCES),
  contract: Text.optional(),
  evidence: z
    .array(z.strictObject({ file: Text, line: z.number().int().positive().optional(), signal: Text }))
    .optional(),
});

export const WorkspaceConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projects: z.record(Name, ProjectSchema),
  edges: z.array(EdgeSchema).optional(),
  integration: z.strictObject({ verify: z.array(Command).min(1) }).optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export function workspaceConfigFile(workspaceDir: string): string {
  return join(workspaceDir, "foreman", "workspace.yaml");
}

/** Reads and shape-checks `workspace.yaml`. Returns `undefined` if the file doesn't exist. */
export function readWorkspaceConfig(file: string): WorkspaceConfig | undefined {
  const data = readYamlFile(file);
  if (data === undefined) return undefined;
  if (!isYamlMap(data)) throw new ConfigInvalidError([{ file, reason: "must be a YAML map" }]);

  const result = WorkspaceConfigSchema.safeParse(data);
  if (!result.success) throw new ConfigInvalidError(issuesFrom(result.error, file));
  return result.data;
}

/** A Project's name in the form that environment variables and other generated names use. */
export function normalizedProjectName(project: string): string {
  return project.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function worktreeEnvName(project: string): string {
  return `FOREMAN_WORKTREE_${normalizedProjectName(project)}`;
}

/** What the schema can't check: rules across keys, and that every Project named exists. */
export function workspaceProblems(config: WorkspaceConfig): Omit<ConfigIssue, "file">[] {
  const problems: Omit<ConfigIssue, "file">[] = [];
  const names = new Set(Object.keys(config.projects));
  const worktreeNames = new Map<string, string>();

  for (const name of [...names].sort()) {
    const { path, repo, commands } = config.projects[name] as WorkspaceConfig["projects"][string];
    const key = `projects.${name}`;

    if ((path === undefined) === (repo === undefined)) {
      problems.push({ key, reason: "declare exactly one of path or repo" });
    }
    if (commands === undefined || Object.keys(commands).length === 0) {
      problems.push({
        key: `${key}.commands`,
        reason: "declare at least one verification command: build, test or verify",
      });
    }

    const worktreeName = worktreeEnvName(name);
    const taken = worktreeNames.get(worktreeName);
    if (taken === undefined) worktreeNames.set(worktreeName, name);
    else problems.push({ key, reason: `${worktreeName} collides with Project "${taken}"` });
  }

  (config.edges ?? []).forEach((edge, index) => {
    for (const end of ["from", "to"] as const) {
      if (!names.has(edge[end])) {
        problems.push({ key: `edges[${index}].${end}`, reason: `no Project named "${edge[end]}"` });
      }
    }
  });

  return problems;
}
