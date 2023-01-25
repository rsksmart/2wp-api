import {
    createStubInstance,
    expect,
  } from '@loopback/testlab';
import {HealthCheckController} from '../../controllers';
import {BitcoinService, BridgeService, SyncStatusDataService, RskNodeService} from '../../services';
import {sinon} from '@loopback/testlab/dist/sinon';
  
  describe('health check controller', () => {
    let getLastBlock: sinon.SinonStub;
    let controller: HealthCheckController; 

    let bitcoinService: BitcoinService;
    let bridgeService: BridgeService;
    let rskNodeService: RskNodeService;
    let theSyncStorageService: SyncStatusDataService;
    let getBestBlock: sinon.SinonStub;
    let getBlockNumber: sinon.SinonStub;
    let getFederationAddress: sinon.SinonStub;

    beforeEach(resetRepositories);
  
    function resetRepositories() {
      bitcoinService = createStubInstance(BitcoinService);
      rskNodeService = createStubInstance(RskNodeService);
      bridgeService = createStubInstance(BridgeService);
      getLastBlock = bitcoinService.getLastBlock as sinon.SinonStub;
      getBlockNumber = rskNodeService.getBlockNumber as sinon.SinonStub;
      getFederationAddress = bridgeService.getFederationAddress as sinon.SinonStub;
      theSyncStorageService = {getBestBlock: sinon.stub(), getById: sinon.stub(), getMany: sinon.stub(), set: sinon.stub(), delete: sinon.stub(), start: sinon.stub(), stop: sinon.stub()};
      getBestBlock = theSyncStorageService.getBestBlock as sinon.SinonStub;

      controller = new HealthCheckController(
        bitcoinService,
        bridgeService,
        rskNodeService,
        theSyncStorageService
      );

      getBestBlock.resolves([
        {
          rskBlockHash: '',
          rskBlockHeight: '',
          rskBlockParentHash: '',
        },
      ]);

      getBlockNumber.resolves([
          {
            blockNumber: 1,
          }
      ]);

      getFederationAddress.resolves([
          {
            address: '',
          }
      ]);

      getLastBlock.resolves([
          {
            page: 0,
            coin: '',
            host: '',
            version: '',
            syncMode: true,
            inSync: true,
            bestHeight: 0,
            chain: '',
            blocks: 0,
            bestBlockHash: '',
          }
      ]);

    }

    it('get best block called once', async () => {
      const health = await controller.health();
      sinon.assert.calledOnce(getBestBlock);
      expect(health).not.null();
    });

    it('rskNodeService connection fails then the general status is up == false', async () => {

        getBlockNumber.resolves([
            {
              blockNumber: null,
            }
        ]);

        const health = await controller.health();
        expect(health.up).false;
      });

      it('bitcoinService connection fails then the general status is up == false', async () => {
        getLastBlock.resolves([null]);
        const health = await controller.health();
        expect(health.up).false;
      });

      it('bridge service connection fails then the general status is up == false', async () => {
        getFederationAddress.resolves([null]);
        const health = await controller.health();
        expect(health.up).false;
      });

      it('database connection fails then the general status is up == false', async () => {
        getBestBlock.resolves([null]);
        const health = await controller.health();
        expect(health.up).false;
      });

      it('the check all count == 4 (blockbook, database, rskNode, bridge)', async () => {
        const health = await controller.health();
        expect(health.check.length).equal(4);
      });

  });
  