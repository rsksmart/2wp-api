# Deployment requirements request — 2wp-api security remediation

**To:** DevOps / Infrastructure
**From:** 2wp-api engineering
**Date raised:** 2026-09-07
**Branch under remediation:** `advisory-fix-1` (fork `rsksmart/2wp-api-ghsa-vxc4-p4rf-87g8`)
**Related:** Immunefi reports 84419, 84461, 84462, 84581, 84755, 86065

---

## Why this request exists

Six security findings have been remediated in the application. Four of them make claims about how the **deployed** service behaves — that it survives a fault, that it restarts, that it bounds memory, that it rate-limits per client. None of those claims can be verified from the application repository.

The four deploy targets in `ci/tasks/` all run `repo-iac-ng/ansible/deploy-2wp-app-api.yml` with per-environment SOPS secrets. Runtime configuration is therefore invisible to us. Two of the fixes are **inert until a deployment change lands alongside them** — they are marked ⚠️ below.

We are asking for two distinct things, and they are separated on purpose because they have different approval paths:

- **Part A — facts.** Read-only. What is configured today. No change, no risk.
- **Part B — changes.** Configuration we are asking you to change or add.
- **Part C — access.** Whether certain signals are queryable, and whether a staging exercise is possible.

## How to answer

Fill in the **Answer** column. `n/a` with a one-line reason is a complete answer. Where a row differs per environment, the four columns are the four deploy targets:

| Short name | Ansible limit | `twowp_api_api_version` |
| --- | --- | --- |
| **MN** | `twowp_app_api_mainnet` | `mainnet` |
| **TN** | `twowp_app_api_testnet` | `testnet` |
| **SMN** | `twowp_app_api_staging_mainnet` | `staging-mainnet` |
| **STN** | `twowp_app_api_staging_testnet` | `staging-testnet` |

Nothing here is urgent to the hour, but **A4 and A5 block work that is otherwise ready to start**, so those two first if you are triaging.

---

## Part A — Facts requested (read-only)

### A1 · Container restart policy

| | MN | TN | SMN | STN |
| --- | --- | --- | --- | --- |
| Restart policy in effect | | | | |
| Does it restart on a **non-zero** exit code? | | | | |
| Does it restart on a **zero** exit code? | | | | |

**What this unblocks.** The application used to exit `0` on every fatal fault, including faults an attacker could trigger. It now exits `0` on a graceful stop (SIGINT/SIGTERM) and `1` on a fatal fault. That change is only useful if the supervisor distinguishes them.

Evidence that it matters: report 84581 observed staging sitting at 502 for 322 seconds after a clean exit and needing manual intervention, while 84419 and 84755 — which died on a signal — recovered in two to five seconds. That is what `on-failure` semantics look like from the outside. If the deployed policy is `on-failure`, the old exit code was silently preventing recovery.

If the policy is `unless-stopped`, both codes recover and no change is needed — we just need to know, so we can stop treating it as an open risk.

### A2 · `NODE_ENV` in the deployed image

| | MN | TN | SMN | STN |
| --- | --- | --- | --- | --- |
| `NODE_ENV` value | | | | |

**What this unblocks.** `NODE_ENV` is set nowhere in the `Dockerfile`, in `docker-compose.yml`, or in `ci/`, so the shipped image defaults to non-production. Outside production, `src/application.ts:206` mounts the REST Explorer UI and the OpenAPI spec endpoint — the `/explorer` serve-static surface that report 84581 exploited. The fatal sink behind it has been fixed, so this is no longer a process kill; it is an unnecessary attack surface and an information disclosure in a production API.

If the answer is anything other than `production` for MN and TN, see **B1**.

### A3 · Process mode and resource limits

| | MN | TN | SMN | STN |
| --- | --- | --- | --- | --- |
| `--appmode=` argument passed (`API`, `DAEMON`, or absent) | | | | |
| Node heap ceiling (`--max-old-space-size`, or `NODE_OPTIONS`) | | | | |
| Container memory limit | | | | |
| Container healthcheck configured? (command + interval) | | | | |
| Number of replicas / instances | | | | |

**What this unblocks.** Every "the process survives" claim in the four remediation plans is expressed relative to a known heap. The verified numbers are:

- Bridge ABI decoding amplifies calldata into heap by a measured ~225x. The bound is 32 KiB per request, so ~7.2 MiB per request in flight.
- Transaction lookups are capped at 8 MiB per response with at most 4 in flight process-wide.
- The open finding S6 (large unread responses) exhausts a **256 MB** heap with 48 connections.

With no heap ceiling and no container memory limit, none of those products can be checked against anything, and the S6 threshold is unknown for the real deployment. With no healthcheck, a restart policy reacts to a process that exits but not to one that is wedged.

