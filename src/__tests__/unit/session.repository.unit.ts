import {
  createStubInstance,
  expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {SessionRepository} from '../../repositories';
import {TxFeeController} from '../../controllers';
import {FeeLevel} from '../../services';
import {sinon} from '@loopback/testlab/dist/sinon';
import {getMockInputs, getUtxoList} from '../helper';
import {FeeAmountData, FeeRequestData, Session} from '../../models';
import * as constants from '../../constants';
import {config} from 'dotenv';
import {RedisDataSource} from '../../datasources';

config();

describe('Session Repository', () => {
  let controller: TxFeeController;
  let feeLevelService: FeeLevel;
  let feeProvider: sinon.SinonStub;
  let findAccountUtxos: sinon.SinonStub;
  let getAccountInputs: sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  beforeEach(resetRepositories);

  function resetRepositories() {
    feeLevelService = {feeProvider: sinon.stub()};
    feeProvider = feeLevelService.feeProvider as sinon.SinonStub;
    sessionRepository = createStubInstance(SessionRepository);
    findAccountUtxos = sessionRepository.findAccountUtxos as sinon.SinonStub;
    getAccountInputs = sessionRepository.getAccountInputs as sinon.SinonStub;
    controller = new TxFeeController(sessionRepository, feeLevelService);
  }

  it('should return the tx fee given provided utxos', async () => {
    const fast: number = process.env.FAST_MINING_BLOCK
      ? +process.env.FAST_MINING_BLOCK
      : 1;
    const average: number = process.env.AVERAGE_MINING_BLOCK
      ? +process.env.AVERAGE_MINING_BLOCK
      : 6;
    const slow: number = process.env.LOW_MINING_BLOCK
      ? +process.env.LOW_MINING_BLOCK
      : 12;
    feeProvider.withArgs(fast).resolves(['0.00003']);
    feeProvider.withArgs(average).resolves(['0.00002']);
    feeProvider.withArgs(slow).resolves(['0.00001']);
    findAccountUtxos.resolves(getUtxoList());
    getAccountInputs.resolves(getMockInputs());
    const sessionId = 'test_id';
    const request = new FeeRequestData({
      sessionId,
      amount: 0.00004,
      accountType: constants.BITCOIN_LEGACY_ADDRESS,
    });
    const feeAmount = await controller.getTxFee(request);
    expect(feeAmount.slow).to.eql(338);
    expect(feeAmount.average).to.eql(676);
    expect(feeAmount.fast).to.eql(1014);
  });

  it('should return the appropriate fee level', async () => {
    const sessionId = 'test_id';
    const dummySessionRepository = new SessionRepository(new RedisDataSource());
    const getStub = sinon.stub(dummySessionRepository, 'get');

    getStub.withArgs(sessionId).resolves(
      new Session({
        _id: 'test_id',
        balance: 6,
        fees: new FeeAmountData({slow: 1, average: 2, fast: 3}),
      }),
    );

    const slowFeeLevel = await dummySessionRepository.getFeeLevel(
      sessionId,
      constants.BITCOIN_SLOW_FEE_LEVEL,
    );
    const averageFeeLevel = await dummySessionRepository.getFeeLevel(
      sessionId,
      constants.BITCOIN_AVERAGE_FEE_LEVEL,
    );
    const fastFeeLevel = await dummySessionRepository.getFeeLevel(
      sessionId,
      constants.BITCOIN_FAST_FEE_LEVEL,
    );

    expect(slowFeeLevel).to.eql(1);
    expect(averageFeeLevel).to.eql(2);
    expect(fastFeeLevel).to.eql(3);

    try {
      await dummySessionRepository.getFeeLevel(sessionId, 'WRONG_FEE_LEVEL');
    } catch (e) {
      expect(e).to.eql(new Error(`Wrong Fee Level: ${'WRONG_FEE_LEVEL'}`));
    }

    try {
      getStub.withArgs(sessionId).resolves(
        new Session({
          _id: 'test_id',
          balance: 6,
          fees: undefined,
        }),
      );

      await dummySessionRepository.getFeeLevel(
        sessionId,
        constants.BITCOIN_SLOW_FEE_LEVEL,
      );
    } catch (e) {
      expect(e).to.eql(
        new Error(`There is not fee amount stored for sessionId ${sessionId}`),
      );
    }
  });

  it('should return an empty array for undefined inputs', async () => {
    const sessionId = 'test_id';
    const dummySessionRepository = new SessionRepository(new RedisDataSource());
    const getStub = sinon.stub(dummySessionRepository, 'get');

    getStub.withArgs(sessionId).resolves(
      new Session({
        _id: 'test_id',
        balance: 6,
        fees: new FeeAmountData({slow: 1, average: 2, fast: 3}),
        inputs: undefined,
      }),
    );

    const dummyInputs = await dummySessionRepository.getAccountInputs(
      sessionId,
    );
    expect(dummyInputs.length).to.eql(0);
  });
});
