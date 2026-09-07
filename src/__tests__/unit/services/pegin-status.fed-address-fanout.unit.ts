import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {BitcoinTx} from '../../../models/bitcoin-tx.model';
import {Status} from '../../../models/pegin-status.model';
import {Vin} from '../../../models/vin.model';
import {Vout} from '../../../models/vout.model';
import {BitcoinService, BridgeService, PeginStatusService} from '../../../services';
import {PeginStatusMongoDbDataService} from '../../../services/pegin-status-data-services/pegin-status-mongo.service';
import {runWithTraceId} from '../../../utils/trace-context';

const FED_ADDRESS = '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB';
const OLD_FED_ADDRESS = '2N6JWYUb6Li4Kux6UB2eihT7n3rm3YX97uv';
const SENDER = '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W';

/**
 * The worst case, and the one an attacker supplies: no output is a federation
 * address, so the loop never returns early and runs to the end.
 */
const voutsWithoutFedAddress = (count: number): Vout[] =>
  Array.from({length: count}, (_, i) => {
    const vout = new Vout();
    vout.isAddress = true;
    vout.addresses = [`2NotAFederationAddress${i}`];
    vout.value = 0;
    vout.hex = 'a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b987';
    return vout;
  });

const fedVout = (address = FED_ADDRESS): Vout => {
  const vout = new Vout();
  vout.isAddress = true;
  vout.addresses = [address];
  vout.value = 500000;
  vout.hex = 'a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b987';
  return vout;
};

const txWith = (vout: Vout[]): BitcoinTx => {
  const tx = new BitcoinTx();
  tx.txId = 'a'.repeat(64);
  const vin = new Vin();
  vin.addresses = [SENDER];
  tx.vin = [vin];
  tx.vout = vout;
  tx.hex =
    '020000000001019b42ab3e8e2f29173cc440544b6d8bdcd7d46ff6197035f06ce38ae92fbd89260100000000fdffffff02b00400000000000017a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b98714a6130000000000160014438ba205a91b42778afc09ada1ad567596fdb1990247304402202149f5201c13d0b33d5dfc8af09d1b95920b409f6c05056eac70a79c202d92e2022031bebf341c45dd64166219f21c49de4c45357657bfc2fdd78f11336af53cc366012103284708827bfced592524611c7a3963a8ae634088d9265a32d6ccc12cbc16b111277f1f00';
  tx.confirmations = 200;
  return tx;
};

const givenService = (tx: BitcoinTx): PeginStatusService => {
  const bitcoinService = sinon.createStubInstance(
    BitcoinService,
  ) as SinonStubbedInstance<BitcoinService> & BitcoinService;
  bitcoinService.getTx.resolves(tx);

  // A plain object rather than `createStubInstance`, which would try to wrap the
  // prototype method this suite has already stubbed. This is the bridge service
  // the *service* holds, and it is not the one the federation lookup uses — see
  // `getFederationAddress` below.
  const bridgeService = {
    getMinPeginValue: async () => 1,
  } as unknown as BridgeService;

  const dataService = sinon.createStubInstance(PeginStatusMongoDbDataService);
  dataService.getById.resolves(undefined);

  return new PeginStatusService(bitcoinService, dataService, bridgeService);
};

/**
 * One `eth_call` to the RSK node per HTTP request, not per transaction output.
 *
 * `getTxDestinationFedAddress` calls `isAFedAddress` for every output, and that
 * used to resolve the federation address from the Bridge every single time. The
 * loop returns on the first federation output it finds, so the expensive case is
 * a transaction with none — which is what an attacker picks, and needs no crafted
 * transaction, only a txid that already exists with enough outputs.
 *
 * The service itself is unchanged: the memo is underneath it, in
 * `federation-addresses.ts`. What these assert is that the fan-out is gone *and*
 * that the answers did not change with it.
 */
