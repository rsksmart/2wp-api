import {
  createStubInstance,
  expect,
  stubExpressContext,
} from '@loopback/testlab';
import {getJsonSchema} from '@loopback/repository-json-schema';
import Ajv, {ValidateFunction} from 'ajv';
import {TxHistoryController} from '../../controllers/tx-history.controller';
import {TxHistoryService} from '../../services/tx-history.service';
import {TxHistory, TOKENS, NETWORKS} from '../../models/tx-history.model';
import {sinon} from '@loopback/testlab/dist/sinon';
import {BitcoinService, RskNodeService} from '../../services';

describe('TxHistoryController', () => {
  let controller: TxHistoryController;
  let txHistoryService: TxHistoryService;
  let bitcoinService: BitcoinService;
  let rskNodeService: RskNodeService;
  let storeTransaction: sinon.SinonStub;
  let getTransactionHistoryByAddress: sinon.SinonStub;
  let getTx: sinon.SinonStub;
  let getRskTransaction: sinon.SinonStub;
  let context: any;

  beforeEach(resetRepositories);

  function resetRepositories() {
    context = stubExpressContext();
    bitcoinService = createStubInstance(BitcoinService);
    rskNodeService = createStubInstance(RskNodeService);
    txHistoryService = createStubInstance(TxHistoryService);
    getTx = bitcoinService.getTx as sinon.SinonStub;
    getRskTransaction = rskNodeService.getTransaction as sinon.SinonStub;
    storeTransaction = txHistoryService.storeTransaction as sinon.SinonStub;
    getTransactionHistoryByAddress = txHistoryService.getTransactionHistoryByAddress as sinon.SinonStub;

    getTx.resolves({});
    getRskTransaction.resolves({});

    controller = new TxHistoryController(
      bitcoinService,
      rskNodeService,
      txHistoryService as any,
      context.response,
    );
  }

  describe('storeTransaction', () => {
    it('should store a valid transaction and return 200', async () => {
      const txHistory: TxHistory = {
        userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        providerHash: 'Test123Hash',
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
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdea',
        providerHash: 'Test456Hash',
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

    it('should return 200 and not store when transaction does not exist in source network', async () => {
      const txHistory: TxHistory = {
        userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        txHash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        providerHash: 'MissingTxHash',
        fromTokenName: 'BTC',
        fromNetworkName: 'Bitcoin',
        toTokenName: 'RBTC',
        toNetworkName: 'Rootstock',
        fromAmount: '0.001',
        toAmount: '0.0009',
        date: new Date('2024-01-03'),
        sdkProvider: 'FLYOVER',
      } as TxHistory;

      getTx.rejects(new Error('Error getting tx'));

      const response = await controller.storeTransaction(txHistory);

      sinon.assert.notCalled(storeTransaction);
      expect(response.statusCode).to.equal(200);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return paginated transaction history', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const mockResult = {
        data: [{
          userAddress: address,
          providerHash: 'Hash1Test123',
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

  describe('TxHistory Schema Validation', () => {
    let ajv: Ajv;
    let validate: ValidateFunction;

    before(() => {
      ajv = new Ajv({allErrors: true, strict: false});
      const schema = getJsonSchema(TxHistory);
      validate = ajv.compile(schema);
    });

    function getValidTxHistory(): Partial<TxHistory> {
      return {
        userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        providerHash: 'Test123Hash',
        fromTokenName: 'BTC',
        fromNetworkName: 'Bitcoin',
        toTokenName: 'RBTC',
        toNetworkName: 'Rootstock',
        fromAmount: '0.001',
        toAmount: '0.0009',
        date: new Date('2024-01-01'),
        sdkProvider: 'FLYOVER',
      };
    }

    describe('Required Fields', () => {
      it('should reject missing userAddress', () => {
        const data = getValidTxHistory();
        delete data.userAddress;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors).to.not.be.undefined;
        expect(validate.errors?.some((e: any) => e.instancePath === '/userAddress')).to.be.true;
      });

      it('should reject missing txHash', () => {
        const data = getValidTxHistory();
        delete data.txHash;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/txHash')).to.be.true;
      });

      it('should reject missing providerHash', () => {
        const data = getValidTxHistory();
        delete data.providerHash;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/providerHash')).to.be.true;
      });

      it('should reject missing fromTokenName', () => {
        const data = getValidTxHistory();
        delete data.fromTokenName;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/fromTokenName')).to.be.true;
      });

      it('should reject missing fromNetworkName', () => {
        const data = getValidTxHistory();
        delete data.fromNetworkName;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/fromNetworkName')).to.be.true;
      });

      it('should reject missing toTokenName', () => {
        const data = getValidTxHistory();
        delete data.toTokenName;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/toTokenName')).to.be.true;
      });

      it('should reject missing toNetworkName', () => {
        const data = getValidTxHistory();
        delete data.toNetworkName;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/toNetworkName')).to.be.true;
      });

      it('should reject missing fromAmount', () => {
        const data = getValidTxHistory();
        delete data.fromAmount;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/fromAmount')).to.be.true;
      });

      it('should reject missing toAmount', () => {
        const data = getValidTxHistory();
        delete data.toAmount;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/toAmount')).to.be.true;
      });

      it('should reject missing date', () => {
        const data = getValidTxHistory();
        delete data.date;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/date')).to.be.true;
      });

      it('should reject missing sdkProvider', () => {
        const data = getValidTxHistory();
        delete data.sdkProvider;
        const valid = validate(data);
        expect(valid).to.be.false;
        expect(validate.errors?.some((e: any) => e.instancePath === '/sdkProvider')).to.be.true;
      });

      it('should accept missing liquidityProviderName (optional field)', () => {
        const data = getValidTxHistory();
        delete data.liquidityProviderName;
        const valid = validate(data);
        expect(valid).to.be.true;
      });
    });

    describe('userAddress Validation', () => {
      it('should accept valid RSK address', () => {
        const data = getValidTxHistory();
        data.userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC legacy mainnet address', () => {
        const data = getValidTxHistory();
        data.userAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC legacy testnet address', () => {
        const data = getValidTxHistory();
        data.userAddress = 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC P2SH address', () => {
        const data = getValidTxHistory();
        data.userAddress = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC bech32 mainnet address', () => {
        const data = getValidTxHistory();
        data.userAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC bech32 testnet address', () => {
        const data = getValidTxHistory();
        data.userAddress = 'tb1qdrf59ns3gkc522fstnmrn8v0emfqd6zqxc2fd0';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC bech32m mainnet address', () => {
        const data = getValidTxHistory();
        data.userAddress = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid BTC bech32m testnet address', () => {
        const data = getValidTxHistory();
        data.userAddress = 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
        expect(validate(data)).to.be.true;
      });

      it('should reject invalid address format', () => {
        const data = getValidTxHistory();
        data.userAddress = 'invalid-address';
        expect(validate(data)).to.be.false;
      });

      it('should reject address that is too short', () => {
        const data = getValidTxHistory();
        data.userAddress = '0x123';
        expect(validate(data)).to.be.false;
      });
    });

    describe('txHash Validation', () => {
      it('should accept valid txHash with 0x prefix', () => {
        const data = getValidTxHistory();
        data.txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid txHash without 0x prefix', () => {
        const data = getValidTxHistory();
        data.txHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        expect(validate(data)).to.be.true;
      });

      it('should reject txHash that is too short', () => {
        const data = getValidTxHistory();
        data.txHash = '0x1234567890abcdef';
        expect(validate(data)).to.be.false;
      });

      it('should reject txHash with invalid characters', () => {
        const data = getValidTxHistory();
        data.txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg';
        expect(validate(data)).to.be.false;
      });
    });

    describe('providerHash Validation', () => {
      it('should accept valid transaction hash with 0x prefix', () => {
        const data = getValidTxHistory();
        data.providerHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid transaction hash without 0x prefix', () => {
        const data = getValidTxHistory();
        data.providerHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid provider identifier (12 alphanumeric characters)', () => {
        const data = getValidTxHistory();
        data.providerHash = 'Test123Hash';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid provider identifier with all uppercase', () => {
        const data = getValidTxHistory();
        data.providerHash = 'TEST123HASH';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid provider identifier with all lowercase', () => {
        const data = getValidTxHistory();
        data.providerHash = 'test123hash';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid provider identifier with all numbers', () => {
        const data = getValidTxHistory();
        data.providerHash = '123456789012';
        expect(validate(data)).to.be.true;
      });

      it('should reject providerHash with hyphens', () => {
        const data = getValidTxHistory();
        data.providerHash = 'test-hash-123';
        expect(validate(data)).to.be.false;
      });

      it('should reject providerHash with underscores', () => {
        const data = getValidTxHistory();
        data.providerHash = 'test_hash_123';
        expect(validate(data)).to.be.false;
      });

      it('should reject providerHash with spaces', () => {
        const data = getValidTxHistory();
        data.providerHash = 'test hash 123';
        expect(validate(data)).to.be.false;
      });

      it('should reject providerHash with special characters', () => {
        const data = getValidTxHistory();
        data.providerHash = 'test@hash#123';
        expect(validate(data)).to.be.false;
      });

      it('should reject empty providerHash', () => {
        const data = getValidTxHistory();
        data.providerHash = '';
        expect(validate(data)).to.be.false;
      });

      it('should reject provider identifier that is too short (less than 12 characters)', () => {
        const data = getValidTxHistory();
        data.providerHash = 'Test123Has';
        expect(validate(data)).to.be.false;
      });

      it('should reject provider identifier that is too long (more than 12 characters)', () => {
        const data = getValidTxHistory();
        data.providerHash = 'Test123Hash1';
        expect(validate(data)).to.be.false;
      });

      it('should reject transaction hash that is too short', () => {
        const data = getValidTxHistory();
        data.providerHash = '0x1234567890abcdef';
        expect(validate(data)).to.be.false;
      });

      it('should reject transaction hash with invalid hex characters', () => {
        const data = getValidTxHistory();
        data.providerHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg';
        expect(validate(data)).to.be.false;
      });

      it('should reject providerHash that exceeds maxLength (256 chars)', () => {
        const data = getValidTxHistory();
        data.providerHash = 'a'.repeat(257);
        expect(validate(data)).to.be.false;
      });
    });

    describe('Token Name Enum Validation', () => {
      TOKENS.forEach(token => {
        it(`should accept valid fromTokenName: ${token}`, () => {
          const data = getValidTxHistory();
          data.fromTokenName = token;
          expect(validate(data)).to.be.true;
        });

        it(`should accept valid toTokenName: ${token}`, () => {
          const data = getValidTxHistory();
          data.toTokenName = token;
          expect(validate(data)).to.be.true;
        });
      });

      it('should reject invalid fromTokenName (not in enum)', () => {
        const data = getValidTxHistory();
        data.fromTokenName = 'ETH' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject invalid toTokenName (not in enum)', () => {
        const data = getValidTxHistory();
        data.toTokenName = 'USDT' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject lowercase token name', () => {
        const data = getValidTxHistory();
        data.fromTokenName = 'btc' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject empty token name', () => {
        const data = getValidTxHistory();
        data.fromTokenName = '' as any;
        expect(validate(data)).to.be.false;
      });
    });

    describe('Network Name Enum Validation', () => {
      NETWORKS.forEach(network => {
        it(`should accept valid fromNetworkName: ${network}`, () => {
          const data = getValidTxHistory();
          data.fromNetworkName = network;
          expect(validate(data)).to.be.true;
        });

        it(`should accept valid toNetworkName: ${network}`, () => {
          const data = getValidTxHistory();
          data.toNetworkName = network;
          expect(validate(data)).to.be.true;
        });
      });

      it('should reject invalid fromNetworkName (not in enum)', () => {
        const data = getValidTxHistory();
        data.fromNetworkName = 'Ethereum' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject invalid toNetworkName (not in enum)', () => {
        const data = getValidTxHistory();
        data.toNetworkName = 'Polygon' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject lowercase network name', () => {
        const data = getValidTxHistory();
        data.fromNetworkName = 'bitcoin' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject empty network name', () => {
        const data = getValidTxHistory();
        data.fromNetworkName = '' as any;
        expect(validate(data)).to.be.false;
      });
    });

    describe('Amount Validation', () => {
      it('should accept valid integer amount', () => {
        const data = getValidTxHistory();
        data.fromAmount = '123';
        data.toAmount = '456';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid decimal amount', () => {
        const data = getValidTxHistory();
        data.fromAmount = '123.456';
        data.toAmount = '0.001';
        expect(validate(data)).to.be.true;
      });

      it('should accept amount with leading zero', () => {
        const data = getValidTxHistory();
        data.fromAmount = '0.001';
        data.toAmount = '0.0009';
        expect(validate(data)).to.be.true;
      });

      it('should reject negative amount', () => {
        const data = getValidTxHistory();
        data.fromAmount = '-123';
        expect(validate(data)).to.be.false;
      });

      it('should reject amount with letters', () => {
        const data = getValidTxHistory();
        data.fromAmount = '123abc';
        expect(validate(data)).to.be.false;
      });

      it('should reject amount with special characters', () => {
        const data = getValidTxHistory();
        data.fromAmount = '123.45.67';
        expect(validate(data)).to.be.false;
      });

      it('should reject empty amount', () => {
        const data = getValidTxHistory();
        data.fromAmount = '';
        expect(validate(data)).to.be.false;
      });
    });

    describe('date Validation', () => {
      it('should accept valid Date object', () => {
        const data = getValidTxHistory();
        data.date = new Date('2024-01-01');
        expect(validate(data)).to.be.true;
      });

      it('should accept valid ISO date string', () => {
        const data = getValidTxHistory();
        data.date = '2024-01-01T00:00:00.000Z' as any;
        expect(validate(data)).to.be.true;
      });

      it('should reject invalid date string', () => {
        const data = getValidTxHistory();
        data.date = 'invalid-date' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject null date', () => {
        const data = getValidTxHistory();
        data.date = null as any;
        expect(validate(data)).to.be.false;
      });
    });

    describe('sdkProvider Enum Validation', () => {
      const validProviders = ['FLYOVER', 'SWAP', 'POWPEG', 'UNION', 'LIFI', 'SYMBIOSIS'];

      validProviders.forEach(provider => {
        it(`should accept valid sdkProvider: ${provider}`, () => {
          const data = getValidTxHistory();
          data.sdkProvider = provider as any;
          expect(validate(data)).to.be.true;
        });
      });

      it('should reject invalid sdkProvider (not in enum)', () => {
        const data = getValidTxHistory();
        data.sdkProvider = 'INVALID' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject lowercase sdkProvider', () => {
        const data = getValidTxHistory();
        data.sdkProvider = 'flyover' as any;
        expect(validate(data)).to.be.false;
      });

      it('should reject empty sdkProvider', () => {
        const data = getValidTxHistory();
        data.sdkProvider = '' as any;
        expect(validate(data)).to.be.false;
      });
    });

    describe('Optional Fields', () => {
      it('should accept valid liquidityProviderName', () => {
        const data = getValidTxHistory();
        data.liquidityProviderName = 'Uniswap';
        expect(validate(data)).to.be.true;
      });

      it('should accept missing liquidityProviderName', () => {
        const data = getValidTxHistory();
        delete data.liquidityProviderName;
        expect(validate(data)).to.be.true;
      });

      it('should accept undefined liquidityProviderName', () => {
        const data = getValidTxHistory();
        data.liquidityProviderName = undefined;
        expect(validate(data)).to.be.true;
      });
    });

    describe('Complete Valid Object', () => {
      it('should accept a fully valid TxHistory object', () => {
        const data = getValidTxHistory();
        expect(validate(data)).to.be.true;
      });

      it('should accept valid object with all fields including optional', () => {
        const data = getValidTxHistory();
        data.liquidityProviderName = 'Uniswap';
        expect(validate(data)).to.be.true;
      });

      it('should accept valid object with different valid enum values', () => {
        const data = getValidTxHistory();
        data.fromTokenName = 'RBTC';
        data.toTokenName = 'BTC';
        data.fromNetworkName = 'Rootstock';
        data.toNetworkName = 'Bitcoin';
        data.sdkProvider = 'SWAP';
        expect(validate(data)).to.be.true;
      });
    });
  });
});

