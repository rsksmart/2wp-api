import {expect} from '@loopback/testlab';
import {
  ProviderHealthState,
  ProviderHealthStore,
} from '../../../services/provider-health';

function result(
  status: 'up' | 'down',
  overrides: Partial<ProviderHealthState> = {},
): ProviderHealthState {
  const at = new Date('2026-11-08T10:00:00Z');
  return {
    status,
    since: at,
    reason: status === 'up' ? null : 'timeout',
    durationMs: 120,
    checkedAt: at,
    opposingStreak: 0,
    ...overrides,
  };
}

describe('Provider health: store', () => {
  let store: ProviderHealthStore;

  beforeEach(() => {
    store = new ProviderHealthStore();
  });

  it('holds nothing before the first check ends', () => {
    expect(store.get('powpeg')).to.be.undefined();
    expect(store.list()).to.deepEqual([]);
  });

  it('returns what was stored for a provider', () => {
    store.set('powpeg', result('down'));

    expect(store.get('powpeg')).to.deepEqual(result('down'));
  });

  it('replaces a provider result with the next one', () => {
    store.set('powpeg', result('up'));
    store.set('powpeg', result('down', {durationMs: 10_000}));

    expect(store.get('powpeg')).to.deepEqual(result('down', {durationMs: 10_000}));
    expect(store.list()).to.have.length(1);
  });

  it('treats provider keys in any case as the same provider', () => {
    store.set('PowPeg', result('up'));

    expect(store.get('powpeg')).to.deepEqual(result('up'));
    expect(store.list().map(e => e.provider)).to.deepEqual(['powpeg']);
  });

  it('lists every provider, sorted by key, with its key', () => {
    store.set('powpeg', result('up'));
    store.set('flyover-lp-2', result('down'));
    store.set('flyover-lp-1', result('up'));

    expect(store.list()).to.deepEqual([
      {provider: 'flyover-lp-1', ...result('up')},
      {provider: 'flyover-lp-2', ...result('down')},
      {provider: 'powpeg', ...result('up')},
    ]);
  });

  it('lists liquidity providers only under the provider they were stored for', () => {
    store.set('flyover', result('up'));
    store.set('powpeg', result('up'));
    store.setLiquidityProviders('Flyover', [{id: 1, name: 'LP', ...result('down')}]);

    const [flyover, powpeg] = store.list();

    expect(flyover.liquidityProviders).to.deepEqual([{id: 1, name: 'LP', ...result('down')}]);
    expect(powpeg).to.not.have.property('liquidityProviders');
  });

  it('is not changed by changing what it returned or was given', () => {
    const given = result('up');
    store.set('powpeg', given);
    given.status = 'down';
    store.list()[0].status = 'down';
    store.get('powpeg')!.status = 'down';

    expect(store.get('powpeg')!.status).to.equal('up');
  });
});
