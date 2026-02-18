import {Client, expect, createRestAppClient} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';
import {TxHistoryService} from '../../services/tx-history.service';
import {ServicesBindings} from '../../dependency-injection-bindings';
import sinon from 'sinon';

describe('TxHistoryController (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;
  let txHistoryService: TxHistoryService;
  let storeTransactionStub: sinon.SinonStub;
  let bitcoinServiceGetTxStub: sinon.SinonStub;
  let rskNodeServiceGetTransactionStub: sinon.SinonStub;

  async function startClient() {
    ({app, client} = await setupApplication());
    
    txHistoryService = await app.get(ServicesBindings.TX_HISTORY_SERVICE);

    if (bitcoinServiceGetTxStub) {
      app.getBinding(ServicesBindings.BITCOIN_SERVICE).to({
        getTx: bitcoinServiceGetTxStub,
      });
    }
    
    if (rskNodeServiceGetTransactionStub) {
      app.getBinding(ServicesBindings.RSK_NODE_SERVICE).to({
        getTransaction: rskNodeServiceGetTransactionStub,
      });
    }
    
    client = createRestAppClient(app);
  }

  before('setupApplication', async () => {

  });

  after(async () => {
    await app.stop();
  });

  afterEach(() => {

    sinon.restore();
  });

  describe('POST /tx-history', () => {
    const getValidRequestBody = () => ({
      userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      providerHash: 'Test12345678',
      fromTokenName: 'BTC',
      fromNetworkName: 'Bitcoin',
      toTokenName: 'RBTC',
      toNetworkName: 'Rootstock',
      fromAmount: '0.001',
      toAmount: '0.0009',
      date: '2024-01-01T00:00:00.000Z',
      sdkProvider: 'FLYOVER',
    });

    it('should store a valid transaction and return 200', async () => {
      bitcoinServiceGetTxStub = sinon.stub();
      bitcoinServiceGetTxStub.resolves({ amount: 0.001, address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' });
      rskNodeServiceGetTransactionStub = sinon.stub();
      rskNodeServiceGetTransactionStub.resolves({});
      
      await startClient();
      
      const requestBody = getValidRequestBody();

      storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);
      const getTransactionByHashStub = sinon.stub(TxHistoryService.prototype, 'getTransactionByHash').resolves(null);

      const res = await client
        .post('/tx-history')
        .send(requestBody)
        .expect(200);

      expect(res.body).to.be.empty();
      sinon.assert.calledOnce(storeTransactionStub);
    });

    describe('Field Validation - Negative Tests', () => {
      it('should reject invalid userAddress format', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          userAddress: 'invalid-address-format',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid txHash format (too short)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          txHash: '0x1234567890abcdef',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid txHash format (invalid characters)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid providerHash format (too short)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          providerHash: 'Test123',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid providerHash format (special characters)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          providerHash: 'Test123456@',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid fromTokenName (not in enum)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          fromTokenName: 'INVALID_TOKEN',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid fromNetworkName (not in enum)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          fromNetworkName: 'Polygon',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid toTokenName (not in enum)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          toTokenName: 'INVALID_TOKEN',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid toNetworkName (not in enum)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          toNetworkName: 'Avalanche',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid fromAmount format (special characters)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          fromAmount: '0.001@#$',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid fromAmount format (letters)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          fromAmount: '0.001abc',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid toAmount format (special characters)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          toAmount: '0.0009!@#',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid toAmount format (letters)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          toAmount: '0.0009xyz',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid date format', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          date: 'invalid-date-string',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid sdkProvider (not in enum)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          sdkProvider: 'INVALID_PROVIDER',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid sdkProvider (lowercase)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          sdkProvider: 'flyover',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid liquidityProviderName (not in enum)', async () => {
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          liquidityProviderName: 'INVALID_PROVIDER',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should accept valid new token names (ETH, USDT)', async () => {
        bitcoinServiceGetTxStub = sinon.stub();
        bitcoinServiceGetTxStub.resolves({ amount: 0.001, address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' });
        rskNodeServiceGetTransactionStub = sinon.stub();
        rskNodeServiceGetTransactionStub.resolves({});
        
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          fromTokenName: 'ETH',
          toTokenName: 'USDT',
        };

        storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);
        const getTransactionByHashStub = sinon.stub(TxHistoryService.prototype, 'getTransactionByHash').resolves(null);

        const res = await client
          .post('/tx-history')
          .send(requestBody)
          .expect(200);

        expect(res.body).to.be.empty();
        sinon.assert.calledOnce(storeTransactionStub);
        getTransactionByHashStub.restore();
      });

      it('should accept valid new network names (Ethereum, BNB Smart Chain)', async () => {
        bitcoinServiceGetTxStub = sinon.stub();
        bitcoinServiceGetTxStub.resolves({});
        rskNodeServiceGetTransactionStub = sinon.stub();
        rskNodeServiceGetTransactionStub.resolves({});
        
        await startClient();
        const requestBody = {
          ...getValidRequestBody(),
          fromNetworkName: 'Ethereum',
          toNetworkName: 'BNB Smart Chain',
        };

        storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);
        const getTransactionByHashStub = sinon.stub(TxHistoryService.prototype, 'getTransactionByHash').resolves(null);

        const res = await client
          .post('/tx-history')
          .send(requestBody)
          .expect(200);

        expect(res.body).to.be.empty();
        sinon.assert.calledOnce(storeTransactionStub);
        getTransactionByHashStub.restore();
      });
    });
  });

  describe('GET /tx-history', () => {
    let getTransactionHistoryStub: sinon.SinonStub;

    beforeEach(() => {
      getTransactionHistoryStub = sinon.stub(TxHistoryService.prototype, 'getTransactionHistoryByAddress').resolves({
        data: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });
    });

    afterEach(() => {
      if (getTransactionHistoryStub) {
        getTransactionHistoryStub.restore();
      }
    });

    it('should return 200 with valid address and page', async () => {
      await startClient();
      const res = await client
        .get('/tx-history')
        .query({address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', page: 1})
        .expect(200);

      expect(res.body).to.have.property('data');
      expect(res.body).to.have.property('total');
      expect(res.body).to.have.property('page');
      expect(res.body).to.have.property('totalPages');
      sinon.assert.calledOnce(getTransactionHistoryStub);
    });

    describe('Parameter Validation - Negative Tests', () => {
      it('should reject missing address parameter', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .expect(400);
      });

      it('should reject invalid address format (not matching pattern)', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: 'invalid-address-format'})
          .expect(400);
      });

      it('should reject invalid address format (too short)', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '0x123'})
          .expect(400);
      });

      it('should reject invalid address format (invalid characters)', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbG'})
          .expect(400);
      });

      it('should reject negative page number', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', page: -1})
          .expect(400);
      });

      it('should reject zero page number', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', page: 0})
          .expect(400);
      });

      it('should reject non-numeric page parameter', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', page: 'invalid'})
          .expect(400);
      });

      it('should reject page as decimal number less than 1', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', page: 0.5})
          .expect(400);
      });

      it('should accept valid BTC address format', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'})
          .expect(200);

        sinon.assert.calledOnce(getTransactionHistoryStub);
      });

      it('should accept valid bech32 BTC address format', async () => {
        await startClient();
        await client
          .get('/tx-history')
          .query({address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'})
          .expect(200);

        sinon.assert.calledOnce(getTransactionHistoryStub);
      });
    });
  });

  describe('GET /tx-history/{txHash}', () => {
    let getTransactionByHashStub: sinon.SinonStub;

    beforeEach(() => {
      getTransactionByHashStub = sinon.stub(TxHistoryService.prototype, 'getTransactionByHash').resolves(null);
    });

    afterEach(() => {
      if (getTransactionByHashStub) {
        getTransactionByHashStub.restore();
      }
    });

    it('should return 200 with valid txHash format', async () => {
      const validTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const mockTransaction = {
        userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        txHash: validTxHash,
        providerHash: 'Test12345678',
        fromTokenName: 'BTC',
        fromNetworkName: 'Bitcoin',
        toTokenName: 'RBTC',
        toNetworkName: 'Rootstock',
        fromAmount: '0.001',
        toAmount: '0.0009',
        date: new Date('2024-01-01T00:00:00.000Z'),
        sdkProvider: 'FLYOVER',
      };

      getTransactionByHashStub.resolves(mockTransaction);

      const res = await client
        .get(`/tx-history/${validTxHash}`)
        .expect(200);

      expect(res.body).to.have.property('txHash', validTxHash);
      sinon.assert.calledOnce(getTransactionByHashStub);
    });

    it('should return 404 when transaction not found', async () => {
      const validTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      getTransactionByHashStub.resolves(null);

      const res = await client
        .get(`/tx-history/${validTxHash}`)
        .expect(404);

      expect(res.body).to.have.property('error', 'Transaction not found');
      sinon.assert.calledOnce(getTransactionByHashStub);
    });

    describe('Parameter Validation - Negative Tests', () => {
      it('should reject invalid txHash format (too short)', async () => {
        await startClient();
        await client
          .get('/tx-history/0x1234567890abcdef')
          .expect(400);
      });

      it('should reject invalid txHash format (missing 0x prefix but wrong length)', async () => {
        await startClient();
        await client
          .get('/tx-history/1234567890abcdef')
          .expect(400);
      });

      it('should reject invalid txHash format (invalid characters)', async () => {
        await startClient();
        await client
          .get('/tx-history/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg')
          .expect(400);
      });

      it('should reject invalid txHash format (special characters)', async () => {
        await startClient();
        await client
          .get('/tx-history/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc@#$')
          .expect(400);
      });

      it('should reject invalid txHash format (contains spaces)', async () => {
        await startClient();
        

        await client
          .get('/tx-history/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab cdef')
          .expect(400);
      });
    });
  });
});