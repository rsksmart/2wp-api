import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';
import {UtxoProvider} from '../../services';

describe('UtxoController (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;
  let utxoProviderService: UtxoProvider;

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

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    
    // Get the UtxoProvider service to mock it
    utxoProviderService = await app.get('services.UtxoProvider');
  });

  after(async () => {
    await app.stop();
  });

  describe('POST /utxo', () => {
    describe('with different address types', () => {
      it('should handle legacy P2PKH mainnet addresses', async () => {
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

        // Mock the utxoProvider method
        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          // Validate response structure
          expect(res.body).to.have.property('data');
          expect(res.body.data).to.be.Array();
          expect(res.body.data).to.have.length(1);

          // Validate UTXO structure
          const utxo = res.body.data[0];
          expect(utxo).to.have.property('address', testAddresses.legacyMainnet);
          expect(utxo).to.have.property('txid', 'abc123def456789');
          expect(utxo).to.have.property('vout', 0);
          expect(utxo).to.have.property('amount', '0.001');
          expect(utxo).to.have.property('satoshis', 100000);
          expect(utxo).to.have.property('height', 800000);
          expect(utxo).to.have.property('confirmations', 6);

          // Validate data types
          expect(utxo.address).to.be.String();
          expect(utxo.txid).to.be.String();
          expect(utxo.vout).to.be.Number();
          expect(utxo.amount).to.be.String();
          expect(utxo.satoshis).to.be.Number();
          expect(utxo.height).to.be.Number();
          expect(utxo.confirmations).to.be.Number();
        } finally {
          // Restore original method
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle legacy P2PKH testnet addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyTestnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyTestnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.address).to.equal(testAddresses.legacyTestnet);
          expect(utxo.txid).to.equal('test123def456789');
          expect(utxo.vout).to.equal(1);
          expect(utxo.amount).to.equal('0.0005');
          expect(utxo.satoshis).to.equal(50000);
          expect(utxo.height).to.equal(2500000);
          expect(utxo.confirmations).to.equal(3);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle P2SH addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.p2sh) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.p2sh],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.address).to.equal(testAddresses.p2sh);
          expect(utxo.txid).to.equal('p2sh123def456789');
          expect(utxo.amount).to.equal('0.01');
          expect(utxo.satoshis).to.equal(1000000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle Bech32 mainnet addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.bech32Mainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.bech32Mainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.address).to.equal(testAddresses.bech32Mainnet);
          expect(utxo.txid).to.equal('bech32123def456789');
          expect(utxo.amount).to.equal('0.005');
          expect(utxo.satoshis).to.equal(500000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle Bech32 testnet addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.bech32Testnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.bech32Testnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.address).to.equal(testAddresses.bech32Testnet);
          expect(utxo.txid).to.equal('bech32test123def456789');
          expect(utxo.amount).to.equal('0.002');
          expect(utxo.satoshis).to.equal(200000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle Bech32m mainnet addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.bech32mMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.bech32mMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.address).to.equal(testAddresses.bech32mMainnet);
          expect(utxo.txid).to.equal('bech32m123def456789');
          expect(utxo.amount).to.equal('0.1');
          expect(utxo.satoshis).to.equal(10000000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle Bech32m testnet addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.bech32mTestnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.bech32mTestnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.address).to.equal(testAddresses.bech32mTestnet);
          expect(utxo.txid).to.equal('bech32mtest123def456789');
          expect(utxo.amount).to.equal('0.05');
          expect(utxo.satoshis).to.equal(5000000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle mixed address types in a single request', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          switch (address) {
            case testAddresses.legacyMainnet:
              return mockUtxos1;
            case testAddresses.p2sh:
              return mockUtxos2;
            case testAddresses.bech32Mainnet:
              return mockUtxos3;
            case testAddresses.bech32mMainnet:
              return mockUtxos4;
            default:
              return [];
          }
        };

        try {
          const requestBody = {
            addressList: [
              testAddresses.legacyMainnet,
              testAddresses.p2sh,
              testAddresses.bech32Mainnet,
              testAddresses.bech32mMainnet,
            ],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(4);
          
          // Verify each address type is present
          const addresses = res.body.data.map((utxo: any) => utxo.address);
          expect(addresses).to.containEql(testAddresses.legacyMainnet);
          expect(addresses).to.containEql(testAddresses.p2sh);
          expect(addresses).to.containEql(testAddresses.bech32Mainnet);
          expect(addresses).to.containEql(testAddresses.bech32mMainnet);

          // Verify UTXO data integrity
          res.body.data.forEach((utxo: any) => {
            expect(utxo).to.have.property('address');
            expect(utxo).to.have.property('txid');
            expect(utxo).to.have.property('vout');
            expect(utxo).to.have.property('amount');
            expect(utxo).to.have.property('satoshis');
            expect(utxo).to.have.property('height');
            expect(utxo).to.have.property('confirmations');
          });
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });
    });

    describe('with multiple UTXOs per address', () => {
      it('should handle multiple UTXOs from a single address', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(3);
          
          // Verify all UTXOs have the same address
          res.body.data.forEach((utxo: any) => {
            expect(utxo.address).to.equal(testAddresses.legacyMainnet);
          });

          // Verify different transaction IDs
          const txids = res.body.data.map((utxo: any) => utxo.txid);
          expect(txids).to.containEql('tx1abc123def456789');
          expect(txids).to.containEql('tx2abc123def456789');
          expect(txids).to.containEql('tx3abc123def456789');
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle multiple UTXOs from multiple addresses', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          switch (address) {
            case testAddresses.legacyMainnet:
              return mockUtxos1;
            case testAddresses.p2sh:
              return mockUtxos2;
            default:
              return [];
          }
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet, testAddresses.p2sh],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(5);
          
          // Verify address distribution
          const legacyUtxos = res.body.data.filter((utxo: any) => utxo.address === testAddresses.legacyMainnet);
          const p2shUtxos = res.body.data.filter((utxo: any) => utxo.address === testAddresses.p2sh);
          
          expect(legacyUtxos).to.have.length(2);
          expect(p2shUtxos).to.have.length(3);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });
    });

    describe('with empty results', () => {
      it('should handle addresses with no UTXOs', async () => {
        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async () => [];

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(0);
          expect(res.body.data).to.be.Array();
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle mixed addresses - some with UTXOs, some without', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [
              testAddresses.legacyMainnet,
              testAddresses.p2sh,
              testAddresses.bech32Mainnet,
            ],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          expect(res.body.data[0].address).to.equal(testAddresses.legacyMainnet);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });
    });

    describe('error handling', () => {
      it('should handle service errors gracefully', async () => {
        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async () => {
          throw new Error('Network error');
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          await client
            .post('/utxo')
            .send(requestBody)
            .expect(500);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle partial failures in multi-address requests', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          if (address === testAddresses.p2sh) {
            throw new Error('Service unavailable');
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [
              testAddresses.legacyMainnet,
              testAddresses.p2sh,
              testAddresses.bech32Mainnet,
            ],
          };

          await client
            .post('/utxo')
            .send(requestBody)
            .expect(500);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });
    });

    describe('edge cases', () => {
      it('should handle very large amounts', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.amount).to.equal('21000000.00000000');
          expect(utxo.satoshis).to.equal(2100000000000000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle very small amounts (dust)', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.amount).to.equal('0.00000001');
          expect(utxo.satoshis).to.equal(1);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle unconfirmed transactions (height 0)', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.height).to.equal(0);
          expect(utxo.confirmations).to.equal(0);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });

      it('should handle high confirmation counts', async () => {
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

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          expect(res.body.data).to.have.length(1);
          const utxo = res.body.data[0];
          expect(utxo.height).to.equal(100000);
          expect(utxo.confirmations).to.equal(800000);
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });
    });

    describe('request validation', () => {
      it('should reject requests with invalid address format', async () => {
        const requestBody = {
          addressList: ['invalid-address'],
        };

        await client
          .post('/utxo')
          .send(requestBody)
          .expect(422); // Unprocessable Entity
      });

      it('should reject requests without addressList', async () => {
        const requestBody = {};

        await client
          .post('/utxo')
          .send(requestBody)
          .expect(422);
      });

      it('should reject requests with empty addressList', async () => {
        const requestBody = {
          addressList: [],
        };

        await client
          .post('/utxo')
          .send(requestBody)
          .expect(422);
      });

      it('should reject requests with additional properties', async () => {
        const requestBody = {
          addressList: [testAddresses.legacyMainnet],
          extraProperty: 'should not be allowed',
        };

        await client
          .post('/utxo')
          .send(requestBody)
          .expect(422);
      });

      it('should reject requests with non-string addresses', async () => {
        const requestBody = {
          addressList: [123, testAddresses.legacyMainnet],
        };

        await client
          .post('/utxo')
          .send(requestBody)
          .expect(422);
      });
    });

    describe('response schema validation', () => {
      it('should return valid UtxoResponse schema', async () => {
        const mockUtxos = [
          {
            txid: 'schema123def456789',
            vout: 0,
            amount: '0.001',
            satoshis: 100000,
            height: 800000,
            confirmations: 6,
          },
        ];

        const originalUtxoProvider = utxoProviderService.utxoProvider;
        utxoProviderService.utxoProvider = async (address: string) => {
          if (address === testAddresses.legacyMainnet) {
            return mockUtxos;
          }
          return [];
        };

        try {
          const requestBody = {
            addressList: [testAddresses.legacyMainnet],
          };

          const res = await client
            .post('/utxo')
            .send(requestBody)
            .expect(200);

          // Validate response structure matches UtxoResponse model
          expect(res.body).to.have.property('data');
          expect(res.body.data).to.be.Array();
          
          // Validate each UTXO matches Utxo model
          res.body.data.forEach((utxo: any) => {
            expect(utxo).to.have.property('address');
            expect(utxo).to.have.property('txid');
            expect(utxo).to.have.property('vout');
            expect(utxo).to.have.property('amount');
            expect(utxo).to.have.property('satoshis');
            expect(utxo).to.have.property('height');
            expect(utxo).to.have.property('confirmations');
            
            // Validate data types
            expect(utxo.address).to.be.String();
            expect(utxo.txid).to.be.String();
            expect(utxo.vout).to.be.Number();
            expect(utxo.amount).to.be.String();
            expect(utxo.satoshis).to.be.Number();
            expect(utxo.height).to.be.Number();
            expect(utxo.confirmations).to.be.Number();
          });
        } finally {
          utxoProviderService.utxoProvider = originalUtxoProvider;
        }
      });
    });
  });
});
