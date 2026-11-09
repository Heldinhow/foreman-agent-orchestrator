import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
  classificationOf,
  classifiedLeaves,
  comparePolicies,
  schemaLeaves,
  type PolicyDifference,
} from "../../src/policy/classification.ts";
import { PolicySchema } from "../../src/policy/schema.ts";

const DEFAULTS = join(import.meta.dir, "..", "..", "policy", "defaults.yaml");

/** Written against the shipped Safety Defaults, and loosely typed as tests plant odd shapes. */
type Draft = any;

async function shippedPolicy(): Promise<Draft> {
  return parse(await Bun.file(DEFAULTS).text());
}

const rule = (draft: Draft, id: string) => draft.policies.guard.rules[id];
const step = (draft: Draft, id: string) => draft.pipeline.steps.find((s: { id: string }) => s.id === id);

/** The differences from the shipped Policy once `edit` has run. */
async function differencesAfter(edit: (draft: Draft) => void, setup?: (draft: Draft) => void) {
  const before = await shippedPolicy();
  setup?.(before);
  const after = structuredClone(before);
  edit(after);
  return comparePolicies(before, after);
}

const effects = (differences: PolicyDifference[]) => differences.map(({ key, effect }) => [key, effect]);

describe("every Policy schema leaf is classified (AC-42)", () => {
  test("no leaf of the Policy schema is unclassified, and no classification names a leaf that's gone", () => {
    const leaves = schemaLeaves(PolicySchema);

    expect(leaves.filter((leaf) => classificationOf(leaf) === undefined)).toEqual([]);
    expect([...classifiedLeaves()].sort()).toEqual([...leaves].sort());
  });

  test("the walk reaches the leaves of maps, named entries and keyed lists, and reports a new leaf", () => {
    const leaves = schemaLeaves(PolicySchema);
    for (const leaf of [
      "locale",
      "policies.sandbox",
      "policies.guard.rules.*.effect",
      "policies.guard.rules.*.match.facts.*",
      "pipeline.steps.*.gates",
      "pipeline.completion",
      "approvals.github.allowlist.*.policyOwner",
    ]) {
      expect(leaves).toContain(leaf);
    }

    const extended = PolicySchema.extend({
      approvals: PolicySchema.shape.approvals.extend({ newKnob: z.boolean() }),
    });
    expect(
      schemaLeaves(extended).filter((leaf) => classificationOf(leaf) === undefined),
    ).toEqual(["approvals.newKnob"]);
  });

  test.each([
    "policies.guard.rules.*.effect",
    "policies.guard.rules.*.enabled",
    "policies.guard.rules.*.except",
    "policies.guard.rules.*.match.paths",
    "policies.sandbox",
    "adapters.*.allowUnenforced",
    "adapters.*.env.passthrough",
    "adapters.*.module",
    "remote.module",
    "policies.repositoryDefaults.mode",
    "policies.repositoryDefaults.allow",
    "policies.repositories.*.mode",
    "policies.repositories.*.allow",
    "approvals.ownerAlias",
    "approvals.expiryHours",
    "approvals.acceptAgentMessages",
    "approvals.github.enabled",
    "approvals.github.allowlist.*.policyOwner",
    "pipeline.steps.*.gates",
    "pipeline.completion",
    "roles.*.tools",
    "roles.*.projects",
    "roles.*.paths.allow",
    "roles.*.paths.forbid",
    "lessons.minOccurrences",
    "router.answerFromDecisions",
  ])("the spec's safety leaf %s is classified safety", (leaf) => {
    expect(classificationOf(leaf)).toBe("safety");
  });

  test.each(["locale", "models.default.model", "limits.maxRounds", "polling.intervalSeconds"])(
    "%s is classified neutral",
    (leaf) => {
      expect(classificationOf(leaf)).toBe("neutral");
    },
  );

  test("an unclassified path counts as a Relaxation at runtime", async () => {
    const differences = await differencesAfter((draft) => {
      draft.approvals.newKnob = true;
    });

    expect(differences).toEqual([
      { key: "approvals.newKnob", before: undefined, after: true, effect: "relaxation", unclassified: true },
    ]);
  });

  test("an unclassified path counts as a Relaxation in every direction, and under a new map", async () => {
    const removed = await differencesAfter(
      (draft) => {
        delete draft.newArea;
      },
      (draft) => {
        draft.newArea = { knob: 1 };
      },
    );
    expect(effects(removed)).toEqual([["newArea.knob", "relaxation"]]);

    const reshaped = await differencesAfter(
      (draft) => {
        draft.newArea = { knob: 1 };
      },
      (draft) => {
        draft.newArea = "plain";
      },
    );
    expect(effects(reshaped)).toEqual([["newArea", "relaxation"]]);
  });
});

