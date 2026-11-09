import { isDeepStrictEqual } from "node:util";
import { comparePolicies, type PolicyDifference } from "./classification.ts";
import type { PolicyLayer } from "./merge.ts";
import type { PolicySet } from "./policy-set.ts";

/** The differences for all Projects, or those a Project adds to them if `project` is set. */
export interface ScopedDifferences {
  project?: string;
  differences: PolicyDifference[];
}

export interface Deviation extends PolicyDifference {
  setBy: PolicyLayer;
}

export interface ScopedDeviations {
  project?: string;
  deviations: Deviation[];
}

function projectNames(...sets: readonly PolicySet[]): string[] {
  const names = sets.flatMap((set) => set.projects.map((layer) => layer.project as string));
  return [...new Set(names)].sort();
}

/**
 * Compares two Policy Sets on their merged results, for all Projects and then per Project,
 * since a Project layer's Relaxation isn't in the general merge. A Project with a layer on
 * only one side compares against the general merge on the other.
 */
export function comparePolicySets(before: PolicySet, after: PolicySet): ScopedDifferences[] {
  const compareFor = (project?: string) =>
    comparePolicies(before.effective(project).policy, after.effective(project).policy);
  const general = compareFor();
  const scopes: ScopedDifferences[] = [
    { differences: general },
    ...projectNames(before, after).map((project) => ({
      project,
      differences: compareFor(project).filter((d) => !general.some((other) => isDeepStrictEqual(d, other))),
    })),
  ];
  return scopes.filter(({ differences }) => differences.length > 0);
}

/** The differences from the Safety Defaults under one merge. A neutral value isn't one. */
function deviationsFor(set: PolicySet, project?: string): Deviation[] {
  const effective = set.effective(project);
  return comparePolicies(set.builtIn.content, effective.policy)
    .filter(({ effect }) => effect !== "neutral")
    .map((difference) => ({ ...difference, setBy: effective.setBy(difference.key) ?? set.builtIn }));
}

/**
 * How a Workspace differs from the Safety Defaults, with empty scopes left out. With no
 * `project`, it lists the general merge and then what each Project layer adds. With one,
 * it lists that Project's whole merged result.
 */
export function deviationReport(set: PolicySet, project?: string): ScopedDeviations[] {
  if (project !== undefined) {
    const deviations = deviationsFor(set, project);
    return deviations.length > 0 ? [{ project, deviations }] : [];
  }
  const general = deviationsFor(set);
  const scopes: ScopedDeviations[] = [
    { deviations: general },
    ...projectNames(set).map((name) => ({
      project: name,
      deviations: deviationsFor(set, name).filter((d) => !general.some((other) => isDeepStrictEqual(d, other))),
    })),
  ];
  return scopes.filter(({ deviations }) => deviations.length > 0);
}
