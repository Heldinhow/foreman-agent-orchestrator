import fs from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { ConfigError } from "../config/errors.ts";
import type { Adapter } from "./contract.ts";

/** What a local Adapter module's default export is called with. */
export interface AdapterContext {
  /** The Adapter's name in Policy. */
  name: string;
  workspaceDir: string;
}

/** A local module's default export. */
export type AdapterFactory = (context: AdapterContext) => Adapter | Promise<Adapter>;

const AdapterShape = z.object({
  id: z.string().min(1),
  capabilities: z.object({
    enforcesPolicy: z.boolean(),
    resumableSessions: z.boolean(),
    modelSelection: z.boolean(),
    readOnly: z.boolean(),
  }),
  start: z.function(),
  send: z.function(),
  status: z.function(),
  diff: z.function(),
  cancel: z.function(),
});

/**
 * Only a path can name a module: a bare name would have Bun look in `node_modules`, or
 * download it, and ADR-0014 allows no plugin to arrive that way. A relative path starts
 * from the Workspace, not from wherever Foreman happens to run.
 */
function modulePath(name: string, module: string, workspaceDir: string): string {
  if (!isAbsolute(module) && !module.startsWith("./") && !module.startsWith("../")) {
    throw new ConfigError(
      `Adapter "${name}": module "${module}" isn't a local path. Use an absolute path, or one starting with ./ or ../ from the Workspace`,
    );
  }
  const path = resolve(workspaceDir, module);
  if (!fs.statSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new ConfigError(`Adapter "${name}": module ${path} doesn't exist or isn't a file`);
  }
  return path;
}

/**
 * Loads a custom Adapter from the one path that Policy declares (ADR-0014). The module runs
 * with Foreman's full trust, so a caller must pass only accepted Policy: a file that a
 * Worker could have edited must never reach this.
 */
export async function loadAdapterModule(name: string, module: string, workspaceDir: string): Promise<Adapter> {
  const path = modulePath(name, module, workspaceDir);
  const invalid = (reason: string) => new ConfigError(`Adapter "${name}": module ${path} ${reason}`);

  let factory: unknown;
  try {
    factory = (await import(path)).default;
  } catch (error) {
    throw invalid(`can't be loaded: ${(error as Error).message}`);
  }
  if (typeof factory !== "function") {
    throw invalid("must have a default export: a function that takes the context and returns an Adapter");
  }

  let adapter: unknown;
  try {
    adapter = await (factory as AdapterFactory)({ name, workspaceDir });
  } catch (error) {
    throw invalid(`failed to create its Adapter: ${(error as Error).message}`);
  }

  const shape = AdapterShape.safeParse(adapter);
  if (!shape.success) {
    const problems = shape.error.issues.map((issue) => `${issue.path.join(".") || "the Adapter"}: ${issue.message}`);
    throw invalid(`didn't return a valid Adapter: ${problems.join("; ")}`);
  }
  return adapter as Adapter;
}
