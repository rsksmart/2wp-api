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
import {FeeRequestData} from '../../models';
import * as constants from '../../constants';
import {config} from 'dotenv';

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
    expect(feeAmount.slow).to.eql(280);
    expect(feeAmount.average).to.eql(518);
    expect(feeAmount.fast).to.eql(777);
  });
});
