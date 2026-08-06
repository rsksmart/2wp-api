import { getLogger, Logger } from '../utils/logger';
import { FeaturesDbDataModel } from '../models/features-data.model';
import { NETWORK_TESTNET } from '../constants';

export interface ProviderFlagValue {
  enabled: boolean;
  [property: string]: unknown;
}
export type ProviderFlags = Record<string, ProviderFlagValue>;

const featureModelProperties = (
  FeaturesDbDataModel as unknown as { definition: { properties: Record<string, unknown> } }
).definition.properties;

const FEATURE_ATTRIBUTE_SUFFIXES: ReadonlyArray<{ suffix: string; property: string }> =
  Object.keys(featureModelProperties)
    .filter(property => property !== 'name' && property !== 'value')
    .map(property => ({
      property,
      suffix: `_${property.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`,
    }));

export class BackofficeFeatureFlagsService {
  logger: Logger = getLogger('backoffice-feature-flags-service');
  private readonly baseUrl = (process.env.BACKOFFICE_API_URL ?? '').trim().replace(/\/+$/, '');
  private readonly email = process.env.BACKOFFICE_API_EMAIL ?? '';
  private readonly password = process.env.BACKOFFICE_API_PASSWORD ?? '';
  private readonly environment = process.env.NETWORK ?? NETWORK_TESTNET;
  private readonly cacheTtlMs = Number(process.env.BACKOFFICE_FLAGS_CACHE_TTL_MS) || 60000;
  private readonly timeoutMs = Number(process.env.BACKOFFICE_HTTP_TIMEOUT_MS) || 2000;
  private sessionCookie: string | null = null;
  private cache: { flags: ProviderFlags; fetchedAt: number } | null = null;
  private inFlight: Promise<ProviderFlags | null> | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) { }

  public async getProviderFlags(): Promise<ProviderFlags | null> {
    if (!this.baseUrl || !this.email || !this.password) return null;
    if (!this.cache || Date.now() - this.cache.fetchedAt >= this.cacheTtlMs) {
      this.inFlight ??= this.refresh().finally(() => {
        this.inFlight = null;
      });
      if (!this.cache) return this.inFlight;
    }
    return this.cache?.flags ?? null;
  }

  private async refresh(): Promise<ProviderFlags | null> {
    try {
      let response = await this.requestFlags();
      if (response.status === 401) {
        this.sessionCookie = null;
        response = await this.requestFlags();
      }
      if (!response.ok) {
        throw new Error(`Backoffice /api/feature-flags responded with status ${response.status}`);
      }
      this.cache = { flags: this.parseFlags(await response.json()), fetchedAt: Date.now() };
      return this.cache.flags;
    } catch (err) {
      this.logger.warn(
        { method: 'refresh', err },
        'Failed to retrieve feature flags from backoffice; serving last known values',
      );
      return this.cache?.flags ?? null;
    }
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private async requestFlags(): Promise<Response> {
    if (!this.sessionCookie) await this.login();
    return this.request(`/api/feature-flags?environment=${encodeURIComponent(this.environment)}`, {
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

  private parseFlags(payload: unknown): ProviderFlags {
    const rows = (payload as { flags?: { key: unknown; value: unknown }[] })?.flags;
    if (!Array.isArray(rows)) {
      throw new Error('Invalid backoffice /api/feature-flags response: missing "flags" array');
    }
    const flags: ProviderFlags = {};
    const attributes = new Map<string, Record<string, unknown>>();
    const dropped: string[] = [];
    rows.forEach(row => {
      const key = row?.key;
      if (typeof key !== 'string' || key.trim() === '') return;
      if (typeof row.value === 'boolean') {
        flags[key] = { enabled: row.value };
        return;
      }
      const attribute = FEATURE_ATTRIBUTE_SUFFIXES.find(
        ({ suffix }) => key.endsWith(suffix) && key.length > suffix.length,
      );
      if (attribute && row.value !== null && row.value !== undefined) {
        const base = key.slice(0, -attribute.suffix.length);
        attributes.set(base, { ...attributes.get(base), [attribute.property]: row.value });
      } else {
        dropped.push(key);
      }
    });
    attributes.forEach((value, key) => {
      if (flags[key]) {
        Object.assign(flags[key], value);
      } else {
        dropped.push(key);
      }
    });
    if (dropped.length > 0) {
      this.logger.warn(
        { method: 'parseFlags', dropped },
        'Ignoring backoffice flags with unsupported value shapes',
      );
    }
    return flags;
  }
}

export function applyProviderFlags(
  features: FeaturesDbDataModel[],
  providerFlags: ProviderFlags,
): FeaturesDbDataModel[] {
  const merged = [...features];
  Object.entries(providerFlags).forEach(([key, { enabled, ...attributes }]) => {
    const name = key.toLowerCase();
    const value = enabled ? 'enabled' : 'disabled';
    const existing = merged.find(feature => feature.name === name);
    if (existing) {
      if (existing.value !== 'enabled' && existing.value !== 'disabled') {
        return;
      }
      existing.value = value;
      Object.assign(existing, attributes);
    } else {
      merged.push(
        Object.assign(new FeaturesDbDataModel(), { name, value, version: 0 }, attributes),
      );
    }
  });
  return merged;
}
