import {
    expect,
  } from '@loopback/testlab';
import { BitcoinService } from '../../../services';
import sinon, { SinonStubbedInstance } from 'sinon';
import { LastBlockInfo } from '../../../models';

describe('Service: BitcoinService', () => {
    let service: BitcoinService;
    let getLastBlock: sinon.SinonStub;

    beforeEach(resetRepositories);

    function resetRepositories() {
        service =
        sinon.createStubInstance(BitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;

        getLastBlock = service.getLastBlock as sinon.SinonStub;

        getLastBlock.resolves([
            {
              page: 0,
              coin: '',
              host: '',
              version: '',
              syncMode: true,
              inSync: true,
              bestHeight: 1000000000,
              chain: '',
              blocks: 0,
              bestBlockHash: '',
            }
        ]);
    }
    
    it('Get Last Block not null', async () => {
        const block = await service.getLastBlock();
        expect(block).not.null();
    });

    it('Get Last Block gt INITIAL_BLOCK', async () => {
        const envInitialBlock = process.env.SYNC_INITIAL_BLOCK_HEIGHT;
        expect(envInitialBlock).not.null;
        const initialBlockNumber = parseInt(envInitialBlock!);
        const block:LastBlockInfo = await getLastBlock();
        expect(block[0]).not.null;
        expect(block[0]).not.undefined;
        expect(block[0].bestHeight).greaterThanOrEqual(initialBlockNumber);
    });

    it('Verify ${process.env.BLOCKBOOK_URL} configuration', async () => {
        const nodeHost = process.env.BLOCKBOOK_URL;
        sinon.assert.match(nodeHost, 'https://blockbook-01.testnet.2wp.iovlabs.net:19130/');
    });
    
});