`--appmode=` matters because without it the API and the block indexer share a process, so a fault in either takes down both, and the indexer's memory competes with request handling.

### A4 · ⚠️ Proxy topology — blocks work that is ready to start

| | MN | TN | SMN | STN |
| --- | --- | --- | --- | --- |
| How many proxies/load balancers sit in front of the app? | | | | |
| Which ones (ALB, CloudFront, nginx, …), in order from the client | | | | |
| The app's immediate socket peer address(es) | | | | |
| The raw `X-Forwarded-For` the app actually receives | | | | |

**What this unblocks.** The rate limiter currently keys each request on the **left-most** entry of `X-Forwarded-For`. An AWS ALB *appends* the address it observes, so the left-most entry is whatever the client put there. A client sending `X-Forwarded-For: 1.2.3.4` arrives as `1.2.3.4, <real address>`, which means a client can mint unlimited rate-limit identities by rotating that header, and can push a chosen third party's address into a blocked bucket.

The fix is to take the Nth entry from the right, where N is the number of trusted hops. **We cannot write it without knowing N** — choosing wrong reintroduces the same bug in the opposite direction, and it fails in a way that looks like working software.

If the raw header is not something you can read from your side, we can add a temporary log line on one route, deploy to staging, make one request and remove it. Say the word and we will prepare that; it is about an hour of work and one deploy.

### A5 · ⚠️ Upstream endpoints and transport security

| | MN | TN | SMN | STN |
| --- | --- | --- | --- | --- |
| `RSK_NODE_HOST` value | | | | |
| `BLOCKBOOK_URL` value | | | | |
| Is https enforced for both? (or could either be plain http?) | | | | |
| Are either reached over a private network / VPC peering? | | | | |
| Are they self-hosted or third-party? | | | | |

**What this unblocks.** Finding S5: a native Brotli decoder is still constructed in-process on the RSK JSON-RPC response path, through web3 → cross-fetch → node-fetch. Exploiting it requires either a malicious or compromised upstream, or a network position between us and it.

If both endpoints are https over a private network, the threat model is weak and S5 stays low priority. **If either can be plain http, a network position is trivial and S5's severity rises immediately** — it becomes the same class of remote process kill as report 84755, which was rated critical. This single answer can reorder the remaining work.

The values are also the baseline for measuring S3 (per-request call volume against the RSK node).

---

## Part B — Changes requested

### B1 · Set `NODE_ENV=production` in production environments

**Where:** MN and TN. Applies to SMN/STN only if you want the staging surface closed too — we would rather it match production, so that staging tests what production runs.

**Effect:** disables `/explorer` and `/openapi.json`. Nothing else in the application branches on `NODE_ENV`.

**Risk if applied:** anyone using `/explorer` against those environments loses it. We are not aware of any such consumer; please flag it if you are.

### B2 · ⚠️ Set `RATE_LIMIT_TRUSTED_PROXIES` per environment

**Where:** all four.

**Value:** the address(es) of the immediate proxy peer, comma-separated. Derived from your answer to A4.

**Effect:** without this variable the rate limiter keys every request on the proxy's socket address, which puts **all traffic behind the load balancer into a single bucket** — 90 requests per 30 seconds shared by the entire internet, 15 per 30 seconds for the fan-out routes. That is an availability incident on the first deploy under any real load, and it is the current default.

**This change and the code fix for A4 must ship together.** Setting the variable before the code fix enables the header-rotation evasion described in A4; shipping the code fix without the variable leaves the single-bucket problem in place. Please plan them as one release.

### B3 · Repoint health checks from `/api` to `/health`

**Where:** wherever load-balancer or monitoring health checks are configured.

**Why:** `/health` now has a dedicated rate-limit allowance of 600 requests per 30-second window per client — far above any real polling cadence, and separate from public traffic, so monitoring cannot be starved by an attacker and vice versa. `/api` has the ordinary allowance of 90 and can return 429 under load, which would make a healthy service look unhealthy.

`/health` returns 200 when every dependency is up and 500 when any is down. It is cached for 2 seconds, so polling it does not multiply upstream load.

If repointing is not practical, tell us and we will give `/api` its own class in code instead.

### B4 · Ensure the seven new environment variables reach each environment

Defaults are safe and the application runs correctly with none of them set — this is about being able to tune per environment without a code change. All are documented in `ENV_VARIABLES.md`.

