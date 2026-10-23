/**
 * Backwards-compatible view over the central resource budgets.
 *
 * @deprecated Import from `./resource-budgets` instead — this module only
 * re-exports the budgets under their historical names so existing call sites
 * keep compiling. New code should use `RESOURCE_BUDGETS`.
 */
import {
  ADDRESS_LIST_MAX_ITEMS,
  MAX_ADDRESS_INFO_TXIDS,
  PROVIDER_CONCURRENCY,
  UTXO_RESPONSE_MAX_ROWS,
} from './resource-budgets';

export {
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
  UTXO_RESPONSE_MAX_ROWS,
};

/** @deprecated Use `MAX_ADDRESS_INFO_TXIDS` from `./resource-budgets`. */
export const ADDRESS_INFO_MAX_TXIDS = MAX_ADDRESS_INFO_TXIDS;
