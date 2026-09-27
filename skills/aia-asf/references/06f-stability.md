# 06f — Stability & Error Handling

> **Read when:** the deliverable makes external calls (network, processes,
> shared resources), is a service/daemon, or has retryable operations — large
> work.
> **Skip when:** small work; pure computation with no external calls; one-off
> scripts with no retryable surface.
>
> **Scale note:** these are *design rules for the deliverable*, not ceremony.
> If the deliverable has no external calls, the whole file is irrelevant — do
> not read it.

Source: Release It! (Nygard) stability patterns; Ousterhout error-handling
philosophy; OWASP A10:2025 (Mishandling of Exceptional Conditions).

---

## 1. Stability patterns (apply when the deliverable makes external calls)

Every external call is an integration point — the most common source of
production failure. The patterns below are the standard set; apply the ones
that fit, skip the rest.

| Pattern | One-line rule |
|---|---|
| **Timeouts** | Every external call has an explicit timeout: connection, read, and total (a call that hangs is worse than a call that fails). |
| **Bounded retries** | Retries are bounded (finite count), exponential backoff + jitter, and only for **idempotent** operations. Never retry a non-idempotent write blindly. |
| **Circuit breaker** | At integration points: closed → open after repeated failures → half-open probe → closed. Prevents hammering a dead dependency. |
| **Bulkheads** | Shared resources (connection pools, thread pools, rate limits) are partitioned so one consumer's exhaustion cannot starve others. |
| **Bounded result sets** | Any query/list/stream is bounded (limit, pagination, max size). Unbounded result sets are a stability antipattern. |
| **Fail fast** | Validate inputs at the boundary and fail immediately with a clear error — do not fail halfway through a multi-step operation. |
| **Graceful shutdown** | On shutdown: stop accepting new work, let in-flight work finish or time out, flush state, release resources. |

**DoD line (large work):** *"if the deliverable makes external calls, it has
timeouts and bounded retries (idempotent only)."*

## 2. Error-handling design rules

- **Define errors out of existence** — the best error handling removes the
  error condition (validate at the boundary, provide defaults, make the
  impossible state unrepresentable). Only handle what cannot be prevented.
- **Handle at the boundary** — catch at the edge (HTTP handler, CLI entry,
  event consumer), convert to the appropriate response; do not scatter
  try/catch through core logic.
- **Generic to the user, detailed to the log** — user-facing errors never leak
  internals (stack traces, SQL, paths); logs carry the full detail. (OWASP
  A10:2025.)
- **Idempotency is a design property** — anything retryable (webhooks, jobs,
  writes) must be idempotent (idempotency keys, unique constraints, natural
  keys). Retries are only safe on idempotent operations.
- **Never use exceptions for control flow** — expected outcomes are values
  (results, optionals, error unions); exceptions are for exceptional
  conditions only.
- **Fail fast** — a broken precondition is a bug; surface it immediately
  rather than degrading silently.

## 3. Observability — service-like deliverables (P07, large work)

If the deliverable is a service/daemon (long-running, serves requests), the
DoD includes:

- **Health/readiness endpoint** — `/health` (or equivalent) that reports
  liveness and readiness; a service that cannot report its own state is
  undebuggable in production.
- **Structured logs to stdout** — machine-parseable (JSON lines), not
  scattered `console.log`; logs are the primary debugging surface.
- **Correlation IDs** — one ID per request/job flows through every log line,
  so a single user action is traceable across modules.
- **Metrics** — where a metrics system exists (Prometheus, etc.): the
  counters/gauges that answer "is it working?" (request rate, error rate,
  latency). No metrics system → skip, and say so.
- **Runbook in README** — start, stop, health check, known issues. An
  operator should be able to run and diagnose it from the README alone.

**DoD line (large work, service-like):** *"health endpoint, structured logs,
correlation IDs, and a runbook exist."*

## 4. Where this applies in ASF

- **Phase 4 (adversarial):** for each external call in the design, ask — what
  is the timeout? Is the retry bounded and idempotent? What happens when the
  dependency is down (circuit breaker/bulkhead)? What is the max result size?
- **Phase 5 (PLAN.md):** the Architecture/Design section names the stability
  patterns chosen for each integration point.
- **Phase 6 (implementation):** apply the patterns as you build; never ship an
  unbounded wait, retry, or result set.
- **Phase 7 (verification):** DoD includes the stability line above.

## Anti-patterns

- ❌ Unbounded retries on non-idempotent writes
- ❌ No timeout on an external call ("it always returns fast")
- ❌ Retrying a POST that creates a resource on every attempt
- ❌ One connection pool shared by all consumers with no bulkhead
- ❌ Loading an entire table into memory because "it's small"
- ❌ Leaking stack traces to end users
- ❌ try/catch around every line of core logic
