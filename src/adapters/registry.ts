import { ConfigError } from "../config/errors.ts";
import type { Policy } from "../policy/schema.ts";
import type { Adapter } from "./contract.ts";
import { loadAdapterModule } from "./local-module.ts";
import { createStubAdapter, isStubAdapterType } from "./stubs.ts";

export type AdapterConfig = Policy["adapters"][string];

/**
 * Finds the Adapter that a Workspace names: the local module it declares, or else the
 * built-in one of that type. Nothing is installed or downloaded (ADR-0014).
 */
export async function resolveAdapter(name: string, config: AdapterConfig, workspaceDir: string): Promise<Adapter> {
  if (config.module !== undefined) return loadAdapterModule(name, config.module, workspaceDir);
  if (isStubAdapterType(config.type)) return createStubAdapter(config.type);
  throw new ConfigError(`Adapter "${name}": there is no built-in Adapter of type "${config.type}", and no module is declared`);
}
