import {ensure0x} from '../../utils/hex-utils';

/** Anything that looks like a 0x-prefixed hex value: a Rootstock hash or address. */
const PREFIXED_HEX = /^0x[0-9a-fA-F]+$/;

/**
 * Normalizes the identifier used as `swap_id`.
 *
 * Atlas correlates the events of one swap by string equality, so the same
 * transaction reaching the queue as `0xAB…` and `ab…` would split into two
 * swaps. Every emitter therefore agrees on one spelling: 0x-prefixed and
 * lowercase.
 *
 * @param value - The hash as it came from the Bridge log or the database.
 * @returns The hash, 0x-prefixed and lowercase.
 * @throws Error when the value is missing or blank, rather than letting an
 * empty `swap_id` reach the queue where it would merge unrelated swaps.
 */
export function normalizeSwapId(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    throw new Error('Cannot build an Atlas event with an empty swap_id');
  }
  return ensure0x(trimmed).toLowerCase();
}

/**
 * Normalizes an address used as `wallet_address`.
 *
 * Only 0x-prefixed hex is lowercased, which is what makes this safe to call on
 * either flow: a Rootstock address is case insensitive (the mixed case is just
 * an EIP-55 checksum), while a Bitcoin address is base58 or bech32 and
 * lowercasing it would produce an address that does not exist.
 *
 * @param value - The address as it came from the Bridge log or the database.
 * @returns The normalized address, or `null` when there is none to report.
 */
export function normalizeAddress(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    return null;
  }
  return PREFIXED_HEX.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}
