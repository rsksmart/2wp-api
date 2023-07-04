import {expect, sinon} from '@loopback/testlab';
import { PegoutStatusDataService } from '../../../services/pegout-status-data-services/pegout-status-data.service';
import { PegoutDataProcessor } from '../../../services/pegout-data.processor';
import { SinonStubbedInstance } from 'sinon';
import { PegoutStatusMongoDbDataService } from '../../../services/pegout-status-data-services/pegout-status-mongo.service';
import ExtendedBridgeTx from '../../../services/extended-bridge-tx';
import {Transaction} from 'bridge-transaction-parser';
import { BRIDGE_EVENTS, BRIDGE_METHODS } from '../../../utils/bridge-utils';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import { PegoutStatus, PegoutStatusDbDataModel } from '../../../models/rsk/pegout-status-data-model';
import { BridgeService } from '../../../services';
import * as constants from '../../../constants';
import { BridgeState } from '@rsksmart/bridge-state-data-parser';
import { ExtendedBridgeEvent } from '../../../models/types/bridge-transaction-parser';
import { remove0x, ensure0x } from '../../../utils/hex-utils';

const sandbox = sinon.createSandbox();

const rskTxHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';
const blockHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';
const btcRawTx1 = '02000000015c13c5492167645155bbc9145dbd77253162c668e651535a85a329f40385a9d201000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff023cfe0600000000001976a914cab5925c59a9a413f8d443000abcc5640bdf067588ac407806000000000017a9148f38b3d8ec8816f7f58a390f306bb90bb178d6ac8700000000';
const btcRawTx2 = '0200000003f3b412ca8a5f5d30a780d9f209a6565190f20b946f15ab040759c1afaad593b201000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff56d9bbd7e6ff6230935d90b6a33b4df492597e79a30358f5d8ab101491959cb401000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff0c640358798d4ee73d4086347489626ee44b5aed70a165c3d72dc59e83e2a2b401000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff02cc240500000000001976a91460890b78920fed16f7505dc1e8b66ea249da062288ac74db06000000000017a9148f38b3d8ec8816f7f58a390f306bb90bb178d6ac8700000000';
const btcRawTx3 = '0200000001701d53fb64c827699dffe2885601b41df981a0a0183a9a44782587f27de65c4503000000fd270100000000004d1f01645321025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da21032822626c45fc1c4e3a3def5b4983636d6291a7a6677f66874c337e78bc3b7784210357a2621df0252caa3c4ccb383d6b309c93adbc6708bccfe751bb0cfeb12d34282103fb8e1d5d0392d35ca8c3656acb6193dbf392b3e89b9b7b86693f5c80f7ce858155ae670350cd00b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f53ae68ffffffff028cff0500000000001976a91409197f6153cb3a91bb51eec373360a1cb3b7c0e088ac2caaa9020000000017a914899e3000cbc7bb817e15c9a8e7a4fd6e78a04c488700000000';

