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
to the deliverable** — do not run the whole list.

The chapter numbers and names below are the **real ASVS 5.0 ones**, verified
against the source project at tag `v5.0.0_release`. This matters: ASVS 5.0
re-numbered relative to 4.0, and a table carrying 4.0 labels under a "5.0"
heading makes the DoD line *"the applicable ASVS chapter checks pass"*
unfalsifiable — nobody can tell whether chapter V5 was checked when nobody
agrees what V5 is. `test/test-security-mapping.mjs` pins this table to the
source project, so drift fails a test instead of quietly making the checklist
mean nothing.

| # | ASVS 5.0 chapter | Applies to |
|---|---|---|
| V1 | Encoding and Sanitization | everything that renders or transforms untrusted input |
| V2 | Validation and Business Logic | everything that accepts input or makes a decision |
| V3 | Web Frontend Security | web/UI deliverables |
| V4 | API and Web Service | any HTTP/API surface (includes 4.3.1 query cost analysis) |
| V5 | File Handling | anything reading or writing user-controlled paths |
| V6 | Authentication | anything with identities |
| V7 | Session Management | anything with sessions |
| V8 | Authorization | anything with per-user visibility |
| V9 | Self-contained Tokens | JWT/opaque-token issuance |
| V10 | OAuth and OIDC | delegated login |
| V11 | Cryptography | anything storing or transmitting secrets |
| V12 | Secure Communication | any network transport |
| V13 | Configuration | everything (includes 13.1.2 pool limits, 13.1.3 resource-management strategy) |
| V14 | Data Protection | anything persisting data |
| V15 | Secure Coding and Architecture | everything (includes 15.1.3/15.2.2 availability, 15.4.x concurrency) |
| V16 | Security Logging and Error Handling | everything (includes 16.5.2 degradation on resource failure) |
| V17 | WebRTC | only if WebRTC is used |

**By deliverable type** (start here, then prune with the table above):

| Deliverable type | Chapters |
|---|---|
| Web/API service | V1–V8, V11–V16 (+V9/V10 if tokens or delegated login) |
| CLI / local tool | V1, V2, V5, V13, V14, V15, V16 (no session/auth chapters) |
| Library/package | V1, V2, V4, V5, V13, V14, V15, V16 (the library's own surface) |
| Agent/tool surface | V1, V2, V4, V5, V13, V15, V16 + the agent chapter below |

**Level selection:** L1 (baseline) for internal tools; L2 for anything
internet-facing or holding user data; L3 only for high-value targets. Default
is L2 for internet-facing, L1 otherwise. Record the chosen level in the plan.

**DoD line (large work):** *"the applicable ASVS chapter checks pass at the
chosen level; the level and chapter selection are recorded in the plan."*
That line is only falsifiable because the table above is correct — which is what
the test is for.

### 2.1 Performance and resource requirements are ASVS's, not a separate list

ASVS 5.0 already carries the availability and resource requirements
(**15.1.3**, **15.2.2**, **13.1.2**, **13.1.3**, **13.2.6**, **4.3.1**,
**15.4.3**, **15.4.4**, **16.5.2**). They are security requirements *and*
performance requirements, and **ASF refuses to maintain two lists of them**
(06c Rule 9: a document that duplicates another document's content is a second
place to be wrong).

So: the security DoD line and the performance scenario share **one abuse-case
load run** against the most expensive endpoint untrusted input can reach. Run it
once; cite the same evidence in both places. The requirement text and the
evidence mapping live in
[06k-performance.md](06k-performance.md) §7 — read it, do not restate it here.

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
