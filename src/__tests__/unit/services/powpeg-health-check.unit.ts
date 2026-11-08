import {
  createStubInstance,
  expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {BridgeService} from '../../../services';
import {
  PowpegHealthCheck,
  ProviderCheckFailure,
} from '../../../services/provider-health';

/** 0.005 BTC, the minimum peg-in on mainnet and testnet today. */
const MINIMUM_PEGIN = 500_000;
const FEDERATION_ADDRESS = '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB';

describe('PowPeg health check', () => {
  let bridgeService: StubbedInstanceWithSinonAccessor<BridgeService>;
  let powpegCheck: PowpegHealthCheck;

  beforeEach(() => {
    bridgeService = createStubInstance(BridgeService);
    bridgeService.stubs.getFederationAddress.resolves(FEDERATION_ADDRESS);
    bridgeService.stubs.getMinPeginValue.resolves(MINIMUM_PEGIN);
    bridgeService.stubs.getRemainingPeginCapacity.resolves(MINIMUM_PEGIN * 10);
    powpegCheck = new PowpegHealthCheck(bridgeService);
  });

  it('reports under the powpeg key', () => {
    expect(powpegCheck.provider).to.equal('powpeg');
  });

  it('passes when the bridge answers and has room for a minimum peg-in', async () => {
    await powpegCheck.check();

    expect(bridgeService.stubs.getFederationAddress.calledOnce).to.be.true();
    expect(bridgeService.stubs.getRemainingPeginCapacity.calledOnce).to.be.true();
    expect(bridgeService.stubs.getMinPeginValue.calledOnce).to.be.true();
  });

  it('passes when the bridge has room for exactly one minimum peg-in', async () => {
    bridgeService.stubs.getRemainingPeginCapacity.resolves(MINIMUM_PEGIN);

    await powpegCheck.check();
  });

  it('fails with no_capacity when less than one minimum peg-in is left', async () => {
    bridgeService.stubs.getRemainingPeginCapacity.resolves(MINIMUM_PEGIN - 1);

    const err = await powpegCheck.check().then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(err).to.be.instanceOf(ProviderCheckFailure);
    expect((err as ProviderCheckFailure).reason).to.equal('no_capacity');
  });

  it('fails with no_capacity when the locking cap is reached', async () => {
    bridgeService.stubs.getRemainingPeginCapacity.resolves(0);

    await expect(powpegCheck.check()).to.be.rejectedWith(
      ProviderCheckFailure,
      {reason: 'no_capacity'},
    );
  });

  it('fails with error when the bridge returns no federation address', async () => {
    bridgeService.stubs.getFederationAddress.resolves('');

    await expect(powpegCheck.check()).to.be.rejectedWith(
      ProviderCheckFailure,
      {reason: 'error'},
    );
  });

  it('passes a failed bridge call on as its own error', async () => {
    // Classifying it (timeout, refused, ...) is the job's work, not the
    // check's, so the original error must reach the job unchanged.
    const bridgeDown = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    bridgeService.stubs.getFederationAddress.rejects(bridgeDown);

    const err = await powpegCheck.check().then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(err).to.equal(bridgeDown);
  });
});
