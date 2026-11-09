import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isYamlMap, type YamlMap } from "../config/yaml-file.ts";
import { Mode } from "./schema.ts";

/**
 * Relaxation classification. This is mechanism, so it lives in code and no Policy key can
 * change it (ADR-0053): if it were in a file, an edit could call a safety key harmless.
 *
 * Every comparison runs on merged Policy, so moving a value between layers isn't a change,
 * and a higher layer can't hide one (ADR-0057). Anything unclassified counts as a
 * Relaxation, so errors fall on the safe side.
 */

export type ChangeEffect = "relaxation" | "tightening" | "neutral";

export interface PolicyDifference {
  /** A dotted key. A keyed list's element is named by its key, as `pipeline.steps.review`. */
  key: string;
  before: unknown;
  after: unknown;
  effect: ChangeEffect;
  /** Set when no classification covers this key. Its effect is always a Relaxation. */
  unclassified: boolean;
}

/** What a list means when it's absent. Most lists are then empty; a limit is then lifted. */
type AbsentList = "empty" | "everything";

type Leaf =
  | { class: "neutral" }
  | { class: "safety"; kind: "opaque"; absent?: unknown }
  | { class: "safety"; kind: "deny-list"; absent?: AbsentList }
  | { class: "safety"; kind: "allow-list"; absent?: AbsentList; absentFrom?: string }
  /** A list in a guard rule. Its direction depends on the rule's effect. */
  | { class: "safety"; kind: "rule-list"; part: "scope" | "exception"; absent?: AbsentList }
  /** `order` runs from least to most protective. */
  | { class: "safety"; kind: "ordered"; order: readonly string[]; absentFrom?: string }
  | { class: "safety"; kind: "boolean"; safe: boolean; absent?: boolean }
  | { class: "safety"; kind: "number"; safer: "higher" | "lower" };

const neutral: Leaf = { class: "neutral" };
const opaque: Leaf = { class: "safety", kind: "opaque" };
const denyList: Leaf = { class: "safety", kind: "deny-list" };
const allowList: Leaf = { class: "safety", kind: "allow-list" };

/** Rule effects, least protective first. No rule at all sits above `allow` and below `flag`. */
const EFFECTS = ["allow", "flag", "require-approval", "deny"] as const;

const REPOSITORY_DEFAULTS = "policies.repositoryDefaults";
const MODE_ORDER: readonly string[] = Mode.options;

const MODEL_ASSIGNMENT = { adapter: neutral, model: neutral, fallbacks: neutral };

function under(prefix: string, leaves: Record<string, Leaf>): Record<string, Leaf> {
  return Object.fromEntries(Object.entries(leaves).map(([key, leaf]) => [`${prefix}.${key}`, leaf]));
}

/**
 * The class of every Policy schema leaf. `*` stands for a name in a map or a keyed list.
 * A test fails if a schema leaf is missing here, or if a row here names no schema leaf.
 */
