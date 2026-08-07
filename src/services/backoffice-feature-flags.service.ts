import { getLogger, Logger } from '../utils/logger';
import { FeaturesDbDataModel } from '../models/features-data.model';
import { NETWORK_TESTNET } from '../constants';

export interface ProviderFlagValue {
  enabled: boolean;
  [property: string]: unknown;
}
export type ProviderFlags = Record<string, ProviderFlagValue>;

function toPropertyName(suffix: string): string {
  const parts = suffix.toLowerCase().split('_');
  return (
    parts[0] +
    parts
      .slice(1)
      .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join('')
  );
}

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
    const properties: { key: string; value: unknown }[] = [];
    const dropped: string[] = [];
    rows.forEach(row => {
      const key = row?.key;
      if (typeof key !== 'string' || key.trim() === '') return;
      if (typeof row.value === 'boolean') {
        flags[key] = { enabled: row.value };
      } else {
        properties.push({ key, value: row.value });
      }
    });
    properties.forEach(({ key, value }) => {
      const base = Object.keys(flags)
        .filter(flag => key.startsWith(`${flag}_`) && key.length > flag.length + 1)
        .sort((a, b) => b.length - a.length)[0];
      const property = base ? toPropertyName(key.slice(base.length + 1)) : null;
      if (property && property !== 'name' && property !== 'value' && value !== null && value !== undefined) {
        flags[base][property] = value;
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
