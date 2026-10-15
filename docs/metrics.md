# Metrics

Prometheus metrics are served at `GET /internal/metrics`. Every series is named
`twp_api_<subsystem>_<name>_<unit>` and carries an `environment` label from
`DEPLOY_ENV` (default `local`). Default Node.js process metrics are exposed with
the same prefix.

Label values never carry free-form request data. They come from closed lists in
code, or, for the HTTP metrics, from the matched route template and the response
status. `src/__tests__/unit/utils/metrics.unit.ts` checks the closed lists.

Series with a closed list start at `0` when the process starts. The HTTP series
start at `0` for every route and response status documented in the OpenAPI
spec; other combinations, such as `unmatched` or `499`, appear on first use, as
do the `mongo_operation_duration_seconds` series.

## Catalog

| Metric | Type | Labels |
|---|---|---|
| `twp_api_up` | gauge | — |
| `twp_api_info` | gauge | `version`, `node_version` |
| `twp_api_http_requests_total` | counter | `method`, `path`, `status` |
| `twp_api_http_request_duration_seconds` | histogram | `method`, `path` |
| `twp_api_http_requests_in_flight` | gauge | — |
| `twp_api_http_format_rejected_total` | counter | `reason`: `content_encoding`, `media_type`, `unroutable`, `body_size` |
| `twp_api_errors_total` | counter | `type`: `validation`, `rejected`, `rate_limited`, `cancelled`, `overloaded`, `timeout`, `upstream`, `internal` |
| `twp_api_rate_limit_rejected_total` | counter | `route_class`: `fanout`, `health`, `other` |
| `twp_api_requests_cancelled_total` | counter | `reason`: `client_aborted`, `timeout` |
| `twp_api_resource_budget_exceeded_total` | counter | `resource`: the `ResourceBudgetName` values, see [`resource-budgets.md`](./resource-budgets.md) |
| `twp_api_provider_permits_active` | gauge | `pool`: `blockbook`, `blockbook-tx` |
| `twp_api_provider_permits_queued` | gauge | `pool` |
| `twp_api_provider_permits_granted_total` | counter | `pool` |
| `twp_api_provider_permits_rejected_total` | counter | `pool`, `reason`: `queue_full`, `wait_timeout` |
| `twp_api_daemon_sync_duration_seconds` | histogram | — |
| `twp_api_mongo_operation_duration_seconds` | histogram | `operation`: `set`; `collection`: a model's collection name |

- `path` is the route template, or `unmatched`. The HTTP metrics skip `/`,
  `/index.html`, `/favicon.ico`, `/openapi.json`, `/openapi.yaml`, `/explorer`
  and `/internal/metrics`.
- `status="499"` means the response never finished: the client went away, or the
  connection was dropped before the response was written.
- Some events are deliberately counted twice. A format refusal is also counted
  under its 4xx status; the format metric exists because `content_encoding` and
  `media_type` are both `415`, and only the first is a security signal. A permit
  refusal is also counted as `resource_budget_exceeded_total{resource="provider_permits"}`,
  a rate-limit refusal as `resource="rate_limit"`, and a deadline cancellation as
  `resource="request_duration_ms"`.

`METRICS_ENABLED` no longer has any effect and can be dropped from deployments.
