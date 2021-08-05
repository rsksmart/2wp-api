import {expect, sinon} from '@loopback/testlab';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {Log} from '../../../models/rsk/log.model';
import {NodeBridgeDataProvider} from '../../../services/node-bridge-data.provider';
import {RskNodeService} from '../../../services/rsk-node.service';
import {ensure0x} from '../../../utils/hex-utils';
import {getRandomAddress, getRandomHash} from '../../helper';

const BridgeAddress = '0x0000000000000000000000000000000001000006';
const PeginSignature = '0x43dc0656';

const getRskNodeService = () => {
  const mockedRskNodeService = sinon.createStubInstance(RskNodeService);
  return mockedRskNodeService;
};

const getUpdateCollectionsTransaction = () => {
  return getRandomTransaction(BridgeAddress, '0x0c5a9990');
};

const getPeginTransaction = (logs: Array<Log> = []) => {
  let input = PeginSignature; // method signature
  input += 'b1ab1a'; // fake data
  return getRandomTransaction(BridgeAddress, input, logs);
};

const getRandomTransaction = (to: string = getRandomAddress(), input: string = ensure0x(''), logs: Array<Log> = []) => {
  return {
    hash: getRandomHash(),
    input: input,
    from: getRandomAddress(),
    to: to,
    logs: logs
  };
};

const getBlockWithPeginData = () => { };

const getBlockWithUpdateCollectionsData = () => { };

const getBlockWithMixedBridgeData = () => { };

const getBlockWithNoBridgeData = (txCount: number = 1, height: number = 1, parentHash: string = getRandomHash()) => {
  let txs = []
  for (let i = 0; i < txCount; i++) {
    txs.push(getRandomTransaction());
  }
  return getBlockWithTheseTransactions(txs, height, parentHash);
};

const getBlockWithTheseTransactions = (transactions: Array<any>, height: number = 1, parentHash: string = getRandomHash()) => {
  return {
    hash: getRandomHash(),
    number: height,
    transactions: transactions,
    parentHash: parentHash
  };
}

describe('Service: NodeBridgeDataProvider', () => {

  it('ignores blocks with no bridge data', async () => {
    let height = 1;
    let rskNodeService = getRskNodeService();
    rskNodeService.getBlock.resolves(getBlockWithNoBridgeData(1, height))

    const thisService = new NodeBridgeDataProvider(rskNodeService);
    let result = await thisService.getData(height);

    expect(result.block.height).to.be.equal(height);
    expect(result.data).to.be.empty;
  });

  it('includes transactions to the bridge, with no filters', async () => {
    let height = 1;
    let firstTx = getRandomTransaction();
    let updateCollectionsTx = getUpdateCollectionsTransaction();
    let peginTx = getPeginTransaction();

    let rskNodeService = getRskNodeService();
    rskNodeService.getBlock.resolves(getBlockWithTheseTransactions([firstTx, updateCollectionsTx, peginTx], height));
    rskNodeService.getTransactionReceipt.withArgs(updateCollectionsTx.hash).resolves(updateCollectionsTx);
    rskNodeService.getTransactionReceipt.withArgs(peginTx.hash).resolves(peginTx);

    const thisService = new NodeBridgeDataProvider(rskNodeService);
    let result = await thisService.getData(height);

    expect(result.block.height).to.be.equal(height);
    expect(result.data).to.have.length(2); // Only includes Bridge txs
    expect(result.data[0].hash).to.be.equal(updateCollectionsTx.hash);
    expect(result.data[1].hash).to.be.equal(peginTx.hash);
  });

  it('includes transactions to the bridge, with pegin filter', async () => {
    let height = 1;
    let firstTx = getRandomTransaction();
    let updateCollectionsTx = getUpdateCollectionsTransaction();
    let peginTx = getPeginTransaction();

    let rskNodeService = getRskNodeService();
    rskNodeService.getBlock.resolves(getBlockWithTheseTransactions([firstTx, updateCollectionsTx, peginTx], height));
    rskNodeService.getTransactionReceipt.withArgs(updateCollectionsTx.hash).resolves(updateCollectionsTx);
    rskNodeService.getTransactionReceipt.withArgs(peginTx.hash).resolves(peginTx);

    const thisService = new NodeBridgeDataProvider(rskNodeService);
    thisService.configure([new BridgeDataFilterModel(PeginSignature)]);
    let result = await thisService.getData(height);

    expect(result.block.height).to.be.equal(height);
    expect(result.data).to.have.length(1); // Only includes pegin Bridge tx
    expect(result.data[0].hash).to.be.equal(peginTx.hash);
  });

});
