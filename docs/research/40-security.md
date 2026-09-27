# Research Notes 3 — Security: standards for secure architecture & development

Sources read: NIST SP 800-218 (SSDF v1.1, incl. SP 800-218A GenAI profile), OWASP
Top 10:2025, OWASP ASVS 5.0 (17 chapters / 345 requirements / L1–L3), OWASP GenAI
Security Project LLM Top 10 (2025), Microsoft STRIDE + Threat Modeling Manifesto,
SLSA v1.0 build levels, threat-model-as-code practice, SSDF evidence/attestation
practice.

---

## S1. NIST SSDF (SP 800-218 v1.1) — the outcome-based secure SDLC framework

Four practice groups (each with numbered tasks); explicitly **not prescriptive about
tools** — it describes outcomes and evidence:

- **PO — Prepare the Organization**: define security requirements for software and
  infrastructure (PO.1); roles/responsibilities/training (PO.2); secure, instrumented
  toolchain producing artifacts and evidence (PO.3, PO.4); remediation SLAs, risk
  acceptance criteria.
- **PS — Protect the Software**: protect code from unauthorized change (PS.1);
  mechanism for consumers to verify integrity — **signing** (PS.2); archive and
  protect each release + the data needed to reproduce and analyze it (PS.3).
- **PW — Produce Well-Secured Software** (largest, most developer-facing):
  design to meet security requirements and mitigate risks (**PW.1**); **review the
  design** (PW.2); **reuse well-secured software / vetted components** (PW.4 — where
  SBOM lives); write source code following secure practices (PW.5); configure build
  processes to improve security (PW.6); **review and analyze code for
  vulnerabilities** (PW.7 — SCA/SAST); **test executable code** (PW.8 — DAST/security
  testing).
- **RV — Respond to Vulnerabilities**: identify/confirm vulnerabilities continuously
  (**RV.1**); assess and remediate (**RV.2** — documented decision: patch / mitigate /
  accept with justification); **root-cause analysis to prevent recurrence (RV.3)**.

Key structural insight: RV.1 is impossible without PW.4's component inventory; the
audit chain is *disclosure identified → exposure evaluated → action taken → date on
each step*. SSDF is the reference behind US federal secure-development attestation,
so it is the most "authoritative" current statement of what a secure SDLC must
contain.

**ASF status**: the ASF has *none* of PO/PS/PW/RV as named practices. Phase 4's
security bullet covers a sliver of PW.5/PW.7. There is no security requirements step
(PO.1/PW.1), no design review lens for security (PW.2), no component vetting or SBOM
(PW.4), no secure build config (PW.6), no security testing (PW.8), and no
vulnerability-response loop (RV.1–RV.3).

## S2. OWASP Top 10:2025 — the current risk taxonomy (and its two new categories)

A01 Broken Access Control · A02 Security Misconfiguration · **A03 Software Supply
Chain Failures** (new as a category) · A04 Cryptographic Failures · A05 Injection ·
**A06 Insecure Design** · A07 Authentication Failures · A08 Software or Data
Integrity Failures · **A09 Security Logging and Alerting Failures** · **A10
Mishandling of Exceptional Conditions** (new).

Two of the three new/renamed categories are **design-stage** concerns (A06 Insecure
Design, A10 exceptional-condition handling) and one is **supply-chain** (A03) — i.e.
the 2025 list itself says: security is not only a coding concern, it is an
architecture/design concern, and it extends beyond your own code. Average 25 CWEs
per category; A01 alone has 40.

**ASF status**: Phase 4's security bullet ("authentication, authorization, injection
(SQL/XSS), data exposure, secrets, abuse/rate-limiting, supply chain") is a
reasonable *subset* of A01/A02/A05/A07/A08/A03 — but it is one line in a checklist,
not a taxonomy, and it omits A06 (insecure design), A09 (logging/alerting), A10
(exception handling), A04 (crypto) entirely.

## S3. OWASP ASVS 5.0 — the verification checklist (L1/L2/L3)

345 verification requirements across 17 chapters; three assurance levels: **L1**
(minimum, 70 reqs), **L2** (standard, 183), **L3** (advanced, 92). Chapters:
V1 Encoding & Sanitization · V2 Validation & Business Logic · V3 Web Frontend
Security · V4 API & Web Service · V5 File Handling · V6 Authentication · V7 Session
Management · V8 Authorization · V9 Self-contained Tokens · V10 OAuth & OIDC ·
V11 Cryptography · V12 Secure Communication · V13 Configuration · V14 Data
Protection · V15 Secure Coding & Architecture · V16 Security Logging & Error
Handling · V17 WebRTC. Requirements carry CWE/NIST 800-53 cross-references.

The ASVS structure is directly usable as an **ASF security DoD checklist**: pick the
chapters that apply to the deliverable (a CLI/extension has no WebRTC; a web app has
V3/V4/V6/V7/V8/V13/V14/V16), pick the level by risk (L1 default, L2 for anything
touching auth/data, L3 for high-value), and verify each applicable requirement.

**ASF status**: nothing equivalent. No security requirement list, no leveling, no
"which chapters apply" step.

## S4. Threat modeling — the design-stage method (STRIDE × DFD, as code)

Threat Modeling Manifesto's four questions: **What are we working on? What can go
wrong? What are we going to do about it? Did we do a good enough job?** — "a
valuable model over a perfect model; people and collaboration over checklists."

**STRIDE** (Microsoft) — six categories, each breaking one security property:
Spoofing (authentication), Tampering (integrity), Repudiation (non-repudiation),
Information Disclosure (confidentiality), Denial of Service (availability),
Elevation of Privilege (authorization). Strength: mechanical enumeration per element.

