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
    value: '5000000000000000',
    wallet: 'liquality',
    fee: '1000000000000',
  });
  let pegoutPayload = new RegisterPayload({
    txHash: '0xb',
    type: constants.TX_TYPE_PEGOUT,
    value: '4000000000000000',
    wallet: 'liquality',
    btcEstimatedFee: "8790",
    rskGas: "211226840000",
  });
  let flyoverPayload = new RegisterPayload({
    txHash: '0xc',
    type: constants.TX_TYPE_PEGOUT,
    value: '5000000000000000',
    wallet: 'wallet',
    fee: '1000000000000',
    rskGas: "17990000000000",
    provider: 'test provider',
    details: {
      blocksToCompleteTransaction: '2',
    },
    quote: {
        callFeeOnWei: '800',
        depositAddr: "testDeposit",
        depositConfirmations: '200',
        depositDateLimit: '49800',
        expireBlocks: '100',
        expireDate: '49850',
        productFeeAmountOnWei: '6300',
        transferConfirmations: '80',
        transferTime: '50600',
        valueOnWei: '18450',
        agreementTimestamp: '1620000000',
        gasFeeOnWei: '1000000000000000000',
        nonce: '1000000000000000000',
        penaltyFeeOnWei: '1000000000000000000',
        btcRefundAddress: "testBtcRefund",
        lbcAddress: "testLbc",
        lpBtcAddress: "testLpBtc",
        rskRefundAddress: "testRskRefund",
        liquidityProviderRskAddress: "testLiquidityProviderRsk",
    },
  });
  let flyoverPayload2 = new RegisterPayload({
      txHash: '0xc',
      type: constants.TX_TYPE_PEGOUT,
      value: '5000000000000000',
      wallet: 'wallet',
      fee: '1000000000000',
      provider: 'test provider',
      details: {
        blocksToCompleteTransaction: '2',
      },
      quote: {
        callFeeOnWei: '-800',
        depositAddr: "testDeposit",
        depositConfirmations: '200',
        depositDateLimit: '49800',
        expireBlocks: '100',
        expireDate: '49850',
        productFeeAmountOnWei: '6300',
        transferConfirmations: '80',
        transferTime: '50600',
        valueOnWei: '18450',
        agreementTimestamp: '1620000000',
        gasFeeOnWei: '-1000000000000000000',
        nonce: '1000000000000000000',
        penaltyFeeOnWei: '1000000000000000000',
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
    it('should not store flyover transaction if has negative values', async () => {
    await registerController.register(flyoverPayload2);
    const result = await context.result;
    expect(result.statusCode).to.equal(400);
  });
});
