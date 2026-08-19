/**
 * Builds absolute Blockbook URLs from `BLOCKBOOK_URL`.
 *
 * The configured base URL is allowed to carry a trailing slash (and a path
 * prefix); both are normalized here so callers can always pass a rooted path
 * such as `/api/v2/utxo/{address}`.
 */

/** Reads and normalizes the configured Blockbook base URL. */
const blockbookBaseUrl = (): string => {
  const base = process.env.BLOCKBOOK_URL?.trim();
  if (!base) {
    throw new Error('BLOCKBOOK_URL is not configured');
  }
  return base.replace(/\/+$/, '');
};

/**
 * Builds an absolute Blockbook URL.
 *
 * @param path - Rooted path, e.g. `/api/v2/utxo/mzBc...`. Path segments taken from user input must already be encoded by the caller.
 * @param query - Optional query-string parameters. Entries with `undefined` values are skipped.
 * @returns The absolute URL.
 * @throws {Error} If `BLOCKBOOK_URL` is not configured.
 */
export function blockbookUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const rootedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${blockbookBaseUrl()}${rootedPath}`;
  if (!query) {
    return url;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.append(key, String(value));
    }
  }
  const serialized = search.toString();
  return serialized ? `${url}?${serialized}` : url;
}
