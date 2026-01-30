import {Client, expect} from '@loopback/testlab';
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

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    
    txHistoryService = await app.get(ServicesBindings.TX_HISTORY_SERVICE);
  });

  after(async () => {
    await app.stop();
  });

  afterEach(() => {
    if (storeTransactionStub) {
      storeTransactionStub.restore();
    }
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
      const requestBody = getValidRequestBody();

      storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);

      const res = await client
        .post('/tx-history')
        .send(requestBody)
        .expect(200);

      expect(res.body).to.be.empty();
      sinon.assert.calledOnce(storeTransactionStub);
    });

    describe('Field Validation - Negative Tests', () => {
      it('should reject invalid userAddress format', async () => {
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
        const requestBody = {
          ...getValidRequestBody(),
          liquidityProviderName: 'INVALID_PROVIDER',
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid liquidityProviderId (negative)', async () => {
        const requestBody = {
          ...getValidRequestBody(),
          liquidityProviderId: -1,
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should reject invalid liquidityProviderId (exceeds maximum)', async () => {
        const requestBody = {
          ...getValidRequestBody(),
          liquidityProviderId: 3,
        };

        await client
          .post('/tx-history')
          .send(requestBody)
          .expect(422);
      });

      it('should accept valid liquidityProviderId (within range)', async () => {
        const requestBody = {
          ...getValidRequestBody(),
          liquidityProviderId: 1,
        };

        storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);

        const res = await client
          .post('/tx-history')
          .send(requestBody)
          .expect(200);

        expect(res.body).to.be.empty();
        sinon.assert.calledOnce(storeTransactionStub);
      });

      it('should accept valid new token names (ETH, USDT)', async () => {
        const requestBody = {
          ...getValidRequestBody(),
          fromTokenName: 'ETH',
          toTokenName: 'USDT',
        };

        storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);

        const res = await client
          .post('/tx-history')
          .send(requestBody)
          .expect(200);

        expect(res.body).to.be.empty();
        sinon.assert.calledOnce(storeTransactionStub);
      });

      it('should accept valid new network names (Ethereum, BNB Smart Chain)', async () => {
        const requestBody = {
          ...getValidRequestBody(),
          fromNetworkName: 'Ethereum',
          toNetworkName: 'BNB Smart Chain',
        };

        storeTransactionStub = sinon.stub(TxHistoryService.prototype, 'storeTransaction').resolves(true);

        const res = await client
          .post('/tx-history')
          .send(requestBody)
          .expect(200);

        expect(res.body).to.be.empty();
        sinon.assert.calledOnce(storeTransactionStub);
      });
    });
  });
});