const LEAVES: Readonly<Record<string, Leaf>> = {
  schemaVersion: neutral,
  locale: neutral,

  // An Adapter type alone is neutral: one that doesn't enforce Policy still needs `allowUnenforced`.
  "adapters.*.type": neutral,
  "adapters.*.module": opaque,
  "adapters.*.allowUnenforced": { class: "safety", kind: "boolean", safe: false, absent: false },
  "adapters.*.env.passthrough": allowList,

  ...under("models.default", MODEL_ASSIGNMENT),
  ...under("models.steps.*", MODEL_ASSIGNMENT),
  ...under("models.roles.*", MODEL_ASSIGNMENT),
  "models.overrides": neutral,

  "roles.*.adapter": neutral,
  "roles.*.prompts": neutral,
  "roles.*.tools": allowList,
  "roles.*.projects": { class: "safety", kind: "allow-list", absent: "everything" },
  "roles.*.paths.allow": { class: "safety", kind: "allow-list", absent: "everything" },
  "roles.*.paths.forbid": denyList,

  "pipeline.steps.*.id": neutral,
  "pipeline.steps.*.scope": opaque,
  "pipeline.steps.*.access": { class: "safety", kind: "ordered", order: ["write", "read-only"] },
  "pipeline.steps.*.prompt": neutral,
  "pipeline.steps.*.role": opaque,
  "pipeline.steps.*.produces": opaque,
  "pipeline.steps.*.phase": opaque,
  "pipeline.steps.*.gates": { class: "safety", kind: "opaque", absent: [] },
  "pipeline.completion": opaque,

  "policies.guard.rules.*.checkpoints": { class: "safety", kind: "rule-list", part: "scope" },
  "policies.guard.rules.*.match.paths": { class: "safety", kind: "rule-list", part: "scope", absent: "everything" },
  "policies.guard.rules.*.match.facts.*": opaque,
  "policies.guard.rules.*.except": { class: "safety", kind: "rule-list", part: "exception" },
  "policies.guard.rules.*.effect": { class: "safety", kind: "ordered", order: EFFECTS },
  "policies.guard.rules.*.enabled": { class: "safety", kind: "boolean", safe: true, absent: true },
  "policies.guard.env.allow": allowList,
  "policies.guard.git.overrides": denyList,
  "policies.guard.git.workerRejectedHooks": denyList,
  "policies.guard.git.workerEnv.*": opaque,
  "policies.guard.git.emptyDirEnv": denyList,
  "policies.sandbox": { class: "safety", kind: "ordered", order: ["none", "bwrap"] },
  [`${REPOSITORY_DEFAULTS}.mode`]: { class: "safety", kind: "ordered", order: MODE_ORDER },
  [`${REPOSITORY_DEFAULTS}.allow`]: allowList,
  "policies.repositories.*.mode": {
    class: "safety",
    kind: "ordered",
    order: MODE_ORDER,
    absentFrom: `${REPOSITORY_DEFAULTS}.mode`,
  },
  "policies.repositories.*.allow": {
    class: "safety",
    kind: "allow-list",
    absentFrom: `${REPOSITORY_DEFAULTS}.allow`,
  },

  "approvals.ownerAlias": opaque,
  "approvals.expiryHours": { class: "safety", kind: "number", safer: "lower" },
  "approvals.acceptAgentMessages": { class: "safety", kind: "boolean", safe: false },
  "approvals.github.enabled": { class: "safety", kind: "boolean", safe: false },
  "approvals.github.allowlist.*.alias": opaque,
  "approvals.github.allowlist.*.login": neutral,
  "approvals.github.allowlist.*.policyOwner": { class: "safety", kind: "boolean", safe: false },

  "remote.type": opaque,
  "remote.apiBaseUrl": opaque,
  "remote.module": opaque,

  "polling.enabled": neutral,
  "polling.intervalSeconds": neutral,

  "lessons.topK": neutral,
  "lessons.tokenCap": neutral,
  "lessons.minOccurrences": { class: "safety", kind: "number", safer: "higher" },

  "router.answerFromDecisions": { class: "safety", kind: "boolean", safe: false },
  "router.decisionFiles": allowList,

  "limits.maxActiveWorkers": neutral,
  "limits.maxRounds": neutral,
  "limits.workerTimeoutMinutes": neutral,
};

/**
 * Lists whose elements have an identity, so a change to one element is judged alone rather
 * than as a new list. Every other list is one leaf, as a list replaces the one below it.
 */
const KEYED_LISTS: Readonly<Record<string, { key: string; ordered: boolean }>> = {
  "pipeline.steps": { key: "id", ordered: true },
  "approvals.github.allowlist": { key: "login", ordered: false },
};

interface Verdict {
  effect: ChangeEffect;
  /** Report on this child of the entry, rather than on the entry as a whole. */
  child?: string;
}

/** Says how to judge a whole entry, or `undefined` to compare its leaves one by one. */
type EntryJudge = (before: unknown, after: unknown) => Verdict | undefined;

const fieldsOf = (value: unknown): YamlMap => (isYamlMap(value) ? value : {});

const isActiveRule = (rule: unknown) => isYamlMap(rule) && rule.enabled !== false;

/** Rule positions with room for "no rule", which is safer than `allow` and less so than `flag`. */
function rulePosition(rule: unknown): number {
  if (!isActiveRule(rule)) return 0.5;
  const index = (EFFECTS as readonly unknown[]).indexOf(fieldsOf(rule).effect);
  return index === -1 ? -1 : index;
}

function moved(from: number, to: number): ChangeEffect {
  if (to === from) return "neutral";
  return to < from ? "relaxation" : "tightening";
}

const judgeRule: EntryJudge = (before, after) => {
  if (isActiveRule(before) && isActiveRule(after)) return undefined;
  const bothExist = isYamlMap(before) && isYamlMap(after);
  const enabledChanged = isActiveRule(before) !== isActiveRule(after);
  return {
    effect: moved(rulePosition(before), rulePosition(after)),
    ...(bothExist && enabledChanged ? { child: "enabled" } : {}),
  };
};

/** A Role or an approver's limits go with it, so it's judged whole unless it's on both sides. */
const judgeGrant: EntryJudge = (before, after) => {
  if (before !== undefined && after !== undefined) return undefined;
  return { effect: after === undefined ? "tightening" : "relaxation" };
};

