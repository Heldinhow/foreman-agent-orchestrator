import type { ConfigIssue } from "../config/errors.ts";
import type { KeyExplanation, PolicySet } from "./policy-set.ts";
import type { Policy } from "./schema.ts";

/**
 * Steps that belong to the core rather than the Pipeline. They can be named in Model
 * Assignment without being declared. Later tickets add checks that need the prompt files
 * (prompt names). Project names are checked by `checkProjectReferences`.
 */
const SYSTEM_STEPS = ["routing", "lesson-extraction", "policy-drafting"];

export interface PolicyProblem {
  key: string;
  reason: string;
}

/** Checks what a schema can't: that every name resolves, and the Pipeline's shape. */
export function checkReferences(policy: Policy): PolicyProblem[] {
  const problems: PolicyProblem[] = [];
  const stepIds = policy.pipeline.steps.map((step) => step.id);
  const steps = new Set([...stepIds, ...SYSTEM_STEPS]);
  const roles = new Set(Object.keys(policy.roles));
  const adapters = new Set(Object.keys(policy.adapters));

  const expect = (known: Set<string>, kind: string, key: string, name: string | undefined) => {
    if (name !== undefined && !known.has(name)) {
      problems.push({ key, reason: `no ${kind} named "${name}"` });
    }
  };

  for (const [name, role] of Object.entries(policy.roles)) {
    expect(adapters, "Adapter", `roles.${name}.adapter`, role.adapter);
  }

  const { models } = policy;
  expect(adapters, "Adapter", "models.default.adapter", models.default?.adapter);
  for (const [name, assignment] of Object.entries(models.steps ?? {})) {
    expect(steps, "Step", `models.steps.${name}`, name);
    expect(adapters, "Adapter", `models.steps.${name}.adapter`, assignment.adapter);
  }
  for (const [name, assignment] of Object.entries(models.roles ?? {})) {
    expect(roles, "Role", `models.roles.${name}`, name);
    expect(adapters, "Adapter", `models.roles.${name}.adapter`, assignment.adapter);
  }
  (models.overrides ?? []).forEach((override, index) => {
    const key = `models.overrides[${index}]`;
    expect(steps, "Step", `${key}.step`, override.step);
    expect(roles, "Role", `${key}.role`, override.role);
    expect(adapters, "Adapter", `${key}.adapter`, override.adapter);
  });

  policy.pipeline.steps.forEach((step, index) => {
    expect(roles, "Role", `pipeline.steps[${index}].role`, step.role);
    if (stepIds.indexOf(step.id) !== index) {
      problems.push({ key: `pipeline.steps[${index}].id`, reason: `duplicate Step "${step.id}"` });
    }
  });
  const taskProducers = policy.pipeline.steps.filter((step) => step.produces === "tasks").length;
  if (taskProducers !== 1) {
    problems.push({
      key: "pipeline.steps",
      reason: `exactly one Step must have produces: tasks, found ${taskProducers}`,
    });
  }

  return problems;
}

/** Checks every Project that Policy names against the Projects `workspace.yaml` declares. */
export function checkProjectReferences(set: PolicySet, projects: ReadonlySet<string>): ConfigIssue[] {
  const { policy, explain } = set.effective();
  const fileSetting = (key: string) => (explain(key)[0] as KeyExplanation).setBy.file;
  const noProject = (name: string) => `no Project named "${name}"`;
  const issues: ConfigIssue[] = [];

  for (const [role, { projects: named = [] }] of Object.entries(policy.roles)) {
    const key = `roles.${role}.projects`;
    named.forEach((name, index) => {
      if (!projects.has(name)) {
        issues.push({ file: fileSetting(key), key: `${key}[${index}]`, reason: noProject(name) });
      }
    });
  }
  for (const name of Object.keys(policy.policies.repositories)) {
    const key = `policies.repositories.${name}`;
    if (!projects.has(name)) issues.push({ file: fileSetting(key), key, reason: noProject(name) });
  }
  for (const { project, file } of set.projects) {
    if (project !== undefined && !projects.has(project)) issues.push({ file, reason: noProject(project) });
  }
  return issues;
}
