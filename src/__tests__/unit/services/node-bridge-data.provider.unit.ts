import {expect, sinon} from '@loopback/testlab';
import {SinonStubbedInstance} from 'sinon';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {NodeBridgeDataProvider} from '../../../services/node-bridge-data.provider';
import ExtendedBridgeTx from '../../../services/extended-bridge-tx'
import FilteredBridgeTransactionProcessor from '../../../services/filtered-bridge-transaction-processor';
import {BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';
import { PeginDataProcessor } from '../../../services/pegin-data.processor';
import { RskBlock } from '../../../models/rsk/rsk-block.model';
import { RskTransaction } from '../../../models/rsk/rsk-transaction.model';
import { PeginStatusDataService } from '../../../services/pegin-status-data-services/pegin-status-data.service';
import { BridgeService } from '../../../services';
import {Transaction} from 'bridge-transaction-parser';

const rskTxHash = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';

// Method args for both pegin_btc and lock_btc are the same.
const getMockedLockPeginBtcMethodArgs = () => {
  const lockPeginBtcMethodArgs = new Map();
  lockPeginBtcMethodArgs.set('tx', '0x0100000001');
  lockPeginBtcMethodArgs.set('height', '2195587');
  lockPeginBtcMethodArgs.set('pmt', '0x4100000008');
  return lockPeginBtcMethodArgs;
};

const getMockedPeginBtcEventsArgs = () => {
  const peginBtcEventsArgs = new Map();
  peginBtcEventsArgs.set('receiver', '0x2D623170Cb518434af6c02602334610f194818c1');
  peginBtcEventsArgs.set('btcTxHash', '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950');
  peginBtcEventsArgs.set('amount', '504237');
  peginBtcEventsArgs.set('protocolVersion', '1');
  return peginBtcEventsArgs;
};

const getMockedLockBtcEventsArgs = () => {
  const lockBtcEventsArgs = new Map();
  lockBtcEventsArgs.set('receiver', '0x2D623170Cb518434af6c02602334610f194818c1');
  lockBtcEventsArgs.set('btcTxHash', '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950');
  lockBtcEventsArgs.set('senderBtcAddress', '0x413bfc1ab391bbedcfdbc45116c5a0a75e628fc4d7b955dfb99b0214d0f1be43');
  lockBtcEventsArgs.set('amount', '1000000');
  return lockBtcEventsArgs;
};

describe('Service: NodeBridgeDataProvider', () => {

  it('adds and removes subscribers', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new NodeBridgeDataProvider(bridgeService);
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
    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new NodeBridgeDataProvider(bridgeService);
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
    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new NodeBridgeDataProvider(bridgeService);
    
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

    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new NodeBridgeDataProvider(bridgeService);
    const mockedPeginDataProcessorSubscriber = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber);

    const data = getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION) + '00001';
    const blockHash = '0x00002';

    const createdOn = new Date();

    const transaction: RskTransaction = {
      blockHash,
      hash: rskTxHash,
      data,
      createdOn,
      blockHeight: 1,
      to: bridge.address
    };

    const mockedFilters = [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
    mockedPeginDataProcessorSubscriber.getFilters.resolves(mockedFilters);

    const rskBlock: RskBlock = {
      height: 1,
      hash: blockHash,
      parentHash: '0x00001',
      transactions: [transaction]
    };

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedLockPeginBtcMethodArgs()
      },
      events: [{
        name: 'pegin_btc',
        signature: '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
        arguments: getMockedLockBtcEventsArgs()
      }]
    }

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn,
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    bridgeService.getBridgeTransactionByHash.resolves(bridgeTransaction);

    await thisService.process(rskBlock);

    sinon.assert.calledOnceWithMatch(mockedPeginDataProcessorSubscriber.process, extendedBridgeTx);

  });

  it('does not inform pegin subscriber if no matching filter', async () => {

    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new NodeBridgeDataProvider(bridgeService);
    const mockedPeginDataProcessorSubscriber = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber);

    const noBridgeData = '0x0000005';
    const blockHash = '0x00002';

    const transaction: RskTransaction = {
      blockHash,
      hash: rskTxHash,
      data: noBridgeData,
      createdOn: new Date(),
      blockHeight: 1,
      to: bridge.address
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

  it('requests bridge tx once if more than 1 subscribers share the same transaction', async () => {

    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    
    const thisService = new NodeBridgeDataProvider(bridgeService);
    const mockedPeginDataProcessorSubscriber1 = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;
    const mockedPeginDataProcessorSubscriber2 = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber1);
    // No pegout subscriber at the moment, so, using another pegin subscriber to test
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber2);

    const data = getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION) + '00001';
    const blockHash = '0x00002';

    const createdOn = new Date();

    const transaction: RskTransaction = {
      blockHash,
      hash: rskTxHash,
      data,
      createdOn,
      blockHeight: 1,
      to: bridge.address
    };

    const mockedFilters = [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
    mockedPeginDataProcessorSubscriber1.getFilters.resolves(mockedFilters);
    mockedPeginDataProcessorSubscriber2.getFilters.resolves(mockedFilters);

    const rskBlock: RskBlock = {
      height: 1,
      hash: blockHash,
      parentHash: '0x00001',
      transactions: [transaction]
    };

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedLockPeginBtcMethodArgs()
      },
      events: [{
        name: 'pegin_btc',
        signature: '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
        arguments: getMockedPeginBtcEventsArgs()
      }]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn,
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    bridgeService.getBridgeTransactionByHash.resolves(bridgeTransaction);

    await thisService.process(rskBlock);

    sinon.assert.calledOnceWithExactly(bridgeService.getBridgeTransactionByHash, rskTxHash);
    sinon.assert.calledOnceWithMatch(mockedPeginDataProcessorSubscriber1.process, extendedBridgeTx);
    sinon.assert.calledOnceWithMatch(mockedPeginDataProcessorSubscriber2.process, extendedBridgeTx);
    
  });

  it('does not process transaction if it it\'s not a bridge transaction', async () => {

    const bridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new NodeBridgeDataProvider(bridgeService);
    const mockedPeginDataProcessorSubscriber = sinon.createStubInstance(PeginDataProcessor) as SinonStubbedInstance<FilteredBridgeTransactionProcessor>;

    // Adds one subscribers
    thisService.addSubscriber(mockedPeginDataProcessorSubscriber);

    const data = getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION) + '00001';
    const blockHash = '0x00002';

    const transaction: RskTransaction = {
      blockHash,
      hash: rskTxHash,
      data,
      createdOn: new Date(),
      blockHeight: 1,
      to: '0x123'
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

});