/** Steps can be added or removed freely, unless that adds write access or changes a Gate. */
const judgeStep: EntryJudge = (before, after) => {
  if (before !== undefined && after !== undefined) return undefined;
  const { access, gates } = fieldsOf(before ?? after);
  if (Array.isArray(gates) && gates.length > 0) return { effect: "relaxation" };
  if (access !== "write") return { effect: "neutral" };
  return { effect: after === undefined ? "tightening" : "relaxation" };
};

/** An Adapter's leaves judge its arrival. Its removal takes all of its authority with it. */
const judgeAdapter: EntryJudge = (_before, after) => (after === undefined ? { effect: "tightening" } : undefined);

const ENTRY_JUDGES: Readonly<Record<string, EntryJudge>> = {
  "adapters.*": judgeAdapter,
  "roles.*": judgeGrant,
  "pipeline.steps.*": judgeStep,
  "policies.guard.rules.*": judgeRule,
  "approvals.github.allowlist.*": judgeGrant,
};

function matches(pattern: string, path: readonly string[]): boolean {
  const segments = pattern.split(".");
  return segments.length === path.length && segments.every((segment, i) => segment === "*" || segment === path[i]);
}

function rowFor<T>(table: Readonly<Record<string, T>>, path: readonly string[]): T | undefined {
  const pattern = Object.keys(table).find((candidate) => matches(candidate, path));
  return pattern === undefined ? undefined : table[pattern];
}

function valueAt(root: YamlMap, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (isYamlMap(node) ? node[part] : undefined), root);
}

const stringsOf = (value: unknown) => (Array.isArray(value) ? value : []);

/** Whether a list gained or lost entries, treating it as a set. */
function listChange(before: unknown, after: unknown, absent: AbsentList = "empty") {
  if (absent === "everything") {
    if (before === undefined && after === undefined) return { grew: false, shrank: false };
    if (before === undefined) return { grew: false, shrank: true };
    if (after === undefined) return { grew: true, shrank: false };
  }
  const from = new Set(stringsOf(before));
  const to = new Set(stringsOf(after));
  return {
    grew: [...to].some((entry) => !from.has(entry)),
    shrank: [...from].some((entry) => !to.has(entry)),
  };
}

function denyEffect({ grew, shrank }: { grew: boolean; shrank: boolean }): ChangeEffect | undefined {
  if (shrank) return "relaxation";
  return grew ? "tightening" : undefined;
}

function allowEffect({ grew, shrank }: { grew: boolean; shrank: boolean }): ChangeEffect | undefined {
  if (grew) return "relaxation";
  return shrank ? "tightening" : undefined;
}

interface Roots {
  before: YamlMap;
  after: YamlMap;
}

/** The effect of a change to one safety leaf, or `undefined` if it changes nothing. */
function safetyEffect(leaf: Leaf, before: unknown, after: unknown, path: readonly string[], roots: Roots) {
  if (leaf.class === "neutral") return "neutral";

  const resolved = (side: unknown, root: YamlMap, absent: unknown) => {
    if (side !== undefined) return side;
    return "absentFrom" in leaf && leaf.absentFrom !== undefined ? valueAt(root, leaf.absentFrom) : absent;
  };
  const absent = "absent" in leaf ? leaf.absent : undefined;
  const from = resolved(before, roots.before, absent);
  const to = resolved(after, roots.after, absent);

  switch (leaf.kind) {
    case "opaque":
      return isDeepStrictEqual(from, to) ? undefined : "relaxation";
    case "deny-list":
      return denyEffect(listChange(before, after, leaf.absent));
    case "allow-list":
      return leaf.absentFrom === undefined
        ? allowEffect(listChange(before, after, leaf.absent))
        : allowEffect(listChange(from, to));
    case "rule-list": {
      const rule = fieldsOf(valueAt(roots.after, path.slice(0, 4).join(".")));
      const change = listChange(before, after, leaf.absent);
      const restricts = rule.effect !== "allow";
      // A restricting rule's scope guards and its exceptions grant. An allow rule is the reverse.
      return restricts === (leaf.part === "scope") ? denyEffect(change) : allowEffect(change);
    }
    case "ordered": {
      if (from === to) return undefined;
      const fromRank = leaf.order.indexOf(from as string);
      const toRank = leaf.order.indexOf(to as string);
      return fromRank === -1 || toRank === -1 ? "relaxation" : moved(fromRank, toRank);
    }
    case "boolean":
      if (from === to) return undefined;
      return to === leaf.safe ? "tightening" : "relaxation";
    case "number": {
      if (from === to) return undefined;
      if (typeof from !== "number" || typeof to !== "number") return "relaxation";
      return (to > from) === (leaf.safer === "higher") ? "tightening" : "relaxation";
    }
  }
}

