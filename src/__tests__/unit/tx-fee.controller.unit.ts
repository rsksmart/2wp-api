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
import SatoshiBig from '../../utils/SatoshiBig';

config();

describe('tx Fee controller', () => {
  let feeLevelProvider: FeeLevel;
  let feeProvider: sinon.SinonStub;
  let findAccountUtxos : sinon.SinonStub;
  let setInputs : sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let txFeeController: TxFeeController;
  const sessionId = 'sessionId';
  const inputSize = 32 + 5 + 106 + 4;
  const outputsSize = 3 * 34;
  const txBytes = outputsSize + 10 ;
  const fastAmount = new SatoshiBig('0.0001', 'btc');
  const averageAmount = new SatoshiBig('0.00005', 'btc');
  const lowAmount = new SatoshiBig('0.00001', 'btc');
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
    feeProvider.withArgs(+fast).resolves([fastAmount.toBTCString()]);
    feeProvider.withArgs(+average).resolves([averageAmount.toBTCString()]);
    feeProvider.withArgs(+low).resolves([lowAmount.toBTCString()]);
  }
  it('should store a optimal input list given based on fastFee amount', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 97410, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
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
      slow: 259,
      average: 1295,
      fast: 2590,
      wereInputsStored: true,
    }))).to.be.true();
  });
  it('should add inputs to the optimal input list if the computed value with fee is not enough', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 97411, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
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
      slow: 406,
      average: 2030,
      fast: 4060,
      wereInputsStored: true,
    }))).to.be.true();
  });
  it('should return the fee of the required amount even if there are no enough balance, and should be the max fee given all utxos', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    const amount = 393001;
    const fees = await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
    const totalBytes: SatoshiBig = new SatoshiBig((utxos1.length * +inputSize + txBytes).toString(), 'satoshi');
    expect(setInputs.notCalled).to.be.true();
    expect(fees).to.be.eql(new FeeAmountData({
      slow: Number(
        totalBytes
          .mul(lowAmount.div(1000))
          .toSatoshiString()
      ),
      average: Number(
        totalBytes
          .mul(averageAmount.div(1000))
          .toSatoshiString()
      ),
      fast: Number(totalBytes
        .mul(fastAmount.div(1000))
        .toSatoshiString()),
      wereInputsStored: false,
    }));
  });
  it('Should reject the call if there are no utxos stored for that ', () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves([]);
    return expect(txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 100, accountType: constants.BITCOIN_LEGACY_ADDRESS})))
      .to.be.rejectedWith('There are no utxos stored for this account type');
  })
});
