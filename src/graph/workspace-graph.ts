/**
 * The Workspace Graph: Projects and typed Edges, with order, impact and cycles computed
 * from them. Pure, and the only place that knows which end of an Edge is Upstream.
 */

export const EDGE_TYPES = ["depends-on", "calls-api", "shares-lib", "publishes-event", "consumes-event"] as const;
export const EDGE_SOURCES = ["detected", "confirmed"] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];
export type EdgeSource = (typeof EDGE_SOURCES)[number];
/** Whether all of the Upstream's Tasks block the Downstream, or only its contract Task (ADR-0026). */
export type EdgeOrdering = "upstream-first" | "contract-first";

const EDGE_RULES: Record<EdgeType, { upstreamEnd: "from" | "to"; ordering: EdgeOrdering }> = {
  "depends-on": { upstreamEnd: "to", ordering: "upstream-first" },
  "shares-lib": { upstreamEnd: "to", ordering: "upstream-first" },
  "calls-api": { upstreamEnd: "to", ordering: "contract-first" },
  "consumes-event": { upstreamEnd: "to", ordering: "contract-first" },
  "publishes-event": { upstreamEnd: "from", ordering: "contract-first" },
};

/** An Edge as `workspace.yaml` states it. */
export interface DeclaredEdge {
  from: string;
  to: string;
  type: EdgeType;
  source: EdgeSource;
  contract?: string;
}

export interface GraphEdge extends DeclaredEdge {
  upstream: string;
  downstream: string;
  /** Only a confirmed Edge affects order and impact. */
  confirmed: boolean;
  ordering: EdgeOrdering;
}

export interface WorkspaceGraph {
  /** Sorted by name. */
  projects: readonly string[];
  /** In a canonical order, whatever order they were declared in. */
  edges: readonly GraphEdge[];
  /**
   * Upstream first. Each entry is a Project or, when longer than one, the Projects of a
   * cycle, which have no order until the Operator gives one (ADR-0027).
   */
  order: readonly (readonly string[])[];
  /** Cycles of confirmed `depends-on` or `shares-lib` Edges, which leave no build order. */
  hardCycles: readonly (readonly string[])[];
  /** Other cycles of confirmed Edges, which are legitimate but need a warning. */
  softCycles: readonly (readonly string[])[];
  warnings: readonly string[];
  /** The transitive Downstream of a Project, in order. */
  impactOf(project: string): string[];
  directDownstreamOf(project: string): string[];
}

/** From each Upstream to its Downstream Projects. */
type Adjacency = ReadonlyMap<string, readonly string[]>;

function normalize(edge: DeclaredEdge): GraphEdge {
  const { upstreamEnd, ordering } = EDGE_RULES[edge.type];
  return {
    ...edge,
    upstream: upstreamEnd === "from" ? edge.from : edge.to,
    downstream: upstreamEnd === "from" ? edge.to : edge.from,
    confirmed: edge.source === "confirmed",
    ordering,
  };
}

function canonicalKey({ upstream, downstream, type, source, contract }: GraphEdge): string {
  return [upstream, downstream, type, source, contract ?? ""].join("\0");
}

/** Sorted by code unit rather than locale, so output is the same on every machine. */
function canonicalEdges(edges: readonly DeclaredEdge[]): GraphEdge[] {
  return edges.map(normalize).sort((a, b) => {
    const [one, other] = [canonicalKey(a), canonicalKey(b)];
    return one < other ? -1 : one > other ? 1 : 0;
  });
}

function adjacencyOf(edges: readonly GraphEdge[]): Adjacency {
  const adjacency = new Map<string, string[]>();
  for (const { upstream, downstream } of edges) {
    adjacency.set(upstream, [...(adjacency.get(upstream) ?? []), downstream]);
  }
  return adjacency;
}

/** Everything reachable from `start`. Includes `start` only if it's on a cycle. */
function reachableFrom(start: string, adjacency: Adjacency): Set<string> {
  const seen = new Set<string>();
  const pending = [...(adjacency.get(start) ?? [])];
  for (const next of pending) {
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...(adjacency.get(next) ?? []));
  }
  return seen;
}

/** The strongly connected groups, each sorted, and sorted by first member. */
function groupsOf(projects: readonly string[], adjacency: Adjacency): string[][] {
  const reach = new Map(projects.map((project) => [project, reachableFrom(project, adjacency)]));
  const mutuallyReachable = (a: string, b: string) => reach.get(a)?.has(b) && reach.get(b)?.has(a);

  const placed = new Set<string>();
  const groups: string[][] = [];
  for (const project of projects) {
    if (placed.has(project)) continue;
    const group = projects.filter((other) => other === project || mutuallyReachable(project, other));
    for (const member of group) placed.add(member);
    groups.push(group);
  }
  return groups;
}

function isCycle(group: readonly string[], adjacency: Adjacency): boolean {
  return group.length > 1 || group.some((project) => adjacency.get(project)?.includes(project));
}

/** Upstream first, taking the first ready group by name, so the result is deterministic. */
function orderOf(groups: readonly string[][], confirmed: readonly GraphEdge[]): string[][] {
  const remaining = [...groups];
  const order: string[][] = [];
  while (remaining.length > 0) {
    const ready = remaining.findIndex(
      (group) =>
        !confirmed.some(
          ({ upstream, downstream }) =>
            group.includes(downstream) &&
            !group.includes(upstream) &&
            remaining.some((other) => other.includes(upstream)),
        ),
    );
    order.push(...remaining.splice(ready, 1));
  }
  return order;
}

function unconfirmedWarning({ from, type, to, source }: GraphEdge): string {
  return `Edge "${from} ${type} ${to}" is unconfirmed (source: ${source}), so it doesn't affect order or impact`;
}

function softCycleWarning(cycle: readonly string[]): string {
  return `cycle through ${cycle.join(", ")} involving calls-api or event Edges: a Run with Tasks in it asks the Operator for the order`;
}

/**
 * Builds the graph. Validation of `workspace.yaml` decides whether a cycle or a dangling
 * Edge is acceptable; here, an Edge end that isn't a declared Project is simply never ordered.
 */
export function createWorkspaceGraph(input: {
  projects: Iterable<string>;
  edges: readonly DeclaredEdge[];
}): WorkspaceGraph {
  const projects = [...input.projects].sort();
  const edges = canonicalEdges(input.edges);
  const confirmed = edges.filter((edge) => edge.confirmed);
  const adjacency = adjacencyOf(confirmed);

  const groups = groupsOf(projects, adjacency);
  const order = orderOf(groups, confirmed);

  const upstreamFirst = adjacencyOf(confirmed.filter((edge) => edge.ordering === "upstream-first"));
  const hardCycles = groupsOf(projects, upstreamFirst).filter((group) => isCycle(group, upstreamFirst));
  const softCycles = groups.filter(
    (group) =>
      isCycle(group, adjacency) &&
      confirmed.some(
        ({ upstream, downstream, ordering }) =>
          ordering === "contract-first" && group.includes(upstream) && group.includes(downstream),
      ),
  );

  const inOrder = (project: string, downstream: Iterable<string>) => {
    const members = new Set(downstream);
    return order.flat().filter((other) => other !== project && members.has(other));
  };

  return {
    projects,
    edges,
    order,
    hardCycles,
    softCycles,
    warnings: [
      ...edges.filter((edge) => !edge.confirmed).map(unconfirmedWarning),
      ...softCycles.map(softCycleWarning),
    ],
    impactOf: (project) => inOrder(project, reachableFrom(project, adjacency)),
    directDownstreamOf: (project) => inOrder(project, adjacency.get(project) ?? []),
  };
}
