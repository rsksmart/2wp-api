import {
    createStubInstance,
    expect,
    stubExpressContext,
  } from '@loopback/testlab';
import {HealthCheckController} from '../../controllers';
import {BitcoinService, BridgeService, SyncStatusDataService, RskNodeService} from '../../services';
import {sinon} from '@loopback/testlab/dist/sinon';
import { writeResultToResponse } from '@loopback/rest';

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
    let context = stubExpressContext();

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
        theSyncStorageService,
        context.response,
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

    it('test req and resp', async () => {
        const context = stubExpressContext();
        writeResultToResponse(context.response,
            {
                "up": true,
                "dataBase": {
                  "lastRskBlockNumber": 3631096,
                  "lastRskBlockHash": "0xff7ca28321bae28bcf6bc192780824334e23a85892a83d257b3ed157011d24c2",
                  "up": true
                },
                "blockBook": {
                  "up": true,
                  "lastBtcBlockNumber": 2422705,
                  "lastBtcBlockHash": "000000000000001d85f0b57645309fdd5478a28bcb7daf32101d66c1b6005bdf",
                  "totalBlocks": 2422705,
                  "syncing": true,
                  "chain": "test"
                },
                "rskNode": {
                  "up": true,
                  "lastRskBlockNumber": 3631102
                },
                "bridgeService": {
                  "up": true,
                  "federationAddress": "2N1rW3cBZNzs2ZxSfyNW7cMcNBktt6fzs88"
                }
            });
        const result = await context.result;

        expect(result.headers['content-type']).to.eql('application/json');
        expect(result.payload).not.null;

    });

    it('all methods called once', async () => {
      await controller.health();
      let result = await context.result;
      sinon.assert.calledOnce(getBestBlock);
      sinon.assert.calledOnce(getBlockNumber);
      sinon.assert.calledOnce(getFederationAddress);
      expect(result.payload).not.null();
     });

  });
