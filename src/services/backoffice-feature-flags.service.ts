import { getLogger, Logger } from '../utils/logger';
import { FeaturesDbDataModel } from '../models/features-data.model';

/** Any JSON value the backoffice can hold for a flag, except null. */
export type FlagValue = boolean | string | number | Record<string, unknown> | unknown[];

export type ProviderFlags = Record<string, FlagValue>;

/**
 * A feature as `/features` serves it: the stored shape, widened to the flag
 * values the backoffice can hold, plus the pairs of a provider.
 */
export type MergedFeature = Omit<FeaturesDbDataModel, 'value'> & {
  value: FlagValue;
  pairs?: ProviderPair[];
};

/**
 * A pair is owned by the backoffice: nothing but `enabled` is read here, so it
 * is served as it arrives and new backoffice attributes need no code change.
 */
export interface ProviderPair {
  enabled: boolean;
  [attribute: string]: unknown;
}

export interface ProviderStatus {
  key: string;
  enabled: boolean;
  /** Pairs the provider can actually serve: its enabled pairs while it is enabled. */
  pairs: ProviderPair[];
}

export interface BackofficeFeatureFlags {
  flags: ProviderFlags;
  providers: ProviderStatus[];
}


export class BackofficeFeatureFlagsService {
  logger: Logger = getLogger('backoffice-feature-flags-service');
  private readonly baseUrl = (process.env.BACKOFFICE_API_URL ?? '').trim().replace(/\/+$/, '');
  private readonly email = process.env.BACKOFFICE_API_EMAIL ?? '';
  private readonly password = process.env.BACKOFFICE_API_PASSWORD ?? '';
  private readonly environment = process.env.DEPLOY_ENV ?? 'local';
  private readonly cacheTtlMs = Number(process.env.BACKOFFICE_FLAGS_CACHE_TTL_MS) || 60000;
  private readonly timeoutMs = Number(process.env.BACKOFFICE_HTTP_TIMEOUT_MS) || 2000;
  private sessionCookie: string | null = null;
  private cache: { data: BackofficeFeatureFlags; fetchedAt: number } | null = null;
  private inFlight: Promise<BackofficeFeatureFlags | null> | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) { }

  public async getProviderFlags(): Promise<BackofficeFeatureFlags | null> {
    if (!this.baseUrl || !this.email || !this.password) return null;
    if (!this.cache || Date.now() - this.cache.fetchedAt >= this.cacheTtlMs) {
      this.inFlight ??= this.refresh().finally(() => {
        this.inFlight = null;
      });
      if (!this.cache) return this.inFlight;
    }
    return this.cache?.data ?? null;
  }

  private async refresh(): Promise<BackofficeFeatureFlags | null> {
    try {
      let response = await this.requestFlags();
      if (response.status === 401) {
        this.sessionCookie = null;
        response = await this.requestFlags();
      }
      if (!response.ok) {
        throw new Error(`Backoffice /api/feature-flags responded with status ${response.status}`);
      }
      this.cache = { data: this.parseFlags(await response.json()), fetchedAt: Date.now() };
      return this.cache.data;
    } catch (err) {
      this.logger.warn(
        { method: 'refresh', err },
        'Failed to retrieve feature flags from backoffice; serving last known values',
      );
      return this.cache?.data ?? null;
    }
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private async requestFlags(): Promise<Response> {
    const params = new URLSearchParams({
      environment: this.environment,
      include: 'providers',
    });
    if (!this.sessionCookie) await this.login();
    return this.request(`/api/feature-flags?${params.toString()}`, {
      headers: { accept: 'application/json', cookie: this.sessionCookie ?? '' },
    });
  }

  private async login(): Promise<void> {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok) {
      throw new Error(`Backoffice login failed with status ${response.status}`);
    }
    const cookies = response.headers.getSetCookie().map(cookie => cookie.split(';')[0]);
    if (cookies.length === 0) {
      throw new Error('Backoffice login response did not include a session cookie');
    }
    this.sessionCookie = cookies.join('; ');
  }

  private parseFlags(payload: unknown): BackofficeFeatureFlags {
    const body = payload as { flags?: { key: unknown; value: unknown }[]; providers?: unknown };
    const rows = body?.flags;
    if (!Array.isArray(rows)) {
      throw new Error('Invalid backoffice /api/feature-flags response: missing "flags" array');
    }
    const flags: ProviderFlags = {};
    const dropped: string[] = [];
    rows.forEach(row => {
      if (typeof row?.key !== 'string') return;
      if (isFlagValue(row.value)) {
        flags[row.key] = row.value;
      } else {
        dropped.push(row.key);
      }
    });
    if (dropped.length > 0) {
      this.logger.warn(
        { method: 'parseFlags', dropped },
        'Ignoring backoffice flags holding no value',
      );
    }
    return { flags, providers: this.parseProviders(body.providers) };
  }

  /**
   * Keeps every provider carrying a `key` and a boolean `enabled`, along with
   * the pairs it can serve. A payload without providers is served as flags only.
   */
  private parseProviders(payload: unknown): ProviderStatus[] {
    if (!Array.isArray(payload)) return [];
    const rows = payload.filter(
      row => typeof row?.key === 'string' && typeof row.enabled === 'boolean',
    );
    if (rows.length < payload.length) {
      this.logger.warn(
        { method: 'parseProviders', dropped: payload.length - rows.length },
        'Ignoring backoffice providers without a key and a boolean enabled',
      );
    }
    return rows.map(row => ({
      key: row.key,
      enabled: row.enabled,
      pairs: row.enabled ? parsePairs(row.pairs) : [],
    }));
  }

}

/** Every JSON value carries a flag, except null and a missing one. */
function isFlagValue(value: unknown): value is FlagValue {
  return value !== null && ['boolean', 'string', 'number', 'object'].includes(typeof value);
}

/** Serves the pairs the backoffice marks as enabled, as they arrive. */
function parsePairs(payload: unknown): ProviderPair[] {
  return Array.isArray(payload) ? payload.filter(pair => pair?.enabled === true) : [];
}

export function applyProviderFlags(
  features: MergedFeature[],
  backofficeFlags: BackofficeFeatureFlags,
): MergedFeature[] {
  const merged: MergedFeature[] = [...features];
  Object.entries(backofficeFlags.flags).forEach(([key, value]) => {
    upsertFeature(merged, key, value);
  });
  backofficeFlags.providers.forEach(provider => {
    upsertFeature(merged, provider.key, provider.enabled, provider.pairs);
  });
  return merged;
}

/**
 * Writes `key` into the feature list, appending it when missing. A boolean
 * reads as `enabled`/`disabled`, every other value is served as it stands.
 * A boolean never overwrites a feature holding neither (e.g. the stored
 * `terms_and_conditions` text), which the backoffice can still replace by
 * serving a value of its own.
 */
function upsertFeature(
  merged: MergedFeature[],
  key: string,
  flagValue: FlagValue,
  pairs?: ProviderPair[],
): void {
  const name = key.toLowerCase();
  const isBoolean = typeof flagValue === 'boolean';
  let value = flagValue;
  if (isBoolean) {
    value = flagValue ? 'enabled' : 'disabled';
  }
  const existing = merged.find(feature => feature.name === name);
  if (!existing) {
    merged.push(Object.assign(new FeaturesDbDataModel(), { name, value, pairs }));
    return;
  }
  if (isBoolean && existing.value !== 'enabled' && existing.value !== 'disabled') {
    return;
  }
  existing.value = value;
  existing.pairs = pairs;
}
