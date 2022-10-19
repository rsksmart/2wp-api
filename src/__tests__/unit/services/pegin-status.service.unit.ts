/* eslint-disable max-len */
/* eslint-disable no-unused-expressions */
import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {BitcoinTx} from '../../../models/bitcoin-tx.model';
import {Status} from '../../../models/pegin-status.model';
import {PeginStatus, PeginStatusDataModel} from '../../../models/rsk/pegin-status-data.model';
import {Vin} from '../../../models/vin.model';
import {Vout} from '../../../models/vout.model';
import {BitcoinService, BridgeService, PeginStatusService} from '../../../services';
import {PeginStatusMongoDbDataService} from '../../../services/pegin-status-data-services/pegin-status-mongo.service';

const federationAddress = '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB';

const getBitcoinTx = (btcTxId: string, from: string, amount: number, confirmations: number, to?: string) => {
  const btcTx = new BitcoinTx();
  btcTx.txId = btcTxId;

  const vinAddress: Vin = new Vin();
  vinAddress.addresses = [from];
  btcTx.vin = [vinAddress];

  const toInformation: Vout = new Vout();
  toInformation.isAddress = true;
  toInformation.value = amount;
  toInformation.addresses = [to || federationAddress];
  toInformation.hex = 'a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b987';
  btcTx.vout = [toInformation];
  btcTx.hex = '020000000001019b42ab3e8e2f29173cc440544b6d8bdcd7d46ff6197035f06ce38ae92fbd89260100000000fdffffff02b00400000000000017a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b98714a6130000000000160014438ba205a91b42778afc09ada1ad567596fdb1990247304402202149f5201c13d0b33d5dfc8af09d1b95920b409f6c05056eac70a79c202d92e2022031bebf341c45dd64166219f21c49de4c45357657bfc2fdd78f11336af53cc366012103284708827bfced592524611c7a3963a8ae634088d9265a32d6ccc12cbc16b111277f1f00';
  btcTx.confirmations = confirmations;

  return btcTx;
};
const getBitcoinTxWithOpReturn = (btcTxId: string, from: string, amount: number, confirmations: number) => {
  const randomTransaction: BitcoinTx = getBitcoinTx(btcTxId, from, amount, confirmations);
  const opReturnValue: Vout = new Vout();
  opReturnValue.hex = '6a2e52534b5401224d0b72bab9342f898c633ef187abff8a96c0fa014a74c48b9e3a5644adb734ab536cab6ae28e85ce';
  opReturnValue.value = 0;
  opReturnValue.isAddress = false;
  randomTransaction.vout[1] = opReturnValue;
  return randomTransaction;
}

const getRskInfo = (btcTxId: string) => {
  const data = new PeginStatusDataModel();
  data.btcTxId = btcTxId;
  data.rskRecipient = 'rskReceipient';
  data.rskTxId = 'rskTxId';
  data.status = PeginStatus.LOCKED;
  return data;
}

