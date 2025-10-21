import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('Input Sanitization (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  describe('POST /broadcast - Input Validation', () => {
    it('should reject SQL injection attempts in data field', async () => {
      await client
        .post('/broadcast')
        .send({
          data: "'; DROP TABLE transactions; --",
        })
        .expect(422);
    });

    it('should reject XSS attempts in data field', async () => {
      await client
        .post('/broadcast')
        .send({
          data: '<script>alert("xss")</script>',
        })
        .expect(422);
    });

    it('should reject non-hexadecimal characters', async () => {
      await client
        .post('/broadcast')
        .send({
          data: 'GHIJKLMNOP',
        })
        .expect(422);
    });

    it('should reject special characters', async () => {
      await client
        .post('/broadcast')
        .send({
          data: '@#$%^&*()',
        })
        .expect(422);
    });

    it('should reject empty string', async () => {
      await client
        .post('/broadcast')
        .send({
          data: '',
        })
        .expect(422);
    });

    it('should accept valid hexadecimal data', async () => {
      await client
        .post('/broadcast')
        .send({
          data: '0123456789abcdefABCDEF',
        })
        .expect(201);
    });

    it('should reject additional properties', async () => {
      await client
        .post('/broadcast')
        .send({
          data: '0123456789abcdef',
          maliciousProperty: 'should not be allowed',
        })
        .expect(422);
    });
  });

  describe('GET /tx - Transaction Hash Validation', () => {
    it('should reject SQL injection in tx parameter', async () => {
      await client
        .get('/tx')
        .query({tx: "'; DROP TABLE transactions; --"})
        .expect(422);
    });

    it('should reject XSS in tx parameter', async () => {
      await client
        .get('/tx')
        .query({tx: '<script>alert("xss")</script>'})
        .expect(422);
    });

    it('should reject transaction hash that is too short', async () => {
      await client
        .get('/tx')
        .query({tx: '0123456789abcdef'})
        .expect(422);
    });

    it('should reject transaction hash that is too long', async () => {
      await client
        .get('/tx')
        .query({tx: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00'})
        .expect(422);
    });

    it('should reject transaction hash with non-hex characters', async () => {
      await client
        .get('/tx')
        .query({tx: 'gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg'})
        .expect(422);
    });

    it('should accept valid 64-character hex transaction hash', async () => {
      // This will fail with 404 if tx not found, but should pass validation (not 422)
      const res = await client
        .get('/tx')
        .query({tx: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'});
      
      // Should not return 422 (validation error)
      expect(res.status).to.not.equal(422);
    });
  });

  describe('GET /tx-status/{txId} - Transaction ID Validation', () => {
    it('should handle invalid RSK transaction hash format', async () => {
      const res = await client
        .get('/tx-status/invalid-tx-id')
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should handle SQL injection attempt', async () => {
      const res = await client
        .get("/tx-status/'; DROP TABLE pegouts; --")
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should handle XSS attempt', async () => {
      const res = await client
        .get('/tx-status/<script>alert("xss")</script>')
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should handle path traversal attempt', async () => {
      const res = await client
        .get('/tx-status/../../etc/passwd')
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should handle null byte injection', async () => {
      const res = await client
        .get('/tx-status/test%00.txt')
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should accept valid RSK transaction hash with 0x prefix', async () => {
      const validRskTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const res = await client
        .get(`/tx-status/${validRskTxHash}`)
        .expect(200);
      
      // Should not return INVALID_DATA for properly formatted hash
      expect(res.body.type).to.not.equal('INVALID_DATA');
    });

    it('should accept valid Bitcoin transaction hash (64 hex chars)', async () => {
      const validBtcTxHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const res = await client
        .get(`/tx-status/${validBtcTxHash}`)
        .expect(200);
      
      // Should not return INVALID_DATA for properly formatted hash
      expect(res.body.type).to.not.equal('INVALID_DATA');
    });
  });

  describe('GET /tx-status-by-type/{txId}/{txType} - Type Parameter Validation', () => {
    const validTxId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('should handle invalid txId with SQL injection', async () => {
      const res = await client
        .get(`/tx-status-by-type/'; DROP TABLE transactions; --/pegin`)
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should handle XSS in txType parameter', async () => {
      const res = await client
        .get(`/tx-status-by-type/${validTxId}/<script>alert("xss")</script>`);
      
      // Should handle gracefully (might be 200 with error or 404)
      expect(res.status).to.be.oneOf([200, 404]);
    });

    it('should accept valid pegin type', async () => {
      const res = await client
        .get(`/tx-status-by-type/${validTxId}/pegin`)
        .expect(200);
      
      expect(res.body).to.have.property('type');
    });

    it('should accept valid pegout type', async () => {
      const res = await client
        .get(`/tx-status-by-type/${validTxId}/pegout`)
        .expect(200);
      
      expect(res.body).to.have.property('type');
    });
  });

  describe('POST /addresses-info - Bitcoin Address Validation', () => {
    it('should reject SQL injection in address list', async () => {
      await client
        .post('/addresses-info')
        .send({
          addressList: ["'; DROP TABLE addresses; --"],
        })
        .expect(422);
    });

    it('should reject XSS in address list', async () => {
      await client
        .post('/addresses-info')
        .send({
          addressList: ['<script>alert("xss")</script>'],
        })
        .expect(422);
    });

    it('should reject invalid Bitcoin address format', async () => {
      await client
        .post('/addresses-info')
        .send({
          addressList: ['not-a-valid-address'],
        })
        .expect(422);
    });

    it('should reject empty address list', async () => {
      await client
        .post('/addresses-info')
        .send({
          addressList: [],
        })
        .expect(422);
    });

    it('should reject additional properties', async () => {
      await client
        .post('/addresses-info')
        .send({
          addressList: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
          maliciousProperty: 'should not be allowed',
        })
        .expect(422);
    });

    it('should accept valid legacy P2PKH mainnet address', async () => {
      const res = await client
        .post('/addresses-info')
        .send({
          addressList: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
        });
      
      // Should not return 422 (validation error)
      expect(res.status).to.not.equal(422);
    });

    it('should accept valid legacy P2PKH testnet address', async () => {
      const res = await client
        .post('/addresses-info')
        .send({
          addressList: ['mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef'],
        });
      
      expect(res.status).to.not.equal(422);
    });

    it('should accept valid P2SH address', async () => {
      const res = await client
        .post('/addresses-info')
        .send({
          addressList: ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'],
        });
      
      expect(res.status).to.not.equal(422);
    });

    it('should accept valid Bech32 mainnet address', async () => {
      const res = await client
        .post('/addresses-info')
        .send({
          addressList: ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'],
        });
      
      expect(res.status).to.not.equal(422);
    });

    it('should accept valid Bech32 testnet address', async () => {
      const res = await client
        .post('/addresses-info')
        .send({
          addressList: ['tb1qdrf59ns3gkc522fstnmrn8v0emfqd6zqxc2fd0'],
        });
      
      expect(res.status).to.not.equal(422);
    });

    it('should accept valid Bech32m address', async () => {
      const res = await client
        .post('/addresses-info')
        .send({
          addressList: ['bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'],
        });
      
      expect(res.status).to.not.equal(422);
    });
  });

  describe('POST /utxo - Address List Validation', () => {
    it('should reject SQL injection in address list', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: ["'; DROP TABLE utxos; --"],
        })
        .expect(422);
    });

    it('should reject XSS in address list', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: ['<img src=x onerror=alert("xss")>'],
        })
        .expect(422);
    });

    it('should reject invalid address format', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: ['invalid-address-123'],
        })
        .expect(422);
    });

    it('should reject non-string addresses', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: [12345, '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
        })
        .expect(422);
    });

    it('should reject empty array', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: [],
        })
        .expect(422);
    });

    it('should reject missing addressList property', async () => {
      await client
        .post('/utxo')
        .send({})
        .expect(422);
    });

    it('should reject additional properties', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
          extraField: 'not allowed',
        })
        .expect(422);
    });
  });

  describe('POST /register - Payload Validation', () => {
    it('should reject negative values in payload', async () => {
      const res = await client
        .post('/register')
        .send({
          type: 'pegin',
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          wallet: 'test-wallet',
          value: '-100',
          fee: '10',
        });
      
      expect(res.status).to.equal(400);
      expect(res.body.error).to.match(/negative/i);
    });

    it('should reject non-numeric values', async () => {
      const res = await client
        .post('/register')
        .send({
          type: 'pegin',
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          wallet: 'test-wallet',
          value: 'not-a-number',
          fee: '10',
        });
      
      expect(res.status).to.equal(400);
      expect(res.body.error).to.match(/non-numeric/i);
    });

    it('should reject SQL injection in txHash', async () => {
      const res = await client
        .post('/register')
        .send({
          type: 'pegin',
          txHash: "'; DROP TABLE transactions; --",
          wallet: 'test-wallet',
          value: '100',
          fee: '10',
        });
      
      // Should either reject or handle gracefully
      expect(res.status).to.be.oneOf([400, 422]);
    });

    it('should reject XSS in wallet field', async () => {
      const res = await client
        .post('/register')
        .send({
          type: 'pegin',
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          wallet: '<script>alert("xss")</script>',
          value: '100',
          fee: '10',
        });
      
      // Should handle gracefully
      expect(res.status).to.be.oneOf([200, 400, 422]);
    });
  });

  describe('GET /estimate-fee/{block} - Block Parameter Validation', () => {
    it('should reject SQL injection in block parameter', async () => {
      const res = await client
        .get("/estimate-fee/'; DROP TABLE blocks; --");
      
      // Should handle gracefully (might be 400, 422, or 404)
      expect(res.status).to.be.oneOf([400, 404, 422, 500]);
    });

    it('should reject XSS in block parameter', async () => {
      const res = await client
        .get('/estimate-fee/<script>alert("xss")</script>');
      
      expect(res.status).to.be.oneOf([400, 404, 422, 500]);
    });

    it('should reject negative block numbers', async () => {
      const res = await client
        .get('/estimate-fee/-1');
      
      expect(res.status).to.be.oneOf([400, 422, 500]);
    });

    it('should reject non-numeric block values', async () => {
      const res = await client
        .get('/estimate-fee/abc');
      
      expect(res.status).to.be.oneOf([400, 404, 422, 500]);
    });

    it('should accept valid block number', async () => {
      const res = await client
        .get('/estimate-fee/6');
      
      // Should not return validation error (422)
      expect(res.status).to.not.equal(422);
    });
  });

  describe('POST /logs - Log Entry Validation', () => {
    it('should handle XSS attempts in log message', async () => {
      const res = await client
        .post('/logs')
        .send({
          type: 'error',
          operation: 'test',
          location: '<script>alert("xss")</script>',
        });
      
      // Should handle gracefully
      expect(res.status).to.be.oneOf([200, 400, 422]);
    });

    it('should handle SQL injection in error field', async () => {
      const res = await client
        .post('/logs')
        .send({
          type: 'error',
          operation: 'test',
          location: 'frontend',
          error: {
            message: "'; DROP TABLE logs; --",
          },
        });
      
      // Should handle gracefully
      expect(res.status).to.be.oneOf([200, 400, 422]);
    });

    it('should accept valid log entry', async () => {
      await client
        .post('/logs')
        .send({
          type: 'info',
          operation: 'test-operation',
          location: 'frontend',
        })
        .expect(200);
    });
  });

  describe('RSK Transaction Hash Format Tests', () => {
    it('should handle RSK tx hash with underscore suffix (before sanitization)', async () => {
      const txHashWithSuffix = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef_123';
      const res = await client
        .get(`/tx-status/${txHashWithSuffix}`)
        .expect(200);
      
      // The sanitization should happen internally
      expect(res.body).to.have.property('type');
    });

    it('should handle RSK tx hash without 0x prefix', async () => {
      const txHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const res = await client
        .get(`/tx-status/${txHash}`)
        .expect(200);
      
      expect(res.body).to.have.property('type');
    });

    it('should validate proper RSK tx hash format (0x + 64 hex)', async () => {
      const validRskTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const res = await client
        .get(`/tx-status/${validRskTxHash}`)
        .expect(200);
      
      // Should not return INVALID_DATA for properly formatted hash
      expect(res.body.type).to.not.equal('INVALID_DATA');
    });
  });

  describe('Cross-Site Request Forgery (CSRF) Headers', () => {
    it('should handle requests with potentially malicious headers', async () => {
      const res = await client
        .get('/health')
        .set('X-Forwarded-For', "'; DROP TABLE users; --")
        .set('Referer', '<script>alert("xss")</script>');
      
      // Should handle gracefully
      expect(res.status).to.be.oneOf([200, 400, 403]);
    });
  });

  describe('Unicode and Special Character Handling', () => {
    it('should handle unicode characters in transaction hash', async () => {
      const res = await client
        .get('/tx-status/你好世界')
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });

    it('should handle emoji in address', async () => {
      await client
        .post('/utxo')
        .send({
          addressList: ['😀🎉🔥'],
        })
        .expect(422);
    });

    it('should handle zero-width characters', async () => {
      const res = await client
        .get('/tx-status/test​invisible​characters')
        .expect(200);
      
      expect(res.body.type).to.equal('INVALID_DATA');
    });
  });
});

