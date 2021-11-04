import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {BridgeData} from '../../../models/rsk/bridge-data.model';
import {PeginStatus, PeginStatusDataModel} from '../../../models/rsk/pegin-status-data.model';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {DaemonService} from '../../../services/daemon.service';
import {NodeBridgeDataProvider} from '../../../services/node-bridge-data.provider';
import {PeginStatusDataService} from '../../../services/pegin-status-data-services/pegin-status-data.service';
import {PeginStatusMongoDbDataService} from '../../../services/pegin-status-data-services/pegin-status-mongo.service';
import {RegisterBtcTransactionDataParser} from '../../../services/register-btc-transaction-data.parser';
import {RskBridgeDataProvider} from '../../../services/rsk-bridge-data.provider';
import {RskChainSyncService, RskChainSyncSubscriber} from '../../../services/rsk-chain-sync.service';
import {BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';
import {getRandomHash} from '../../helper';

describe('Service: DaemonService', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  })

  afterEach(() => {
    clock.restore();
  })

  it('starts and stops', async () => {
    const mockedRskBridgeDataProvider = <RskBridgeDataProvider>{};
    mockedRskBridgeDataProvider.configure = sinon.stub();
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;;
    const daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0",
      new RegisterBtcTransactionDataParser()
    );

    await daemonService.start();
    await daemonService.start();

    expect(daemonService.started).to.be.true;

    sinon.assert.calledOnce(mockedRskSyncChainService.start);

    await daemonService.stop();

    expect(daemonService.started).to.be.false;
  });

  it('sync starts when service is started', async () => {
    const mockedRskBridgeDataProvider = <RskBridgeDataProvider>{};
    mockedRskBridgeDataProvider.configure = sinon.stub();
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;;
    const daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0",
      new RegisterBtcTransactionDataParser()
    );

    clock.tick(1);

    expect(mockedRskSyncChainService.sync.notCalled).to.be.true;

    await daemonService.start();

    clock.tick(1);

    expect(mockedRskSyncChainService.sync.called).to.be.true;

  });

  it('configures registerBtcTransaction filter', async () => {
    const mockedRskBridgeDataProvider = sinon.spy(<RskBridgeDataProvider>{
      configure: () => { },
      getData: (): Promise<BridgeData> => Promise.resolve(new BridgeData())
    });
    const mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    const mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;;
    const daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0",
      new RegisterBtcTransactionDataParser()
    );

    await daemonService.start();

    sinon.assert.calledOnceWithMatch(
      mockedRskBridgeDataProvider.configure,
      [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))]
    );
  });

  it('saves new pegins in storage', async () => {
    const mockedRskBridgeDataProvider = sinon.createStubInstance(NodeBridgeDataProvider);
    const mockedPeginStatusDataService = sinon.createStubInstance(PeginStatusMongoDbDataService);
    const mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;
    const mockedRegisterBtcTransactionDataParser =
      sinon.createStubInstance(RegisterBtcTransactionDataParser) as SinonStubbedInstance<RegisterBtcTransactionDataParser> & RegisterBtcTransactionDataParser;

    const addedBlock = new RskBlock(1, getRandomHash(), getRandomHash());
    const peginTx = new RskTransaction();
    peginTx.hash = getRandomHash();

    const bridgeData = new BridgeData();
    bridgeData.block = addedBlock;
    bridgeData.data.push(peginTx);
    mockedRskBridgeDataProvider.getData.resolves(bridgeData);

    const peginStatusModel = new PeginStatusDataModel();
    peginStatusModel.btcTxId = peginTx.hash;
    peginStatusModel.status = PeginStatus.LOCKED;
    mockedRegisterBtcTransactionDataParser.parse.returns(peginStatusModel);

    const daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0",
      mockedRegisterBtcTransactionDataParser
    );

    // Daemon should have subscribed to mockedRskSyncChainService events
    await daemonService.start();

    sinon.assert.calledOnce(mockedRskSyncChainService.subscribe);
    const subscriber = <RskChainSyncSubscriber>mockedRskSyncChainService.subscribe.getCall(0).firstArg;

    // Fake the addition of a block
    await subscriber.blockAdded(addedBlock);

    // All the save should have happened
    sinon.assert.calledOnce(mockedPeginStatusDataService.getById);
    sinon.assert.calledOnce(mockedPeginStatusDataService.set);

    // Mock the pegin status as stored
    mockedPeginStatusDataService.getById.resolves(peginStatusModel);

    // Fake the addition of a block AGAIN
    await subscriber.blockAdded(addedBlock);

    // getById should be called twice
    sinon.assert.calledTwice(mockedPeginStatusDataService.getById);
    // set should have only be called once
    sinon.assert.calledOnce(mockedPeginStatusDataService.set);

  });

  it('ignores transactions that are not pegins', async () => {
    const mockedRskBridgeDataProvider = sinon.createStubInstance(NodeBridgeDataProvider);
    const mockedPeginStatusDataService = sinon.createStubInstance(PeginStatusMongoDbDataService);
    const mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;
    const mockedRegisterBtcTransactionDataParser =
      sinon.createStubInstance(RegisterBtcTransactionDataParser) as SinonStubbedInstance<RegisterBtcTransactionDataParser> & RegisterBtcTransactionDataParser;

    const addedBlock = new RskBlock(1, getRandomHash(), getRandomHash());
    const peginTx = new RskTransaction();
    peginTx.hash = getRandomHash();

    const bridgeData = new BridgeData();
    bridgeData.block = addedBlock;
    bridgeData.data.push(peginTx);
    mockedRskBridgeDataProvider.getData.resolves(bridgeData);

    const peginStatusModel = new PeginStatusDataModel();
    peginStatusModel.btcTxId = peginTx.hash;
    peginStatusModel.status = PeginStatus.LOCKED;
    mockedRegisterBtcTransactionDataParser.parse.returns(null);

    const daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0",
      mockedRegisterBtcTransactionDataParser
    );

    // Daemon should have subscribed to mockedRskSyncChainService events
    await daemonService.start();

    sinon.assert.calledOnce(mockedRskSyncChainService.subscribe);
    const subscriber = <RskChainSyncSubscriber>mockedRskSyncChainService.subscribe.getCall(0).firstArg;

    // Fake the addition of a block
    await subscriber.blockAdded(addedBlock);

    sinon.assert.notCalled(mockedPeginStatusDataService.getById);
    sinon.assert.notCalled(mockedPeginStatusDataService.set);
  });

  it('deletes pegins for forked blocks from storage', async () => {
    const mockedRskBridgeDataProvider = sinon.createStubInstance(NodeBridgeDataProvider);
    const mockedPeginStatusDataService = sinon.createStubInstance(PeginStatusMongoDbDataService);
    const mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;
    const mockedRegisterBtcTransactionDataParser =
      sinon.createStubInstance(RegisterBtcTransactionDataParser) as SinonStubbedInstance<RegisterBtcTransactionDataParser> & RegisterBtcTransactionDataParser;

    const deletedBlock = new RskBlock(1, getRandomHash(), getRandomHash());

    const daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0",
      mockedRegisterBtcTransactionDataParser
    );

    // Daemon should have subscribed to mockedRskSyncChainService events
    await daemonService.start();

    sinon.assert.calledOnce(mockedRskSyncChainService.subscribe);
    const subscriber = <RskChainSyncSubscriber>mockedRskSyncChainService.subscribe.getCall(0).firstArg;

    // Fake the deletion of a block
    await subscriber.blockDeleted(deletedBlock);

    sinon.assert.calledOnce(mockedPeginStatusDataService.deleteByRskBlockHeight);
  });

});
