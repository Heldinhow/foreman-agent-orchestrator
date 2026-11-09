import { CHECKPOINT_FACTS, factsAt, type Checkpoint } from "../policy/checkpoints.ts";
import { LAYER_PRECEDENCE, type LayerName } from "../policy/merge.ts";
import { patternCovers, patternExcepts, relativePath } from "../policy/path-glob.ts";
import type { EffectivePolicy } from "../policy/policy-set.ts";
import { isFallbackRule, type Rule } from "../policy/schema.ts";

export type Effect = Rule["effect"];

export interface CheckDecision {
  effect: Effect;
  /** The ID of the rule that produced this decision. */
  rule: string;
  /** The highest Policy Layer that set any part of that rule. */
  layer: LayerName;
}

export type Facts = Readonly<Record<string, string | number | boolean>>;

/** All the engine reads of Policy. The merged result of a Policy Snapshot satisfies it. */
export type PolicySnapshot = Pick<EffectivePolicy, "policy" | "explain">;

/**
 * The caller asked something that can't be judged, or the Policy it gave has no rule for
 * it. Each of these would otherwise fall through to a rule that doesn't apply, so the
 * engine refuses rather than answer.
 */
export class CheckError extends Error {}

const MOST_RESTRICTIVE_FIRST: readonly Effect[] = ["deny", "require-approval", "flag", "allow"];

function checkedFacts(checkpoint: Checkpoint, facts: Facts): Facts {
  if (!Object.hasOwn(CHECKPOINT_FACTS, checkpoint)) {
    throw new CheckError(`unknown checkpoint "${checkpoint}"`);
  }
  const declared = factsAt(checkpoint);
  for (const name of declared) {
    if (!Object.hasOwn(facts, name)) throw new CheckError(`${checkpoint} needs the fact "${name}"`);
  }
  for (const name of Object.keys(facts)) {
    if (!declared.includes(name)) throw new CheckError(`${checkpoint} has no fact "${name}"`);
  }
  if (!Object.hasOwn(facts, "path")) return facts;

  const path = typeof facts.path === "string" ? relativePath(facts.path) : undefined;
  if (path === undefined) {
    throw new CheckError(`${checkpoint} needs "path" to be a path inside its root, got ${JSON.stringify(facts.path)}`);
  }
  return { ...facts, path };
}

function conditionsHold(rule: Rule, facts: Facts): boolean {
  const { paths, facts: expected } = rule.match ?? {};
  const path = String(facts.path);
  if (paths !== undefined && !paths.some((pattern) => patternCovers(pattern, path))) return false;
  if ((rule.except ?? []).some((pattern) => patternExcepts(pattern, path))) return false;
  return Object.entries(expected ?? {}).every(([name, value]) => facts[name] === value);
}

function layerOf(id: string, snapshot: PolicySnapshot): LayerName {
  const setters = snapshot.explain(`policies.guard.rules.${id}`).map((entry) => entry.setBy.name);
  const layer = LAYER_PRECEDENCE.findLast((name) => setters.includes(name));
  if (layer === undefined) throw new CheckError(`no Policy Layer set the rule "${id}"`);
  return layer;
}

/**
 * Decides one checkpoint from its facts and a Policy Snapshot, and from nothing else, so
 * Worker text and prompts can't reach the result.
 *
 * A matching rule with conditions beats the checkpoint's fallback rules, which have none
 * and exist so that no decision is ever implied. Within either group the most restrictive
 * effect wins, so a rule can't undercut a deny without changing that deny.
 */
export function evaluate(checkpoint: Checkpoint, facts: Facts, snapshot: PolicySnapshot): CheckDecision {
  const checked = checkedFacts(checkpoint, facts);
  const rules = Object.entries(snapshot.policy.policies.guard.rules).filter(
    ([, rule]) => rule.enabled !== false && rule.checkpoints.includes(checkpoint),
  );
  const matching = rules.filter(([, rule]) => !isFallbackRule(rule) && conditionsHold(rule, checked));
  const candidates = matching.length > 0 ? matching : rules.filter(([, rule]) => isFallbackRule(rule));

  const [winner] = candidates.toSorted(
    ([idA, a], [idB, b]) =>
      MOST_RESTRICTIVE_FIRST.indexOf(a.effect) - MOST_RESTRICTIVE_FIRST.indexOf(b.effect) || idA.localeCompare(idB),
  );
  if (winner === undefined) throw new CheckError(`Policy has no rule set for ${checkpoint}`);

  const [id, rule] = winner;
  return { effect: rule.effect, rule: id, layer: layerOf(id, snapshot) };
}
