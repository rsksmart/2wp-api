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
import Big from 'big.js';

config();

describe('tx Fee controller', () => {
  let feeLevelProvider: FeeLevel;
  let feeProvider: sinon.SinonStub;
  let findAccountUtxos : sinon.SinonStub;
  let setInputs : sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let txFeeController: TxFeeController;
  const fast = process.env.FAST_MINING_BLOCK ?? 1;
  const average = process.env.AVERAGE_MINING_BLOCK ?? 6;
  const low = process.env.LOW_MINING_BLOCK ?? 12;
  const sessionId = 'sessionId';
  const inputSize = 32 + 4 + 71 + 34 + 4;
  const outputSize = 8 + 24;
  const txHeaderSize = 13;
  const txBytes = txHeaderSize + (3 * outputSize);
  const fastAmount = new SatoshiBig('0.0015', 'btc');
  const averageAmount = new SatoshiBig('0.0013', 'btc');
  const lowAmount = new SatoshiBig('0.0011', 'btc');
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
    feeProvider.withArgs(+fast).resolves([fastAmount.toBTCString()]);
    feeProvider.withArgs(+average).resolves([averageAmount.toBTCString()]);
    feeProvider.withArgs(+low).resolves([lowAmount.toBTCString()]);
  }
  it('should store a optimal input list given based on fastFee amount', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 97410, accountType: constants.BITCOIN_LEGACY_ADDRESS}));
    const totalBytes: Big = new Big((2* +inputSize + txBytes).toString());
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
      },),
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
      slow: totalBytes.mul(lowAmount.div(1000)).toNumber(),
      average: totalBytes.mul(averageAmount.div(1000)).toNumber(),
      fast: totalBytes.mul(fastAmount.div(1000)).toNumber(),
      wereInputsStored: true,
    }))).to.be.true();
  });
  it('should add inputs to the optimal input list if the computed value with fee is not enough', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 97411, accountType: constants.BITCOIN_LEGACY_ADDRESS}));
    const totalBytes: Big = new Big((2* +inputSize + txBytes).toString());
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
    ],  new FeeAmountData({
      slow: totalBytes.mul(lowAmount.div(1000)).toNumber(),
      average: totalBytes.mul(averageAmount.div(1000)).toNumber(),
      fast: totalBytes.mul(fastAmount.div(1000)).toNumber(),
      wereInputsStored: true,
    }))).to.be.true();
  });
  it('should return the fee of the required amount even if there are no enough balance, and should be the max fee given all utxos', async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    const amount = 393001;
    const fees = await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
    const totalBytes: Big = new Big((utxos1.length * +inputSize + txBytes).toString());
    expect(setInputs.notCalled).to.be.true();
    expect(fees).to.be.eql(new FeeAmountData({
      slow: Number(
        totalBytes
          .mul(lowAmount.div(1000))
          .toString()
      ),
      average: Number(
        totalBytes
          .mul(averageAmount.div(1000))
          .toString()
      ),
      fast: Number(totalBytes
        .mul(fastAmount.div(1000))
        .toString()),
      wereInputsStored: false,
    }));
  });
  it('Should reject the call if there are no utxos stored for that ', () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves([]);
    return expect(txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 100, accountType: constants.BITCOIN_LEGACY_ADDRESS})))
      .to.be.rejectedWith('There are no utxos stored for this account type');
  });
  it(`should ensure the fee amount are at least ${constants.BITCOIN_MIN_SATOSHI_FEE} satoshis `, async () => {
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    const amount = 80000;
    const fees = await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
    expect(fees.fast).to.be.greaterThanOrEqual(constants.BITCOIN_MIN_SATOSHI_FEE);
    expect(fees.average).to.be.greaterThanOrEqual(constants.BITCOIN_MIN_SATOSHI_FEE);
    expect(fees.slow).to.be.greaterThanOrEqual(constants.BITCOIN_MIN_SATOSHI_FEE);
  });
  it(`should ensure the fee amount are ${constants.BITCOIN_MAX_SATOSHI_FEE} satoshis at the most`, async () => {
    const utxo = {
      address: 'address',
      txid: 'txId1',
      vout: 0,
      amount: '0.000001',
      satoshis: 1000,
      height: 12055,
      confirmations: 3500,
    };
    const largeUtxos = Array.from(Array(19200).keys()).map(() => utxo);
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(largeUtxos);
    const amount = 18000000;
    const fees = await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount, accountType: constants.BITCOIN_LEGACY_ADDRESS}))
    expect(fees.fast).to.be.belowOrEqual(constants.BITCOIN_MAX_SATOSHI_FEE);
    expect(fees.average).to.be.belowOrEqual(constants.BITCOIN_MAX_SATOSHI_FEE);
    expect(fees.slow).to.be.belowOrEqual(constants.BITCOIN_MAX_SATOSHI_FEE);
  });
  it('should ensure the mininum Fee Calculated were based on the environment varibles given', async () => {
    const minFastFee = new SatoshiBig(process.env.FEE_PER_KB_FAST_MIN ?? 100, 'satoshi');
    const minAverageFee = new SatoshiBig(process.env.FEE_PER_KB_AVERAGE_MIN ?? 100, 'satoshi');
    const minSlowFee = new SatoshiBig(process.env.FEE_PER_KB_SLOW_MIN ?? 100, 'satoshi');
    feeProvider.withArgs(+fast).resolves(['0.0001']);
    feeProvider.withArgs(+average).resolves(['0.00005']);
    feeProvider.withArgs(+low).resolves(['0.00001']);
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
      .resolves(utxos1);
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount: 97411, accountType: constants.BITCOIN_LEGACY_ADDRESS}));
    const totalBytes: Big = new Big((2* +inputSize + txBytes).toString());
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
    ],  new FeeAmountData({
      slow: totalBytes.mul(minSlowFee).toNumber(),
      average: totalBytes.mul(minAverageFee).toNumber(),
      fast: totalBytes.mul(minFastFee).toNumber(),
      wereInputsStored: true,
    }))).to.be.true();
  });
  it('Should ensure the change output has a higher value than dust environment variable ', async () => {
    const dustValue = process.env.DUST_VALUE ?? 1000;
    const minFastFee = new SatoshiBig(process.env.FEE_PER_KB_FAST_MIN ?? 100, 'satoshi');
    const minAverageFee = new SatoshiBig(process.env.FEE_PER_KB_AVERAGE_MIN ?? 100, 'satoshi');
    const minSlowFee = new SatoshiBig(process.env.FEE_PER_KB_SLOW_MIN ?? 100, 'satoshi');
    feeProvider.withArgs(+fast).resolves(['0.0001']);
    feeProvider.withArgs(+average).resolves(['0.00005']);
    feeProvider.withArgs(+low).resolves(['0.00001']);
    findAccountUtxos.withArgs(sessionId, constants.BITCOIN_LEGACY_ADDRESS)
        .resolves(utxos1);
    const amount = 97000;
    await txFeeController.getTxFee(new FeeRequestData({ sessionId, amount, accountType: constants.BITCOIN_LEGACY_ADDRESS}));
    const totalBytes: Big = new Big((2* +inputSize + (3 * outputSize) + txHeaderSize).toString());
    const changeAmount = 200000 - amount - totalBytes.mul(minFastFee).toNumber();
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
    ],  new FeeAmountData({
      slow: totalBytes.mul(minSlowFee).toNumber(),
      average: totalBytes.mul(minAverageFee).toNumber(),
      fast: totalBytes.mul(minFastFee).toNumber(),
      wereInputsStored: true,
    }))).to.be.true();
    expect(changeAmount >= dustValue).to.be.true();
  });
});
