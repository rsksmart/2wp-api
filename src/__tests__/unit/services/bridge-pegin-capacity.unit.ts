import {expect, sinon} from '@loopback/testlab';
import {BridgeService} from '../../../services';

/** Satoshis to the wei that `getRbtcInCirculation` returns. */
const WEI_PER_SATOSHI = 1e10;
/** 21 000 000 BTC, the locking cap on mainnet and testnet today. */
const LOCKING_CAP = 21_000_000 * 1e8;
/** 1 134.82687791 RBTC, read from mainnet on 2026-11-06. */
const CIRCULATION = 113_482_687_791;

describe('BridgeService: peg-in capacity', () => {
  const sandbox = sinon.createSandbox();
  let bridgeService: BridgeService;
  let maxAllowed: string | undefined;

  beforeEach(() => {
    maxAllowed = process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI;
    delete process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI;
    bridgeService = new BridgeService();
    sandbox.stub(bridgeService, 'getLockingCapAmount').resolves(LOCKING_CAP);
    sandbox
      .stub(bridgeService, 'getRbtcInCirculation')
      .resolves(CIRCULATION * WEI_PER_SATOSHI);
  });

  afterEach(() => {
    sandbox.restore();
    if (maxAllowed === undefined) {
      delete process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI;
    } else {
      process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI = maxAllowed;
    }
  });

  describe('getRemainingPeginCapacity', () => {
    it('is the locking cap minus the RBTC in circulation, in satoshis', async () => {
      expect(await bridgeService.getRemainingPeginCapacity()).to.equal(
        LOCKING_CAP - CIRCULATION,
      );
    });

    it('is zero, not negative, once circulation passes the locking cap', async () => {
      (bridgeService.getLockingCapAmount as sinon.SinonStub).resolves(
        CIRCULATION - 1,
      );

      expect(await bridgeService.getRemainingPeginCapacity()).to.equal(0);
    });

    it('ignores the per-peg-in maximum', async () => {
      // MAX_AMOUNT_ALLOWED_IN_SATOSHI limits one peg-in. Applied here it would
      // report the bridge as nearly full whenever that limit is low.
      process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI = '1000';

      expect(await bridgeService.getRemainingPeginCapacity()).to.equal(
        LOCKING_CAP - CIRCULATION,
      );
    });

    it('rejects when a bridge call fails', async () => {
      const bridgeDown = new Error('bridge down');
      (bridgeService.getRbtcInCirculation as sinon.SinonStub).rejects(bridgeDown);

      await expect(bridgeService.getRemainingPeginCapacity()).to.be.rejectedWith(
        'bridge down',
      );
    });
  });

  describe('getPeginAvailability', () => {
    it('is the remaining capacity when no per-peg-in maximum is set', async () => {
      expect(await bridgeService.getPeginAvailability()).to.equal(
        LOCKING_CAP - CIRCULATION,
      );
    });

    it('is capped by the per-peg-in maximum', async () => {
      process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI = '1000';

      expect(await bridgeService.getPeginAvailability()).to.equal(1000);
    });

    it('rejects when a bridge call fails', async () => {
      const bridgeDown = new Error('bridge down');
      (bridgeService.getLockingCapAmount as sinon.SinonStub).rejects(bridgeDown);

      await expect(bridgeService.getPeginAvailability()).to.be.rejectedWith(
        'bridge down',
      );
    });
  });
});