const bridgeState: BridgeState = {
  pegoutsWaitingForConfirmations: [
    {
      btcRawTx: btcRawTx2,
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
process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS = '10';

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
    expect(thisService.getFilters().length).to.equal(4);
  });

  it('handles RECEIVED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x40d2878B98A9C5A5b7bc3B2FC0e26dfDefCfe737';
    const btcDestinationAddress = '0x09197f6153cb3a91bb51eec373360a1cb3b7c0e0';
    const amount = 566666;

    const releaseRequestReceivedEventsArgs = {
      sender : rskSenderAddress,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };

    const createdOn = new Date();

    const bridgeTransaction: Transaction = {
      txHash: '0xfffce75653adb8b90a1be6809a44d37e07c4f7cf5d4daf209f3e23a4c9a29cf1',
      blockNumber: 3609605,
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

    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestReceivedEvent:ExtendedBridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;
    const theRskSenderAddress = <string> releaseRequestReceivedEvent!.arguments.sender;
    const theBtcDestinationAddress = <string> releaseRequestReceivedEvent!.arguments.btcDestinationAddress;
    const theAmount = <number> releaseRequestReceivedEvent!.arguments.amount;

    const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = theRskSenderAddress;
    status.btcRecipientAddress = theBtcDestinationAddress;
    status.valueRequestedInSatoshis = theAmount;
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.RECEIVED;
    status.rskBlockHash = extendedBridgeTx.blockHash;
    status.originatingRskBlockHash = extendedBridgeTx.blockHash;
    status.isNewestStatus = true;
    sinon.assert.calledOnce(mockedPegoutStatusDataService.set);
  });

  it('verify method isMethodAccepted returns true for RECEIVED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x40d2878B98A9C5A5b7bc3B2FC0e26dfDefCfe737';
    const btcDestinationAddress = '0x09197f6153cb3a91bb51eec373360a1cb3b7c0e0';
    const amount = 566666;

    const releaseRequestReceivedEventsArgs = {
      sender : rskSenderAddress,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };

    const createdOn = new Date();

    const bridgeTransaction: Transaction = {
      txHash: '0xfffce75653adb8b90a1be6809a44d37e07c4f7cf5d4daf209f3e23a4c9a29cf1',
      blockNumber: 3609605,
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

    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestReceivedEvent:ExtendedBridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;
    const theRskSenderAddress = <string> releaseRequestReceivedEvent!.arguments.sender;
    const theBtcDestinationAddress = <string> releaseRequestReceivedEvent!.arguments.btcDestinationAddress;
    const theAmount = <number> releaseRequestReceivedEvent!.arguments.amount;

    const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = theRskSenderAddress;
    status.btcRecipientAddress = theBtcDestinationAddress;
    status.valueRequestedInSatoshis = theAmount;
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.RECEIVED;
    status.rskBlockHash = extendedBridgeTx.blockHash;
    status.originatingRskBlockHash = extendedBridgeTx.blockHash;
    status.isNewestStatus = true;

    expect(thisService.isMethodAccepted(extendedBridgeTx)).true;
  });

  it('Parse correctly method name "" ', async () => {
    const rskSenderAddress = '0x40d2878B98A9C5A5b7bc3B2FC0e26dfDefCfe737';
    const btcDestinationAddress = '0x09197f6153cb3a91bb51eec373360a1cb3b7c0e0';
    const amount = 566666;

    const releaseRequestReceivedEventsArgs = {
      sender : rskSenderAddress,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };

    const createdOn = new Date();

    const bridgeTransaction: Transaction = {
      txHash: '0xfffce75653adb8b90a1be6809a44d37e07c4f7cf5d4daf209f3e23a4c9a29cf1',
      blockNumber: 3609605,
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

    const name = (extendedBridgeTx.method.name || extendedBridgeTx.method.name === '') ? extendedBridgeTx.method.name : extendedBridgeTx.method as unknown as string;
    expect(name).empty;
  });

  it('validate accepted methods for method "" ', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const btcDestinationAddress = 'mreuQThm58CrYL4WCuY4SmDqiAQzWSy9GR';
    const amount = 504237;

    const releaseRequestReceivedEventsArgs = {
      sender : rskSenderAddress,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };

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

    expect(thisService.isMethodAccepted(extendedBridgeTx)).true;
  });

  it('validate accepted methods for a valid method ', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const btcDestinationAddress = 'mreuQThm58CrYL4WCuY4SmDqiAQzWSy9GR';
    const amount = 504237;

    const releaseRequestReceivedEventsArgs = {
      sender : rskSenderAddress,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };


    const createdOn = new Date();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'zzzzzz-invalid-xxxxx',
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

    expect(thisService.isMethodAccepted(extendedBridgeTx)).false;
  });

  it('validate accepted methods for a invalid method ', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const btcDestinationAddress = 'mreuQThm58CrYL4WCuY4SmDqiAQzWSy9GR';
    const amount = 504237;

    const releaseRequestReceivedEventsArgs = {
      sender : rskSenderAddress,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };

    const createdOn = new Date();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: BRIDGE_METHODS.UPDATE_COLLECTIONS,
        signature: '',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED,
        signature: '0x8e04e2f2c246a91202761c435d6a4971bdc7af0617f0c739d900ecd12a6d7266',
        arguments: releaseRequestReceivedEventsArgs,
      },]
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

    expect(thisService.isMethodAccepted(extendedBridgeTx)).false;
  });

  it('handles REJECTED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const bridgeService: BridgeService = <BridgeService> {};
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, bridgeService);
    const rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    const reason = '3';

    const releaseRequestedRejectEventsArgs = {
      sender : rskSenderAddress,
      reason : reason,
    };

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

    const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.REJECTED;

    sinon.assert.calledOnceWithMatch(mockedPegoutStatusDataService.set, status);

  });

  it('handles RELEASE_REQUEST_RECEIVED status, testnet', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const rskTxSender = '0x1234567890123456789012345678901234567890';
    const btcDestinationAddress = 'mgM4vPBnDKa8cKkXki4Bp5nQ7hgTGd4va8';
    const amount = 500000;
    const originatingRskTxHash = '0x5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698';
    const createdOn = new Date();
    const rskBlockHeight = 2831033;

    const releaseRequestReceivedEventsArgs = {
      rskTxSender : rskTxSender,
      btcDestinationAddress : btcDestinationAddress,
      amount : amount,
    };

    const bridgeTransaction: Transaction = {
      txHash: originatingRskTxHash,
      blockNumber: rskBlockHeight,
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

    expect(thisService.isMethodAccepted(extendedBridgeTx)).equal(true);
    await thisService.process(extendedBridgeTx);
    sinon.assert.calledOnce(mockedPegoutStatusDataService.set);
  });

  it('handles RELEASE_REJECTED status', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const rskTxHash = '0x3769e1117683faa318c683af5fb763dc03d431580ecf2ad1271ff25bf946fe9c';
    const btcTxHash = '0xfbfbc14548d7a352287b5f02199ac909d473333f7c2a072eb4dfda30f97a84e2';
    const amount = 500000;
    const originatingRskTxHash = '0x5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698';
    const createdOn = new Date();
    const rskBlockHeight = 2831033;

    const releaseRequestedEventsArgs = {
      rskTxHash : originatingRskTxHash,
      btcTxHash : btcTxHash,
      amount : amount,
    };

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: rskBlockHeight,
      method: {
        name: '',
        signature: '',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED,
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

    expect(thisService.isMethodAccepted(extendedBridgeTx)).equal(true);
    await thisService.process(extendedBridgeTx);
    sinon.assert.calledOnce(mockedPegoutStatusDataService.set);

  });

  it('handles WAITING_FOR_SIGNATURE status for pegouts WAITING_FOR_CONFIRMATIONS that have enough confirmations', async () => {

    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);

    const createdOn = new Date();

    const originatingRskTxHash = '0x3ca5051117e635df4e77a66214d3a0805904c1b86357d5c43279d73f7baad8d9';
    const rskTxHash = '0x7bdcfca72ea7103a804f9f9013bfb205c8c61fe9deb903a9923e03b80a16bfd2';

    const dbPegoutWaitingForConfirmation: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    const originatingRskBlockHeight = 2869963;
    const currentRskBlockHeight = 2869983;
    const pegoutCreationRskBlockHeight = 2869973;

    dbPegoutWaitingForConfirmation.rskTxHash = rskTxHash;
    dbPegoutWaitingForConfirmation.btcRecipientAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';
    dbPegoutWaitingForConfirmation.createdOn = createdOn;
    dbPegoutWaitingForConfirmation.originatingRskTxHash = originatingRskTxHash;
    dbPegoutWaitingForConfirmation.rskBlockHeight = pegoutCreationRskBlockHeight;
    dbPegoutWaitingForConfirmation.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    dbPegoutWaitingForConfirmation.status = PegoutStatus.WAITING_FOR_CONFIRMATION;
    dbPegoutWaitingForConfirmation.btcRawTransaction = btcRawTx1;
    dbPegoutWaitingForConfirmation.originatingRskBlockHeight = originatingRskBlockHeight;
    dbPegoutWaitingForConfirmation.valueRequestedInSatoshis = 521000;

    mockedPegoutStatusDataService.getManyWaitingForConfirmationNewestCreatedOnBlock.resolves([dbPegoutWaitingForConfirmation]);

    const pegoutConfirmedEventArgs = new Map();
    pegoutConfirmedEventArgs.set('btcTxHash', '');
    pegoutConfirmedEventArgs.set('pegoutCreationRskBlockNumber', pegoutCreationRskBlockHeight);

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: currentRskBlockHeight,
      method: {
        name: '',
        signature: '',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.PEGOUT_CONFIRMED,
        signature: '',
        arguments: pegoutConfirmedEventArgs
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

    const pegoutWithWaitingForSignature: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    pegoutWithWaitingForSignature.rskTxHash = rskTxHash;
    pegoutWithWaitingForSignature.btcRecipientAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';
    pegoutWithWaitingForSignature.createdOn = createdOn;
    pegoutWithWaitingForSignature.originatingRskTxHash = originatingRskTxHash;
    pegoutWithWaitingForSignature.rskBlockHeight = currentRskBlockHeight;
    pegoutWithWaitingForSignature.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    pegoutWithWaitingForSignature.status = PegoutStatus.WAITING_FOR_SIGNATURE;
    pegoutWithWaitingForSignature.btcRawTransaction = btcRawTx1;
    pegoutWithWaitingForSignature.originatingRskBlockHeight = originatingRskBlockHeight;
    pegoutWithWaitingForSignature.valueRequestedInSatoshis = 521000;

    sinon.assert.calledTwice(mockedPegoutStatusDataService.set);
  });

  it('handles SIGNED status for pegouts WAITING_FOR_SIGNATURE', async () => {

    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);

    const createdOn = new Date();

    const originatingRskTxHash = '0x3ca5051117e635df4e77a66214d3a0805904c1b86357d5c43279d73f7baad8d9';
    const rskTxHash = '0x7bdcfca72ea7103a804f9f9013bfb205c8c61fe9deb903a9923e03b80a16bfd2';

    const dbPegoutWaitingForSignature: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    const rskBlockHeight = 2869973;
    const rskBlockHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d661';
    const batchPegoutRskTxHash = 'testhash';

    dbPegoutWaitingForSignature.rskTxHash = rskTxHash;
    dbPegoutWaitingForSignature.btcRecipientAddress = 'mgM4vPBnDKa8cKkXki4Bp5nQ7hgTGd4va8';
    dbPegoutWaitingForSignature.createdOn = createdOn;
    dbPegoutWaitingForSignature.originatingRskTxHash = originatingRskTxHash;
    dbPegoutWaitingForSignature.rskBlockHeight = rskBlockHeight - 200;
    dbPegoutWaitingForSignature.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    dbPegoutWaitingForSignature.status = PegoutStatus.WAITING_FOR_SIGNATURE;
    dbPegoutWaitingForSignature.btcRawTransaction = btcRawTx1;
    dbPegoutWaitingForSignature.originatingRskBlockHeight = 2869983;
    dbPegoutWaitingForSignature.valueRequestedInSatoshis = 521000;
    dbPegoutWaitingForSignature.originatingRskBlockHash = blockHash;
    dbPegoutWaitingForSignature.rskBlockHash = rskBlockHash;
    dbPegoutWaitingForSignature.batchPegoutRskTxHash = batchPegoutRskTxHash;

    mockedPegoutStatusDataService.getPegoutByRecipientAndCreationTx
      .withArgs(dbPegoutWaitingForSignature.btcRecipientAddress, batchPegoutRskTxHash)
      .resolves([dbPegoutWaitingForSignature]);

    mockedBridgeService.getBridgeState.resolves(bridgeState);

    const relaseBtcEventsArgs = {
      btcRawTransaction : btcRawTx3,
      releaseRskTxHash: batchPegoutRskTxHash,
    };

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: rskBlockHeight,
      method: {
        name: 'addSignature',
        signature: '0xf10b9c59',
        arguments: new Map()
      },
      events: [{
        name: BRIDGE_EVENTS.RELEASE_BTC,
        signature: '0x655929b56d5c5a24f81ee80267d5151b9d680e7e703387999922e9070bc98a02',
        arguments: relaseBtcEventsArgs
      }]
    }

    const rskBlockHash2 = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d662';

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash: rskBlockHash2,
      txHash: bridgeTransaction.txHash,
      createdOn,
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    await thisService.process(extendedBridgeTx);

    const pegoutWithSigned: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    pegoutWithSigned.rskTxHash = rskTxHash;
    pegoutWithSigned.btcRecipientAddress = 'mgM4vPBnDKa8cKkXki4Bp5nQ7hgTGd4va8';
    pegoutWithSigned.createdOn = createdOn;
    pegoutWithSigned.originatingRskTxHash = originatingRskTxHash;
    pegoutWithSigned.rskBlockHeight = rskBlockHeight;
    pegoutWithSigned.rskSenderAddress = '0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc';
    pegoutWithSigned.status = PegoutStatus.RELEASE_BTC;
    pegoutWithSigned.btcRawTransaction = btcRawTx1;
    pegoutWithSigned.originatingRskBlockHeight = 2869983;
    pegoutWithSigned.valueRequestedInSatoshis = 521000;
    pegoutWithSigned.originatingRskBlockHash = blockHash;
    pegoutWithSigned.rskBlockHash = rskBlockHash2;
    pegoutWithSigned.valueRequestedInSatoshis= 521000,
    pegoutWithSigned.valueInSatoshisToBeReceived= 44673580,
    pegoutWithSigned.feeInSatoshisToBePaid= -44152580,
    pegoutWithSigned.btcRawTransaction= '0200000001701d53fb64c827699dffe2885601b41df981a0a0183a9a44782587f27de65c4503000000fd270100000000004d1f01645321025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da21032822626c45fc1c4e3a3def5b4983636d6291a7a6677f66874c337e78bc3b7784210357a2621df0252caa3c4ccb383d6b309c93adbc6708bccfe751bb0cfeb12d34282103fb8e1d5d0392d35ca8c3656acb6193dbf392b3e89b9b7b86693f5c80f7ce858155ae670350cd00b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f53ae68ffffffff028cff0500000000001976a91409197f6153cb3a91bb51eec373360a1cb3b7c0e088ac2caaa9020000000017a914899e3000cbc7bb817e15c9a8e7a4fd6e78a04c488700000000',

    expect(thisService.isMethodAccepted(extendedBridgeTx)).equal(true);
    sinon.assert.calledWithMatch(mockedPegoutStatusDataService.set, dbPegoutWaitingForSignature);
  });

  it('handles BATCH_PEGOUT_CREATED status', async () => {
    sandbox.stub(process.env, 'NETWORK').value(constants.NETWORK_MAINNET);
    const mockedPegoutStatusDataService:PegoutStatusDataService =
      {
        deleteByRskBlockHeight: sinon.stub(),
        getManyByOriginatingRskTxHash: sinon.stub(),
        getLastByOriginatingRskTxHash: sinon.stub(),
        getLastByOriginatingRskTxHashNewest: sinon.stub(),
        getAllNotFinishedByBtcRecipientAddress: sinon.stub(),
        getPegoutByRecipientAndCreationTx: sinon.stub(),
        set: sinon.stub(),
        getManyWaitingForConfirmationNewest: sinon.stub(),
        getManyWaitingForSignaturesNewest: sinon.stub(),
        getManyByRskTxHashes: sinon.stub(),
        getManyByBtcRawTxInputsHashNewest: sinon.stub(),
        getManyWaitingForConfirmationNewestCreatedOnBlock: sinon.stub(),
        getById: sinon.stub(),
        getMany: sinon.stub(),
        delete: sinon.stub(),
        start: sinon.stub(),
        stop: sinon.stub()
      };

    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const createdOn = new Date();
    mockedBridgeService.getBridgeState.resolves(bridgeState);
    const getLastByOriginatingRskTxHash = mockedPegoutStatusDataService.getLastByOriginatingRskTxHashNewest as sinon.SinonStub;
    const set = mockedPegoutStatusDataService.set as sinon.SinonStub;

    const extendedBridgeTx: ExtendedBridgeTx = {
      txHash: "0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5",
      method: {
        name: "updateCollections",
        signature: "0x0c5a9990",
        arguments: {
        },
      },
      events: [
        {
          name: "update_collections",
          signature: "0x1069152f4f916cbf155ee32a695d92258481944edb5b6fd649718fc1b43e515e",
          arguments: {
            sender: "0xD478f3CE39cc5957b890C09EFE709AC7d4c282F8",
          },
        },
        {
          name: "release_requested",
          signature: "0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790",
          arguments: {
            rskTxHash: "0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5",
            btcTxHash: "0x14b8033bda330b5aba325040188419129c60762e852d7add97f40d14bbdc6931",
            amount: "4500000",
          },
        },
        {
          name: "batch_pegout_created",
          signature: "0x483d0191cc4e784b04a41f6c4801a0766b43b1fdd0b9e3e6bfdca74e5b05c2eb",
          arguments: {
            btcTxHash: "0x14b8033bda330b5aba325040188419129c60762e852d7add97f40d14bbdc6931",
            releaseRskTxHashes: "0xed0b3849b1087653d916f490392b7c7578c4611ef4b0ec1063d6bcd393fb60806205c184b4039891bfeea7c9f1198851dc71906afd677098618cdcb81a17b484a7d55089e1339a7ca1fce6d2f8014ad9f03897982f77ca8af756c8ad25903b49790a13033e2766699b226aef2de80abe4f0714d09da76c5f93d0977ce6b3246cd05d84ed8add93279ae3d608685c563b683a45c3c5d93fa4a792ba9d46f334c17a8661aa403de296e9bdc6b548404689f4d19a85a09d451c71cc15b92f916207498c3f1c2ecaee97696b8cf61841204cadb218ffe09552e3e48e0a1e1a81267bd06861f412bb86f5cd9192bd6adb08a76b82ed88aa6145da714607a0200dd7e076d856c85b2e6c524f6d6eb0e23621df999ddc2cad2ded8aaee678d4a9aa6f81",
          },
        },
      ],
      blockNumber: 3552254,
      blockHash: "0x4746b0c952019e464066ebb34d802bdc4c5f41825b0eb17b634d22ac8a4082da",
      createdOn: createdOn,
      to: "0x0000000000000000000000000000000001000006",
    };

    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const hasEvent = events.some(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);
    const batchPegoutsEvent = events.find(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);

    expect(hasEvent).true;
    expect(batchPegoutsEvent).not.null;

    const foundPegoutStatus: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
    foundPegoutStatus.isNewestStatus = true;
    foundPegoutStatus.btcRecipientAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55';

    let allPegoutTxs = remove0x(batchPegoutsEvent!.arguments.releaseRskTxHashes);
    let totalHashes = allPegoutTxs.length / 64;

    expect(totalHashes).equal(9);

    let eventData = '';

    for(let i = 0; i < totalHashes; i++) {
      eventData = ensure0x(allPegoutTxs.slice(64*i, (64*i) + 64));
      foundPegoutStatus.originatingRskTxHash = eventData;
      getLastByOriginatingRskTxHash.withArgs(eventData).resolves(foundPegoutStatus);
    }

    await thisService.process(extendedBridgeTx);
    const btcTxHash = <string> batchPegoutsEvent!.arguments.btcTxHash;
    const newClonedPegoutStatus:PegoutStatusDbDataModel = {
      rskTxHash: '0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5_1',
      btcRecipientAddress: 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55',
      originatingRskTxHash: '0xed0b3849b1087653d916f490392b7c7578c4611ef4b0ec1063d6bcd393fb6080',
      status: PegoutStatus.WAITING_FOR_CONFIRMATION,
      rskBlockHeight: 3552254,
      btcTxHash: btcTxHash,
      isNewestStatus: true,
      rskBlockHash: '0x4746b0c952019e464066ebb34d802bdc4c5f41825b0eb17b634d22ac8a4082da',
      batchPegoutIndex: 1,
      batchPegoutRskTxHash: '0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5',
      rskSenderAddress: '',
      createdOn: new Date(),
      originatingRskBlockHash: '',
      originatingRskBlockHeight: 0,
      btcRawTransaction: '',
      valueRequestedInSatoshis: 0,
      valueInSatoshisToBeReceived: 0,
      feeInSatoshisToBePaid: 0,
      reason: '',
      btcRawTxInputsHash: '',
      getId: function (): string {
        return '';
      },
      getIdFieldName: function (): string {
        return '';
      },
      setRskTxInformation: function (_extendedBridgeTx: ExtendedBridgeTx): void {
      },
    }
    var spy = sinon.spy();
    spy(newClonedPegoutStatus);
    getLastByOriginatingRskTxHash.withArgs(newClonedPegoutStatus.batchPegoutRskTxHash);
    sinon.assert.calledWith(spy, sinon.match({ batchPegoutRskTxHash: "0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5" }));
    sinon.assert.callCount(getLastByOriginatingRskTxHash, totalHashes);
    sinon.assert.callCount(set, totalHashes * 2);
  }).timeout(20000);

  it('returns same valueInSatoshisToBeReceived when did not find pegout in pegoutsWaitingForConfirmations', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const mockedPegoutStatus = new PegoutStatusDbDataModel();
    mockedPegoutStatus.originatingRskTxHash = rskTxHash;
    mockedPegoutStatus.valueInSatoshisToBeReceived = 1000;
    mockedBridgeService.getBridgeState.resolves(bridgeState);
    await thisService['addValueInSatoshisToBeReceivedAndFee'](mockedPegoutStatus);
    expect(mockedPegoutStatus.valueInSatoshisToBeReceived).equal(1000);
  })

  it('returns same valueInSatoshisToBeReceived when found a pegout but did not find an output containing the btcRecipientAddress', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const mockedPegoutStatus = new PegoutStatusDbDataModel();
    mockedPegoutStatus.originatingRskTxHash = '0x5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698';
    mockedPegoutStatus.valueInSatoshisToBeReceived = 1000;
    mockedBridgeService.getBridgeState.resolves(bridgeState);
    await thisService['addValueInSatoshisToBeReceivedAndFee'](mockedPegoutStatus);
    expect(mockedPegoutStatus.valueInSatoshisToBeReceived).equal(1000);
  })

  it('returns calculated valueInSatoshisToBeReceived when found pegout in pegoutsWaitingForConfirmations', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);
    const mockedPegoutStatus = new PegoutStatusDbDataModel();
    mockedPegoutStatus.originatingRskTxHash = '0x5628682b56ef179e066fd12ee25a84436def371b0a11b45cf1d8308ed06f4698';
    mockedPegoutStatus.btcRawTransaction = btcRawTx2;
    mockedPegoutStatus.btcRecipientAddress = 'mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55'; // output address with value 337100 from raw tx
    mockedBridgeService.getBridgeState.resolves(bridgeState);
    await thisService['addValueInSatoshisToBeReceivedAndFee'](mockedPegoutStatus);
    expect(mockedPegoutStatus.valueInSatoshisToBeReceived).equal(337100);
  })

  it('processIndividualPegout', async () => {
    const mockedPegoutStatusDataService = sinon.createStubInstance(PegoutStatusMongoDbDataService) as SinonStubbedInstance<PegoutStatusDataService>;
    const mockedBridgeService = sinon.createStubInstance(BridgeService) as SinonStubbedInstance<BridgeService> & BridgeService;
    const thisService = new PegoutDataProcessor(mockedPegoutStatusDataService, mockedBridgeService);

    const extendedBridgeTx: ExtendedBridgeTx = {
      txHash: "0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5",
      method: {
        name: "updateCollections",
        signature: "0x0c5a9990",
        arguments: {
        },
      },
      events: [
        {
          name: "update_collections",
          signature: "0x1069152f4f916cbf155ee32a695d92258481944edb5b6fd649718fc1b43e515e",
          arguments: {
            sender: "0xD478f3CE39cc5957b890C09EFE709AC7d4c282F8",
          },
        },
        {
          name: "release_requested",
          signature: "0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790",
          arguments: {
            rskTxHash: "0x6843cfeaafe38e1044ec5638877ff766015b44887d32c7aef7daec84aa3af7c5",
            btcTxHash: "0x14b8033bda330b5aba325040188419129c60762e852d7add97f40d14bbdc6931",
            amount: "4500000",
          },
        },
        {
          name: "batch_pegout_created",
          signature: "0x483d0191cc4e784b04a41f6c4801a0766b43b1fdd0b9e3e6bfdca74e5b05c2eb",
          arguments: {
            btcTxHash: "0x14b8033bda330b5aba325040188419129c60762e852d7add97f40d14bbdc6931",
            releaseRskTxHashes: "0xed0b3849b1087653d916f490392b7c7578c4611ef4b0ec1063d6bcd393fb60806205c184b4039891bfeea7c9f1198851dc71906afd677098618cdcb81a17b484a7d55089e1339a7ca1fce6d2f8014ad9f03897982f77ca8af756c8ad25903b49790a13033e2766699b226aef2de80abe4f0714d09da76c5f93d0977ce6b3246cd05d84ed8add93279ae3d608685c563b683a45c3c5d93fa4a792ba9d46f334c17a8661aa403de296e9bdc6b548404689f4d19a85a09d451c71cc15b92f916207498c3f1c2ecaee97696b8cf61841204cadb218ffe09552e3e48e0a1e1a81267bd06861f412bb86f5cd9192bd6adb08a76b82ed88aa6145da714607a0200dd7e076d856c85b2e6c524f6d6eb0e23621df999ddc2cad2ded8aaee678d4a9aa6f81",
          },
        },
      ],
      blockNumber: 3552254,
      blockHash: "0x4746b0c952019e464066ebb34d802bdc4c5f41825b0eb17b634d22ac8a4082da",
      createdOn: new Date(),
      to: "0x0000000000000000000000000000000001000006",
    };

    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const hasEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);
    const releaseRequestedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);

    mockedPegoutStatusDataService.getLastByOriginatingRskTxHashNewest.resolves(new PegoutStatusDbDataModel());
    sinon.stub(thisService, 'addValueInSatoshisToBeReceivedAndFee' as any);

    expect(hasEvent).true;
    expect(releaseRequestedEvent).not.null;

    await thisService['processIndividualPegout'](extendedBridgeTx);
    sinon.assert.calledTwice(mockedPegoutStatusDataService.set);
  })
});