**DFD + trust boundaries**: external entities, processes, data stores, data flows,
and **trust boundaries** (where the trust level changes). "Data flows that cross the
boundary — user input, external-API responses, calls from another service — are all
'the moment something untrusted enters the inside.' This coincides with where
validation, authentication, and authorization should take effect." The boundary is
the security architecture's map.

**Element × STRIDE matrix** → threat list with mitigations; prioritize by
**risk = likelihood × impact**; **acceptance is a legitimate recorded option**.

**Threat modeling as code**: threat registry as typed YAML (`id, component, stride,
description, risk, mitigation, mitigated`) in the repo, plus a CI verification that
**fails on high-risk unmitigated threats** — turning the design artifact into a
living contract that cannot rot. This is exactly the ASF's own pattern (docs as
code + machine-checkable gate), applied to security.

Timing: light and frequent — per feature at design time (30–60 min), on architecture
change (trust boundary moves), periodic review.

**ASF status**: nothing. Phase 4's "Security:" line is a *prompt*, not a method; no
trust boundaries, no STRIDE, no registry, no gate. And the ASF's own products are
agent systems — the trust boundary between *untrusted user content* and *the agent's
tool execution* is the single most important boundary in everything Ai Applied
builds.

## S5. Supply chain: SLSA levels + SBOM + provenance

SLSA v1.0 build track: **L0** no guarantees; **L1** provenance exists (build
platform, process, top-level inputs — prevents release mistakes, aids debugging and
rebuilds); **L2** signed provenance from a hosted build platform (prevents tampering
*after* the build); **L3** hardened build platform (prevents tampering *during* the
build; runs cannot influence one another; signing secrets inaccessible to build
steps). Provenance = what entity built the artifact, what process, what inputs;
consumers verify against expected provenance.

SBOM is the component inventory (SSDF PW.4) that makes RV.1 possible; SCA scans
dependencies against known-vulnerability databases; the standard tooling is
`npm audit`/`osv-scanner`/`grype`/`trivy` + lockfile hygiene.

**ASF status**: Phase 4 asks about "license, maintenance, size, security history,
lockfile hygiene" — advisory only. No SBOM, no provenance, no SCA gate, no
dependency-allowlist, no "pinned + lockfile committed" rule, no vuln-response loop
after release. (Notably the ASF's own release flow *does* publish to npm — the
supply-chain question applies to the factory itself.)

## S6. OWASP LLM Top 10 (2025) — security for AI/agent products (ASF's own domain)

LLM01 Prompt Injection · LLM02 Sensitive Information Disclosure · LLM03 Supply Chain
· LLM04 Data Poisoning · LLM05 Improper Output Handling · LLM06 Excessive Agency ·
LLM07 System Prompt Leakage · LLM08 Vector & Embedding Vulnerabilities · LLM09
Misinformation · LLM10 Unbounded Consumption.

Mitigation themes: prompt-injection isolation via structured execution contexts,
**least-privilege tool permission matrices for agentic systems**, RAG document
sanitization, inference-layer rate limiting and **cost budget enforcement**.

**ASF status**: zero. The ASF builds *agentic* systems (pi extensions that execute
tools, read files, call APIs) and the factory itself is an agent. LLM06 (excessive
agency) and LLM01 (prompt injection via untrusted content) are the direct analogues
of the trust-boundary problem in S4. NIST also published **SP 800-218A** (SSDF
community profile for GenAI model development) — the AI-specific extension of the
same framework.

## S7. Secure coding practices (the PW.5/PW.7 layer, distilled)

- **Validate at the trust boundary** — input validation belongs where untrusted data
  enters, not scattered; fail closed.
- **Server-side authorization always** (IDOR is the #1 class: client-side checks are
  decoration); **least privilege** everywhere (roles, tokens, tool permissions).
- **Rate limiting + timeouts** on public endpoints (A02/A07/DoS).
- **Tamper-resistant audit logs** (append-only, integrity-protected) — the
  Repudiation countermeasure; log security events (A09).
- **Secrets**: never in code/repo/history; secret scanning (gitleaks/trufflehog) as a
  gate; environment/secret-manager injection; rotation.
- **Crypto**: use standard primitives/libraries, never hand-rolled; TLS everywhere
  (A04/A12).
- **Exception handling**: handle errors at the boundary, return generic messages,
  log details internally (A10 — new category, and the ASF's own 06b Rule 5 "read the
  real error" must not leak it to users).
- **Dependency hygiene**: lockfile committed, `npm audit`/SCA in CI, pin exact
  versions for runtime deps, review license + maintenance before adoption (Phase 2
  criteria already exist — they just need a gate).

## S8. What this pillar implies for an agent-run factory

1. **Security must be a first-class phase concern, not an adversarial bullet**: a
   lightweight threat model (DFD + trust boundaries + STRIDE × element matrix) for
   large work, stored as code, with a machine-checkable "high-risk threats must be
   mitigated or explicitly accepted" gate.
2. **A security DoD checklist derived from ASVS** (chapters × level by risk) is
   directly implementable as a reference doc + DoD lines — and it is *checkable*,
   which is what makes it hold for an agent.
3. **Supply-chain gate**: SBOM/`npm audit`/lockfile check as an optional Code Health
   Gate module (same `npx --no-install` + `missingTool: warn` pattern as 06e).
4. **Secrets scanning gate** (gitleaks via npx) — trivially mechanical, high value.
5. **LLM/agent-specific security** belongs in the ASF because the ASF's products are
   agents: prompt-injection isolation, least-privilege tool permissions, output
   handling, cost/consumption bounds. This is a differentiator — almost no generic
   SDLC framework has it, and Ai Applied's domain is exactly there.
6. **RV loop**: after release, vulnerability response is a real obligation (SSDF RV);
   for an agent factory this can be a lightweight "known-vuln check before each
   release" rule.
