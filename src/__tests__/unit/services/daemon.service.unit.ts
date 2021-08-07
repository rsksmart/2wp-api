import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {BridgeDataFilterModel} from '../../../models/bridge-data-filter.model';
import {BridgeData} from '../../../models/rsk/bridge-data.model';
import {DaemonService} from '../../../services/daemon.service';
import {PeginStatusDataService} from '../../../services/pegin-status-data-services/pegin-status-data.service';
import {RskBridgeDataProvider} from '../../../services/rsk-bridge-data.provider';
import {RskChainSyncService} from '../../../services/rsk-chain-sync.service';

describe('Service: DaemonService', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  })

  afterEach(() => {
    clock.restore();
  })

  it('starts and stops', async () => {
    let mockedRskBridgeDataProvider = <RskBridgeDataProvider>{};
    mockedRskBridgeDataProvider.configure = sinon.stub();
    let mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    let mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;;
    let daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0"
    );

    await daemonService.start();
    await daemonService.start();

    expect(daemonService.started).to.be.true;

    sinon.assert.calledOnce(mockedRskSyncChainService.start);

    await daemonService.stop();

    expect(daemonService.started).to.be.false;
  });

  it('sync starts when service is started', async () => {
    let mockedRskBridgeDataProvider = <RskBridgeDataProvider>{};
    mockedRskBridgeDataProvider.configure = sinon.stub();
    let mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    let mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;;
    let daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0"
    );

    clock.tick(1);

    expect(mockedRskSyncChainService.sync.notCalled).to.be.true;

    await daemonService.start();

    clock.tick(1);

    expect(mockedRskSyncChainService.sync.called).to.be.true;

  });

  it('configures registerBtcTransaction filter', async () => {

    let mockedRskBridgeDataProvider = sinon.spy(<RskBridgeDataProvider>{
      configure: () => { },
      getData: (): Promise<BridgeData> => Promise.resolve(new BridgeData())
    });
    let mockedPeginStatusDataService = <PeginStatusDataService>{};
    mockedPeginStatusDataService.start = sinon.stub();
    mockedPeginStatusDataService.stop = sinon.stub();
    let mockedRskSyncChainService =
      sinon.createStubInstance(RskChainSyncService) as SinonStubbedInstance<RskChainSyncService> & RskChainSyncService;;
    let daemonService = new DaemonService(
      mockedRskBridgeDataProvider,
      mockedPeginStatusDataService,
      mockedRskSyncChainService,
      "0"
    );

    await daemonService.start();

    sinon.assert.calledOnceWithMatch(mockedRskBridgeDataProvider.configure, [new BridgeDataFilterModel('43dc0656')]);
  });

  // TODO: add these tests
  it('saves new pegins in storage', async () => { });
  it('ignores transactions that are not pegins', async () => { });
  it('deletes pegins for forked blocks from storage', async () => { });

});
