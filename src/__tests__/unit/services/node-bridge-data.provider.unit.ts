import {expect, sinon} from '@loopback/testlab';
import {SinonStubbedInstance} from 'sinon';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {Log} from '../../../models/rsk/log.model';
import {NodeBridgeDataProvider} from '../../../services/node-bridge-data.provider';
import FilteredBridgeTransactionProcessor from '../../../services/filtered-bridge-transaction-processor';
import {RskNodeService} from '../../../services/rsk-node.service';
import {BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';
import {ensure0x} from '../../../utils/hex-utils';
import {getRandomAddress, getRandomHash} from '../../helper';
import { PeginDataProcessor } from '../../../services/pegin-data.processor';
import { RskBlock } from '../../../models/rsk/rsk-block.model';
import { RskTransaction } from '../../../models/rsk/rsk-transaction.model';
import { PeginStatusDataService } from '../../../services/pegin-status-data-services/pegin-status-data.service';

const getRskNodeService = () => {
  const mockedRskNodeService = sinon.createStubInstance(RskNodeService);
  return mockedRskNodeService;
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

const getBlockWithTheseTransactions = (transactions: Array<any>, height = 1, parentHash: string = getRandomHash()) => {
  return {
    hash: getRandomHash(),
    number: height,
    transactions: transactions,
    parentHash: parentHash
  };
}

describe('Service: NodeBridgeDataProvider', () => {

  it('adds and removes subscribers', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const rskNodeService = getRskNodeService();
    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const peginDataProcessorSubscriber = new PeginDataProcessor(mockedPeginStatusDataService) as FilteredBridgeTransactionProcessor;
    expect(thisService.getSubscribers()).to.be.empty;

    // Adds a subscriber
    thisService.addSubscriber(peginDataProcessorSubscriber);
    expect(thisService.getSubscribers()).to.not.be.empty;
    expect(thisService.getSubscribers().length).to.equal(1);
    expect(thisService.getSubscribers()[0]).to.equal(peginDataProcessorSubscriber);

    // Removes the subscriber
    thisService.removeSubscriber(peginDataProcessorSubscriber);
    expect(thisService.getSubscribers()).to.be.empty;
    
  });

  it('ignores extra subscribers if they are the same when adding/removing more subscribers', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const rskNodeService = getRskNodeService();
    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const peginDataProcessorSubscriber = new PeginDataProcessor(mockedPeginStatusDataService) as FilteredBridgeTransactionProcessor;
    expect(thisService.getSubscribers()).to.be.empty;

    // Adds the same subscriber multiple times
    thisService.addSubscriber(peginDataProcessorSubscriber);
    thisService.addSubscriber(peginDataProcessorSubscriber);
    thisService.addSubscriber(peginDataProcessorSubscriber);

    // Still only the original subscriber should be added
    expect(thisService.getSubscribers()).to.not.be.empty;
    expect(thisService.getSubscribers().length).to.equal(1);
    expect(thisService.getSubscribers()[0]).to.equal(peginDataProcessorSubscriber);

    // Tries to remove the same subscriber multiple times, should ignore it
    thisService.removeSubscriber(peginDataProcessorSubscriber);
    thisService.removeSubscriber(peginDataProcessorSubscriber);
    thisService.removeSubscriber(peginDataProcessorSubscriber);
    expect(thisService.getSubscribers()).to.be.empty;
    
  });

  it('removes the correct subscriber', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const rskNodeService = getRskNodeService();
    const thisService = new NodeBridgeDataProvider(rskNodeService);
    
    const peginDataProcessorSubscriber1 = new PeginDataProcessor(mockedPeginStatusDataService) as FilteredBridgeTransactionProcessor;
    const peginDataProcessorSubscriber2 = new PeginDataProcessor(mockedPeginStatusDataService) as FilteredBridgeTransactionProcessor;

    expect(thisService.getSubscribers()).to.be.empty;

    // Adds 2 subscribers
    thisService.addSubscriber(peginDataProcessorSubscriber1);
    thisService.addSubscriber(peginDataProcessorSubscriber2);

    expect(thisService.getSubscribers()).to.not.be.empty;
    expect(thisService.getSubscribers().length).to.equal(2);

    // Remove one subscriber
    thisService.removeSubscriber(peginDataProcessorSubscriber2);

    // Check the correct subscriber was removed
    expect(thisService.getSubscribers()).to.not.be.empty;
    expect(thisService.getSubscribers().length).to.equal(1);
    expect(thisService.getSubscribers()[0]).to.not.equal(peginDataProcessorSubscriber2);
    
  });

  it('informs subscribers', async () => {

    const rskNodeService = getRskNodeService();
    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const mockedPeginDataProcessorSubscriber = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber);

    const data = getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION) + '00001';
    const blockHash = '0x00002';
    const transactionHash = '0x0001';

    const transaction: RskTransaction = {
      blockHash,
      hash: transactionHash,
      data,
      logs: [],
      createdOn: new Date(),
      blockHeight: 1
    };

    const txReceipt = {
      logs: [ { logIndex: 0,
        blockNumber: 2670247,
        blockHash:
         '0x6bbf8089746842f7b30197ef5c097c634aabf645097360e3027730844531e2bc',
        transactionHash:
         '0x775ac941eb0034dfb4cbc26d65eeac6cfcc9f26e70c391389cbcb5bd02b7ca3e',
        transactionIndex: 4,
        address: '0x0000000000000000000000000000000001000006',
        data:
         '0x000000000000000000000000000000000000000000000000000000000007a1200000000000000000000000000000000000000000000000000000000000000001',
        topics:
         [ '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
           '0x000000000000000000000000307666818840f76513554b50d2d323631b9affbf',
           '0xcfda821cc08c4b392991fead5661fa59a5cc68e2995e3ad668931d92c0b48787' ],
        id: 'log_2dd1db92' } ]
    };

    rskNodeService.getTransactionReceipt.withArgs(transaction.hash).resolves(txReceipt);
    const mockedFilters = [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
    mockedPeginDataProcessorSubscriber.getFilters.resolves(mockedFilters);

    const rskBlock: RskBlock = {
      height: 1,
      hash: blockHash,
      parentHash: '0x00001',
      transactions: [transaction]
    };

    await thisService.process(rskBlock);

    sinon.assert.calledOnceWithExactly(mockedPeginDataProcessorSubscriber.process, transaction);

  });

  it('does not inform pegin subscriber if no matching filter', async () => {

    const rskNodeService = getRskNodeService();
    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const mockedPeginDataProcessorSubscriber = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber);

    const noBridgeData = '0x0000005';
    const blockHash = '0x00002';
    const transactionHash = '0x0001';

    const transaction: RskTransaction = {
      blockHash,
      hash: transactionHash,
      data: noBridgeData,
      logs: [],
      createdOn: new Date(),
      blockHeight: 1
    };

    const mockedFilters = [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
    mockedPeginDataProcessorSubscriber.getFilters.resolves(mockedFilters);

    const rskBlock: RskBlock = {
      height: 1,
      hash: blockHash,
      parentHash: '0x00001',
      transactions: [transaction]
    };

    await thisService.process(rskBlock);

    sinon.assert.neverCalledWith(mockedPeginDataProcessorSubscriber.process);

  });

  it('requests transaction receipt once if more than 1 subscribers share the same transaction', async () => {

    const rskNodeService = getRskNodeService();
    const thisService = new NodeBridgeDataProvider(rskNodeService);
    const mockedPeginDataProcessorSubscriber1 = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;
    const mockedPeginDataProcessorSubscriber2 = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber1);
    // No pegout subscriber at the moment, so, using another pegin subscriber to test
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber2);

    const data = getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION) + '00001';
    const blockHash = '0x00002';
    const transactionHash = '0x0001';

    const transaction: RskTransaction = {
      blockHash,
      hash: transactionHash,
      data,
      logs: [],
      createdOn: new Date(),
      blockHeight: 1
    };

    const txReceipt = {
      logs: [ { logIndex: 0,
        blockNumber: 2670247,
        blockHash:
         '0x6bbf8089746842f7b30197ef5c097c634aabf645097360e3027730844531e2bc',
        transactionHash:
         '0x775ac941eb0034dfb4cbc26d65eeac6cfcc9f26e70c391389cbcb5bd02b7ca3e',
        transactionIndex: 4,
        address: '0x0000000000000000000000000000000001000006',
        data:
         '0x000000000000000000000000000000000000000000000000000000000007a1200000000000000000000000000000000000000000000000000000000000000001',
        topics:
         [ '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
           '0x000000000000000000000000307666818840f76513554b50d2d323631b9affbf',
           '0xcfda821cc08c4b392991fead5661fa59a5cc68e2995e3ad668931d92c0b48787' ],
        id: 'log_2dd1db92' } ]
    };

    rskNodeService.getTransactionReceipt.withArgs(transaction.hash).resolves(txReceipt);
    const mockedFilters = [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
    mockedPeginDataProcessorSubscriber1.getFilters.resolves(mockedFilters);
    mockedPeginDataProcessorSubscriber2.getFilters.resolves(mockedFilters);

    const rskBlock: RskBlock = {
      height: 1,
      hash: blockHash,
      parentHash: '0x00001',
      transactions: [transaction]
    };

    await thisService.process(rskBlock);

    sinon.assert.calledOnceWithExactly(mockedPeginDataProcessorSubscriber1.process, transaction);
    sinon.assert.calledOnce(rskNodeService.getTransactionReceipt);

  });

});
