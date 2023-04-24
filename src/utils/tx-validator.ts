const VALID_TX_ID_REGEX = new RegExp(/^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/);

export function isValidTxId(id: string) {
  return VALID_TX_ID_REGEX.test(id);
}