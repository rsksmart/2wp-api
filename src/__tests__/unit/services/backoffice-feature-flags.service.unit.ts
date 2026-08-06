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
  'DEPLOY_ENV',
  'BACKOFFICE_FLAGS_CACHE_TTL_MS',
  'BACKOFFICE_HTTP_TIMEOUT_MS',
];

const FLAGS_URL = 'http://backoffice.local/api/feature-flags?environment=testnet&include=providers';

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {status, headers});

const loginResponse = () =>
  jsonResponse(200, {user: {}}, {'set-cookie': 'auth=session-token; HttpOnly; Path=/'});

const flagsResponse = (flags: Array<{key: string; value: unknown}>, providers?: unknown) =>
  jsonResponse(200, providers === undefined ? {flags} : {flags, providers});

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
    process.env.DEPLOY_ENV = 'testnet';
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
    const retrieved = await service.getProviderFlags();
    expect(retrieved?.flags).to.eql({
      FLYOVER: true,
      UNION_BRIDGE: false,
      POWPEG: true,
      MAINTENANCE_MODE: false,
    });
    const loginCall = fetchStub.getCall(0);
    expect(loginCall.args[0]).to.equal('http://backoffice.local/api/auth/login');
    const flagsCall = fetchStub.getCall(1);
    expect(flagsCall.args[0]).to.equal(FLAGS_URL);
    expect(flagsCall.args[1].headers.cookie).to.equal('auth=session-token');
  });

  it('serves the cached flags within the TTL without extra requests', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    const service = newService(fetchStub);
    await service.getProviderFlags();
    const again = await service.getProviderFlags();
    expect(again?.flags.FLYOVER).to.be.true();
    sinon.assert.callCount(fetchStub, 2);
  });

  it('re-logs in once when the session is rejected with 401', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(new Response('', {status: 401}));
    fetchStub.onCall(2).resolves(loginResponse());
    fetchStub.onCall(3).resolves(flagsResponse([{key: 'POWPEG', value: true}]));
    const service = newService(fetchStub);
    const retrieved = await service.getProviderFlags();
    expect(retrieved?.flags.POWPEG).to.be.true();
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
    expect(first?.flags.FLYOVER).to.be.true();
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await service.getProviderFlags();
    expect(second?.flags.FLYOVER).to.be.true();
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
    expect(stale?.flags.FLYOVER).to.be.true();
    resolveRefresh(flagsResponse([{key: 'FLYOVER', value: false}]));
    await new Promise(resolve => setImmediate(resolve));
    const refreshed = await service.getProviderFlags();
    expect(refreshed?.flags.FLYOVER).to.be.false();
  });

  it('keeps the session after a non-401 failure and skips the login on the next cycle', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(new Response('', {status: 500}));
    fetchStub.onCall(2).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
    const retrieved = await service.getProviderFlags();
    expect(retrieved?.flags.FLYOVER).to.be.true();
    sinon.assert.callCount(fetchStub, 3);
    const retryCall = fetchStub.getCall(2);
    expect(retryCall.args[0]).to.equal(FLAGS_URL);
    expect(retryCall.args[1].headers.cookie).to.equal('auth=session-token');
  });

  it('keeps the session after a network failure and skips the login on the next cycle', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).rejects(new Error('connection refused'));
    fetchStub.onCall(2).resolves(flagsResponse([{key: 'FLYOVER', value: true}]));
    const service = newService(fetchStub);
    expect(await service.getProviderFlags()).to.be.null();
    const retrieved = await service.getProviderFlags();
    expect(retrieved?.flags.FLYOVER).to.be.true();
    expect(fetchStub.getCall(2).args[0]).to.equal(FLAGS_URL);
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

  it('forwards boolean, string, number and JSON flag values', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(
      flagsResponse([
        {key: 'POWPEG', value: true},
        {key: 'TERMS_AND_CONDITIONS', value: '# TERMS OF SERVICES'},
        {key: 'MAX_AMOUNT', value: 10.5},
        {key: 'LIMITS', value: {min: '0.001', networks: ['BITCOIN']}},
        {key: 'ROLLOUT', value: ['flyover', 'powpeg']},
      ]),
    );
    const service = newService(fetchStub);
    const retrieved = await service.getProviderFlags();
    expect(retrieved?.flags).to.eql({
      POWPEG: true,
      TERMS_AND_CONDITIONS: '# TERMS OF SERVICES',
      MAX_AMOUNT: 10.5,
      LIMITS: {min: '0.001', networks: ['BITCOIN']},
      ROLLOUT: ['flyover', 'powpeg'],
    });
  });

  it('drops flags holding no value', async () => {
    const fetchStub = sinon.stub();
    fetchStub.onCall(0).resolves(loginResponse());
    fetchStub.onCall(1).resolves(
      flagsResponse([
        {key: 'FLYOVER', value: null},
        {key: 'UNION_BRIDGE', value: undefined},
        {key: 'POWPEG', value: false},
      ]),
    );
    const service = newService(fetchStub);
    const retrieved = await service.getProviderFlags();
    expect(retrieved?.flags).to.eql({POWPEG: false});
  });

  describe('providers', () => {
    const pair = (attributes: Record<string, unknown>) => ({
      id: 9,
      fromNetwork: 'BITCOIN',
      toNetwork: 'ROOTSTOCK',
      fromToken: 'BTC',
      toToken: 'RBTC',
      enabled: true,
      ...attributes,
    });

    const retrieveProviders = async (providers: unknown) => {
      const fetchStub = sinon.stub();
      fetchStub.onCall(0).resolves(loginResponse());
      fetchStub.onCall(1).resolves(flagsResponse([{key: 'FLYOVER', value: true}], providers));
      return (await newService(fetchStub).getProviderFlags())?.providers;
    };

    it('keeps the enabled pairs of an enabled provider, and nothing else about it', async () => {
      const providers = await retrieveProviders([
        {
          id: 3,
          key: 'BOLTZ',
          displayName: 'Boltz',
          enabled: true,
          pairs: [pair({id: 9}), pair({id: 10, fromToken: 'RBTC', enabled: false})],
        },
      ]);
      expect(providers).to.eql([
        {
          key: 'BOLTZ',
          enabled: true,
          pairs: [
            {
              id: 9,
              fromNetwork: 'BITCOIN',
              toNetwork: 'ROOTSTOCK',
              fromToken: 'BTC',
              toToken: 'RBTC',
              enabled: true,
            },
          ],
        },
      ]);
    });

    it('nests no pairs under a disabled provider', async () => {
      const providers = await retrieveProviders([
        {id: 2, key: 'CHANGELLY', enabled: false, pairs: [pair({})]},
      ]);
      expect(providers).to.eql([{key: 'CHANGELLY', enabled: false, pairs: []}]);
    });

    it('passes through attributes the backoffice adds to a pair', async () => {
      const providers = await retrieveProviders([
        {
          id: 5,
          key: 'SYMBIOSIS',
          enabled: true,
          pairs: [pair({minAmount: '0.001', maxAmount: '1.5'})],
        },
      ]);
      expect(providers?.[0].pairs[0].minAmount).to.equal('0.001');
      expect(providers?.[0].pairs[0].maxAmount).to.equal('1.5');
    });

    it('ignores providers without a key and a boolean enabled', async () => {
      const providers = await retrieveProviders([
        {id: 1, key: 'MOCK', enabled: 'yes', pairs: []},
        {id: 2, enabled: true, pairs: []},
        {id: 3, key: 'BOLTZ', enabled: true, pairs: []},
      ]);
      expect(providers).to.eql([{key: 'BOLTZ', enabled: true, pairs: []}]);
    });

    it('resolves an empty provider list when the payload carries none', async () => {
      expect(await retrieveProviders(undefined)).to.eql([]);
      expect(await retrieveProviders({not: 'an array'})).to.eql([]);
      expect(await retrieveProviders([{id: 1, key: 'MOCK', enabled: true}])).to.eql([
        {key: 'MOCK', enabled: true, pairs: []},
      ]);
    });
  });

  describe('applyProviderFlags()', () => {
    it('appends missing provider features and overwrites existing ones', () => {
      const existing = new FeaturesDbDataModel();
      existing.name = 'flyover';
      existing.value = 'enabled';
      existing.version = 1;
      const merged = applyProviderFlags([existing], {
        flags: {
          FLYOVER: false,
          UNION_BRIDGE: true,
          POWPEG: false,
          NEW_PROVIDER: true,
        },
        providers: [],
      });
      const byName = new Map(merged.map(feature => [feature.name, feature.value]));
      expect(merged.length).to.equal(4);
      expect(byName.get('flyover')).to.equal('disabled');
      expect(byName.get('union_bridge')).to.equal('enabled');
      expect(byName.get('powpeg')).to.equal('disabled');
      expect(byName.get('new_provider')).to.equal('enabled');
    });

    it('does not let a boolean flag overwrite a feature holding text', () => {
      const terms = new FeaturesDbDataModel();
      terms.name = 'terms_and_conditions';
      terms.value = '# TERMS OF SERVICES';
      const merged = applyProviderFlags([terms], {
        flags: {TERMS_AND_CONDITIONS: true},
        providers: [],
      });
      expect(merged.length).to.equal(1);
      expect(merged[0].value).to.equal('# TERMS OF SERVICES');
    });

    it('serves string, number and JSON flag values as they stand', () => {
      const limits = {min: '0.001', networks: ['BITCOIN']};
      const merged = applyProviderFlags([], {
        flags: {
          TERMS_AND_CONDITIONS: '# BACKOFFICE TERMS',
          MAX_AMOUNT: 10.5,
          LIMITS: limits,
          FLYOVER: true,
        },
        providers: [],
      });
      const byName = new Map(merged.map(feature => [feature.name, feature.value]));
      expect(byName.get('terms_and_conditions')).to.equal('# BACKOFFICE TERMS');
      expect(byName.get('max_amount')).to.equal(10.5);
      expect(byName.get('limits')).to.eql(limits);
      expect(byName.get('flyover')).to.equal('enabled');
    });

    it('lets a non-boolean flag replace the stored value', () => {
      const terms = new FeaturesDbDataModel();
      terms.name = 'terms_and_conditions';
      terms.value = '# STORED TERMS';
      const merged = applyProviderFlags([terms], {
        flags: {TERMS_AND_CONDITIONS: '# BACKOFFICE TERMS'},
        providers: [],
      });
      expect(merged.length).to.equal(1);
      expect(merged[0].value).to.equal('# BACKOFFICE TERMS');
    });

    it('appends a feature per provider with its pairs nested', () => {
      const pairs = [
        {
          fromNetwork: 'BITCOIN',
          toNetwork: 'ROOTSTOCK',
          fromToken: 'BTC',
          toToken: 'RBTC',
          enabled: true,
        },
      ];
      const merged = applyProviderFlags([], {
        flags: {},
        providers: [
          {key: 'BOLTZ', enabled: true, pairs},
          {key: 'CHANGELLY', enabled: false, pairs: []},
        ],
      });
      const byName = new Map(merged.map(feature => [feature.name, feature]));
      expect(merged.length).to.equal(2);
      expect(byName.get('boltz')?.value).to.equal('enabled');
      expect(byName.get('boltz')).to.have.property('pairs', pairs);
      expect(byName.get('changelly')?.value).to.equal('disabled');
      expect(byName.get('changelly')).to.have.property('pairs', []);
    });

    it('nests the pairs on a locally stored feature carrying the provider name', () => {
      const local = new FeaturesDbDataModel();
      local.name = 'boltz';
      local.value = 'disabled';
      const merged = applyProviderFlags([local], {
        flags: {},
        providers: [{key: 'BOLTZ', enabled: true, pairs: []}],
      });
      expect(merged.length).to.equal(1);
      expect(merged[0].value).to.equal('enabled');
      expect(merged[0]).to.have.property('pairs', []);
    });
  });
});
