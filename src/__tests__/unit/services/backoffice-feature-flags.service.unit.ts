import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {
  BackofficeFeatureFlagsService,
  applyProviderFlags,
} from '../../../services/backoffice-feature-flags.service';
import {FeaturesDbDataModel} from '../../../models/features-data.model';

const ENV_KEYS = [
  'BACKOFFICE_API_URL',
  'BACKOFFICE_API_EMAIL',
  'BACKOFFICE_API_PASSWORD',
  'NETWORK',
  'BACKOFFICE_FLAGS_CACHE_TTL_MS',
  'BACKOFFICE_HTTP_TIMEOUT_MS',
];

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {status, headers});

const loginResponse = () =>
  jsonResponse(200, {user: {}}, {'set-cookie': 'auth=session-token; HttpOnly; Path=/'});

const flagsResponse = (flags: Array<{key: string; value: unknown}>) =>
  jsonResponse(200, {flags});

const newService = (fetchStub: sinon.SinonStub) =>
  new BackofficeFeatureFlagsService(fetchStub as unknown as typeof fetch);

describe('Service: BackofficeFeatureFlagsService', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.BACKOFFICE_API_URL = 'http://backoffice.local';
    process.env.BACKOFFICE_API_EMAIL = 'svc@example.com';
    process.env.BACKOFFICE_API_PASSWORD = 'a-service-password';
    process.env.NETWORK = 'testnet';
    delete process.env.BACKOFFICE_FLAGS_CACHE_TTL_MS;
    delete process.env.BACKOFFICE_HTTP_TIMEOUT_MS;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('resolves null when the integration is not configured', async () => {
    delete process.env.BACKOFFICE_API_URL;
    const fetchStub = sinon.stub();
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
    sinon.assert.notCalled(fetchStub);
  });

  it('logs in and retrieves the provider flags', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(
      flagsResponse([
        {key: 'FLYOVER', value: true},
        {key: 'UNION_BRIDGE', value: false},
        {key: 'POWPEG', value: true},
        {key: 'MAINTENANCE_MODE', value: false},
      ]),
    );
    const service = newService(fetchStub);
    const flags = await service.getProviderFlags();
    expect(flags).to.eql({
      FLYOVER: {enabled: true},
      UNION_BRIDGE: {enabled: false},
      POWPEG: {enabled: true},
      MAINTENANCE_MODE: {enabled: false},
    });
    const loginCall = fetchStub.getCall(0);
    expect(loginCall.args[0]).to.equal('http://backoffice.local/api/auth/login');
    const flagsCall = fetchStub.getCall(1);
    expect(flagsCall.args[0]).to.equal(
      'http://backoffice.local/api/feature-flags?environment=testnet',
    );
    expect(flagsCall.args[1].headers.cookie).to.equal('auth=session-token');
  });

  it('serves the cached flags within the TTL without extra requests', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    const service = newService(fetchStub);
    await service.getProviderFlags();
    const again = await service.getProviderFlags();
    expect(again?.FLYOVER.enabled).to.be.true();
    sinon.assert.callCount(fetchStub, 2);
  });

  it('re-logs in once when the session is rejected with 401', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(new Response('', {status: 401}));
    fetchStub.onCall(2).resolves(loginResponse());
    fetchStub.onCall(3).resolves(flagsResponse([{key: 'POWPEG', value: true}]));
    const service = newService(fetchStub);
    const flags = await service.getProviderFlags();
    expect(flags?.POWPEG.enabled).to.be.true();
    sinon.assert.callCount(fetchStub, 4);
  });

  it('falls back to the last known flags when the backoffice becomes unreachable', async () => {
    process.env.BACKOFFICE_FLAGS_CACHE_TTL_MS = '1';
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    fetchStub.onCall(2).rejects(new Error('connection refused'));
    const service = newService(fetchStub);
    const first = await service.getProviderFlags();
    expect(first?.FLYOVER.enabled).to.be.true();
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await service.getProviderFlags();
    expect(second?.FLYOVER.enabled).to.be.true();
  });

  it('serves the stale flags immediately and refreshes in the background once the TTL expires', async () => {
    process.env.BACKOFFICE_FLAGS_CACHE_TTL_MS = '1';
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    let resolveRefresh!: (response: Response) => void;
    fetchStub.onCall(2).returns(new Promise(resolve => {
      resolveRefresh = resolve;
    }));
    const service = newService(fetchStub);
    await service.getProviderFlags();
    await new Promise(resolve => setTimeout(resolve, 5));
    const stale = await service.getProviderFlags();
    expect(stale?.FLYOVER.enabled).to.be.true();
    resolveRefresh(flagsResponse([{key: 'FLYOVER', value: false}]));
    await new Promise(resolve => setImmediate(resolve));
    const refreshed = await service.getProviderFlags();
    expect(refreshed?.FLYOVER.enabled).to.be.false();
  });

  it('keeps the session after a non-401 failure and skips the login on the next cycle', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(new Response('', {status: 500}));
    fetchStub.onCall(2).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
    const flags = await service.getProviderFlags();
    expect(flags?.FLYOVER.enabled).to.be.true();
    sinon.assert.callCount(fetchStub, 3);
    const retryCall = fetchStub.getCall(2);
    expect(retryCall.args[0]).to.equal(
      'http://backoffice.local/api/feature-flags?environment=testnet',
    );
    expect(retryCall.args[1].headers.cookie).to.equal('auth=session-token');
  });

  it('keeps the session after a network failure and skips the login on the next cycle', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).rejects(new Error('connection refused'));
    fetchStub.onCall(2).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
    const flags = await service.getProviderFlags();
    expect(flags?.FLYOVER.enabled).to.be.true();
    expect(fetchStub.getCall(2).args[0]).to.equal(
      'http://backoffice.local/api/feature-flags?environment=testnet',
    );
  });

  it('resolves null instead of rejecting when the first fetch fails', async () => {
    const fetchStub = sinon.stub().rejects(new Error('connection refused'));
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
  });

  it('resolves null when the response payload is not the expected shape', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(jsonResponse(200, {unexpected: true}));
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
  });

  it('pairs property flags with their boolean flag and drops orphans and invalid shapes', async () => {
    const browsers = {chrome: true, firefox: false};
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(
      flagsResponse([
        {key: 'FLYOVER', value: 'yes'},
        {key: 'POWPEG', value: true},
        {key: 'POWPEG_ANY_NEW_PROPERTY', value: {some: 'data'}},
        {key: 'NEW_PROVIDER', value: false},
        {key: 'WALLET_LEDGER', value: true},
        {key: 'WALLET_LEDGER_SUPPORTED_BROWSERS', value: browsers},
        {key: 'WALLET_LEDGER_VALUE', value: 'enabled'},
        {key: 'ORPHAN_SUPPORTED_BROWSERS', value: browsers},
      ]),
    );
    const service = newService(fetchStub);
    const flags = await service.getProviderFlags();
    expect(flags).to.eql({
      POWPEG: {enabled: true, anyNewProperty: {some: 'data'}},
      NEW_PROVIDER: {enabled: false},
      WALLET_LEDGER: {enabled: true, supportedBrowsers: browsers},
    });
  });

  describe('applyProviderFlags()', () => {
    it('appends missing provider features and overwrites existing ones', () => {
      const existing = new FeaturesDbDataModel();
      existing.name = 'flyover';
      existing.value = 'enabled';
      existing.version = 1;
      const merged = applyProviderFlags([existing], {
        FLYOVER: {enabled: false},
        UNION_BRIDGE: {enabled: true},
        POWPEG: {enabled: false},
        NEW_PROVIDER: {enabled: true},
      });
      const byName = new Map(merged.map(feature => [feature.name, feature.value]));
      expect(merged.length).to.equal(4);
      expect(byName.get('flyover')).to.equal('disabled');
      expect(byName.get('union_bridge')).to.equal('enabled');
      expect(byName.get('powpeg')).to.equal('disabled');
      expect(byName.get('new_provider')).to.equal('enabled');
    });

    const walletFeature = () => {
      const wallet = new FeaturesDbDataModel();
      wallet.name = 'wallet_ledger';
      wallet.value = 'enabled';
      wallet.supportedBrowsers = {
        chrome: true, firefox: true, safari: true, edge: true, brave: true, chromium: true, opera: true,
      };
      return wallet;
    };

    it('applies flag attributes to existing and appended features', () => {
      const browsers = {chrome: true, firefox: false, safari: false, edge: true, brave: false, chromium: true, opera: false};
      const merged = applyProviderFlags([walletFeature()], {
        WALLET_LEDGER: {enabled: true, supportedBrowsers: browsers},
        FLYOVER: {enabled: true},
      });
      const byName = new Map(merged.map(feature => [feature.name, feature]));
      expect(byName.get('wallet_ledger')?.supportedBrowsers).to.eql(browsers);
      expect(byName.get('flyover')?.supportedBrowsers).to.be.undefined();
    });

    it('keeps the existing supportedBrowsers when the flag has none', () => {
      const merged = applyProviderFlags([walletFeature()], {WALLET_LEDGER: {enabled: false}});
      expect(merged[0].supportedBrowsers).to.eql(walletFeature().supportedBrowsers);
      expect(merged[0].value).to.equal('disabled');
    });

    it('does not overwrite features whose value is not enabled/disabled', () => {
      const terms = new FeaturesDbDataModel();
      terms.name = 'terms_and_conditions';
      terms.value = '# TERMS OF SERVICES';
      const merged = applyProviderFlags([terms], {TERMS_AND_CONDITIONS: {enabled: true}});
      expect(merged.length).to.equal(1);
      expect(merged[0].value).to.equal('# TERMS OF SERVICES');
    });
  });
});
