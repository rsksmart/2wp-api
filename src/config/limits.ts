function parseEnvInt(val: string | undefined, defaultVal: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultVal;
}

export const ADDRESS_LIST_MAX_ITEMS = parseEnvInt(process.env.ADDRESS_LIST_MAX_ITEMS, 50);
export const UTXO_RESPONSE_MAX_ROWS = parseEnvInt(process.env.UTXO_RESPONSE_MAX_ROWS, 1000);
export const ADDRESS_INFO_MAX_TXIDS = parseEnvInt(process.env.ADDRESS_INFO_MAX_TXIDS, 100);
export const PROVIDER_CONCURRENCY = parseEnvInt(process.env.PROVIDER_CONCURRENCY, 5);
