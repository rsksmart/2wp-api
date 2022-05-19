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
import { BridgeService } from '../../../services';
import * as constants from '../../../constants';
import { BridgeState } from 'bridge-state-data-parser';
const sandbox = sinon.createSandbox();

const rskTxHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';
const blockHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';

const bridgeState: BridgeState = {
  pegoutsWaitingForConfirmations: [
    {
      btcRawTx: '0200000003f3b412ca8a5f5d30a780d9f209a6565190f20b946f15ab040759c1afaad593b201000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff56d9bbd7e6ff6230935d90b6a33b4df492597e79a30358f5d8ab101491959cb401000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff0c640358798d4ee73d4086347489626ee44b5aed70a165c3d72dc59e83e2a2b401000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff02cc240500000000001976a91460890b78920fed16f7505dc1e8b66ea249da062288ac74db06000000000017a9148f38b3d8ec8816f7f58a390f306bb90bb178d6ac8700000000',
      pegoutCreationBlockNumber: '2846747',
      rskTxHash: '5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698'
    }
  ],
  activeFederationUtxos: [],
  pegoutRequests: [],
  pegoutsWaitingForSignatures: [],
  nextPegoutCreationBlockNumber: 0
};

const NETWORK = process.env.NETWORK;

describe('Service: PegoutDataProcessor', () => {

  afterEach(() => {
    sandbox.stub(process.env, 'NETWORK').value(NETWORK);
  });

  it('returns filters', () => {
    const mockedPegoutStatusDataService = <PegoutStatusDataService>{};
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    expect(thisService.getFilters()).to.be.Array;
    expect(thisService.getFilters()).to.not.be.empty;
    expect(thisService.getFilters().length).to.equal(2);
  });

  it('handles RECEIVED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const btcDestinationAddress = 'mreuQThm58CrYL4WCuY4SmDqiAQzWSy9GR';
    const amount = 504237;

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
    status.valueRequestedInSatoshis = amount;
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.RECEIVED;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

  it('handles REJECTED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
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
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.REJECTED;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

  it('handles WAITING_FOR_CONFIRMATION status, testnet', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const rskTxHash = '0x3769e1117683faa318c683af5fb763dc03d431580ecf2ad1271ff25bf946fe9c';
    const btcTxHash = '0xfbfbc14548d7a352287b5f02199ac909d473333f7c2a072eb4dfda30f97a84e2';
    const amount = 500000;
    const originatingRskTxHash = '0x5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698';
    const createdOn = new Date();
    const rskBlockHeight = 2831033;
    const foundReceivedPegoutStatus: PegoutStatusDataModel = new PegoutStatusDataModel();

    mockedBridgeService.getBridgeState.resolves(bridgeState);

    foundReceivedPegoutStatus.rskTxHash = originatingRskTxHash;
    foundReceivedPegoutStatus.btcRecipientAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';
    foundReceivedPegoutStatus.createdOn = createdOn;
    foundReceivedPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    foundReceivedPegoutStatus.rskBlockHeight = 2831033;
    foundReceivedPegoutStatus.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    foundReceivedPegoutStatus.status = PegoutStatus.RECEIVED;
    foundReceivedPegoutStatus.valueRequestedInSatoshis = 500000;

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
    status.valueRequestedInSatoshis = amount;
    status.btcTxHash = btcTxHash;
    status.valueRequestedInSatoshis = 500000;
    status.valueInSatoshisToBeReceived = 337100;
    status.feeInSatoshisToBePaid = 162900;
    status.btcRawTransaction = bridgeState.pegoutsWaitingForConfirmations[0].btcRawTx;
    status.originatingRskBlockHeight = foundReceivedPegoutStatus.rskBlockHeight;
    status.status = PegoutStatus.WAITING_FOR_CONFIRMATION;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

  it('handles WAITING_FOR_CONFIRMATION status, mainnet', async () => {

    sandbox.stub(process.env, 'NETWORK').value(constants.NETWORK_MAINNET);

    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const rskTxHash = '0x3769e1117683faa318c683af5fb763dc03d431580ecf2ad1271ff25bf946fe9c';
    const btcTxHash = '0xfbfbc14548d7a352287b5f02199ac909d473333f7c2a072eb4dfda30f97a84e2';
    const amount = 500000;
    const originatingRskTxHash = '0x5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698';
    const createdOn = new Date();
    const rskBlockHeight = 2831033;
    const foundReceivedPegoutStatus: PegoutStatusDataModel = new PegoutStatusDataModel();

    mockedBridgeService.getBridgeState.resolves(bridgeState);

    foundReceivedPegoutStatus.rskTxHash = originatingRskTxHash;
    foundReceivedPegoutStatus.btcRecipientAddress = '19oS3TSoxpJdksLDzX13MdUSP4oB2R4MVC';
    foundReceivedPegoutStatus.createdOn = createdOn;
    foundReceivedPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    foundReceivedPegoutStatus.rskBlockHeight = 2831033;
    foundReceivedPegoutStatus.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    foundReceivedPegoutStatus.status = PegoutStatus.RECEIVED;
    foundReceivedPegoutStatus.valueRequestedInSatoshis = 500000;

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
    status.valueRequestedInSatoshis = amount;
    status.btcTxHash = btcTxHash;
    status.status = PegoutStatus.WAITING_FOR_CONFIRMATION;
    status.valueRequestedInSatoshis = 500000;
    status.valueInSatoshisToBeReceived = 337100;
    status.feeInSatoshisToBePaid = 162900;
    status.btcRawTransaction = bridgeState.pegoutsWaitingForConfirmations[0].btcRawTx;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

});
