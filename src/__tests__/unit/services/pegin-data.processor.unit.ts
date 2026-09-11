import {expect} from '@loopback/testlab';
import {PeginStatus, PeginStatusDataModel} from '../../../models/rsk/pegin-status-data.model';
import {PeginDataProcessor} from '../../../services/pegin-data.processor';
import {PeginStatusDataService} from '../../../services/pegin-status-data-services/pegin-status-data.service';
import sinon, {SinonStubbedInstance} from 'sinon';
import {PeginStatusMongoDbDataService} from '../../../services/pegin-status-data-services/pegin-status-mongo.service';
import ExtendedBridgeTx from '../../../services/extended-bridge-tx';
import {Transaction} from '@rsksmart/bridge-transaction-parser';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {ExtendedBridgeEvent} from "../../../models/types/bridge-transaction-parser";
import {AtlasEventPublisher} from '../../../services/atlas/atlas-event-publisher';
import {AtlasEventMetrics} from '../../../services/atlas/atlas-event-metrics';
import {AtlasEvent, AtlasEventType, SwapCreatedData, SwapRejectedData} from '../../../models/atlas/atlas-event.model';

type StubbedAtlasEventPublisher = AtlasEventPublisher & {publish: sinon.SinonStub};

const givenAtlasEventPublisher = (): StubbedAtlasEventPublisher =>
  ({publish: sinon.stub().resolves(), metrics: new AtlasEventMetrics()});

const publishedEvents = (publisher: StubbedAtlasEventPublisher): AtlasEvent[] =>
  publisher.publish.getCalls().map(call => call.args[0] as AtlasEvent);

const btcTxHash = '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950';
const rskTxHash = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
const blockHash = '0xe934eb559aa52270dcad6ca6a890b19ba8605381b90a72f4a19a850a2e79d660';

const getMockedRegisterBtcTransactionMethodArgs = () => {
  const lockPeginBtcMethodArgs = new Map();
  lockPeginBtcMethodArgs.set('tx', '0x0100000001');
  lockPeginBtcMethodArgs.set('height', '2195587');
  lockPeginBtcMethodArgs.set('pmt', '0x4100000008');
  return lockPeginBtcMethodArgs;
};

const getMockedPeginBtcEvent = () => {
  const peginBtcEvent: ExtendedBridgeEvent = {
    name: 'pegin_btc',
    signature: '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    arguments: {
      receiver : '0x2D623170Cb518434af6c02602334610f194818c1',
      btcTxHash,
      amount : 504237,
      protocolVersion :'1'
    }
  };
  return peginBtcEvent;
};

const getMockedLockBtcEvent = () => {
  const peginBtcEvent: ExtendedBridgeEvent = {
    name: 'lock_btc',
    signature: '0xec2232bdbe54a92238ce7a6b45d53fb31f919496c6abe1554be1cc8eddb6600a',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    arguments: {
      receiver : '0x2D623170Cb518434af6c02602334610f194818c1',
      senderBtcAddress: '0x413bfc1ab391bbedcfdbc45116c5a0a75e628fc4d7b955dfb99b0214d0f1be43',
      btcTxHash,
      amount : 1000000,
    }
  };
  return peginBtcEvent;
};

const getMockedRejectedPeginEvent = () => {
  const rejectedPeginEventArgs = new Map();
  rejectedPeginEventArgs.set('btcTxHash', btcTxHash);
  rejectedPeginEventArgs.set('reason', '3');
  const peginBtcEvent: ExtendedBridgeEvent = {
    name: 'rejected_pegin',
    signature: '0x708ce1ead20561c5894a93be3fee64b326b2ad6c198f8253e4bb56f1626053d6',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    arguments: {
      btcTxHash,
      reason: '3'
    }
  };
  return peginBtcEvent;
};

const getMockedReleaseRequestedEvent = () => {
  const peginBtcEvent: ExtendedBridgeEvent = {
    name: 'release_requested',
    signature: '0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    arguments: {
      btcTxHash,
      rskTxHash,
      amount : 1000,
    }
  };
  return peginBtcEvent;
};

const getMockedUnrefundablePeginEvent = () => {
  const lunrefundablePeginEventArgs = new Map();
  lunrefundablePeginEventArgs.set('btcTxHash', btcTxHash);
  lunrefundablePeginEventArgs.set('reason', '1');
  const peginBtcEvent: ExtendedBridgeEvent = {
    name: 'unrefundable_pegin',
    signature: '0x35be155c87e408cbbcb753dc12f95fc5a242a29460a3d7189e807e63d7c185a7',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    arguments: {
      btcTxHash,
      reason: '1',
    }
  };
  return peginBtcEvent;
};

