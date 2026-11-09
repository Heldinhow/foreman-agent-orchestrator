# Research references and compatibility

## Authoring method

Refactored using [AI Hero: The /writing-for-agents Skill](https://www.aihero.dev/skills-writing-for-agents) and the locally installed `writing-for-agents/SKILL.md` and `SKILL-MECHANICS.md`:

- Model-invoked intentionally: the Router must reach this skill for assignments, messages, grill questions, returns and recovery without waiting for a human command.
- Root instructions retain responsibilities, approval rules and durable-record ownership; the skill owns operational coordination.
- The main skill contains branch selection and steps with observable completion criteria. Thread mechanics, grill, recovery and record fields are disclosed only when their branch needs them.
- Repeated procedures were replaced with conditional pointers. Templates contain fields rather than another copy of the workflow.

This is a structural authoring review, not a claim of behavioral reliability. The AI Hero method calls for running the document and diagnosing failures; live T3 exercises remain outstanding.

## T3 research

Discovered through the skills.sh search endpoint and reviewed from their source repositories. These links are research provenance, not dependencies, endorsements or guarantees of compatibility. Foreman's instructions were written for its owner-confirmed architecture; no third-party scripts or skill contents are bundled.

- [pjmuller/skills — t3-manage-thread](https://skills.sh/pjmuller/skills/t3-manage-thread): useful coverage of thread messaging, explicit delivery modes and handoffs. Its model defaults, account-routing helpers and child-delegate workflows are not adopted.
- [gitbobobo/bstack — t3-code](https://skills.sh/gitbobobo/bstack/t3-code): useful discussion of workspace binding and activity reading. Local database assumptions, ACP fallbacks and cleanup scripts are not adopted.
- [gitbobobo/bstack — t3-orchestrator](https://skills.sh/gitbobobo/bstack/t3-orchestrator): evaluated but not adopted; centers child delegation and repository-specific routing, which conflict with Foreman's independent-Worker design.

Current T3 tool definitions and host instructions take precedence over descriptions in any external skill. Redistributing third-party content would require a separate license and safety review; this skill does not do so.

The portable `.agents/skills/<name>/SKILL.md` format is discoverable by compatible Agent Skills hosts. Pi documents project discovery at this path; other T3 providers/harnesses may require explicit loading. Do not promise identical discovery across providers. If it is not discovered automatically, explicitly read this skill's `SKILL.md` and its required references before coordination.
