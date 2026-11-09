import { z } from "zod";
import { CHECKPOINTS, factsAt } from "./checkpoints.ts";
import { globProblem } from "./path-glob.ts";

/**
 * The shape of Policy, and nothing else: every value lives in `policy/defaults.yaml`
 * (ADR-0051, ADR-0058), so no field here has a default. The built-in layer must
 * validate against `PolicySchema` by itself. Higher layers hold only what differs.
 */

/**
 * The form of a Project, Role, Adapter, Step or rule name. A name is a segment of a
 * dotted Policy key and of a path under `foreman/projects`, so it can't hold a dot or slash.
 */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const Name = z.string().regex(NAME_PATTERN);
const Text = z.string().min(1);
const Texts = z.array(Text);
const PathGlobs = z.array(
  Text.superRefine((pattern, context) => {
    const problem = globProblem(pattern);
    if (problem !== undefined) context.addIssue({ code: "custom", message: problem });
  }),
);
const PositiveInt = z.number().int().positive();
const SchemaVersion = z.literal(1);

/** The Outbound Action kinds a Gate or a Mode's allowlist can name. */
const OutboundKind = z.enum(["push", "draft-pr", "pr", "merge", "deploy"]);

const GateSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("human") }),
  z.strictObject({ type: z.literal("evidence") }),
  z.strictObject({ type: z.literal("diff-check") }),
  z.strictObject({ type: z.literal("review-verdict") }),
  z.strictObject({ type: z.literal("integration") }),
  z.strictObject({ type: z.literal("outbound"), actions: z.array(OutboundKind).min(1) }),
  z.strictObject({ type: z.literal("command"), command: Text }),
]);

const StepSchema = z.strictObject({
  id: Name,
  scope: z.enum(["run", "task"]),
  access: z.enum(["read-only", "write"]),
  prompt: Text,
  role: Name.optional(),
  produces: z.enum(["spec", "tasks"]).optional(),
  phase: z.literal("after-completion").optional(),
  gates: z.array(GateSchema).optional(),
});

const RuleSchema = z.strictObject({
  checkpoints: z.array(z.enum(CHECKPOINTS)).min(1),
  match: z
    .strictObject({
      paths: PathGlobs.optional(),
      facts: z.record(Name, z.union([z.string(), z.number(), z.boolean()])).optional(),
    })
    .optional(),
  except: PathGlobs.optional(),
  effect: z.enum(["allow", "deny", "flag", "require-approval"]),
  enabled: z.boolean().optional(),
});

export type Rule = z.infer<typeof RuleSchema>;

/**
 * Whether a rule applies whatever the facts, with no `match` or `except`. A checkpoint's
 * fallback says what happens when no rule with conditions applies.
 */
export function isFallbackRule(rule: Rule): boolean {
  const { paths, facts } = rule.match ?? {};
  return paths === undefined && Object.keys(facts ?? {}).length === 0 && (rule.except ?? []).length === 0;
}

/** What a rule can test depends on its checkpoints, so a typo can't leave it doing nothing. */
function checkRuleConditions(id: string, rule: Rule, context: z.RefinementCtx): void {
  const at = (path: (string | number)[], message: string) =>
    context.addIssue({ code: "custom", path: ["rules", id, ...path], message });

  for (const checkpoint of rule.checkpoints) {
    const facts = factsAt(checkpoint);
    for (const name of Object.keys(rule.match?.facts ?? {})) {
      if (!facts.includes(name)) at(["match", "facts", name], `${checkpoint} has no fact "${name}"`);
    }
    if (facts.includes("path")) continue;
    if (rule.match?.paths !== undefined) at(["match", "paths"], `${checkpoint} has no path to match`);
    if (rule.except !== undefined) at(["except"], `${checkpoint} has no path to match`);
  }
}

/**
 * A layer holds only what differs, so this applies to `PolicySchema` and so to the merged
 * result, not to a layer alone. A missing rule can't quietly mean "allow" (ADR-0058).
 */
const GuardSchema = z
  .strictObject({ rules: z.record(Name, RuleSchema) })
  .superRefine(({ rules }, context) => {
    for (const [id, rule] of Object.entries(rules)) checkRuleConditions(id, rule, context);

    const enabled = Object.values(rules).filter((rule) => rule.enabled !== false);
    for (const checkpoint of CHECKPOINTS) {
      if (!enabled.some((rule) => rule.checkpoints.includes(checkpoint) && isFallbackRule(rule))) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `${checkpoint} has no rule set: it needs an enabled rule with no match or except, so that its decision is never implied`,
        });
      }
    }
  });

