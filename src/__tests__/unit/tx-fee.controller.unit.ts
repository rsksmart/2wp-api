import {
  createStubInstance, expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {SessionRepository} from '../../repositories';
import { TxFeeController} from '../../controllers';
import {FeeLevel} from '../../services';
import {config} from 'dotenv';
import {sinon} from '@loopback/testlab/dist/sinon';
import {FeeAmountData, FeeRequestData, TxInput} from '../../models';
import * as constants from '../../constants';

config();

describe('tx Fee controller', () => {
  let feeLevelProvider: FeeLevel;
  let feeProvider: sinon.SinonStub;
  let findAccountUtxos : sinon.SinonStub;
  let setInputs : sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let txFeeController: TxFeeController;
  const sessionId = 'sessionId';
  beforeEach(resetRepositories);

  const utxos1 = [
    {
      address: 'address',
      txid: 'txId1',
      vout: 0,
      amount: '0.0001',
      satoshis: 100000,
      height: 12055,
      confirmations: 3500,
    },
    {
      address: 'address',
      txid: 'txId2',
      vout: 0,
      amount: '0.0001',
      satoshis: 100000,
      height: 12055,
      confirmations: 3500,
    },
    {
      address: 'address',
      txid: 'txId3',
      vout: 0,
      amount: '0.0001',
      satoshis: 100000,
      height: 12055,
      confirmations: 3500,
    },
    {
      address: 'address',
      txid: 'txId4',
      vout: 0,
      amount: '0.0001',
      satoshis: 100000,
      height: 12055,
      confirmations: 3500,
    },
  ];
  const utxos2 = [
    {
      address: 'address',
      txid: 'txId1',
      vout: 0,
      amount: '0.0001',
      satoshis: 100000,
      height: 12055,
      confirmations: 3500,
    },
  ]
  function resetRepositories() {
    feeLevelProvider = {feeProvider: sinon.stub()}
    feeProvider = feeLevelProvider.feeProvider as sinon.SinonStub;
    sessionRepository = createStubInstance(SessionRepository);
    setInputs = sessionRepository.setInputs as sinon.SinonStub;
    findAccountUtxos = sessionRepository.findAccountUtxos as sinon.SinonStub;
    txFeeController = new TxFeeController(sessionRepository, feeLevelProvider)
    const fast = process.env.FAST_MINING_BLOCK ?? 1;
    const average = process.env.AVERAGE_MINING_BLOCK ?? 6;
    const low = process.env.LOW_MINING_BLOCK ?? 12;
    feeProvider.withArgs(+fast).resolves(['0.0001']);
    feeProvider.withArgs(+average).resolves(['0.00005']);
    feeProvider.withArgs(+low).resolves(['0.00001']);
  }
  it('should store a optimal input list given based on fastFee amount', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 96620, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
    expect(setInputs.calledOnceWith(sessionId, [
      new TxInput({
        address: 'address',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        address_n: [0],
        // eslint-disable-next-line @typescript-eslint/naming-convention
        prev_hash: 'txId1',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        prev_index: 0,
        amount: 100000,
      }),
    ], new FeeAmountData({
      slow: 338,
      average: 1690,
      fast: 3380,
    }))).to.be.true();
  });
  it('should add inputs to the optimal input list if the computed value with fee is not enough', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 96621, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
    expect(setInputs.calledOnceWith(sessionId, [
      new TxInput({
        address: 'address',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        address_n: [0],
        // eslint-disable-next-line @typescript-eslint/naming-convention
        prev_hash: 'txId1',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        prev_index: 0,
        amount: 100000,
      }),
      new TxInput({
        address: 'address',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        address_n: [0],
        // eslint-disable-next-line @typescript-eslint/naming-convention
        prev_hash: 'txId2',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        prev_index: 0,
        amount: 100000,
      }),
    ], new FeeAmountData({
      slow: 518,
      average: 2590,
      fast: 5180,
    }))).to.be.true();
  });
  it('should reject the call if the required amount is not satisfied with the utxo sum',   () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos2);
    return expect(txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 96621, accountType: constants.BITCOIN_LEGACY_ADDRESS})))
      .to.be.rejectedWith('The required amount is not satisfied with the current utxo List');
  });
  it('Should reject the call if there are no utxos stored for that ', () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves([]);
    return expect(txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 100, accountType: constants.BITCOIN_LEGACY_ADDRESS})))
      .to.be.rejectedWith('There are no utxos stored for this account type');
  })
});
