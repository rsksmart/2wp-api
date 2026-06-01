/** Legacy P2PKH/P2SH, and bech32 SegWit v0/v1 (mainnet and testnet). */
const BTC_ADDRESS_BODY =
  '[13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{38,59}|(bc1p|tb1p)[0-9a-z]{39,59}';

/** EVM-style address (e.g. Rootstock). */
const EVM_ADDRESS_BODY = '0x[a-fA-F0-9]{40}';

export const BTC_ADDRESS_PATTERN = `^(${BTC_ADDRESS_BODY})$`;

export const EVM_ADDRESS_PATTERN = `^${EVM_ADDRESS_BODY}$`;

export const BTC_OR_EVM_ADDRESS_PATTERN = `^(${EVM_ADDRESS_BODY}|${BTC_ADDRESS_BODY})$`;
