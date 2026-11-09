import { describe, expect, test } from "bun:test";
import {
  createWorkspaceGraph,
  type DeclaredEdge,
  type EdgeType,
} from "../../src/graph/workspace-graph.ts";

function edge(from: string, type: EdgeType, to: string, source: DeclaredEdge["source"] = "confirmed"): DeclaredEdge {
  return { from, to, type, source };
}

function graphOf(projects: string[], edges: DeclaredEdge[]) {
  return createWorkspaceGraph({ projects, edges });
}

// The names sort the opposite way round to the Edge, so a passing order can't be an alphabetical accident.
const UPSTREAM = "z-upstream";
const DOWNSTREAM = "a-downstream";

const directions: { type: EdgeType; from: string; to: string; ordering: string }[] = [
  { type: "depends-on", from: DOWNSTREAM, to: UPSTREAM, ordering: "upstream-first" },
  { type: "shares-lib", from: DOWNSTREAM, to: UPSTREAM, ordering: "upstream-first" },
  { type: "calls-api", from: DOWNSTREAM, to: UPSTREAM, ordering: "contract-first" },
  { type: "consumes-event", from: DOWNSTREAM, to: UPSTREAM, ordering: "contract-first" },
  { type: "publishes-event", from: UPSTREAM, to: DOWNSTREAM, ordering: "contract-first" },
];

describe.each(directions)("a confirmed $type Edge from $from to $to", ({ type, from, to, ordering }) => {
  const graph = graphOf([UPSTREAM, DOWNSTREAM], [edge(from, type, to)]);

  test("normalizes to the Upstream and Downstream the spec defines", () => {
    expect(graph.edges).toEqual([
      {
        from,
        to,
        type,
        source: "confirmed",
        upstream: UPSTREAM,
        downstream: DOWNSTREAM,
        confirmed: true,
        ordering,
      } as never,
    ]);
  });

  test("orders the Upstream first", () => {
    expect(graph.order).toEqual([[UPSTREAM], [DOWNSTREAM]]);
  });

  test("puts the Downstream in the Upstream's impact, and not the reverse", () => {
    expect(graph.impactOf(UPSTREAM)).toEqual([DOWNSTREAM]);
    expect(graph.impactOf(DOWNSTREAM)).toEqual([]);
  });

  test("gives no warning", () => {
    expect(graph.warnings).toEqual([]);
  });
});

describe("order", () => {
  test("is the same whatever order the Projects and Edges were declared in", () => {
    const edges = [edge("c", "depends-on", "a"), edge("b", "calls-api", "a"), edge("d", "shares-lib", "b")];

    const one = graphOf(["a", "b", "c", "d"], edges);
    const other = graphOf(["d", "c", "b", "a"], edges.toReversed());

    expect(one.order).toEqual([["a"], ["b"], ["c"], ["d"]]);
    expect(other.order).toEqual(one.order);
    expect(other.edges).toEqual(one.edges);
  });

  test("takes every Project, including one with no Edges", () => {
    expect(graphOf(["b", "lone", "a"], [edge("b", "depends-on", "a")]).order).toEqual([["a"], ["b"], ["lone"]]);
  });

  test("follows a chain across Edge types", () => {
    const graph = graphOf(
      ["notifier", "orders-api", "catalog-api", "shared-types"],
      [
        edge("catalog-api", "shares-lib", "shared-types"),
        edge("orders-api", "calls-api", "catalog-api"),
        edge("orders-api", "publishes-event", "notifier"),
      ],
    );

    expect(graph.order.flat()).toEqual(["shared-types", "catalog-api", "orders-api", "notifier"]);
  });

  test("keeps the Projects of a calls-api cycle together, between their Upstream and Downstream", () => {
    const graph = graphOf(
      ["base", "x", "y", "top"],
      [
        edge("x", "calls-api", "y"),
        edge("y", "calls-api", "x"),
        edge("x", "depends-on", "base"),
        edge("top", "depends-on", "y"),
      ],
    );

    expect(graph.order).toEqual([["base"], ["x", "y"], ["top"]]);
  });
});

describe("impact", () => {
  const graph = graphOf(
    ["base", "left", "right", "top", "elsewhere"],
    [
      edge("left", "depends-on", "base"),
      edge("right", "calls-api", "base"),
      edge("top", "shares-lib", "left"),
      edge("top", "consumes-event", "right"),
    ],
  );

  test("is transitive, lists a diamond's Project once and follows order", () => {
    expect(graph.impactOf("base")).toEqual(["left", "right", "top"]);
  });

  test("direct Downstream stops at the first hop", () => {
    expect(graph.directDownstreamOf("base")).toEqual(["left", "right"]);
  });

  test("leaves out Projects that aren't Downstream", () => {
    expect(graph.impactOf("left")).toEqual(["top"]);
    expect(graph.impactOf("elsewhere")).toEqual([]);
  });

  test("around a cycle, never lists the Project itself", () => {
    const cyclic = graphOf(["x", "y"], [edge("x", "calls-api", "y"), edge("y", "calls-api", "x")]);

    expect(cyclic.impactOf("x")).toEqual(["y"]);
    expect(cyclic.impactOf("y")).toEqual(["x"]);
  });
});

