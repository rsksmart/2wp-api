import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
  UTXO_RESPONSE_MAX_ROWS,
} from '../../config/limits';
import {UtxoController} from '../../controllers/utxo.controller';
import {AddressList, Utxo} from '../../models';
import {UtxoResponse} from '../../models/utxo-response.model';
import {UtxoProvider} from '../../services';

describe('UtxoController', () => {
  let utxoProviderService: UtxoProvider;
  let utxoProvider: sinon.SinonStub;
  let utxoController: UtxoController;

  // Test addresses for different Bitcoin address types
  const testAddresses = {
    // Legacy P2PKH addresses (mainnet)
    legacyMainnet: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    // Legacy P2PKH addresses (testnet)
    legacyTestnet: 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef',
    // P2SH addresses
    p2sh: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    // Bech32 addresses (mainnet)
    bech32Mainnet: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    // Bech32 addresses (testnet)
    bech32Testnet: 'tb1qdrf59ns3gkc522fstnmrn8v0emfqd6zqxc2fd0',
    // Bech32m addresses (mainnet)
    bech32mMainnet: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    // Bech32m addresses (testnet)
    bech32mTestnet: 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
  };

  function resetRepositories() {
    utxoProviderService = {utxoProvider: sinon.stub()};
    utxoProvider = utxoProviderService.utxoProvider as sinon.SinonStub;
    utxoController = new UtxoController(utxoProviderService);
  }

  beforeEach(resetRepositories);

  describe('getUtxos', () => {
    describe('with different address types', () => {
      it('should handle legacy P2PKH mainnet addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const mockUtxos = [
          {
            txid: 'abc123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result).to.be.instanceOf(UtxoResponse);
        expect(result.data).to.have.length(1);
        expect(result.data[0]).to.containDeep({
          address: testAddresses.legacyMainnet,
          txid: 'abc123def456789',
          vout: 0,
          amount: '0.001',
          satoshis: 100000,
          height: 800000,
          confirmations: 6,
        });
        sinon.assert.calledOnceWithExactly(utxoProvider, testAddresses.legacyMainnet);
      });

      it('should handle legacy P2PKH testnet addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyTestnet],
        });

        const mockUtxos = [
          {
            txid: 'test123def456789',
            vout: 1,
            amount: '0.0005',
            satoshis: 50000,
            height: 2500000,
            confirmations: 3,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyTestnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.legacyTestnet,
          txid: 'test123def456789',
          vout: 1,
          amount: '0.0005',
          satoshis: 50000,
          height: 2500000,
          confirmations: 3,
        });
      });

      it('should handle P2SH addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.p2sh],
        });

        const mockUtxos = [
          {
            txid: 'p2sh123def456789',
            vout: 0,
            amount: '0.01',
            satoshis: 1000000,
            height: 750000,
            confirmations: 12,
          },
        ];

        utxoProvider.withArgs(testAddresses.p2sh).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.p2sh,
          txid: 'p2sh123def456789',
          vout: 0,
          amount: '0.01',
          satoshis: 1000000,
          height: 750000,
          confirmations: 12,
        });
      });

      it('should handle Bech32 mainnet addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.bech32Mainnet],
        });

        const mockUtxos = [
          {
            txid: 'bech32123def456789',
            vout: 0,
            amount: '0.005',
            satoshis: 500000,
            height: 780000,
            confirmations: 8,
          },
        ];

        utxoProvider.withArgs(testAddresses.bech32Mainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.bech32Mainnet,
          txid: 'bech32123def456789',
          vout: 0,
          amount: '0.005',
          satoshis: 500000,
          height: 780000,
          confirmations: 8,
        });
      });

      it('should handle Bech32 testnet addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.bech32Testnet],
        });

        const mockUtxos = [
          {
            txid: 'bech32test123def456789',
            vout: 0,
            amount: '0.002',
            satoshis: 200000,
            height: 2400000,
            confirmations: 5,
          },
        ];

        utxoProvider.withArgs(testAddresses.bech32Testnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.bech32Testnet,
          txid: 'bech32test123def456789',
          vout: 0,
          amount: '0.002',
          satoshis: 200000,
          height: 2400000,
          confirmations: 5,
        });
      });

      it('should handle Bech32m mainnet addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.bech32mMainnet],
        });

        const mockUtxos = [
          {
            txid: 'bech32m123def456789',
            vout: 0,
            amount: '0.1',
            satoshis: 10000000,
            height: 790000,
            confirmations: 15,
          },
        ];

        utxoProvider.withArgs(testAddresses.bech32mMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.bech32mMainnet,
          txid: 'bech32m123def456789',
          vout: 0,
          amount: '0.1',
          satoshis: 10000000,
          height: 790000,
          confirmations: 15,
        });
      });

      it('should handle Bech32m testnet addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.bech32mTestnet],
        });

        const mockUtxos = [
          {
            txid: 'bech32mtest123def456789',
            vout: 0,
            amount: '0.05',
            satoshis: 5000000,
            height: 2450000,
            confirmations: 7,
          },
        ];

        utxoProvider.withArgs(testAddresses.bech32mTestnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.bech32mTestnet,
          txid: 'bech32mtest123def456789',
          vout: 0,
          amount: '0.05',
          satoshis: 5000000,
          height: 2450000,
          confirmations: 7,
        });
      });

      it('should handle mixed address types in a single request', async () => {
        const addressList = new AddressList({
          addressList: [
            testAddresses.legacyMainnet,
            testAddresses.p2sh,
            testAddresses.bech32Mainnet,
            testAddresses.bech32mMainnet,
          ],
        });

        const mockUtxos1 = [
          {
            txid: 'legacy123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
        ];

        const mockUtxos2 = [
          {
            txid: 'p2sh123def456789',
            vout: 0,
            amount: '0.01',
            satoshis: 1000000,
            height: 750000,
            confirmations: 12,
          },
        ];

        const mockUtxos3 = [
          {
            txid: 'bech32123def456789',
            vout: 0,
            amount: '0.005',
            satoshis: 500000,
            height: 780000,
            confirmations: 8,
          },
        ];

        const mockUtxos4 = [
          {
            txid: 'bech32m123def456789',
            vout: 0,
            amount: '0.1',
            satoshis: 10000000,
            height: 790000,
            confirmations: 15,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos1);
        utxoProvider.withArgs(testAddresses.p2sh).resolves(mockUtxos2);
        utxoProvider.withArgs(testAddresses.bech32Mainnet).resolves(mockUtxos3);
        utxoProvider.withArgs(testAddresses.bech32mMainnet).resolves(mockUtxos4);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data).to.have.length(4);
        expect(result.data[0].address).to.equal(testAddresses.legacyMainnet);
        expect(result.data[1].address).to.equal(testAddresses.p2sh);
        expect(result.data[2].address).to.equal(testAddresses.bech32Mainnet);
        expect(result.data[3].address).to.equal(testAddresses.bech32mMainnet);
        sinon.assert.callCount(utxoProvider, 4);
      });
    });

    describe('with multiple UTXOs per address', () => {
      it('should handle multiple UTXOs from a single address', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const mockUtxos = [
          {
            txid: 'tx1abc123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
          {
            txid: 'tx2abc123def456789',
            vout: 1,
            amount: '0.002',
            satoshis: 200000,
            height: 800100,
            confirmations: 5,
          },
          {
            txid: 'tx3abc123def456789',
            vout: 0,
            amount: '0.0005',
            satoshis: 50000,
            height: 800200,
            confirmations: 4,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data).to.have.length(3);
        expect(result.data[0].address).to.equal(testAddresses.legacyMainnet);
        expect(result.data[1].address).to.equal(testAddresses.legacyMainnet);
        expect(result.data[2].address).to.equal(testAddresses.legacyMainnet);
        expect(result.data[0].txid).to.equal('tx1abc123def456789');
        expect(result.data[1].txid).to.equal('tx2abc123def456789');
        expect(result.data[2].txid).to.equal('tx3abc123def456789');
      });

      it('should handle multiple UTXOs from multiple addresses', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet, testAddresses.p2sh],
        });

        const mockUtxos1 = [
          {
            txid: 'addr1tx1abc123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
          {
            txid: 'addr1tx2abc123def456789',
            vout: 1,
            amount: '0.002',
            satoshis: 200000,
            height: 800100,
            confirmations: 5,
          },
        ];

        const mockUtxos2 = [
          {
            txid: 'addr2tx1abc123def456789',
            vout: 0,
            amount: '0.01',
            satoshis: 1000000,
            height: 750000,
            confirmations: 12,
          },
          {
            txid: 'addr2tx2abc123def456789',
            vout: 1,
            amount: '0.005',
            satoshis: 500000,
            height: 750100,
            confirmations: 11,
          },
          {
            txid: 'addr2tx3abc123def456789',
            vout: 2,
            amount: '0.001',
            satoshis: 100000,
            height: 750200,
            confirmations: 10,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos1);
        utxoProvider.withArgs(testAddresses.p2sh).resolves(mockUtxos2);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data).to.have.length(5);
        expect(result.data.filter(utxo => utxo.address === testAddresses.legacyMainnet)).to.have.length(2);
        expect(result.data.filter(utxo => utxo.address === testAddresses.p2sh)).to.have.length(3);
      });
    });

    describe('with empty results', () => {
      it('should handle addresses with no UTXOs', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves([]);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data).to.have.length(0);
        sinon.assert.calledOnceWithExactly(utxoProvider, testAddresses.legacyMainnet);
      });

      it('should handle mixed addresses - some with UTXOs, some without', async () => {
        const addressList = new AddressList({
          addressList: [
            testAddresses.legacyMainnet,
            testAddresses.p2sh,
            testAddresses.bech32Mainnet,
          ],
        });

        const mockUtxos = [
          {
            txid: 'onlyonetx123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);
        utxoProvider.withArgs(testAddresses.p2sh).resolves([]);
        utxoProvider.withArgs(testAddresses.bech32Mainnet).resolves([]);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data).to.have.length(1);
        expect(result.data[0].address).to.equal(testAddresses.legacyMainnet);
        sinon.assert.callCount(utxoProvider, 3);
      });
    });

    describe('error handling', () => {
      it('should reject when utxoProvider throws an error', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const error = new Error('Network error');
        utxoProvider.withArgs(testAddresses.legacyMainnet).rejects(error);

        try {
          await utxoController.getUtxos(addressList);
          expect.fail(null, null, 'Expected method to throw an error', 'throw');
        } catch (err) {
          expect(err).to.equal(error);
        }

        sinon.assert.calledOnceWithExactly(utxoProvider, testAddresses.legacyMainnet);
      });

      it('should reject when one address fails in a multi-address request', async () => {
        const addressList = new AddressList({
          addressList: [
            testAddresses.legacyMainnet,
            testAddresses.p2sh,
            testAddresses.bech32Mainnet,
          ],
        });

        const mockUtxos = [
          {
            txid: 'success123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
        ];

        const error = new Error('Service unavailable');

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);
        utxoProvider.withArgs(testAddresses.p2sh).rejects(error);
        utxoProvider.withArgs(testAddresses.bech32Mainnet).resolves([]);

        try {
          await utxoController.getUtxos(addressList);
          expect.fail(null, null, 'Expected method to throw an error', 'throw');
        } catch (err) {
          expect(err).to.equal(error);
        }

        sinon.assert.calledThrice(utxoProvider);
      });
    });

    describe('edge cases', () => {
      it('should handle very large amounts', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const mockUtxos = [
          {
            txid: 'largeamount123def456789',
            vout: 0,
            amount: '21000000.00000000',
            satoshis: 2100000000000000,
            height: 800000,
            confirmations: 6,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.legacyMainnet,
          txid: 'largeamount123def456789',
          vout: 0,
          amount: '21000000.00000000',
          satoshis: 2100000000000000,
          height: 800000,
          confirmations: 6,
        });
      });

      it('should handle very small amounts (dust)', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const mockUtxos = [
          {
            txid: 'dust123def456789',
            vout: 0,
            amount: '0.00000001',
            satoshis: 1,
            height: 800000,
            confirmations: 6,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.legacyMainnet,
          txid: 'dust123def456789',
          vout: 0,
          amount: '0.00000001',
          satoshis: 1,
          height: 800000,
          confirmations: 6,
        });
      });

      it('should handle unconfirmed transactions (height 0)', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const mockUtxos = [
          {
            txid: 'unconfirmed123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 0,
            confirmations: 0,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.legacyMainnet,
          txid: 'unconfirmed123def456789',
          vout: 0,
          amount: '0.001',
          satoshis: 100000,
          height: 0,
          confirmations: 0,
        });
      });

      it('should handle high confirmation counts', async () => {
        const addressList = new AddressList({
          addressList: [testAddresses.legacyMainnet],
        });

        const mockUtxos = [
          {
            txid: 'oldtx123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 100000,
            confirmations: 800000,
          },
        ];

        utxoProvider.withArgs(testAddresses.legacyMainnet).resolves(mockUtxos);

        const result = await utxoController.getUtxos(addressList);

        expect(result.data[0]).to.containDeep({
          address: testAddresses.legacyMainnet,
          txid: 'oldtx123def456789',
          vout: 0,
          amount: '0.001',
          satoshis: 100000,
          height: 100000,
          confirmations: 800000,
        });
      });
    });

    describe('vulnerability 79368 — duplicate address-list response amplification', () => {
      // Deterministic generator of unique valid mainnet legacy P2PKH addresses.
      // Length 34 (1 + 33) fits the controller regex [13mn][...]{25,34}.
      function uniqueLegacyMainnet(index: number): string {
        const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let n = index + 1;
        let suffix = '';
        while (n > 0) {
          suffix = base58[n % 58] + suffix;
          n = Math.floor(n / 58);
        }
        return '1' + suffix.padStart(33, 'A');
      }

      it('should reject addressList exceeding ADDRESS_LIST_MAX_ITEMS without calling the provider', async () => {
        const tooMany = Array.from(
          {length: ADDRESS_LIST_MAX_ITEMS + 1},
          (_, i) => uniqueLegacyMainnet(i),
        );
        const addressList = new AddressList({addressList: tooMany});
        utxoProvider.resolves([]);

        let caught: unknown = null;
        try {
          await utxoController.getUtxos(addressList);
        } catch (err) {
          caught = err;
        }

        expect(caught).to.not.be.null();
        sinon.assert.notCalled(utxoProvider);
      });

      it('should reject addressList containing duplicate addresses', async () => {
        const addressList = new AddressList({
          addressList: [
            testAddresses.legacyMainnet,
            testAddresses.legacyMainnet,
          ],
        });
        utxoProvider.resolves([]);

        let caught: unknown = null;
        try {
          await utxoController.getUtxos(addressList);
        } catch (err) {
          caught = err;
        }

        expect(caught).to.not.be.null();
        sinon.assert.notCalled(utxoProvider);
      });

      it('should call the provider at most once per unique address (defense in depth)', async () => {
        // Even if duplicate rejection is disabled by configuration, the
        // controller must collapse duplicates before fan-out so a single
        // address never produces N provider calls.
        const addressList = new AddressList({
          addressList: [
            testAddresses.legacyMainnet,
            testAddresses.legacyMainnet,
            testAddresses.legacyMainnet,
          ],
        });
        utxoProvider.resolves([]);

        try {
          await utxoController.getUtxos(addressList);
        } catch {
          // Rejection is also acceptable here; the assertion below covers it.
        }

        expect(utxoProvider.callCount).to.be.lessThanOrEqual(1);
      });

      it('should bound provider fan-out concurrency to PROVIDER_CONCURRENCY', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        utxoProvider.callsFake(async () => {
          inFlight += 1;
          if (inFlight > maxInFlight) maxInFlight = inFlight;
          await new Promise(resolve => setTimeout(resolve, 25));
          inFlight -= 1;
          return [];
        });

        const addresses = Array.from(
          {length: PROVIDER_CONCURRENCY * 4},
          (_, i) => uniqueLegacyMainnet(i),
        );
        const addressList = new AddressList({addressList: addresses});

        await utxoController.getUtxos(addressList);

        expect(maxInFlight).to.be.lessThanOrEqual(PROVIDER_CONCURRENCY);
      });

      it('should cap the aggregated UTXO response to UTXO_RESPONSE_MAX_ROWS rows', async () => {
        const addressCount = 5;
        const addresses = Array.from(
          {length: addressCount},
          (_, i) => uniqueLegacyMainnet(i),
        );
        const addressList = new AddressList({addressList: addresses});
        const utxosPerAddress =
          Math.ceil(UTXO_RESPONSE_MAX_ROWS / addressCount) + 1;
        const heavyUtxos = Array.from({length: utxosPerAddress}, (_, i) => ({
          txid: String(i).padStart(64, '0'),
          vout: i,
          amount: '0.00000546',
          satoshis: 546,
          height: 1,
          confirmations: 1,
        }));
        utxoProvider.resolves(heavyUtxos);

        let caught: unknown = null;
        let result: import('../../models/utxo-response.model').UtxoResponse | null = null;
        try {
          result = await utxoController.getUtxos(addressList);
        } catch (err) {
          caught = err;
        }

        // Either the controller rejects with a payload-too-large style error,
        // or it truncates the response — both close the amplification channel.
        if (caught) {
          expect(caught).to.not.be.null();
        } else {
          expect(result).to.not.be.null();
          expect(result!.data.length).to.be.lessThanOrEqual(UTXO_RESPONSE_MAX_ROWS);
        }
      });

      it('PoC regression: should reject 25 000 duplicate addresses without invoking the provider', async () => {
        const addressList = new AddressList({
          addressList: Array.from({length: 25000}, () => testAddresses.legacyMainnet),
        });
        utxoProvider.resolves([]); // empty per-address rows for safety

        const startedAt = Date.now();
        let caught: unknown = null;
        try {
          await utxoController.getUtxos(addressList);
        } catch (err) {
          caught = err;
        }
        const elapsedMs = Date.now() - startedAt;

        expect(caught).to.not.be.null();
        sinon.assert.notCalled(utxoProvider);
        // Reject must be a constant-time guard, not after walking the list.
        expect(elapsedMs).to.be.lessThan(500);
      });
    });
  });
});