describe('Service: PeginStatusService federation address fan-out', () => {
  const OUTPUTS = 500;
  let getFederationAddress: sinon.SinonStub;
  let previousHistory: string | undefined;

  beforeEach(() => {
    // Saved and put back in `afterEach`. `.env.test` sets this, and the existing
    // pegin-status suite depends on the address it names — a suite that leaves it
    // changed breaks whichever file mocha happens to load next.
    previousHistory = process.env.FEDERATION_ADDRESSES_HISTORY;
    process.env.FEDERATION_ADDRESSES_HISTORY = '';
    // Stubbed on the prototype rather than on an instance: the lookup goes
    // through a module-scope `BridgeService` created at import time in
    // `federation-addresses.ts`, which no test can reach by injection. Without
    // this the suite would call the real testnet node once per output.
    getFederationAddress = sinon
      .stub(BridgeService.prototype, 'getFederationAddress')
      .resolves(FED_ADDRESS);
  });

  afterEach(() => {
    sinon.restore();
    if (previousHistory === undefined) {
      delete process.env.FEDERATION_ADDRESSES_HISTORY;
    } else {
      process.env.FEDERATION_ADDRESSES_HISTORY = previousHistory;
    }
  });

  it('asks the Bridge exactly once for a transaction with no federation output', async () => {
    // The worst case: 500 outputs, none of them the federation, so the loop runs
    // to the end. It used to make 500 calls.
    const service = givenService(txWith(voutsWithoutFedAddress(OUTPUTS)));

    await runWithTraceId('t', () =>
      service.getPeginStatusInfo('a'.repeat(64)),
    );

    sinon.assert.calledOnce(getFederationAddress);
  }).timeout(20000);

  it('still finds a federation output in the last position', async () => {
    // The happy path the memo must not change. A `Set` built wrong is the one
    // way this work could fail silently, so it is asserted on the result and not
    // only on the call count.
    process.env.FEDERATION_ADDRESSES_HISTORY = '';
    const vouts = [...voutsWithoutFedAddress(OUTPUTS - 1), fedVout()];
    const service = givenService(txWith(vouts));

    const result = await runWithTraceId('t', () =>
      service.getPeginStatusInfo('a'.repeat(64)),
    );

    expect(result.btc.federationAddress).to.equal(FED_ADDRESS);
    sinon.assert.calledOnce(getFederationAddress);
  }).timeout(20000);

  it('recognises a historical federation address too', async () => {
    process.env.FEDERATION_ADDRESSES_HISTORY = OLD_FED_ADDRESS;
    const vouts = [...voutsWithoutFedAddress(10), fedVout(OLD_FED_ADDRESS)];
    const service = givenService(txWith(vouts));

    const result = await runWithTraceId('t', () =>
      service.getPeginStatusInfo('a'.repeat(64)),
    );

    expect(result.btc.federationAddress).to.equal(OLD_FED_ADDRESS);
  }).timeout(20000);

  it('reports no pegin when no output is the federation', async () => {
    const service = givenService(txWith(voutsWithoutFedAddress(10)));

    const result = await runWithTraceId('t', () =>
      service.getPeginStatusInfo('a'.repeat(64)),
    );

    expect(result.status).to.equal(Status.ERROR_NOT_A_PEGIN);
  }).timeout(20000);

  it('tolerates a transaction with no outputs at all', async () => {
    // The loop guards on `vout &&`, and that guard has never had a test.
    const service = givenService(txWith([]));

    const result = await runWithTraceId('t', () =>
      service.getPeginStatusInfo('a'.repeat(64)),
    );

    expect(result.status).to.equal(Status.ERROR_NOT_A_PEGIN);
  }).timeout(20000);

  it('makes one call per request, not one for all of them', async () => {
    // Guards the scope from the other side: a process-wide cache would make this
    // one call, and would also make the federation state stale across a change.
    const service = givenService(txWith(voutsWithoutFedAddress(10)));

    await runWithTraceId('a', () => service.getPeginStatusInfo('a'.repeat(64)));
    await runWithTraceId('b', () => service.getPeginStatusInfo('a'.repeat(64)));

    expect(getFederationAddress.callCount).to.equal(2);
  }).timeout(20000);
});
