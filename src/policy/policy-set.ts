import { isAbsolute, join } from "node:path";
import { ConfigError, ConfigInvalidError, type ConfigIssue } from "../config/errors.ts";
import { isYamlMap, type YamlMap } from "../config/yaml-file.ts";
import {
  assertProjectName,
  issuesFrom,
  projectLayerFiles,
  readBuiltInLayer,
  readFullLayer,
  readProjectLayer,
} from "./layer-files.ts";
import { mergeLayers, type Origins, type PolicyLayer } from "./merge.ts";
import { checkReferences } from "./references.ts";
import { PolicySchema, type Policy } from "./schema.ts";

export interface PolicyLocations {
  /** The shipped `policy/defaults.yaml`. */
  defaultsFile: string;
  workspaceDir: string;
  /** The user override, whether or not it exists. */
  overrideFile: string;
}

/** Where the user override lives, from the injected environment. */
export function userOverrideFile(env: Record<string, string | undefined>): string {
  const { XDG_CONFIG_HOME: xdg, HOME: home } = env;
  // The XDG spec says to ignore an empty or relative value.
  if (xdg !== undefined && isAbsolute(xdg)) return join(xdg, "foreman", "override.yaml");
  if (home === undefined || home === "") {
    throw new ConfigError("can't locate the user override: neither XDG_CONFIG_HOME nor HOME is set");
  }
  return join(home, ".config", "foreman", "override.yaml");
}

/** One key's current value and the layers behind it. */
export interface KeyExplanation {
  key: string;
  value: unknown;
  setBy: PolicyLayer;
  /** Lower layers that also set the key, highest first. */
  overrides: readonly PolicyLayer[];
}

export interface EffectivePolicy {
  policy: Policy;
  /** One entry per value at or under `key`. Empty if no layer sets it. */
  explain(key: string): KeyExplanation[];
  /** The highest layer that set a key or, failing that, the nearest key above it. */
  setBy(key: string): PolicyLayer | undefined;
}

export interface PolicySet {
  builtIn: PolicyLayer;
  workspace?: PolicyLayer;
  /** Sorted by Project name. */
  projects: readonly PolicyLayer[];
  override?: PolicyLayer;
  /** The merge for one Project, or for no Project in particular if none is given. */
  effective(project?: string): EffectivePolicy;
}

function layerFor(key: string, origins: Origins): PolicyLayer | undefined {
  const path = key.replace(/\[\d+\].*$/, "").split(".");
  for (let length = path.length; length > 0; length--) {
    const layer = origins.get(path.slice(0, length).join("."))?.at(-1);
    if (layer !== undefined) return layer;
  }
  return undefined;
}

function collectValues(value: unknown, key: string): { key: string; value: unknown }[] {
  if (isYamlMap(value) && Object.keys(value).length > 0) {
    return Object.entries(value).flatMap(([name, child]) => collectValues(child, `${key}.${name}`));
  }
  return [{ key, value }];
}

function lookup(root: YamlMap, key: string): unknown {
  let node: unknown = root;
  for (const part of key.split(".")) {
    if (!isYamlMap(node) || !Object.hasOwn(node, part)) return undefined;
    node = node[part];
  }
  return node;
}

/** Validates the merge as well as each layer, as a rule can be incomplete until merged. */
function mergeAndValidate(layers: readonly PolicyLayer[]): EffectivePolicy {
  const { merged, origins } = mergeLayers(layers);
  const highest = (layers.at(-1) as PolicyLayer).file;
  const attributed = (issue: { key?: string; reason: string }): ConfigIssue => ({
    ...issue,
    file: layerFor(issue.key ?? "", origins)?.file ?? highest,
  });

  const result = PolicySchema.safeParse(merged);
  if (!result.success) throw new ConfigInvalidError(issuesFrom(result.error, highest).map(attributed));

  const problems = checkReferences(result.data);
  if (problems.length > 0) throw new ConfigInvalidError(problems.map(attributed));

  return {
    policy: result.data,
    explain(key) {
      const value = lookup(merged, key);
      if (value === undefined) return [];
      return collectValues(value, key).map((entry) => {
        const chain = origins.get(entry.key) ?? [];
        return { ...entry, setBy: chain.at(-1) as PolicyLayer, overrides: chain.slice(0, -1).reverse() };
      });
    },
    setBy: (key) => layerFor(key, origins),
  };
}

/** Runs each read, so one command reports every invalid file rather than only the first. */
function issueCollector() {
  const issues = new Map<string, ConfigIssue>();
  return {
    attempt<T>(read: () => T): T | undefined {
      try {
        return read();
      } catch (error) {
        if (!(error instanceof ConfigInvalidError)) throw error;
        for (const issue of error.issues) issues.set(JSON.stringify(issue), issue);
        return undefined;
      }
    },
    throwIfAny() {
      if (issues.size > 0) throw new ConfigInvalidError([...issues.values()]);
    },
  };
}

/**
 * Reads and validates every layer. Invalid Policy is refused as a whole, so this
 * throws `ConfigInvalidError` if any layer, or any Project's merge, is invalid.
 *
 * Only these fixed locations are read. A policy file inside a Project's repository is
 * never a layer (ADR-0052), since a repository's content is untrusted.
 */
export function loadPolicySet(locations: PolicyLocations): PolicySet {
  // Without the built-in layer no other layer can be judged, so this one stops at once.
  const builtIn = readBuiltInLayer(locations.defaultsFile);

  const collector = issueCollector();
  const workspace = collector.attempt(() =>
    readFullLayer("Workspace", join(locations.workspaceDir, "foreman", "foreman.yaml")),
  );
  const projects = projectLayerFiles(locations.workspaceDir).flatMap(({ project, file }) => {
    const layer = collector.attempt(() => {
      assertProjectName(project, file);
      return readProjectLayer(project, file);
    });
    return layer === undefined ? [] : [layer];
  });
  const override = collector.attempt(() => readFullLayer("user override", locations.overrideFile));
  collector.throwIfAny();

  const layersFor = (project: PolicyLayer | undefined) =>
    [builtIn, workspace, project, override].filter((layer) => layer !== undefined);

  const general = collector.attempt(() => mergeAndValidate(layersFor(undefined)));
  const perProject = new Map(
    projects.flatMap((layer) => {
      const merged = collector.attempt(() => mergeAndValidate(layersFor(layer)));
      return merged === undefined ? [] : [[layer.project as string, merged] as const];
    }),
  );
  collector.throwIfAny();

  return {
    builtIn,
    workspace,
    projects,
    override,
    effective: (project) => perProject.get(project ?? "") ?? (general as EffectivePolicy),
  };
}