describe('Service: PeginDataProcessor', () => {

  it('parses a transaction with no event logs as null', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const extendedBridgeTx: ExtendedBridgeTx = <ExtendedBridgeTx> {};
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);
    expect(result).to.be.null;
  });

  it('parses a transaction with a random log as null', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const extendedBridgeTx: ExtendedBridgeTx = <ExtendedBridgeTx> <unknown> {events: [{name: 'random'}]};
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);
    expect(result).to.be.null;
  });

  it('parses a transaction with a PEGIN_BTC log properly', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedPeginBtcEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      const [event] = bridgeTransaction.events as ExtendedBridgeEvent[];
      const rskReceiver = <string> event.arguments.receiver;
      expect(result.rskRecipient).to.be.equal(rskReceiver.toLowerCase());
      expect(result.status).to.be.equal(PeginStatus.LOCKED);
      expect(result.btcTxId).to.be.equal(btcTxHash);
    }
  });

  it('parses a transaction with a LOCK_BTC log properly', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedLockBtcEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      const [event] = bridgeTransaction.events as ExtendedBridgeEvent[];
      const rskReceiver = <string> event.arguments.receiver;
      expect(result.rskRecipient).to.be.equal(rskReceiver.toLowerCase());
      expect(result.status).to.be.equal(PeginStatus.LOCKED);
      expect(result.btcTxId).to.be.equal(btcTxHash);
    }
  });

  it('parses a rejected_pegin with neither companion log as REJECTED_NO_REFUND', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);

    // The Bridge rejected the peg-in and emitted no refund branch at all. The
    // user's funds are not coming back, so the honest status is the same one a
    // declared unrefundable pegin gets, rather than no status at all.
    expect(result).to.not.be.null();
    expect(result!.status).to.equal(PeginStatus.REJECTED_NO_REFUND);
    expect(result!.btcTxId).to.equal(btcTxHash);
    expect(result!.rskTxId).to.equal(rskTxHash);
  });

  it('parses a transaction with REJECTED_PEGIN and RELEASE_REQUESTED event logs as a rejected pegin with refund', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedReleaseRequestedEvent(), getMockedRejectedPeginEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      expect(result.rskRecipient).to.be.null; // ATM the parsing of a REJECTED_PEGIN can't set the recipient
      expect(result.status).to.be.equal(PeginStatus.REJECTED_REFUND);
      expect(result.btcTxId).to.be.equal(btcTxHash);
    }
  });

  it('parses a transaction with REJECTED_PEGIN and UNREFUNDABLE_PEGIN event logs as a rejected pegin with no refund', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent(), getMockedUnrefundablePeginEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      expect(result.rskRecipient).to.be.null; // ATM the parsing of a REJECTED_PEGIN can't set the recipient
      expect(result.status).to.be.equal(PeginStatus.REJECTED_NO_REFUND);
      expect(result.btcTxId).to.be.equal(btcTxHash);
    }
  });

  it('returns filters', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    expect(thisService.getFilters()).to.be.Array;
    expect(thisService.getFilters()).to.not.be.empty;
    expect(thisService.getFilters().length).to.equal(1);
  });


  it('processes pegin transaction', async () => {
    const mockedPeginStatusDataService =
      sinon.createStubInstance(PeginStatusMongoDbDataService) as SinonStubbedInstance<PeginStatusDataService>;;

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent(), getMockedReleaseRequestedEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    await thisService.process(extendedBridgeTx);
    sinon.assert.calledOnce(mockedPeginStatusDataService.set);
  });

  it('ignores pegin transaction if found in db', async () => {
    const mockedPeginStatusDataService =
      sinon.createStubInstance(PeginStatusMongoDbDataService) as SinonStubbedInstance<PeginStatusDataService>;

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent(), getMockedReleaseRequestedEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const foundPegin: PeginStatusDataModel = <PeginStatusDataModel>{};
    mockedPeginStatusDataService.getById.resolves(foundPegin);
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    await thisService.process(extendedBridgeTx);
    sinon.assert.neverCalledWith(mockedPeginStatusDataService.set);
  });

  it('returns early if no peginStatus can be parsed from transaction because event logs is empty', async () => {
    const mockedPeginStatusDataService =
      sinon.createStubInstance(PeginStatusMongoDbDataService) as SinonStubbedInstance<PeginStatusDataService>;

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: []
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService, givenAtlasEventPublisher());
    await thisService.process(extendedBridgeTx);
    sinon.assert.neverCalledWith(mockedPeginStatusDataService.getById);
    sinon.assert.neverCalledWith(mockedPeginStatusDataService.set);
  });

  describe('Atlas events', () => {
    const originalNetwork = process.env.NETWORK;
    const receiver = '0x2D623170Cb518434af6c02602334610f194818c1';
    const senderBtcAddress = 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8';
    // 0.5 BTC in satoshis: `pegin_btc` and `lock_btc` report satoshis, unlike
    // the peg-out logs which report weis. Verified on testnet at block 7140002,
    // where amount=50000000 credited the receiver 0.5 RBTC.
    const halfBtcInSatoshis = '50000000';

    beforeEach(() => {
      process.env.NETWORK = 'testnet';
    });

    after(() => {
      if (originalNetwork === undefined) {
        delete process.env.NETWORK;
      } else {
        process.env.NETWORK = originalNetwork;
      }
    });

    const givenPeginBtcEvent = (): ExtendedBridgeEvent => (<ExtendedBridgeEvent> <unknown> {
      name: 'pegin_btc',
      signature: '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a',
      arguments: {receiver, btcTxHash, amount: halfBtcInSatoshis, protocolVersion: '1'},
    });

    const givenLockBtcEvent = (): ExtendedBridgeEvent => (<ExtendedBridgeEvent> <unknown> {
      name: 'lock_btc',
      signature: '0xec2232bdbe54a92238ce7a6b45d53fb31f919496c6abe1554be1cc8eddb6600a',
      arguments: {receiver, senderBtcAddress, btcTxHash, amount: halfBtcInSatoshis},
    });

    const givenTx = (events: ExtendedBridgeEvent[]): ExtendedBridgeTx => (<ExtendedBridgeTx> <unknown> {
      sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
      blockTimestamp: 1626736729000,
      blockHash,
      txHash: rskTxHash,
      createdOn: new Date('2024-05-01T10:00:00.000Z'),
      blockNumber: 1,
      to: bridge.address,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs(),
      },
      events,
    });

    const givenProcessor = () => {
      const dataService =
        sinon.createStubInstance(PeginStatusMongoDbDataService) as SinonStubbedInstance<PeginStatusDataService>;
      const publisher = givenAtlasEventPublisher();
      return {dataService, publisher, processor: new PeginDataProcessor(dataService, publisher)};
    };

    it('publishes exactly two events for a LOCKED pegin, in order', async () => {
      const {dataService, publisher, processor} = givenProcessor();

      await processor.process(givenTx([givenPeginBtcEvent()]));

      sinon.assert.calledTwice(publisher.publish);
      const [event, completed] = publishedEvents(publisher);
      expect(event.event_type).to.equal(AtlasEventType.SWAP_CREATED);
      expect(completed.event_type).to.equal(AtlasEventType.SWAP_COMPLETED);
      expect(completed.swap_id).to.equal(event.swap_id);
      expect(event.swap_id).to.equal(btcTxHash);
      expect(event.emitted_at).to.equal('2024-05-01T10:00:00.000Z');

      const data = event.data as SwapCreatedData;
      expect(data.source_chain).to.equal('bitcoin_testnet');
      expect(data.destination_chain).to.equal('rootstock_testnet');
      expect(data.input_asset).to.equal('BTC');
      expect(data.output_asset).to.equal('RBTC');
      expect(data.input_amount).to.equal('0.50000000');
      expect(data.wallet_address).to.equal(receiver.toLowerCase());

      sinon.assert.callOrder(dataService.set, publisher.publish);
    });

    it('prefers the Bitcoin sender address when the log is lock_btc', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(givenTx([givenLockBtcEvent()]));

      const [event] = publishedEvents(publisher);
      expect((event.data as SwapCreatedData).wallet_address).to.equal(senderBtcAddress);
    });

    it('publishes swap.created then swap.rejected for a refundable rejection', async () => {
      const {dataService, publisher, processor} = givenProcessor();

      await processor.process(
        givenTx([getMockedRejectedPeginEvent(), getMockedReleaseRequestedEvent()]),
      );

      sinon.assert.calledTwice(publisher.publish);
      const [created, rejected] = publishedEvents(publisher);
      expect(created.event_type).to.equal(AtlasEventType.SWAP_CREATED);
      expect(rejected.event_type).to.equal(AtlasEventType.SWAP_REJECTED);
      expect(created.swap_id).to.equal(btcTxHash);
      expect(rejected.swap_id).to.equal(btcTxHash);

      // release_requested carries the amount the user sent; no log in this
      // branch carries an address.
      const createdData = created.data as SwapCreatedData;
      expect(createdData.input_amount).to.equal('0.00001000');
      expect(createdData.wallet_address).to.be.null();

      // rejected_pegin reason=3 is LEGACY_PEGIN_UNDETERMINED_SENDER in rskj.
      const rejectedData = rejected.data as SwapRejectedData;
      expect(rejectedData.refund_applicable).to.be.true();
      expect(rejectedData.error_category).to.equal('protocol_violation');
      expect(rejectedData.error_code).to.equal('LEGACY_PEGIN_UNDETERMINED_SENDER');
      expect(rejectedData.error_message).to.match(/rejected_pegin reason=3/);

      sinon.assert.callOrder(dataService.set, publisher.publish);
    });

    it('publishes the amount the user sent for a refundable rejection', async () => {
      const releaseRequested = (<ExtendedBridgeEvent> <unknown> {
        name: 'release_requested',
        signature: '0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790',
        arguments: {btcTxHash, rskTxHash, amount: halfBtcInSatoshis},
      });
      const {publisher, processor} = givenProcessor();

      await processor.process(givenTx([getMockedRejectedPeginEvent(), releaseRequested]));

      const [created] = publishedEvents(publisher);
      expect((created.data as SwapCreatedData).input_amount).to.equal('0.50000000');
    });

    it('reports zero for an unrefundable rejection, which carries no amount', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(
        givenTx([getMockedRejectedPeginEvent(), getMockedUnrefundablePeginEvent()]),
      );

      const [created] = publishedEvents(publisher);
      expect((created.data as SwapCreatedData).input_amount).to.equal('0.00000000');
    });

    it('publishes swap.created then a terminal swap.rejected for an unrefundable pegin', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(
        givenTx([getMockedRejectedPeginEvent(), getMockedUnrefundablePeginEvent()]),
      );

      sinon.assert.calledTwice(publisher.publish);
      const [created, rejected] = publishedEvents(publisher);
      expect(created.event_type).to.equal(AtlasEventType.SWAP_CREATED);

      // The code names the root cause, rejected_pegin reason=3, while the
      // unrefundable reason=1 only explains why no refund was issued.
      const rejectedData = rejected.data as SwapRejectedData;
      expect(rejectedData.refund_applicable).to.be.false();
      expect(rejectedData.error_category).to.equal('protocol_violation');
      expect(rejectedData.error_code).to.equal('LEGACY_PEGIN_UNDETERMINED_SENDER');
      expect(rejectedData.error_message).to.match(/unrefundable_pegin reason=1/);
      expect(rejectedData.error_message).to.match(/not refundable/);
    });

    describe('rejection with no refund branch', () => {
      const givenNoRefundBranchTx = () => givenTx([getMockedRejectedPeginEvent()]);

      it('persists that pegin so the user gets a status', async () => {
        const {dataService, processor} = givenProcessor();

        await processor.process(givenNoRefundBranchTx());

        sinon.assert.calledOnce(dataService.set);
        const [persisted] = dataService.set.firstCall.args as [PeginStatusDataModel];
        expect(persisted.status).to.equal(PeginStatus.REJECTED_NO_REFUND);
      });

      it('publishes swap.created then swap.rejected for it', async () => {
        const {publisher, processor} = givenProcessor();

        await processor.process(givenNoRefundBranchTx());

        sinon.assert.calledTwice(publisher.publish);
        const [created, rejected] = publishedEvents(publisher);
        expect(created.event_type).to.equal(AtlasEventType.SWAP_CREATED);
        expect(rejected.event_type).to.equal(AtlasEventType.SWAP_REJECTED);

        const rejectedData = rejected.data as SwapRejectedData;
        expect(rejectedData.error_code).to.equal('PEGIN_REJECTED_NO_REFUND_BRANCH');
        expect(rejectedData.refund_applicable).to.be.false();
      });

      it('warns that the Bridge emitted no refund branch', async () => {
        const {processor} = givenProcessor();
        const warn = sinon.spy(processor.logger, 'warn');

        await processor.process(givenNoRefundBranchTx());

        sinon.assert.called(warn);
        expect(JSON.stringify(warn.getCalls().map(call => call.args)))
          .to.match(/refund branch/i);
      });
    });

    // The flow cannot be derived from the envelope, so the processor has to
    // pass it for the publication metric to be broken down by peg.
    it('tells the publisher these events are peg-ins', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(givenTx([givenPeginBtcEvent()]));

      sinon.assert.called(publisher.publish);
      publisher.publish.getCalls().forEach(call => {
        expect(call.args[1]).to.equal('pegin');
      });
    });

    it('tells the publisher a rejection is a peg-in too', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(
        givenTx([getMockedRejectedPeginEvent(), getMockedUnrefundablePeginEvent()]),
      );

      sinon.assert.calledTwice(publisher.publish);
      const [created, rejected] = publisher.publish.getCalls();
      expect(created.args[1]).to.equal('pegin');
      expect(rejected.args[1]).to.equal('pegin');
      expect((rejected.args[0] as AtlasEvent).event_type).to.equal(AtlasEventType.SWAP_REJECTED);
    });

    it('gives every event its own event_id', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(
        givenTx([getMockedRejectedPeginEvent(), getMockedReleaseRequestedEvent()]),
      );

      const [created, rejected] = publishedEvents(publisher);
      expect(created.event_id).to.not.equal(rejected.event_id);
    });

    describe('when one event of a pair cannot be delivered', () => {
      const givenRejectionTx = () =>
        givenTx([getMockedRejectedPeginEvent(), getMockedUnrefundablePeginEvent()]);

      // This is what actually happens in production: SqsAtlasEventPublisher
      // swallows a transport failure and counts it, so the loop keeps going and
      // the rejection still reaches the queue even if the created event was lost.
      it('still publishes the rejection when the transport drops the created event', async () => {
        const {publisher, processor} = givenProcessor();
        publisher.publish.callsFake(async (event: AtlasEvent, flow: 'pegin' | 'pegout') => {
          if (event.event_type === AtlasEventType.SWAP_CREATED) {
            publisher.metrics.recordFailure(event.event_type, flow);
            return;
          }
          publisher.metrics.recordSuccess(event.event_type, flow);
        });

        await processor.process(givenRejectionTx());

        sinon.assert.calledTwice(publisher.publish);
        expect(publisher.metrics.total('failure', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(1);
        expect(publisher.metrics.total('success', AtlasEventType.SWAP_REJECTED, 'pegin')).to.equal(1);
      });

      // A publisher that rejects is violating its interface contract. The pair
      // is then truncated on purpose: a swap.rejected with no swap.created
      // would reach Atlas for a swap it never opened a row for, which is worse
      // than the swap being absent and the failure logged.
      it('stops at the first event a publisher throws on, rather than emitting a rejection with no created', async () => {
        const {dataService, publisher, processor} = givenProcessor();
        const error = sinon.spy(processor.logger, 'error');
        publisher.publish.onFirstCall().rejects(new Error('publisher violated its contract'));

        await processor.process(givenRejectionTx());

        sinon.assert.calledOnce(publisher.publish);
        expect(publishedEvents(publisher).map(e => e.event_type))
          .to.eql([AtlasEventType.SWAP_CREATED]);
        // The status stays written: analytics never roll back a peg-in.
        sinon.assert.calledOnce(dataService.set);
        sinon.assert.called(error);
        expect(JSON.stringify(error.getCalls().map(call => call.args)))
          .to.match(/Could not build or publish/);
      });
    });

    it('does not publish when the status could not be saved', async () => {
      const {dataService, publisher, processor} = givenProcessor();
      dataService.set.rejects(new Error('mongo is down'));

      await processor.process(givenTx([givenPeginBtcEvent()]));

      sinon.assert.notCalled(publisher.publish);
    });

    it('keeps the status persisted when publishing fails', async () => {
      const {dataService, publisher, processor} = givenProcessor();
      publisher.publish.rejects(new Error('sqs is down'));

      await processor.process(givenTx([givenPeginBtcEvent()]));

      sinon.assert.calledOnce(dataService.set);
      sinon.assert.calledOnce(publisher.publish);
    });

    it('does not publish again for a pegin already registered', async () => {
      const {dataService, publisher, processor} = givenProcessor();
      dataService.getById.resolves(new PeginStatusDataModel());

      await processor.process(givenTx([givenPeginBtcEvent()]));

      sinon.assert.notCalled(dataService.set);
      sinon.assert.notCalled(publisher.publish);
    });

    it('publishes nothing for a transaction that is not a pegin', async () => {
      const {publisher, processor} = givenProcessor();

      await processor.process(givenTx([]));

      sinon.assert.notCalled(publisher.publish);
    });

    it('does not publish when NETWORK is not configured', async () => {
      delete process.env.NETWORK;
      const {dataService, publisher, processor} = givenProcessor();

      await processor.process(givenTx([givenPeginBtcEvent()]));

      sinon.assert.calledOnce(dataService.set);
      sinon.assert.notCalled(publisher.publish);
    });
  });

});
