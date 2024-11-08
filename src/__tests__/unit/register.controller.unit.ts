import {ExpressContextStub, StubbedInstanceWithSinonAccessor, createStubInstance, expect, sinon, stubExpressContext} from '@loopback/testlab';
import {RegisterController} from '../../controllers/register.controller';
import {RegisterService} from '../../services/register.service';
import {RegisterPayload} from '../../models';
import {SessionRepository} from '../../repositories';
import * as constants from '../../constants';
import {FlyoverService} from '../../services';

describe('RegisterController', () => {
  let registerController: RegisterController;
  let registerService: RegisterService;
  let flyoverService: FlyoverService;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let context: ExpressContextStub;
  let register: sinon.SinonStub;
  let registerFlyover: sinon.SinonStub;
  let get: sinon.SinonStub;
  let payload = new RegisterPayload({
    txHash: '0x',
    type: constants.TX_TYPE_PEGIN,
    value: 0.005,
    wallet: 'liquality',
    fee: 0.000001,
  });
  let pegoutPayload = new RegisterPayload({
    txHash: '0xb',
    type: constants.TX_TYPE_PEGOUT,
    value: 0.004,
    wallet: 'liquality',
    fee: 0.000002,
  });
  let flyoverPayload = new RegisterPayload({
    txHash: '0xc',
    type: constants.TX_TYPE_PEGOUT,
    value: 0.005,
    wallet: 'wallet',
    fee: 0.000001,
    provider: 'test provider',
    details: {
      blocksToCompleteTransaction: 2,
    },
    quote: {
        callFeeOnWei: 800n,
        depositAddr: "testDeposit",
        depositConfirmations: 200,
        depositDateLimit: 49800,
        expireBlocks: 100,
        expireDate: 49850,
        productFeeAmountOnWei: 6300n,
        transferConfirmations: 80,
        transferTime: 50600,
        valueOnWei: 18450n,
        agreementTimestamp: 1620000000,
        gasFeeOnWei: 1000000000000000000n,
        nonce: 1n,
        penaltyFeeOnWei: 1000000000000000000n,
        btcRefundAddress: "testBtcRefund",
        lbcAddress: "testLbc",
        lpBtcAddress: "testLpBtc",
        rskRefundAddress: "testRskRefund",
        liquidityProviderRskAddress: "testLiquidityProviderRsk",
    },
  });
  beforeEach(reset);
  function reset() {
    context = stubExpressContext();
    registerService = createStubInstance(RegisterService);
    flyoverService = createStubInstance(FlyoverService);
    sessionRepository = createStubInstance(SessionRepository);
    get = sessionRepository.get as sinon.SinonStub;
    register = registerService.register as sinon.SinonStub;
    registerFlyover = flyoverService.register as sinon.SinonStub;
    registerController = new RegisterController(
      registerService,
      flyoverService,
      context.response,
      sessionRepository,
    );
  }

  it('should register a pegin', async () => {
    register.resolves(true);
    get.resolves('43ef33c59294d5033d96cb25b8f94723');
    await registerController.register(payload);
    const result = await context.result;
    sinon.assert.called(register);
    expect(result.statusCode).to.equal(200);
  });

  it('should register a pegout', async () => {
    await registerController.register(pegoutPayload);
    const result = await context.result;
    sinon.assert.called(register);
    expect(result.statusCode).to.equal(200);
  });
  it('should not store flyover transaction without provider', async () => {
    await registerController.register(payload);
    const result = await context.result;
    sinon.assert.notCalled(registerFlyover);
    expect(result.statusCode).to.equal(200);
  });
  it('should store flyover transaction', async () => {
    await registerController.register(flyoverPayload);
    const result = await context.result;
    sinon.assert.called(registerFlyover);
    expect(result.statusCode).to.equal(200);
  });
});
