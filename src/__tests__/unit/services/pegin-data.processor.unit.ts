import {expect} from '@loopback/testlab';
import {PeginStatus, PeginStatusDataModel} from '../../../models/rsk/pegin-status-data.model';
import {PeginDataProcessor} from '../../../services/pegin-data.processor';
import {PeginStatusDataService} from '../../../services/pegin-status-data-services/pegin-status-data.service';
import sinon, {SinonStubbedInstance} from 'sinon';
import {PeginStatusMongoDbDataService} from '../../../services/pegin-status-data-services/pegin-status-mongo.service';
import ExtendedBridgeTx from '../../../services/extended-bridge-tx';
import {Transaction} from 'bridge-transaction-parser';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {ExtendedBridgeEvent} from "../../../models/types/bridge-transaction-parser";

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
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(extendedBridgeTx);
    expect(result).to.be.null;
  });

  it('parses a transaction with a random log as null', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const extendedBridgeTx: ExtendedBridgeTx = <ExtendedBridgeTx> <unknown> {events: [{name: 'random'}]};
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
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
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedPeginBtcEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      const [event] = bridgeTransaction.events as ExtendedBridgeEvent[]
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
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedLockBtcEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      const [event] = bridgeTransaction.events as ExtendedBridgeEvent[]
      const rskReceiver = <string> event.arguments.receiver;
      expect(result.rskRecipient).to.be.equal(rskReceiver.toLowerCase());
      expect(result.status).to.be.equal(PeginStatus.LOCKED);
      expect(result.btcTxId).to.be.equal(btcTxHash);
    }
  });

  it('parses a transaction with just a REJECTED_PEGIN log as null (should never happen :))', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    const result = thisService.parse(extendedBridgeTx);

    expect(result).to.be.null;
  });

  it('parses a transaction with REJECTED_PEGIN and RELEASE_REQUESTED event logs as a rejected pegin with refund', () => {
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedReleaseRequestedEvent(), getMockedRejectedPeginEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
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
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent(), getMockedUnrefundablePeginEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
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
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
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
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent(), getMockedReleaseRequestedEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    await thisService.process(extendedBridgeTx);
    sinon.assert.calledOnce(mockedPeginStatusDataService.set);
  });

  it('ignores pegin transaction if found in db', async () => {
    const mockedPeginStatusDataService =
      sinon.createStubInstance(PeginStatusMongoDbDataService) as SinonStubbedInstance<PeginStatusDataService>;

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: [getMockedRejectedPeginEvent(), getMockedReleaseRequestedEvent()]
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
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
    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    await thisService.process(extendedBridgeTx);
    sinon.assert.neverCalledWith(mockedPeginStatusDataService.set);
  });

  it('returns early if no peginStatus can be parsed from transaction because event logs is empty', async () => {
    const mockedPeginStatusDataService =
      sinon.createStubInstance(PeginStatusMongoDbDataService) as SinonStubbedInstance<PeginStatusDataService>;

    const bridgeTransaction: Transaction = {
      txHash: rskTxHash,
      blockNumber: 1,
      method: {
        name: 'registerBtcTransaction',
        signature: '0x43dc0656',
        arguments: getMockedRegisterBtcTransactionMethodArgs()
      },
      events: []
    };

    const extendedBridgeTx: ExtendedBridgeTx = {
      blockHash,
      txHash: bridgeTransaction.txHash,
      createdOn: new Date(),
      blockNumber: bridgeTransaction.blockNumber,
      to: bridge.address,
      method: bridgeTransaction.method,
      events: bridgeTransaction.events
    };

    const thisService = new PeginDataProcessor(mockedPeginStatusDataService);
    await thisService.process(extendedBridgeTx);
    sinon.assert.neverCalledWith(mockedPeginStatusDataService.getById);
    sinon.assert.neverCalledWith(mockedPeginStatusDataService.set);
  });

});
