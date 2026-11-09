import { expect } from "bun:test";

const ID = "p_[a-z0-9_]+";
const NODE = new RegExp(`^  (${ID})\\["([A-Za-z0-9_-]+)"\\]$`);
const EDGE = new RegExp(`^  (${ID}) (-->|-\\.->)\\|"([a-z-]+)( \\(detected\\))?"\\| (${ID})$`);

export interface ParsedEdge {
  upstream: string;
  downstream: string;
  type: string;
  dashed: boolean;
}

/** The fenced Mermaid block of a rendered `graph.md`, with its fence removed. */
export function mermaidBlock(document: string): string {
  const match = /^```mermaid\n([\s\S]*?)^```$/m.exec(document);
  if (match === null) throw new Error(`no fenced mermaid block in:\n${document}`);
  return match[1] as string;
}

/**
 * Parses the flowchart subset Foreman renders, and fails on anything outside it. The real
 * parser needs a DOM and a large dependency tree, so this pins a form that it accepts:
 * quoted labels, and generated ids that can't be a Mermaid keyword such as `end`.
 */
export function parseFlowchart(block: string): { projects: string[]; edges: ParsedEdge[] } {
  const [header, ...lines] = block.trimEnd().split("\n");
  expect(header).toBe("flowchart LR");

  const labels = new Map<string, string>();
  const edges: ParsedEdge[] = [];
  const labelOf = (id: string) => {
    const label = labels.get(id);
    if (label === undefined) throw new Error(`an Edge uses undeclared node ${id}`);
    return label;
  };

  for (const line of lines) {
    const node = NODE.exec(line);
    const edge = EDGE.exec(line);
    if (node !== null) {
      expect(labels.has(node[1] as string)).toBe(false);
      labels.set(node[1] as string, node[2] as string);
    } else if (edge !== null) {
      const dashed = edge[2] === "-.->";
      expect(edge[4] !== undefined).toBe(dashed);
      edges.push({
        upstream: labelOf(edge[1] as string),
        downstream: labelOf(edge[5] as string),
        type: edge[3] as string,
        dashed,
      });
    } else {
      throw new Error(`not a valid flowchart line: ${JSON.stringify(line)}`);
    }
  }
  return { projects: [...labels.values()], edges };
}