const RepositorySchema = z.strictObject({
  mode: z.enum(["propose", "autonomous"]),
  allow: z.array(OutboundKind),
});

const ModelAssignmentSchema = z.strictObject({
  adapter: Name.optional(),
  model: Text,
  fallbacks: Texts.optional(),
});

const LimitsSchema = z.strictObject({
  maxActiveWorkers: PositiveInt,
  maxRounds: PositiveInt,
  workerTimeoutMinutes: PositiveInt,
});

export const PolicySchema = z.strictObject({
  schemaVersion: SchemaVersion,
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/, "must be a locale such as en or pt-BR"),
  adapters: z.record(
    Name,
    z.strictObject({
      type: Text,
      module: Text.optional(),
      allowUnenforced: z.boolean().optional(),
      env: z.strictObject({ passthrough: Texts }).optional(),
    }),
  ),
  models: z.strictObject({
    default: ModelAssignmentSchema.optional(),
    steps: z.record(Name, ModelAssignmentSchema).optional(),
    roles: z.record(Name, ModelAssignmentSchema).optional(),
    overrides: z.array(ModelAssignmentSchema.extend({ step: Name, role: Name })).optional(),
  }),
  roles: z.record(
    Name,
    z.strictObject({
      adapter: Name.optional(),
      prompts: Texts.optional(),
      tools: Texts,
      projects: z.array(Name).optional(),
      paths: z.strictObject({ allow: Texts, forbid: Texts }).optional(),
    }),
  ),
  pipeline: z.strictObject({
    steps: z.array(StepSchema).min(1),
    completion: z.array(GateSchema),
  }),
  policies: z.strictObject({
    guard: GuardSchema,
    sandbox: z.enum(["none", "bwrap"]),
    /** Applies to every repository that `repositories` doesn't name. */
    repositoryDefaults: RepositorySchema,
    repositories: z.record(Name, RepositorySchema.partial()),
  }),
  approvals: z.strictObject({
    ownerAlias: Text,
    expiryHours: PositiveInt,
    acceptAgentMessages: z.boolean(),
    github: z.strictObject({
      enabled: z.boolean(),
      allowlist: z.array(z.strictObject({ alias: Text, login: Text, policyOwner: z.boolean() })),
    }),
  }),
  remote: z
    .strictObject({
      type: Text,
      apiBaseUrl: z.url().optional(),
      module: Text.optional(),
    })
    .optional(),
  polling: z.strictObject({ enabled: z.boolean(), intervalSeconds: PositiveInt }),
  lessons: z.strictObject({ topK: PositiveInt, tokenCap: PositiveInt, minOccurrences: PositiveInt }),
  router: z.strictObject({ answerFromDecisions: z.boolean(), decisionFiles: Texts }),
  limits: LimitsSchema,
});

export type Policy = z.infer<typeof PolicySchema>;

/**
 * Makes every map key optional at every depth, so a layer can hold one value without
 * restating its neighbours. A list stays whole, since a list in a layer replaces the
 * one below it, and unknown keys stay errors.
 */
function partialDeep(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional) return partialDeep(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodObject) return partialObject(schema.shape);
  if (schema instanceof z.ZodRecord) {
    return z.record(schema.keyType as z.ZodString, partialDeep(schema.valueType as z.ZodType));
  }
  return schema;
}

function partialObject(shape: Record<string, z.ZodType>): z.ZodType {
  const fields = Object.entries(shape).map(([key, field]) => [key, partialDeep(field).optional()]);
  return z.strictObject(Object.fromEntries(fields));
}

function layerSchema(shape: Record<string, z.ZodType>): z.ZodType {
  const { schemaVersion: _required, ...rest } = shape;
  return z.strictObject({
    schemaVersion: SchemaVersion,
    ...(partialObject(rest) as z.ZodObject).shape,
  });
}

/** The Workspace and user-override layers can set any key. */
export const FullLayerSchema = layerSchema(PolicySchema.shape);

/**
 * A Project layer holds what can differ per Project. Roles, Adapters, the Pipeline and
 * similar settings span Projects, and `maxActiveWorkers` is a Workspace-wide limit.
 */
export const ProjectLayerSchema = layerSchema({
  schemaVersion: SchemaVersion,
  models: PolicySchema.shape.models,
  policies: PolicySchema.shape.policies,
  limits: LimitsSchema.omit({ maxActiveWorkers: true }),
});
