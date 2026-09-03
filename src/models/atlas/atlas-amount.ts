import Big from 'big.js';

const SATOSHIS_PER_BTC = 100_000_000;
const AMOUNT_DECIMALS = 8;

/**
 * Formats an amount in satoshis as the fixed 8-decimal string the Atlas SWAP
 * schema expects (`"0.12345678"`).
 *
 * `big.js` is used throughout so large values never lose precision through
 * `Number` arithmetic.
 *
 * @param satoshis - Amount in satoshis. Nullish values are treated as zero.
 * @returns The amount in BTC/RBTC as a decimal string.
 */
export function satoshisToDecimalString(satoshis: number | undefined | null): string {
  return new Big(satoshis ?? 0).div(SATOSHIS_PER_BTC).toFixed(AMOUNT_DECIMALS);
}