/** A keyed list as a map, or `undefined` if an element has no key or shares one. */
function keyedElements(list: unknown, key: string): YamlMap | undefined {
  if (list === undefined) return {};
  if (!Array.isArray(list)) return undefined;
  // No prototype, so a name such as `__proto__` is an ordinary entry that can't hide.
  const elements: YamlMap = Object.create(null);
  for (const element of list) {
    const name = isYamlMap(element) ? element[key] : undefined;
    if (typeof name !== "string" || Object.hasOwn(elements, name)) return undefined;
    elements[name] = element;
  }
  return elements;
}

function orderChanged(before: YamlMap, after: YamlMap): boolean {
  const common = (from: YamlMap, other: YamlMap) => Object.keys(from).filter((name) => Object.hasOwn(other, name));
  return !isDeepStrictEqual(common(before, after), common(after, before));
}

/**
 * Compares two merged Policies and returns every difference, sorted by key. An effect of
 * `neutral` isn't a difference from any Safety Default. Everything else is.
 */
export function comparePolicies(before: object, after: object): PolicyDifference[] {
  const roots: Roots = { before: before as YamlMap, after: after as YamlMap };
  const differences: PolicyDifference[] = [];

  const report = (path: readonly string[], from: unknown, to: unknown, effect: ChangeEffect, unclassified = false) => {
    differences.push({ key: path.join("."), before: from, after: to, effect, unclassified });
  };

  function compareMaps(from: YamlMap, to: YamlMap, path: readonly string[]) {
    for (const name of new Set([...Object.keys(from), ...Object.keys(to)])) {
      const child = [...path, name];
      compare(Object.hasOwn(from, name) ? from[name] : undefined, Object.hasOwn(to, name) ? to[name] : undefined, child);
    }
  }

  function compareKeyedList(from: unknown, to: unknown, path: readonly string[], list: { key: string; ordered: boolean }) {
    const fromElements = keyedElements(from, list.key);
    const toElements = keyedElements(to, list.key);
    if (fromElements === undefined || toElements === undefined) {
      report(path, from, to, "relaxation");
      return;
    }
    if (list.ordered && orderChanged(fromElements, toElements)) report(path, from, to, "relaxation");
    compareMaps(fromElements, toElements, path);
  }

  function compareLeaf(from: unknown, to: unknown, path: readonly string[]) {
    const leaf = rowFor(LEAVES, path);
    if (leaf === undefined) {
      report(path, from, to, "relaxation", true);
      return;
    }
    const effect = safetyEffect(leaf, from, to, path, roots);
    if (effect !== undefined) report(path, from, to, effect);
  }

  function compare(from: unknown, to: unknown, path: readonly string[]) {
    if (isDeepStrictEqual(from, to)) return;

    const judge = rowFor(ENTRY_JUDGES, path);
    const verdict = judge?.(from, to);
    if (verdict !== undefined) {
      if (verdict.child === undefined) {
        report(path, from, to, verdict.effect);
      } else {
        report([...path, verdict.child], fieldsOf(from)[verdict.child], fieldsOf(to)[verdict.child], verdict.effect);
      }
      return;
    }

    const list = rowFor(KEYED_LISTS, path);
    if (list !== undefined) {
      compareKeyedList(from, to, path, list);
      return;
    }

    const descends = (isYamlMap(from) || from === undefined) && (isYamlMap(to) || to === undefined);
    if (descends) {
      compareMaps(fieldsOf(from), fieldsOf(to), path);
    } else {
      compareLeaf(from, to, path);
    }
  }

  compareMaps(roots.before, roots.after, []);
  return differences.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The class of one schema leaf, as named by `schemaLeaves`, or `undefined` if it has none. */
export function classificationOf(leaf: string): Leaf["class"] | undefined {
  return Object.hasOwn(LEAVES, leaf) ? (LEAVES[leaf] as Leaf).class : undefined;
}

export function classifiedLeaves(): string[] {
  return Object.keys(LEAVES);
}

/** Every leaf of a Policy schema, with `*` for a name in a map or a keyed list. */
export function schemaLeaves(schema: z.ZodType, path = ""): string[] {
  const child = (name: string) => (path === "" ? name : `${path}.${name}`);
  if (schema instanceof z.ZodOptional) return schemaLeaves(schema.unwrap() as z.ZodType, path);
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodType>).flatMap(([name, field]) =>
      schemaLeaves(field, child(name)),
    );
  }
  if (schema instanceof z.ZodRecord) return schemaLeaves(schema.valueType as z.ZodType, child("*"));
  if (schema instanceof z.ZodArray && Object.hasOwn(KEYED_LISTS, path)) {
    return schemaLeaves(schema.element as z.ZodType, child("*"));
  }
  return [path];
}
