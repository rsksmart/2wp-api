import {expect, sinon} from '@loopback/testlab';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {Log} from '../../../models/rsk/log.model';
import {NodeBridgeDataProvider} from '../../../services/node-bridge-data.provider';
import {RskNodeService} from '../../../services/rsk-node.service';
import {BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';
import {ensure0x} from '../../../utils/hex-utils';
import {getRandomAddress, getRandomHash} from '../../helper';

const getRskNodeService = () => {
  const mockedRskNodeService = sinon.createStubInstance(RskNodeService);
  return mockedRskNodeService;
};

const getUpdateCollectionsTransaction = () => {
  return getRandomTransaction(bridge.address, getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS));
};

const getPeginTransaction = (logs: Array<Log> = []) => {
  let input = getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION); // method signature
  input += 'b1ab1a'; // fake data
  return getRandomTransaction(bridge.address, input, logs);
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

const getBlockWithNoBridgeData = (txCount = 1, height = 1, parentHash: string = getRandomHash()) => {
  const txs = []
  for (let i = 0; i < txCount; i++) {
    txs.push(getRandomTransaction());
  }
  return getBlockWithTheseTransactions(txs, height, parentHash);
};

const getBlockWithTheseTransactions = (transactions: Array<any>, height = 1, parentHash: string = getRandomHash()) => {
  return {
    hash: getRandomHash(),
    number: height,
    transactions: transactions,
    parentHash: parentHash
  };
}

describe('Service: NodeBridgeDataProvider', () => {

  it('ignores blocks with no bridge data', async () => {
    const height = 1;
    const rskNodeService = getRskNodeService();
    rskNodeService.getBlock.resolves(getBlockWithNoBridgeData(1, height))

    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const result = await thisService.getData(height);

    expect(result.block.height).to.be.equal(height);
    expect(result.data).to.be.empty;
  });

  it('includes transactions to the bridge, with no filters', async () => {
    const height = 1;
    const firstTx = getRandomTransaction();
    const updateCollectionsTx = getUpdateCollectionsTransaction();
    const peginTx = getPeginTransaction();

    const rskNodeService = getRskNodeService();
    rskNodeService.getBlock.resolves(getBlockWithTheseTransactions([firstTx, updateCollectionsTx, peginTx], height));
    rskNodeService.getTransactionReceipt.withArgs(updateCollectionsTx.hash).resolves(updateCollectionsTx);
    rskNodeService.getTransactionReceipt.withArgs(peginTx.hash).resolves(peginTx);

    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const result = await thisService.getData(height);

    expect(result.block.height).to.be.equal(height);
    expect(result.data).to.have.length(2); // Only includes Bridge txs
    expect(result.data[0].hash).to.be.equal(updateCollectionsTx.hash);
    expect(result.data[1].hash).to.be.equal(peginTx.hash);
  });

  it('includes transactions to the bridge, with pegin filter', async () => {
    const height = 1;
    const firstTx = getRandomTransaction();
    const updateCollectionsTx = getUpdateCollectionsTransaction();
    const peginTx = getPeginTransaction();

    const rskNodeService = getRskNodeService();
    rskNodeService.getBlock.resolves(getBlockWithTheseTransactions([firstTx, updateCollectionsTx, peginTx], height));
    rskNodeService.getTransactionReceipt.withArgs(updateCollectionsTx.hash).resolves(updateCollectionsTx);
    rskNodeService.getTransactionReceipt.withArgs(peginTx.hash).resolves(peginTx);

    const thisService = new NodeBridgeDataProvider(rskNodeService);
    thisService.configure([new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))]);
    const result = await thisService.getData(height);

    expect(result.block.height).to.be.equal(height);
    expect(result.data).to.have.length(1); // Only includes pegin Bridge tx
    expect(result.data[0].hash).to.be.equal(peginTx.hash);
  });

});