const getPeginStatusServiceWithMockedEnvironment = (
  btcTransaction: BitcoinTx | undefined,
  minPeginValue: number,
  rskTransaction?: PeginStatusDataModel
): PeginStatusService => {
  const mockedBitcoinService = sinon.createStubInstance(BitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;
  if (btcTransaction) {
    mockedBitcoinService.getTx.resolves(btcTransaction);
  } else {
    mockedBitcoinService.getTx.rejects();
  }

  const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
  mockedBridgeService.getMinPeginValue.resolves(minPeginValue);
  mockedBridgeService.getFederationAddress.resolves(federationAddress);

  const mockedPeginStatusMongoDbDataService = sinon.createStubInstance(PeginStatusMongoDbDataService);
  mockedPeginStatusMongoDbDataService.getById.resolves(rskTransaction);

  return new PeginStatusService(
    mockedBitcoinService,
    mockedPeginStatusMongoDbDataService,
    mockedBridgeService
  );
}

describe('function: getPeginSatusInfo', () => {

  afterEach(function () {
    sinon.restore();
  });

  it('getPeginSatusInfo txId has an unexpected error', async () => {
    const btcTxId = 'txId1';

    const thisService = getPeginStatusServiceWithMockedEnvironment(undefined, 5);

    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).to.be.equal(btcTxId);
    expect(result.btc.confirmations).to.be.empty;
    expect(result.rsk).to.be.empty;
    expect(result.status).to.be.equal(Status.ERROR_UNEXPECTED);
  })

  it('getPeginSatusInfo invalid sender address', async () => {
    const btcTxId = 'txId1';
    const randomTransaction: BitcoinTx = getBitcoinTx(btcTxId, 'address', 1000000, 200);

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5);
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).to.be.equal(btcTxId);
    expect(result.rsk).to.be.empty;
    expect(result.status).to.be.equal(Status.ERROR_NOT_A_PEGIN);
  })

  it('getPeginSatusInfo sent an address different than powpeg address', async () => {
    const btcTxId = 'txId2';
    const randomTransaction: BitcoinTx = getBitcoinTx(
      btcTxId,
      '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W',
      1000000,
      200,
      '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W'  //Not the powpeg address
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5);
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).to.be.equal(btcTxId);
    expect(result.rsk).to.be.empty;
    expect(result.status).equal(Status.ERROR_NOT_A_PEGIN);
  })

  it('getPeginSatusInfo sent amount below minimum', async () => {
    const btcTxId = 'txId3';
    const randomTransaction: BitcoinTx = getBitcoinTx(
      btcTxId,
      '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W',
      1,
      200
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 500);
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).to.be.equal(btcTxId);
    expect(result.btc.amountTransferred).to.be.equal(1 / 100000000);
    expect(result.btc.federationAddress).to.be.equal(federationAddress);
    expect(result.btc.confirmations).to.be.equal(200);
    expect(result.rsk).to.be.empty;
    expect(result.status).to.be.equal(Status.ERROR_BELOW_MIN);

  })

  it('getPeginSatusInfo confirmed in RSK', async () => {
    const btcTxId = 'txId4';
    const randomTransaction: BitcoinTx = getBitcoinTx(
      btcTxId,
      '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W',
      1000000,
      200
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5, getRskInfo(btcTxId));
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).to.be.equal(btcTxId);
    expect(result.btc.amountTransferred).to.be.equal(0.01);
    expect(result.btc.federationAddress).to.be.equal(federationAddress);
    expect(result.btc.confirmations).to.be.equal(200);
    expect(result.rsk.recipientAddress).to.be.equal('rskReceipient');
    expect(result.status).to.be.equal(Status.CONFIRMED);
  })

  it('getPeginSatusInfo does not exist in RSK', async () => {
    const btcTxId = 'txId5';
    const randomTransaction: BitcoinTx = getBitcoinTx(
      btcTxId,
      '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W',
      1000000,
      200
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5);
    const result = await thisService.getPeginSatusInfo(btcTxId);
    expect(result.btc.txId).equal(btcTxId);
    expect(result.btc.amountTransferred).to.be.equal(0.01);
    expect(result.btc.federationAddress).to.be.equal(federationAddress);
    expect(result.rsk.recipientAddress).not.be.empty;
    expect(result.status).equal(Status.NOT_IN_RSK_YET);
  })

  it('getPeginSatusInfo bech32 without OP_RETURNS return NOT_A_PEGIN error', async () => {
    const btcTxId = 'txId5';
    const randomTransaction: BitcoinTx = getBitcoinTx(
      btcTxId,
      'tb1qupcsaeakafua4cjwtpnyjegjjrq4ut42fut44h',
      1000000,
      200
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5);
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).equal(btcTxId);
    expect(result.rsk).to.be.empty
    expect(result.status).equal(Status.ERROR_NOT_A_PEGIN);
  })

  it('getPeginSatusInfo bech32 with OP_RETURNS return NOT_IN_RSK_YET', async () => {
    const btcTxId = 'txId5';
    const randomTransaction: BitcoinTx = getBitcoinTxWithOpReturn(
      btcTxId,
      'tb1qupcsaeakafua4cjwtpnyjegjjrq4ut42fut44h',
      1000000,
      200
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 200);
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).equal(btcTxId);
    expect(result.btc.amountTransferred).to.be.equal(0.01);
    expect(result.btc.federationAddress).to.be.equal(federationAddress);
    expect(result.btc.confirmations).to.be.equal(200);
    expect(result.rsk.recipientAddress).to.be.equal('0x224d0b72bab9342f898c633ef187abff8a96c0fa');
    expect(result.status).equal(Status.NOT_IN_RSK_YET);
  })

  it('getPeginSatusInfo bech32 with OP_RETURNS return CONFIRMED', async () => {
    const btcTxId = 'txId6';
    const randomTransaction: BitcoinTx = getBitcoinTxWithOpReturn(
      btcTxId,
      'tb1qupcsaeakafua4cjwtpnyjegjjrq4ut42fut44h',
      1000000,
      200
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5, getRskInfo(btcTxId));
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).equal(btcTxId);
    expect(result.btc.amountTransferred).to.be.equal(0.01);
    expect(result.btc.federationAddress).to.be.equal(federationAddress);
    expect(result.btc.confirmations).to.be.equal(200);
    expect(result.rsk.recipientAddress).to.be.equal('rskReceipient');
    expect(result.status).equal(Status.CONFIRMED);
  })

  it('getPeginSatusInfo waiting BTC confirmations', async () => {
    const btcTxId = 'txId5';
    const randomTransaction: BitcoinTx = getBitcoinTx(
      btcTxId,
      '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W',
      1000000,
      5
    );

    const thisService = getPeginStatusServiceWithMockedEnvironment(randomTransaction, 5);
    const result = await thisService.getPeginSatusInfo(btcTxId);

    expect(result.btc.txId).equal(btcTxId);
    expect(result.btc.amountTransferred).to.be.equal(0.01);
    expect(result.btc.federationAddress).to.be.equal(federationAddress);
    expect(result.rsk.recipientAddress).not.be.empty;
    expect(result.status).equal(Status.WAITING_CONFIRMATIONS);
  })
})
