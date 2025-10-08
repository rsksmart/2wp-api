import {
  createStubInstance,
  expect,
  stubExpressContext,
} from '@loopback/testlab';
import {TxHistoryController} from '../../controllers/tx-history.controller';
import {TxHistoryService} from '../../services/tx-history.service';
import {TxHistory} from '../../models/tx-history.model';
import {sinon} from '@loopback/testlab/dist/sinon';

describe('TxHistoryController', () => {
  let controller: TxHistoryController;
  let txHistoryService: TxHistoryService;
  let storeTransaction: sinon.SinonStub;
  let getTransactionHistoryByAddress: sinon.SinonStub;
  let context: any;

  beforeEach(resetRepositories);

  function resetRepositories() {
    context = stubExpressContext();
    txHistoryService = createStubInstance(TxHistoryService);
    storeTransaction = txHistoryService.storeTransaction as sinon.SinonStub;
    getTransactionHistoryByAddress = txHistoryService.getTransactionHistoryByAddress as sinon.SinonStub;

    controller = new TxHistoryController(
      txHistoryService,
      context.response,
    );
  }

  describe('storeTransaction', () => {
    it('should store a valid transaction and return 200', async () => {
      const txHistory: TxHistory = {
        userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        providerHash: 'test-hash-123',
        fromTokenName: 'BTC',
        fromNetworkName: 'Bitcoin',
        toTokenName: 'RBTC',
        toNetworkName: 'Rootstock',
        fromAmount: '0.001',
        toAmount: '0.0009',
        date: new Date('2024-01-01'),
        sdkProvider: 'FLYOVER',
      } as TxHistory;

      storeTransaction.resolves(true);

      const response = await controller.storeTransaction(txHistory);

      sinon.assert.calledOnce(storeTransaction);
      sinon.assert.calledWith(storeTransaction, txHistory);
      expect(response.statusCode).to.equal(200);
    });

    it('should return 500 when storage fails', async () => {
      const txHistory: TxHistory = {
        userAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        providerHash: 'test-hash-456',
        fromTokenName: 'RBTC',
        fromNetworkName: 'Rootstock',
        toTokenName: 'BTC',
        toNetworkName: 'Bitcoin',
        fromAmount: '0.002',
        toAmount: '0.0019',
        date: new Date('2024-01-02'),
        sdkProvider: 'POWPEG',
      } as TxHistory;

      storeTransaction.resolves(false);

      const response = await controller.storeTransaction(txHistory);

      sinon.assert.calledOnce(storeTransaction);
      expect(response.statusCode).to.equal(500);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return paginated transaction history', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const mockResult = {
        data: [{
          userAddress: address,
          providerHash: 'hash1',
          fromTokenName: 'BTC',
          fromNetworkName: 'Bitcoin',
          toTokenName: 'RBTC',
          toNetworkName: 'Rootstock',
          fromAmount: '0.001',
          toAmount: '0.0009',
          date: new Date('2024-01-01'),
          sdkProvider: 'FLYOVER',
        }],
        total: 1,
        page: 1,
        totalPages: 1,
      };

      getTransactionHistoryByAddress.resolves(mockResult);

      const response = await controller.getTransactionHistory(address, 1);

      sinon.assert.calledOnce(getTransactionHistoryByAddress);
      sinon.assert.calledWith(getTransactionHistoryByAddress, address, 1);
      expect(response.statusCode).to.equal(200);
    });

    it('should return 400 when address is missing', async () => {
      const response = await controller.getTransactionHistory('', 1);

      sinon.assert.notCalled(getTransactionHistoryByAddress);
      expect(response.statusCode).to.equal(400);
    });

    it('should return 400 when page is less than 1', async () => {
      const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

      const response = await controller.getTransactionHistory(address, 0);

      sinon.assert.notCalled(getTransactionHistoryByAddress);
      expect(response.statusCode).to.equal(400);
    });
  });
});

