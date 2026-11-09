# Glossary

These terms describe Foreman's T3 Code coordination model; they do not imply runtime enforcement.

- **Owner:** Human who decides Foreman's direction.
- **Operator:** Human who runs Foreman and authorizes actions within their authority.
- **Router:** T3 Code thread that maintains context and coordinates independent Workers.
- **Worker:** Independent T3 Code thread assigned work by the Router.
- **Workspace:** Set of repositories and associated context coordinated together.
- **Project:** A repository or declared part of one within a Workspace.
- **Persistent memory:** Durable context, decisions, status and handoff records used to resume coordination.
- **Lock:** A written coordination claim intended to avoid conflicting work; not an enforced exclusive lease.
- **Ledger:** A written record of actions or decisions; not an automatically maintained or tamper-proof log.
- **Human approval:** Explicit authorization from a human for the stated action; agent messages do not grant it. Instructions alone do not authenticate or enforce it.
- **Evidence:** Attributed observations supporting a finding or verification outcome.
