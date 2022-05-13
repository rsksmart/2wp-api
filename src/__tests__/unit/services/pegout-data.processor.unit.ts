import {expect, sinon} from '@loopback/testlab';
import { PegoutStatusDataService } from '../../../services/pegout-status-data-services/pegout-status-data.service';
import { PegoutDataProcessor } from '../../../services/pegout-data.processor';
import { SinonStubbedInstance } from 'sinon';
import { PegoutStatusMongoDbDataService } from '../../../services/pegout-status-data-services/pegout-status-mongo.service';
import ExtendedBridgeTx from '../../../services/extended-bridge-tx';
import {Transaction} from 'bridge-transaction-parser';
import { BRIDGE_EVENTS } from '../../../utils/bridge-utils';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import { PegoutStatus, PegoutStatusDataModel } from '../../../models/rsk/pegout-status-data-model';

const rskTxHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';
const blockHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';

describe('Service: PegoutDataProcessor', () => {

  it('returns filters', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService);
    expect(thisService.getFilters()).to.be.Array;
    expect(thisService.getFilters()).to.not.be.empty;
    expect(thisService.getFilters().length).to.equal(2);
  });

  it('handles RECEIVED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService);
    
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const btcDestinationAddress = 'mreuQThm58CrYL4WCuY4SmDqiAQzWSy9GR';
    const amount = '504237';

    const peginBtcEventsArgs = new Map();
    peginBtcEventsArgs.set('sender', rskSenderAddress);
    peginBtcEventsArgs.set('btcDestinationAddress', btcDestinationAddress);
    peginBtcEventsArgs.set('amount', amount);

    const createdOn = new Date();
    
    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: '',
        signature: '',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED,
        signature: '0x8e04e2f2c246a91202761c435d6a4971bdc7af0617f0c739d900ecd12a6d7266',
        arguments: peginBtcEventsArgs
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

    await thisService.process(extendedBridgeTx);

    const status: PegoutStatusDataModel = new PegoutStatusDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.btcRecipientAddress = btcDestinationAddress;
    status.valueInWeisSentToTheBridge = amount;
    status.status = PegoutStatus.RECEIVED;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

  it('handles REJECTED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService);
    
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const reason = '3';

    const peginBtcEventsArgs = new Map();
    peginBtcEventsArgs.set('sender', rskSenderAddress);
    peginBtcEventsArgs.set('reason', reason);

    const createdOn = new Date();
    
    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: '',
        signature: '',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED,
        signature: '0x8e04e2f2c246a91202761c435d6a4971bdc7af0617f0c739d900ecd12a6d7266',
        arguments: peginBtcEventsArgs
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

    await thisService.process(extendedBridgeTx);

    const status: PegoutStatusDataModel = new PegoutStatusDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.status = PegoutStatus.REJECTED;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

});
