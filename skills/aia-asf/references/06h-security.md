# 06h — Security: Threat Model, ASVS DoD, Supply Chain, Agent Tools

> **Read when:** Phase 4/5 for **large work**; and for any deliverable that
> handles untrusted input, secrets, or exposes an interface.
> **Skip when:** small work; deliverables with no untrusted input, no secrets,
> no network exposure — the one-line DoD below is enough.
>
> **Scale note:** security effort is proportional to the attack surface. A CLI
> that formats local files needs the one-liner; a service that accepts
> untrusted input needs the full checklist. **Never skip the one-liner.**

Sources: OWASP Threat Modeling, STRIDE, ASVS 5.0, OWASP Top 10 2025,
SLSA, gitleaks/OSV best practices.

---

## 0. One-line DoD (applies to ALL work, both scales)

> **"No secrets in the repo; no untrusted input reaches a shell/query/path
> unvalidated; no unbounded resource use on user-controlled input."**

## 1. Threat model as code (large work, Phase 4/5)

A threat model is a **document in the repo**, not a meeting. Keep it to one
page:

1. **Context view** — draw the system boundary and **trust boundaries**
   (where untrusted input crosses into trusted code: user input, webhooks,
   file uploads, subprocess input, agent tool input).
2. **STRIDE matrix** — for each trust boundary, walk STRIDE and record what
   applies (Spoofing, Tampering, Repudiation, Information disclosure, Denial
   of service, Elevation of privilege). Most rows will be N/A — that is fine.
3. **Threat registry** — each identified threat: id, description, affected
   boundary, likelihood, impact, mitigation, status (mitigated / accepted /
   open). Open high-risk threats block delivery unless explicitly accepted by
   the user.
4. **Gate** — no High-likelihood × High-impact threat is unmitigated and
   unrecorded. Accepted risks are recorded with rationale (Phase 4 resolution
   rules).

## 2. ASVS-based Definition of Done (large work)

Use OWASP ASVS 5.0 as the checklist source. **Select the chapters that apply
to the deliverable** — do not run the whole list:

| Deliverable type | Applicable chapters (ASVS 5.0) |
|---|---|
| Web/API service | V1 (architecture), V2 (auth), V3 (session), V4 (access control), V5 (input validation), V6 (output encoding), V7 (crypto), V8 (errors), V14 (config), V15 (API) |
| CLI / local tool | V1, V5, V6, V8, V14 (no session/auth chapters) |
| Library/package | V1, V5, V6, V8, V14 (the library's own surface) |
| Agent/tool surface | V1, V4, V5, V6, V8 + the agent chapter below |

**Level selection:** L1 (baseline) for internal tools; L2 for anything
internet-facing or holding user data; L3 only for high-value targets. Default
is L2 for internet-facing, L1 otherwise. Record the chosen level in the plan.

**DoD line (large work):** *"the applicable ASVS chapter checks pass at the
chosen level; the level and chapter selection are recorded in the plan."*

## 3. Supply chain & secrets (P17)

### Dependency decision (Phase 2 research, one line)

For every dependency, record in the plan: license, maintenance status, size,
security history, and the alternative considered. A dependency with no
maintainer or a risky license needs a recorded decision.

### Automated gates (large work, via `/asf health`)

| Gate | Tool | Default | Fails when |
|---|---|---|---|
| Dependency vulnerabilities | `npm audit` / `osv-scanner` | warn | known vuln in a runtime dep (high/critical) |
| Secrets in repo | `gitleaks` | warn | any secret pattern in tracked files |

- **Lockfile is committed** — reproducibility is a security property.
- **RV loop (release):** re-run the dependency check **before every release**
  (07-release.md step 1) — a vulnerability discovered after the last run must
  not ship.
- **Never invent credentials** — no hardcoded tokens, no `.env` in the repo,
  no secrets in commit messages or CHANGELOGs.

## 4. Agent/tool-surface chapter (P18 — only when applicable)

Applies **only** when the deliverable has agent-like tool surfaces (an LLM
agent with tools, a plugin system, an extension that exposes capabilities to
a model). It is a chapter inside this file — not a separate reference — and
it is **strictly proportional**: a small agent surface gets the one-liner, a
full agent platform gets the full list.

**One-liner (small surface):** *"agent tools are least-privilege: no tool can
do more than the user asked for; tool output is validated before use."*

**Full list (large surface):**

1. **Least privilege** — each tool gets the minimum scope; no tool with
   blanket shell/DB/network access unless the user explicitly granted it.
2. **Human-in-the-loop** — destructive/irreversible actions (publish, delete,
   pay, deploy) require explicit user confirmation; the agent never
   self-approves.
3. **Output validation** — tool results are validated before being used as
   input to another tool or rendered to the user (a tool that returns
   attacker-controlled strings must not inject into a shell or HTML).
4. **Prompt-injection surface** — treat tool results and fetched content as
   **untrusted input** (they can carry instructions); the agent must not
   follow instructions found in data.
5. **Abuse-case test** — one test that proves the agent cannot escalate
   beyond its granted scope (e.g. asks for a tool it does not have, or
   injects instructions via tool output).
6. **Auditability** — tool calls are logged with inputs (redacted) so misuse
   is traceable.

**DoD line (agent surfaces):** *"every agent tool is least-privilege, and
there is an abuse-case test proving the boundary holds."*

## Where this applies in ASF

- **Phase 2 (research):** dependency decision line (license, maintenance,
  security history, alternative).
- **Phase 4 (adversarial):** threat model (trust boundaries, STRIDE,
  registry) for large work; the security lens questions already in
  04-adversarial.md.
- **Phase 5 (PLAN.md):** threat model + ASVS level/chapter selection recorded.
- **Phase 6 (implementation):** secrets hygiene; least-privilege agent tools.
- **Phase 7 (verification):** ASVS DoD + gates + abuse-case test.

## Anti-patterns

- ❌ Secrets in the repo (`.env`, tokens, keys in code or commits)
- ❌ Unvalidated input reaching a shell/query/path
- ❌ "It's internal, security doesn't apply"
- ❌ An agent tool with blanket shell/DB access
- ❌ Following instructions found in fetched content or tool output
- ❌ Shipping a release without re-running the dependency check
- ❌ A threat model that exists only in someone's head
