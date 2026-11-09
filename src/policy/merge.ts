import { isYamlMap, type YamlMap } from "../config/yaml-file.ts";

/** The Policy Layers, lowest precedence first. */
export const LAYER_PRECEDENCE = ["built-in", "Workspace", "Project", "user override"] as const;

export type LayerName = (typeof LAYER_PRECEDENCE)[number];

export interface PolicyLayer {
  name: LayerName;
  file: string;
  content: YamlMap;
  /** Set on a Project layer. */
  project?: string;
}

/** Each dotted key, with the layers that set it, lowest precedence first. */
export type Origins = ReadonlyMap<string, readonly PolicyLayer[]>;

/**
 * Merges layers given lowest precedence first. Maps merge deeply, which merges named
 * rules by ID, since they are a map keyed by ID. Anything else, including a list,
 * replaces what the lower layer had.
 */
export function mergeLayers(layers: readonly PolicyLayer[]): { merged: YamlMap; origins: Origins } {
  const merged: YamlMap = {};
  const origins = new Map<string, PolicyLayer[]>();

  function mergeInto(target: YamlMap, source: YamlMap, prefix: string, layer: PolicyLayer) {
    for (const [key, value] of Object.entries(source)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      origins.set(path, [...(origins.get(path) ?? []), layer]);
      if (isYamlMap(value)) {
        const existing = Object.hasOwn(target, key) ? target[key] : undefined;
        const child = isYamlMap(existing) ? existing : {};
        target[key] = child;
        mergeInto(child, value, path, layer);
      } else {
        target[key] = value;
      }
    }
  }

  for (const layer of layers) mergeInto(merged, layer.content, "", layer);
  return { merged, origins };
}
