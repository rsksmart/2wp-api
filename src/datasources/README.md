# Datasources

This directory contains config for datasources used by this app.

Every REST datasource takes its outbound budgets (request timeout, explicit JSON
expectation) from `rest-datasource-budgets.ts`.

The LoopBack REST connector buffers a whole provider response before the
application sees it, so it cannot bound response size, and it has no retry policy
to bound. The two high-risk Blockbook endpoints — `/api/v1/utxo/{address}` and
`/api/v2/address/{address}` — therefore do not use this connector at all; they go
through the bounded client in `src/utils/bounded-http-client.ts`, which enforces
size, time and retry budgets. See `docs/resource-budgets.md`.
