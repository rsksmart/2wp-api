export const ADDRESS_LIST_MAX_ITEMS = Number(process.env.ADDRESS_LIST_MAX_ITEMS ?? 50);
export const UTXO_RESPONSE_MAX_ROWS = Number(process.env.UTXO_RESPONSE_MAX_ROWS ?? 1000);
export const ADDRESS_INFO_MAX_TXIDS = Number(process.env.ADDRESS_INFO_MAX_TXIDS ?? 100);
export const PROVIDER_CONCURRENCY = Number(process.env.PROVIDER_CONCURRENCY ?? 5);
export const REJECT_DUPLICATE_ADDRESSES = process.env.ADDRESS_LIST_REJECT_DUPLICATES !== '0';