describe("an unconfirmed Edge", () => {
  const detected = edge("a", "depends-on", "z", "detected");

  test("doesn't change order", () => {
    expect(graphOf(["a", "z"], [detected]).order).toEqual([["a"], ["z"]]);
    expect(graphOf(["a", "z"], [edge("a", "depends-on", "z")]).order).toEqual([["z"], ["a"]]);
  });

  test("doesn't change impact", () => {
    const graph = graphOf(["a", "z"], [detected]);

    expect(graph.impactOf("z")).toEqual([]);
    expect(graph.directDownstreamOf("z")).toEqual([]);
  });

  test("appears as a warning, and stays in the graph", () => {
    const graph = graphOf(["a", "z"], [detected]);

    expect(graph.warnings).toHaveLength(1);
    expect(graph.warnings[0]).toContain("a depends-on z");
    expect(graph.warnings[0]).toContain("unconfirmed");
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.confirmed).toBe(false);
  });

  test("can't form a cycle, since no order rests on it", () => {
    const graph = graphOf(["a", "z"], [edge("z", "depends-on", "a"), detected]);

    expect(graph.hardCycles).toEqual([]);
    expect(graph.softCycles).toEqual([]);
    expect(graph.order).toEqual([["a"], ["z"]]);
  });
});

describe("cycles", () => {
  test.each<[string, DeclaredEdge[], string[]]>([
    ["depends-on", [edge("a", "depends-on", "b"), edge("b", "depends-on", "a")], ["a", "b"]],
    ["shares-lib", [edge("a", "shares-lib", "b"), edge("b", "shares-lib", "a")], ["a", "b"]],
    ["both kinds", [edge("a", "depends-on", "b"), edge("b", "shares-lib", "a")], ["a", "b"]],
    [
      "three Projects",
      [edge("a", "depends-on", "b"), edge("b", "depends-on", "c"), edge("c", "depends-on", "a")],
      ["a", "b", "c"],
    ],
    ["a Project depending on itself", [edge("a", "depends-on", "a")], ["a"]],
  ])("a cycle of %s is a hard cycle", (_name, edges, members) => {
    const graph = graphOf(["a", "b", "c"], edges);

    expect(graph.hardCycles).toEqual([members]);
    expect(graph.softCycles).toEqual([]);
  });

  test.each<[string, DeclaredEdge[]]>([
    ["calls-api", [edge("a", "calls-api", "b"), edge("b", "calls-api", "a")]],
    ["events", [edge("a", "publishes-event", "b"), edge("a", "consumes-event", "b")]],
    ["calls-api and an event", [edge("a", "calls-api", "b"), edge("a", "publishes-event", "b")]],
    ["calls-api closing a depends-on path", [edge("a", "depends-on", "b"), edge("b", "calls-api", "a")]],
  ])("a cycle of %s is a soft cycle, with a warning", (_name, edges) => {
    const graph = graphOf(["a", "b"], edges);

    expect(graph.hardCycles).toEqual([]);
    expect(graph.softCycles).toEqual([["a", "b"]]);
    expect(graph.warnings).toHaveLength(1);
    expect(graph.warnings[0]).toContain("cycle");
    expect(graph.warnings[0]).toContain("a, b");
    expect(graph.order).toEqual([["a", "b"]]);
  });

  test("a publisher and its consumer declared from both sides aren't a cycle", () => {
    const graph = graphOf(["a", "b"], [edge("a", "publishes-event", "b"), edge("b", "consumes-event", "a")]);

    expect(graph.softCycles).toEqual([]);
    expect(graph.order).toEqual([["a"], ["b"]]);
  });

  test("two separate cycles are reported separately", () => {
    const graph = graphOf(
      ["a", "b", "c", "d"],
      [
        edge("a", "depends-on", "b"),
        edge("b", "depends-on", "a"),
        edge("c", "depends-on", "d"),
        edge("d", "depends-on", "c"),
      ],
    );

    expect(graph.hardCycles).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

test("a Project named like a built-in object member behaves as any other", () => {
  const graph = graphOf(["constructor", "toString"], [edge("toString", "depends-on", "constructor")]);

  expect(graph.order).toEqual([["constructor"], ["toString"]]);
  expect(graph.impactOf("constructor")).toEqual(["toString"]);
});
