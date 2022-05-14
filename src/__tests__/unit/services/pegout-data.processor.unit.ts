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

    const releaseRequestReceivedEventsArgs = new Map();
    releaseRequestReceivedEventsArgs.set('sender', rskSenderAddress);
    releaseRequestReceivedEventsArgs.set('btcDestinationAddress', btcDestinationAddress);
    releaseRequestReceivedEventsArgs.set('amount', amount);

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
        arguments: releaseRequestReceivedEventsArgs
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

    const releaseRequestedRejectEventsArgs = new Map();
    releaseRequestedRejectEventsArgs.set('sender', rskSenderAddress);
    releaseRequestedRejectEventsArgs.set('reason', reason);

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
        signature: '0xb607c3e1fbe6b38cd145b15b837f7b722b199caa60e3057b36c141adee3b75e7',
        arguments: releaseRequestedRejectEventsArgs
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

  it('handles WAITING_FOR_CONFIRMATION status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService);
    const rskTxHash = '0xce51d57e61b659b38c182485c4061483137fd6a52f567bcf67317db5274379c6';
    const btcTxHash = '0xfbfbc14548d7a352287b5f02199ac909d473333f7c2a072eb4dfda30f97a84e2';
    const amount = '500000';
    const originatingRskTxHash = '0xf0d8cce820ac5035f2825d36c1ce2b1e7bc5bf1909c735d46400caf4a2e045ce';
    const createdOn = new Date();
    const rskBlockHeight = 2831033;
    const foundReceivedPegoutStatus: PegoutStatusDataModel = new PegoutStatusDataModel();

    foundReceivedPegoutStatus.rskTxHash = originatingRskTxHash;
    foundReceivedPegoutStatus.btcRecipientAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';
    foundReceivedPegoutStatus.createdOn = createdOn;
    foundReceivedPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    foundReceivedPegoutStatus.rskBlockHeight = 2831033;
    foundReceivedPegoutStatus.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    foundReceivedPegoutStatus.status = PegoutStatus.RECEIVED;
    foundReceivedPegoutStatus.valueInWeisSentToTheBridge = '500000';

    mockedPegoutStatusDataService.getLastByOriginatingRskTxHash.withArgs(originatingRskTxHash).resolves(foundReceivedPegoutStatus);

    const releaseRequestedEventsArgs = new Map();
    releaseRequestedEventsArgs.set('rskTxHash', originatingRskTxHash);
    releaseRequestedEventsArgs.set('btcTxHash', btcTxHash);
    releaseRequestedEventsArgs.set('amount', amount);

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: rskBlockHeight,
      method: {
        name: '',
        signature: '',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.RELEASE_REQUESTED,
        signature: '0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790',
        arguments: releaseRequestedEventsArgs
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
    status.originatingRskTxHash = originatingRskTxHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = foundReceivedPegoutStatus.rskSenderAddress;
    status.btcRecipientAddress = foundReceivedPegoutStatus.btcRecipientAddress;
    status.valueInWeisSentToTheBridge = amount;
    status.btcTxHash = btcTxHash;
    status.status = PegoutStatus.WAITING_FOR_CONFIRMATION;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

});