/** Each row: one edit from a starting Policy, and the keys and effect it must produce. */
interface Row {
  name: string;
  setup?: (draft: Draft) => void;
  edit: (draft: Draft) => void;
  expected: [string, PolicyDifference["effect"]][];
}

const RULES = "policies.guard.rules";
const SECRET_RULE = `${RULES}.deny-secret-files`;
const addAdapter = (draft: Draft) => {
  draft.adapters.local = { type: "fake" };
};
const addRole = (draft: Draft) => {
  draft.roles.backend = { tools: ["read"], projects: ["catalog-api"], paths: { allow: ["src/**"], forbid: ["infra/**"] } };
};
const addAllowRule = (draft: Draft) => {
  draft.policies.guard.rules["allow-fixtures"] = {
    checkpoints: ["diff.path"],
    match: { paths: ["fixtures/**"] },
    except: ["fixtures/private/**"],
    effect: "allow",
  };
};
const addApprover = (draft: Draft) => {
  draft.approvals.github.allowlist = [{ alias: "approver-1", login: "example-login", policyOwner: false }];
};

const table: { kind: string; rows: Row[] }[] = [
  {
    kind: "a deny list",
    rows: [
      {
        name: "removing a denied path relaxes",
        edit: (d) => rule(d, "deny-secret-files").match.paths.splice(0, 1),
        expected: [[`${SECRET_RULE}.match.paths`, "relaxation"]],
      },
      {
        name: "adding a denied path tightens",
        edit: (d) => rule(d, "deny-secret-files").match.paths.push("*.p12"),
        expected: [[`${SECRET_RULE}.match.paths`, "tightening"]],
      },
      {
        name: "swapping a denied path relaxes, as one entry has gone",
        edit: (d) => {
          rule(d, "deny-secret-files").match.paths[0] = "*.p12";
        },
        expected: [[`${SECRET_RULE}.match.paths`, "relaxation"]],
      },
      {
        name: "reordering a denied list isn't a change",
        edit: (d) => rule(d, "deny-secret-files").match.paths.reverse(),
        expected: [],
      },
      {
        name: "dropping a Role's forbidden path relaxes",
        setup: addRole,
        edit: (d) => {
          d.roles.backend.paths.forbid = [];
        },
        expected: [["roles.backend.paths.forbid", "relaxation"]],
      },
      {
        name: "forbidding another path for a Role tightens",
        setup: addRole,
        edit: (d) => d.roles.backend.paths.forbid.push("secrets/**"),
        expected: [["roles.backend.paths.forbid", "tightening"]],
      },
    ],
  },
  {
    kind: "an allow list",
    rows: [
      {
        name: "allowing another Outbound Action relaxes",
        edit: (d) => d.policies.repositoryDefaults.allow.push("merge"),
        expected: [["policies.repositoryDefaults.allow", "relaxation"]],
      },
      {
        name: "allowing one less Outbound Action tightens",
        setup: (d) => {
          d.policies.repositoryDefaults.allow = ["push", "draft-pr"];
        },
        edit: (d) => {
          d.policies.repositoryDefaults.allow = ["push"];
        },
        expected: [["policies.repositoryDefaults.allow", "tightening"]],
      },
      {
        name: "adding a guard exception relaxes",
        edit: (d) => rule(d, "deny-secret-files").except.push("tests/fixtures/*.pem"),
        expected: [[`${SECRET_RULE}.except`, "relaxation"]],
      },
      {
        name: "removing a guard exception tightens",
        edit: (d) => rule(d, "deny-secret-files").except.pop(),
        expected: [[`${SECRET_RULE}.except`, "tightening"]],
      },
      {
        name: "passing another variable through relaxes",
        setup: addAdapter,
        edit: (d) => {
          d.adapters.local.env = { passthrough: ["EXAMPLE_PROVIDER_API_KEY"] };
        },
        expected: [["adapters.local.env.passthrough", "relaxation"]],
      },
      {
        name: "passing one less variable through tightens",
        setup: (d) => {
          d.adapters.local = { type: "fake", env: { passthrough: ["EXAMPLE_PROVIDER_API_KEY"] } };
        },
        edit: (d) => {
          d.adapters.local.env.passthrough = [];
        },
        expected: [["adapters.local.env.passthrough", "tightening"]],
      },
      {
        name: "giving a Role another tool relaxes",
        edit: (d) => d.roles.reviewer.tools.push("bash"),
        expected: [["roles.reviewer.tools", "relaxation"]],
      },
      {
        name: "taking a tool from a Role tightens",
        edit: (d) => {
          d.roles.reviewer.tools = [];
        },
        expected: [["roles.reviewer.tools", "tightening"]],
      },
      {
        name: "giving a Role another Project relaxes",
        setup: addRole,
        edit: (d) => d.roles.backend.projects.push("orders-api"),
        expected: [["roles.backend.projects", "relaxation"]],
      },
      {
        name: "lifting a Role's Project limit relaxes, as no limit means every Project",
        setup: addRole,
        edit: (d) => {
          delete d.roles.backend.projects;
        },
        expected: [["roles.backend.projects", "relaxation"]],
      },
      {
        name: "limiting a Role to named Projects tightens",
        setup: (d) => {
          addRole(d);
          delete d.roles.backend.projects;
        },
        edit: (d) => {
          d.roles.backend.projects = ["catalog-api"];
        },
        expected: [["roles.backend.projects", "tightening"]],
      },
      {
        name: "dropping a Role's path limits relaxes on both lists",
        setup: addRole,
        edit: (d) => {
          delete d.roles.backend.paths;
        },
        expected: [
          ["roles.backend.paths.allow", "relaxation"],
          ["roles.backend.paths.forbid", "relaxation"],
        ],
      },
      {
        name: "adding a Role relaxes, as one change",
        edit: addRole,
        expected: [["roles.backend", "relaxation"]],
      },
      {
        name: "removing a Role tightens, even though its limits go with it",
        setup: addRole,
        edit: (d) => {
          delete d.roles.backend;
        },
        expected: [["roles.backend", "tightening"]],
      },
      {
        name: "allowlisting an approver relaxes",
        edit: addApprover,
        expected: [["approvals.github.allowlist.example-login", "relaxation"]],
      },
      {
        name: "allowlisting a login named __proto__ relaxes like any other",
        edit: (d) => {
          d.approvals.github.allowlist = [{ alias: "approver-1", login: "__proto__", policyOwner: true }];
        },
        expected: [["approvals.github.allowlist.__proto__", "relaxation"]],
      },
      {
        name: "removing an approver tightens",
        setup: addApprover,
        edit: (d) => {
          d.approvals.github.allowlist = [];
        },
        expected: [["approvals.github.allowlist.example-login", "tightening"]],
      },
      {
        name: "allowing a further decision file relaxes",
        edit: (d) => d.router.decisionFiles.push("docs/decisions.md"),
        expected: [["router.decisionFiles", "relaxation"]],
      },
    ],
  },
  {
    kind: "a named rule",
    rows: [
      {
        name: "removing a deny rule relaxes",
        edit: (d) => {
          delete d.policies.guard.rules["deny-secret-files"];
        },
        expected: [[SECRET_RULE, "relaxation"]],
      },
      {
        name: "disabling a deny rule relaxes, and is reported on `enabled`",
        edit: (d) => {
          rule(d, "deny-secret-files").enabled = false;
        },
        expected: [[`${SECRET_RULE}.enabled`, "relaxation"]],
      },
      {
        name: "enabling a disabled deny rule tightens",
        setup: (d) => {
          rule(d, "deny-secret-files").enabled = false;
        },
        edit: (d) => {
          rule(d, "deny-secret-files").enabled = true;
        },
        expected: [[`${SECRET_RULE}.enabled`, "tightening"]],
      },
      {
        name: "stating `enabled: true` isn't a change",
        edit: (d) => {
          rule(d, "deny-secret-files").enabled = true;
        },
        expected: [],
      },
      {
        name: "moving an effect towards allow relaxes",
        edit: (d) => {
          rule(d, "require-approval-push").effect = "allow";
        },
        expected: [[`${RULES}.require-approval-push.effect`, "relaxation"]],
      },
      {
        name: "moving an effect away from allow tightens",
        edit: (d) => {
          rule(d, "require-approval-push").effect = "deny";
        },
        expected: [[`${RULES}.require-approval-push.effect`, "tightening"]],
      },
      {
        name: "adding a deny rule with its own exceptions tightens, as one change",
        edit: (d) => {
          d.policies.guard.rules["deny-vendor"] = {
            checkpoints: ["diff.path"],
            match: { paths: ["vendor/**"] },
            except: ["vendor/README.md"],
            effect: "deny",
          };
        },
        expected: [[`${RULES}.deny-vendor`, "tightening"]],
      },
      {
        name: "adding an allow rule relaxes",
        edit: addAllowRule,
        expected: [[`${RULES}.allow-fixtures`, "relaxation"]],
      },
      {
        name: "removing an allow rule tightens",
        setup: addAllowRule,
        edit: (d) => {
          delete d.policies.guard.rules["allow-fixtures"];
        },
        expected: [[`${RULES}.allow-fixtures`, "tightening"]],
      },
      {
        name: "widening an allow rule's paths relaxes, the reverse of a deny rule",
        setup: addAllowRule,
        edit: (d) => rule(d, "allow-fixtures").match.paths.push("samples/**"),
        expected: [[`${RULES}.allow-fixtures.match.paths`, "relaxation"]],
      },
      {
        name: "narrowing an allow rule's paths tightens",
        setup: addAllowRule,
        edit: (d) => {
          rule(d, "allow-fixtures").match.paths = [];
        },
        expected: [[`${RULES}.allow-fixtures.match.paths`, "tightening"]],
      },
      {
        name: "dropping an allow rule's exception relaxes",
        setup: addAllowRule,
        edit: (d) => {
          delete rule(d, "allow-fixtures").except;
        },
        expected: [[`${RULES}.allow-fixtures.except`, "relaxation"]],
      },
      {
        name: "adding a checkpoint to a deny rule tightens",
        edit: (d) => rule(d, "deny-secret-files").checkpoints.push("diff.content"),
        expected: [[`${SECRET_RULE}.checkpoints`, "tightening"]],
      },
      {
        name: "removing a checkpoint from a deny rule relaxes",
        edit: (d) => rule(d, "deny-secret-files").checkpoints.pop(),
        expected: [[`${SECRET_RULE}.checkpoints`, "relaxation"]],
      },
      {
        name: "adding a checkpoint to an allow rule relaxes",
        setup: addAllowRule,
        edit: (d) => rule(d, "allow-fixtures").checkpoints.push("worktree.copy"),
        expected: [[`${RULES}.allow-fixtures.checkpoints`, "relaxation"]],
      },
      {
        name: "giving an unconditional rule a path limit relaxes, as it now covers less",
        edit: (d) => {
          rule(d, "require-approval-push").match = { paths: ["docs/**"] };
        },
        expected: [[`${RULES}.require-approval-push.match.paths`, "relaxation"]],
      },
      {
        name: "lifting a deny rule's path limit tightens, as it now covers everything",
        edit: (d) => {
          delete rule(d, "deny-secret-files").match.paths;
        },
        expected: [[`${SECRET_RULE}.match.paths`, "tightening"]],
      },
      {
        name: "changing a fact a rule matches on relaxes, as it has no order",
        edit: (d) => {
          rule(d, "allow-close-with-evidence").match.facts.evidence = "absent";
        },
        expected: [[`${RULES}.allow-close-with-evidence.match.facts.evidence`, "relaxation"]],
      },
      {
        name: "editing a rule that stays disabled changes no protection",
        setup: (d) => {
          rule(d, "deny-secret-files").enabled = false;
        },
        edit: (d) => rule(d, "deny-secret-files").match.paths.pop(),
        expected: [[SECRET_RULE, "neutral"]],
      },
    ],
  },
  {
    kind: "an ordered enum",
    rows: [
      {
        name: "turning the sandbox off relaxes",
        setup: (d) => {
          d.policies.sandbox = "bwrap";
        },
        edit: (d) => {
          d.policies.sandbox = "none";
        },
        expected: [["policies.sandbox", "relaxation"]],
      },
      {
        name: "turning the sandbox on tightens",
        edit: (d) => {
          d.policies.sandbox = "bwrap";
        },
        expected: [["policies.sandbox", "tightening"]],
      },
      {
        name: "moving the default Mode to autonomous relaxes",
        edit: (d) => {
          d.policies.repositoryDefaults.mode = "autonomous";
        },
        expected: [["policies.repositoryDefaults.mode", "relaxation"]],
      },
      {
        name: "moving the default Mode to propose tightens",
        setup: (d) => {
          d.policies.repositoryDefaults.mode = "autonomous";
        },
        edit: (d) => {
          d.policies.repositoryDefaults.mode = "propose";
        },
        expected: [["policies.repositoryDefaults.mode", "tightening"]],
      },
      {
        name: "a read-only Step becoming write relaxes",
        edit: (d) => {
          step(d, "review").access = "write";
        },
        expected: [["pipeline.steps.review.access", "relaxation"]],
      },
      {
        name: "a write Step becoming read-only tightens",
        edit: (d) => {
          step(d, "implement").access = "read-only";
        },
        expected: [["pipeline.steps.implement.access", "tightening"]],
      },
      {
        name: "naming a repository as autonomous relaxes, judged against the default it replaces",
        edit: (d) => {
          d.policies.repositories["catalog-api"] = { mode: "autonomous" };
        },
        expected: [["policies.repositories.catalog-api.mode", "relaxation"]],
      },
      {
        name: "naming a repository as propose isn't a change while the default is propose",
        edit: (d) => {
          d.policies.repositories["catalog-api"] = { mode: "propose" };
        },
        expected: [],
      },
      {
        name: "keeping a repository in propose under an autonomous default tightens",
        setup: (d) => {
          d.policies.repositoryDefaults.mode = "autonomous";
        },
        edit: (d) => {
          d.policies.repositories["catalog-api"] = { mode: "propose" };
        },
        expected: [["policies.repositories.catalog-api.mode", "tightening"]],
      },
      {
        name: "dropping a repository's propose under an autonomous default relaxes",
        setup: (d) => {
          d.policies.repositoryDefaults.mode = "autonomous";
          d.policies.repositories["catalog-api"] = { mode: "propose" };
        },
        edit: (d) => {
          delete d.policies.repositories["catalog-api"];
        },
        expected: [["policies.repositories.catalog-api.mode", "relaxation"]],
      },
      {
        name: "a repository's own allowlist is judged against the default it replaces",
        setup: (d) => {
          d.policies.repositoryDefaults.allow = ["push"];
        },
        edit: (d) => {
          d.policies.repositories["catalog-api"] = { allow: ["push", "merge"] };
          d.policies.repositories["orders-api"] = { allow: ["push"] };
          d.policies.repositories.notifier = { allow: [] };
        },
        expected: [
          ["policies.repositories.catalog-api.allow", "relaxation"],
          ["policies.repositories.notifier.allow", "tightening"],
        ],
      },
    ],
  },
  {
    kind: "a boolean",
    rows: [
      {
        name: "accepting agent messages relaxes",
        edit: (d) => {
          d.approvals.acceptAgentMessages = true;
        },
        expected: [["approvals.acceptAgentMessages", "relaxation"]],
      },
      {
        name: "refusing agent messages tightens",
        setup: (d) => {
          d.approvals.acceptAgentMessages = true;
        },
        edit: (d) => {
          d.approvals.acceptAgentMessages = false;
        },
        expected: [["approvals.acceptAgentMessages", "tightening"]],
      },
      {
        name: "allowing an unenforced Adapter relaxes",
        setup: addAdapter,
        edit: (d) => {
          d.adapters.local.allowUnenforced = true;
        },
        expected: [["adapters.local.allowUnenforced", "relaxation"]],
      },
      {
        name: "dropping the unenforced opt-in tightens, as absent means false",
        setup: (d) => {
          d.adapters.local = { type: "fake", allowUnenforced: true };
        },
        edit: (d) => {
          delete d.adapters.local.allowUnenforced;
        },
        expected: [["adapters.local.allowUnenforced", "tightening"]],
      },
      {
        name: "stating the unenforced opt-in as false isn't a change",
        setup: addAdapter,
        edit: (d) => {
          d.adapters.local.allowUnenforced = false;
        },
        expected: [],
      },
      {
        name: "making an approver a Policy Owner relaxes",
        setup: addApprover,
        edit: (d) => {
          d.approvals.github.allowlist[0].policyOwner = true;
        },
        expected: [["approvals.github.allowlist.example-login.policyOwner", "relaxation"]],
      },
      {
        name: "taking Policy Owner from an approver tightens",
        setup: (d) => {
          addApprover(d);
          d.approvals.github.allowlist[0].policyOwner = true;
        },
        edit: (d) => {
          d.approvals.github.allowlist[0].policyOwner = false;
        },
        expected: [["approvals.github.allowlist.example-login.policyOwner", "tightening"]],
      },
      {
        name: "letting the Router answer from decisions relaxes",
        edit: (d) => {
          d.router.answerFromDecisions = true;
        },
        expected: [["router.answerFromDecisions", "relaxation"]],
      },
      {
        name: "enabling the GitHub Approval channel relaxes",
        edit: (d) => {
          d.approvals.github.enabled = true;
        },
        expected: [["approvals.github.enabled", "relaxation"]],
      },
    ],
  },
  {
    kind: "a number",
    rows: [
      {
        name: "a longer Approval expiry relaxes",
        edit: (d) => {
          d.approvals.expiryHours = 48;
        },
        expected: [["approvals.expiryHours", "relaxation"]],
      },
      {
        name: "a shorter Approval expiry tightens",
        edit: (d) => {
          d.approvals.expiryHours = 1;
        },
        expected: [["approvals.expiryHours", "tightening"]],
      },
      {
        name: "fewer occurrences for a Lesson relaxes",
        edit: (d) => {
          d.lessons.minOccurrences = 1;
        },
        expected: [["lessons.minOccurrences", "relaxation"]],
      },
      {
        name: "more occurrences for a Lesson tightens",
        edit: (d) => {
          d.lessons.minOccurrences = 5;
        },
        expected: [["lessons.minOccurrences", "tightening"]],
      },
    ],
  },
  {
    kind: "an opaque value",
    rows: [
      {
        name: "setting an Adapter module relaxes",
        setup: addAdapter,
        edit: (d) => {
          d.adapters.local.module = "./adapters/one.ts";
        },
        expected: [["adapters.local.module", "relaxation"]],
      },
      {
        name: "changing an Adapter module relaxes",
        setup: (d) => {
          d.adapters.local = { type: "fake", module: "./adapters/one.ts" };
        },
        edit: (d) => {
          d.adapters.local.module = "./adapters/two.ts";
        },
        expected: [["adapters.local.module", "relaxation"]],
      },
      {
        name: "removing an Adapter module relaxes too, as it has no order",
        setup: (d) => {
          d.adapters.local = { type: "fake", module: "./adapters/one.ts" };
        },
        edit: (d) => {
          delete d.adapters.local.module;
        },
        expected: [["adapters.local.module", "relaxation"]],
      },
      {
        name: "setting a Remote module relaxes",
        edit: (d) => {
          d.remote = { type: "github", module: "./remote.ts" };
        },
        expected: [
          ["remote.module", "relaxation"],
          ["remote.type", "relaxation"],
        ],
      },
      {
        name: "changing a command Gate relaxes",
        setup: (d) => {
          step(d, "implement").gates.push({ type: "command", command: "./one.sh" });
        },
        edit: (d) => {
          step(d, "implement").gates[2].command = "./two.sh";
        },
        expected: [["pipeline.steps.implement.gates", "relaxation"]],
      },
      {
        name: "adding a Gate counts as relaxing too, as Gates are opaque",
        edit: (d) => step(d, "implement").gates.push({ type: "human" }),
        expected: [["pipeline.steps.implement.gates", "relaxation"]],
      },
      ...["evidence", "diff-check"].map((type): Row => ({
        name: `removing the ${type} Gate relaxes`,
        edit: (d) => {
          const implement = step(d, "implement");
          implement.gates = implement.gates.filter((gate: { type: string }) => gate.type !== type);
        },
        expected: [["pipeline.steps.implement.gates", "relaxation"]],
      })),
      {
        name: "removing the human Gate relaxes",
        edit: (d) => {
          delete step(d, "tickets").gates;
        },
        expected: [["pipeline.steps.tickets.gates", "relaxation"]],
      },
      {
        name: "removing the outbound Gate relaxes",
        edit: (d) => {
          d.pipeline.completion = [{ type: "integration" }];
        },
        expected: [["pipeline.completion", "relaxation"]],
      },
      {
        name: "reordering the completion Gates relaxes",
        edit: (d) => d.pipeline.completion.reverse(),
        expected: [["pipeline.completion", "relaxation"]],
      },
      {
        name: "changing an approver's alias relaxes",
        setup: addApprover,
        edit: (d) => {
          d.approvals.github.allowlist[0].alias = "approver-2";
        },
        expected: [["approvals.github.allowlist.example-login.alias", "relaxation"]],
      },
      {
        name: "removing a Step with a Gate relaxes",
        edit: (d) => {
          d.pipeline.steps = d.pipeline.steps.filter((s: { id: string }) => s.id !== "review");
        },
        expected: [["pipeline.steps.review", "relaxation"]],
      },
      {
        name: "reordering Steps relaxes",
        edit: (d) => {
          const [first, second, ...rest] = d.pipeline.steps;
          d.pipeline.steps = [second, first, ...rest];
        },
        expected: [["pipeline.steps", "relaxation"]],
      },
      {
        name: "giving a Step a different Role relaxes",
        setup: addRole,
        edit: (d) => {
          step(d, "review").role = "backend";
        },
        expected: [["pipeline.steps.review.role", "relaxation"]],
      },
      {
        name: "an allowlist naming one login twice relaxes as a whole, so a grant can't hide",
        setup: addApprover,
        edit: (d) => {
          d.approvals.github.allowlist = [
            { alias: "approver-1", login: "example-login", policyOwner: true },
            { alias: "approver-1", login: "example-login", policyOwner: false },
          ];
        },
        expected: [["approvals.github.allowlist", "relaxation"]],
      },
    ],
  },
  {
    kind: "a neutral value",
    rows: [
      {
        name: "changing the locale is neutral",
        edit: (d) => {
          d.locale = "pt-BR";
        },
        expected: [["locale", "neutral"]],
      },
      {
        name: "changing a limit is neutral",
        edit: (d) => {
          d.limits.maxRounds = 9;
        },
        expected: [["limits.maxRounds", "neutral"]],
      },
      {
        name: "re-prompting a Step is neutral",
        edit: (d) => {
          step(d, "review").prompt = "strict-review";
        },
        expected: [["pipeline.steps.review.prompt", "neutral"]],
      },
      {
        name: "removing a Step with no Gate is neutral",
        edit: (d) => {
          d.pipeline.steps = d.pipeline.steps.filter((s: { id: string }) => s.id !== "grill");
        },
        expected: [["pipeline.steps.grill", "neutral"]],
      },
      {
        name: "adding a read-only Step with no Gate is neutral",
        edit: (d) => {
          d.pipeline.steps.splice(1, 0, { id: "research", scope: "run", access: "read-only", prompt: "research" });
        },
        expected: [["pipeline.steps.research", "neutral"]],
      },
      {
        name: "adding an Adapter by its type alone is neutral",
        edit: addAdapter,
        expected: [["adapters.local.type", "neutral"]],
      },
      {
        name: "changing the model is neutral",
        edit: (d) => {
          d.models.default = { model: "provider/model" };
        },
        expected: [["models.default.model", "neutral"]],
      },
    ],
  },
  {
    kind: "a whole entry",
    rows: [
      {
        name: "adding a write Step relaxes",
        edit: (d) => {
          d.pipeline.steps.push({ id: "patch", scope: "task", access: "write", prompt: "patch" });
        },
        expected: [["pipeline.steps.patch", "relaxation"]],
      },
      {
        name: "removing a write Step with no Gate tightens",
        setup: (d) => {
          d.pipeline.steps.push({ id: "patch", scope: "task", access: "write", prompt: "patch" });
        },
        edit: (d) => {
          d.pipeline.steps.pop();
        },
        expected: [["pipeline.steps.patch", "tightening"]],
      },
      {
        name: "adding a read-only Step with a Gate relaxes, as Gates are opaque",
        edit: (d) => {
          d.pipeline.steps.push({
            id: "audit",
            scope: "run",
            access: "read-only",
            prompt: "audit",
            gates: [{ type: "human" }],
          });
        },
        expected: [["pipeline.steps.audit", "relaxation"]],
      },
      {
        name: "removing an Adapter tightens",
        setup: (d) => {
          d.adapters.local = { type: "fake", module: "./adapters/one.ts", allowUnenforced: true };
        },
        edit: (d) => {
          delete d.adapters.local;
        },
        expected: [["adapters.local", "tightening"]],
      },
    ],
  },
];

describe.each(table)("$kind", ({ rows }) => {
  test.each(rows)("$name", async ({ setup, edit, expected }) => {
    expect(effects(await differencesAfter(edit, setup))).toEqual(expected);
  });
});

test("a difference carries its before and after values, for the diff to show", async () => {
  const [difference] = await differencesAfter((draft) => {
    draft.policies.sandbox = "bwrap";
  });

  expect(difference).toEqual({
    key: "policies.sandbox",
    before: "none",
    after: "bwrap",
    effect: "tightening",
    unclassified: false,
  });
});

test("the same Policy has no differences", async () => {
  expect(await differencesAfter(() => {})).toEqual([]);
});
