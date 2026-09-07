import {config} from 'dotenv';

/**
 * Loads the environment the test process runs under, and makes it hermetic.
 *
 * Required from `.mocharc.json`, so it runs before any suite is loaded.
 *
 * **Why this exists.** It used to happen by accident: the REST datasource modules
 * each called dotenv's `config()` at import time, so importing any of them
 * populated `process.env` for the whole process. Production never depended on
 * that — the real entry point loads `dotenv/config` on its first line — but the
 * test process never imports the entry point, so retiring those datasources took
 * the only thing loading `.env` with them, and suites that construct a service
 * reaching for `RSK_NODE_HOST` failed on an undefined provider.
 *
 * `.env.test` is tracked in the repository, so loading it gives a fresh checkout
 * the same values as a developer's machine. The previous behaviour read the
 * untracked `.env` and therefore depended on a file CI may never have had.
 */
config({path: '.env.test'});
config();

/*
 * The upstream endpoints are deliberately *not* overridden here, and that is
 * worth recording rather than leaving as an absence.
 *
 * `.env.test` names the real testnet Blockbook and a public RSK node, so any
 * suite that forgets to mock an upstream reaches it for real — slowly, and
 * dependent on the developer's VPN. Pinning both to a closed loopback port makes
 * that hermetic, and doing so reddens ten tests that turn out to depend on live
 * network access today: six in `pegin-status.service.unit.ts`, two in
 * `pegout-data.processor.unit.ts`, one in `bitcoin.service` and one acceptance
 * case. Those are a pre-existing gap, not something this change introduced, and
 * fixing them is a larger job than it belongs inside.
 *
 * So this preserves the previous behaviour exactly: the same values reach the
 * same suites as before the REST datasources were retired. Making the suite
 * hermetic is tracked separately — the recorded RPC fixtures in
 * `__tests__/fixtures/` are the pattern to extend.
 */