| Variable | Default | What it bounds |
| --- | --- | --- |
| `MAX_BRIDGE_CALLDATA_BYTES` | `32768` | Calldata handed to the Bridge ABI decoder |
| `MAX_TX_PROVIDER_RESPONSE_BYTES` | `8388608` | One transaction-lookup provider response |
| `TX_PROVIDER_MAX_IN_FLIGHT` | `4` | Transaction lookups in flight process-wide |
| `RATE_LIMIT_MAX_HEALTH_REQUESTS` | `600` | Requests per window per client on `/health` |
| `PROCESS_FAILURE_TRIPWIRE_MAX` | `10` | Failures of one kind survived in a window before exiting 1 |
| `PROCESS_FAILURE_TRIPWIRE_WINDOW_MS` | `60000` | That window's length |
| `PROCESS_FAILURE_TRIPWIRE_MAX_KINDS` | `64` | Failure kinds the tripwire tracks at once |

**One caution:** these are safety bounds, and raising one without checking what it multiplies against can undo the protection it provides. `MAX_BRIDGE_CALLDATA_BYTES` and `MAX_TX_PROVIDER_RESPONSE_BYTES` in particular are sized against measured amplification factors and against the concurrency limits, not chosen by feel. Please treat a request to raise either as a code review rather than a config change, and route it to us.

### B5 · Heap ceiling and container memory limit

**Where:** all four, if A3 shows they are absent.

**Request:** an explicit `--max-old-space-size` and an explicit container memory limit, with the container limit above the heap ceiling by enough for the non-heap footprint.

**Why:** with no ceiling, Node sizes the heap from the host and the numbers in our remediation plans stop meaning anything. With a ceiling and a limit, an out-of-memory condition becomes a process exit the supervisor can act on rather than an unpredictable degradation, and the S6 threshold becomes a known quantity we can test against.

We are happy to propose values once we know the container limits and observed RSS — that is a follow-up, not part of this request.

---

## Part C — Access and exercises

### C1 · Log and metrics queryability

| Signal | Queryable today? | Can an alert be attached? |
| --- | --- | --- |
| Log lines with `event=resource_budget_exceeded` (has `resource`, `configuredLimit`, `observedValue`, `traceId`) | | |
| Counter `resource_budget_exceeded_total`, labelled by `resource` | | |
| Log lines with `event=unhandledRejection` | | |
| Process-failure tripwire trips | | |
| Process exit codes (distinguishing 0 from 1) | | |
| Counter `rate_limit_rejected_total`, labelled by route class | | |

**What this unblocks.** Every one of the four remediation plans ends with the same post-deploy step: *48 hours in staging with zero budget violations*. The point of that step is to catch a bound calibrated too tightly — which fails silently, by rejecting legitimate traffic, and is the single most likely way this remediation causes an incident.

If these signals are not queryable, that verification step cannot be performed, and we would be deploying a set of new limits with no way to see them firing. We would rather know that now than discover it during the 48-hour window.

Specifically, we need to be able to answer: *did anything hit `resource=bridge_calldata_bytes` or `resource=provider_response_bytes` with `detail=blockbook.tx` in the last 48 hours?* Expected answer in both cases: zero.

### C2 · A staging exercise: stop MongoDB for 2 minutes under traffic

**Request:** a window in which MongoDB can be stopped for roughly two minutes in SMN or STN, with normal traffic flowing, and restarted.

**Why:** this is the direct verification for the B3 remediation. Before the fix, a single unauthenticated `GET /health` with MongoDB unreachable killed the process about fifteen seconds after the HTTP response — long after the response, which is why an earlier review pass recorded it as not reproducible.

What we expect to observe: `/health` returning 500, every route that does not touch MongoDB serving normally, **zero restarts**, and automatic recovery when MongoDB returns without a restart being needed. The last part matters most: a connection failure must not be cached in a way that survives the outage.

Roughly 30 minutes of your time, and it is the only way to verify this end to end.

### C3 · CI environment

| | Answer |
| --- | --- |
| Node major version CI builds and tests with | |
| Does the test job have outbound network access? | |
| Which npm scripts does CI run? (`test`, `test:all`, `acceptance-test`?) | |

**What this unblocks.** The project's `engines` requires Node ≥24 and <25. Eight unit tests currently fail in environments without network access — they reach a public testnet RSK node directly, which the branch documents as a known pre-existing gap. We need to know whether CI's failures are those eight and nothing else. Without the Node version and the egress answer we cannot triage a red build, and the acceptance suite includes child-process tests that must run for the remediation evidence to be complete.

---

## Exit criteria

This request is complete when every cell in Part A is answered or marked `n/a` with a reason, each item in Part B is accepted, rejected with a reason, or scheduled, and each item in Part C is answered.

The completed document is the evidence for the deployment half of this remediation, and it is what gets attached to the Immunefi responses whose claims depend on production state rather than on branch state. Three of the six reports fall into that category.

**Please reply on this document rather than in a thread**, so the answers stay diffable and citable as the environments change.

## Contact and turnaround

Owner on our side: 2wp-api engineering.

If A4 and A5 can come back before the rest, that unblocks the work that is currently waiting. Everything else can follow at a normal pace.
