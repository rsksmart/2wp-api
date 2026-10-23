import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {PegoutStatuses} from '../../../models/rsk/pegout-status-data-model';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {PegoutDataProcessor} from '../../../services/pegout-data.processor';
import {PegoutStatusDataService} from '../../../services/pegout-status-data-services/pegout-status-data.service';
import {PegoutStatusService} from '../../../services/pegout-status/pegout-status.service';
import {RskNodeService} from '../../../services/rsk-node.service';
import {
  assertBridgeSelectorAllowed,
  BRIDGE_METHODS,
  getBridgeSignature,
  PEGOUT_ROUTE_SELECTORS,
} from '../../../utils/bridge-utils';

/** `registerFastBridgeBtcTransaction` — the permissionless method at issue. */
const FLYOVER_SELECTOR = '0x6adc0133';
const rskTxHash = `0x${'d2'.repeat(32)}`;

/**
 * Defence in depth behind the size bound.
 *
 * The size bound stops the process dying. This stops the pegout route decoding
 * methods it has no business decoding in the first place —
 * `registerFastBridgeBtcTransaction` is permissionless, is not a pegout method,
 * and is the one the hostile payload rides on.
 */
describe('Utils: bridge selector allowlist', () => {
  it('rejects registerFastBridgeBtcTransaction', () => {
    expect(() =>
      assertBridgeSelectorAllowed(`${FLYOVER_SELECTOR}${'ab'.repeat(64)}`),
    ).to.throw(/selector/);
  });

  it('rejects the other permissionless methods', () => {
    // getBtcTransactionConfirmations and receiveHeaders are both callable by
    // anyone and neither is a pegout method. The size bound already covers
    // them; this makes the coverage intentional rather than incidental.
    ['0x5b644587', '0xe5400e7b'].forEach(selector => {
      expect(() => assertBridgeSelectorAllowed(selector)).to.throw(/selector/);
    });
  });

  it('accepts every selector the pegout processor declares', () => {
    new PegoutDataProcessor(
      undefined as never,
      undefined as never,
    )
      .getFilters()
      .forEach(filter => {
        expect(() =>
          assertBridgeSelectorAllowed(filter.abiEncodedSignature),
        ).to.not.throw();
      });
  });

  it('accepts empty calldata, which is how a pegout is requested', () => {
    expect(() => assertBridgeSelectorAllowed('0x')).to.not.throw();
  });

  it('derives the allowlist from the daemon filters rather than restating them', () => {
    // `docs/resource-budgets.md` already warns that these selectors are
    // load-bearing: filtering happens before the decode, so a selector drifting
    // between two definitions stops indexing a method rather than merely
    // decoding it and discarding the result. A hand-written second copy is that
    // drift waiting to happen.
    expect(PEGOUT_ROUTE_SELECTORS).to.deepEqual(
      new Set(
        new PegoutDataProcessor(undefined as never, undefined as never)
          .getFilters()
          .map(filter => filter.abiEncodedSignature),
      ),
    );
  });

  it('pins which selectors are on it', () => {
    // The derivation test above says the two lists are one list. It cannot say
    // the list is right — deriving `getFilters()` from the set makes any change
    // agree with itself. This is what notices a method being dropped: losing
    // `releaseBtc` here would stop the route resolving completed pegouts and
    // stop the daemon indexing them, both silently.
    expect([...PEGOUT_ROUTE_SELECTORS].sort()).to.deepEqual(
      [
        '0x0c5a9990', // updateCollections
        '0xf10b9c59', // addSignature
        '0x80af2871', // releaseBtc
        '0x', // empty calldata: the pegout request itself
      ].sort(),
    );
  });

  it('accepts by name exactly what it accepts by selector', () => {
    // `isMethodAccepted` applies the same policy after the decode, by method
    // name. It was a third hand-written copy of the list; a method dropped from
    // one and not the others stops being processed with nothing saying so.
    const processor = new PegoutDataProcessor(
      undefined as never,
      undefined as never,
    );
    const acceptedByName = (name: string) =>
      processor.isMethodAccepted({method: {name}} as never);

    ['updateCollections', 'addSignature', 'releaseBtc', ''].forEach(name => {
      expect(acceptedByName(name)).to.be.true();
    });
    ['registerFastBridgeBtcTransaction', 'receiveHeaders'].forEach(name => {
      expect(acceptedByName(name)).to.be.false();
    });
  });

  it('fails closed on calldata it cannot read a selector from', () => {
    [undefined, null, '', 'sin-prefijo', 42].forEach(bad => {
      expect(() => assertBridgeSelectorAllowed(bad as never)).to.throw(
        /selector/,
      );
    });
  });

  it('names only the selector, never the calldata behind it', () => {
    let caught: any = null;
    try {
      assertBridgeSelectorAllowed(`${FLYOVER_SELECTOR}${'ab'.repeat(2048)}`);
    } catch (err) {
      caught = err;
    }

    expect(caught.message).to.match(/0x6adc0133/);
    expect(caught.message).to.not.match(/abab/);
    expect(caught.message.length).to.be.below(200);
  });
});

describe('Service: PegoutStatusService selector gating', () => {
  const givenRskTransaction = (data: string): RskTransaction =>
    ({
      blockHash: '0x00002',
      hash: rskTxHash,
      data,
      createdOn: new Date(0),
      blockHeight: 1,
      to: '0x0000000000000000000000000000000001000006',
      value: 0,
      from: '0x4495768E683423a4299d6a7F02a0689a6Ff5a0a4',
      receipt: {status: 1},
    } as unknown as RskTransaction);

  let rskNodeService: sinon.SinonStubbedInstance<RskNodeService> & RskNodeService;
  let service: PegoutStatusService;
  let previousHost: string | undefined;

  before(() => {
    // The service builds a Web3 from this at construction, and web3 refuses an
    // undefined provider. Nothing here talks to it — every node call is stubbed.
    previousHost = process.env.RSK_NODE_HOST;
    process.env.RSK_NODE_HOST = 'https://public-node.testnet.rsk.co';
  });

  after(() => {
    process.env.RSK_NODE_HOST = previousHost;
  });

  beforeEach(() => {
    rskNodeService = sinon.createStubInstance(
      RskNodeService,
    ) as sinon.SinonStubbedInstance<RskNodeService> & RskNodeService;
    service = new PegoutStatusService(
      {
        getLastByOriginatingRskTxHashNewest: sinon.stub().resolves(null),
      } as unknown as PegoutStatusDataService,
      rskNodeService,
    );
  });

  it('never decodes a flyover transaction on the pegout route', async () => {
    rskNodeService.getTransaction.resolves(
      givenRskTransaction(`${FLYOVER_SELECTOR}${'ab'.repeat(64)}`),
    );

    const result = await service.getPegoutStatusByRskTxHash(rskTxHash);

    expect(result.status).to.equal(PegoutStatuses.NOT_FOUND);
    sinon.assert.notCalled(rskNodeService.getBridgeTransaction);
  });

  it('still decodes the pegout methods', async () => {
    rskNodeService.getTransaction.resolves(
      givenRskTransaction(getBridgeSignature(BRIDGE_METHODS.RELEASE_BTC)),
    );
    rskNodeService.getBridgeTransaction.resolves(undefined);

    await service.getPegoutStatusByRskTxHash(rskTxHash);

    sinon.assert.calledOnce(rskNodeService.getBridgeTransaction);
  });
});
