import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';
import nock from 'nock';

describe('FireblocksController (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /fireblocks/generic-get', () => {
    it('should successfully call Fireblocks API and return response', async () => {
      const requestBody = {
        apiKey: 'test-api-key',
        jwt: 'test-jwt-token',
        uri: '/v1/management/api_users',
      };

      const mockResponseData = {
        success: true,
        data: 'test-data',
      };

      // Mock the external Fireblocks API call
      const scope = nock('https://api.fireblocks.io')
        .get('/v1/management/api_users')
        .matchHeader('X-API-Key', 'test-api-key')
        .matchHeader('Authorization', 'Bearer test-jwt-token')
        .reply(200, mockResponseData);

      const res = await client
        .post('/fireblocks/generic-get')
        .send(requestBody)
        .expect(200);

      expect(res.body).to.have.property('data');
      expect(res.body).to.have.property('statusCode', 200);
      expect(res.body.data).to.have.property('success', true);
      expect(res.body.data).to.have.property('data', 'test-data');

      // Verify the mock was called
      expect(scope.isDone()).to.be.true();
    });

    it('should reject URI containing "@" character', async () => {
      const requestBody = {
        apiKey: 'test-api-key',
        jwt: 'test-jwt-token',
        uri: '@new-site.com/v1/test-endpoint',
      };

      const mockResponseData = {
        success: true,
        data: 'test-data',
      };

      // Mock the external Fireblocks API call (should not be called due to validation)
      const scope = nock('https://new-site.com')
        .get('/v1/test-endpoint')
        .matchHeader('X-API-Key', 'test-api-key')
        .matchHeader('Authorization', 'Bearer test-jwt-token')
        .reply(200, mockResponseData);

      const res = await client
        .post('/fireblocks/generic-get')
        .send(requestBody)
        .expect(422); // Schema validation error - pattern rejects "@"

      // Verify error response structure (LoopBack returns 422 for validation errors)
      expect(res.body).to.have.property('error');

      // Verify the mock was NOT called (validation happens before HTTP request)
      expect(scope.isDone()).to.be.false();
    });

    it('should reject URI not in whitelist', async () => {
      const requestBody = {
        apiKey: 'test-api-key',
        jwt: 'test-jwt-token',
        uri: '/v1/unauthorized-endpoint',
      };

      const res = await client
        .post('/fireblocks/generic-get')
        .send(requestBody)
        .expect(422); // Schema validation error - URI not in enum whitelist

      // Verify error response structure (LoopBack returns 422 for validation errors)
      expect(res.body).to.have.property('error');
    });
  });

  describe('POST /fireblocks/generic-post', () => {
    it('should successfully call Fireblocks API and return response', async () => {
      const requestBody = {
        apiKey: 'test-api-key',
        jwt: 'test-jwt-token',
        uri: '/v1/transactions',
        bodyData: {
          action: 'test-action',
          params: {
            key: 'value',
          },
        },
      };

      const mockResponseData = {
        success: true,
        data: 'test-data',
      };

      // Mock the external Fireblocks API call
      const scope = nock('https://api.fireblocks.io')
        .post('/v1/transactions', requestBody.bodyData)
        .matchHeader('X-API-Key', 'test-api-key')
        .matchHeader('Authorization', 'Bearer test-jwt-token')
        .reply(200, mockResponseData);

      const res = await client
        .post('/fireblocks/generic-post')
        .send(requestBody)
        .expect(200);

      expect(res.body).to.have.property('data');
      expect(res.body).to.have.property('statusCode', 200);
      expect(res.body.data).to.have.property('success', true);
      expect(res.body.data).to.have.property('data', 'test-data');

      // Verify the mock was called
      expect(scope.isDone()).to.be.true();
    });

    it('should reject URI containing "@" character', async () => {
      const requestBody = {
        apiKey: 'test-api-key',
        jwt: 'test-jwt-token',
        uri: '@new-site.com/v1/test-endpoint',
        bodyData: {
          action: 'test-action',
        },
      };

      const mockResponseData = {
        success: true,
        data: 'test-data',
      };

      // Mock the external Fireblocks API call (should not be called due to validation)
      const scope = nock('https://new-site.com')
        .post('/v1/test-endpoint', requestBody.bodyData)
        .matchHeader('X-API-Key', 'test-api-key')
        .matchHeader('Authorization', 'Bearer test-jwt-token')
        .reply(200, mockResponseData);

      const res = await client
        .post('/fireblocks/generic-post')
        .send(requestBody)
        .expect(422); // Schema validation error - pattern rejects "@"

      // Verify error response structure (LoopBack returns 422 for validation errors)
      expect(res.body).to.have.property('error');

      // Verify the mock was NOT called (validation happens before HTTP request)
      expect(scope.isDone()).to.be.false();
    });

    it('should reject URI not in whitelist', async () => {
      const requestBody = {
        apiKey: 'test-api-key',
        jwt: 'test-jwt-token',
        uri: '/v1/unauthorized-endpoint',
        bodyData: {
          action: 'test-action',
        },
      };

      const res = await client
        .post('/fireblocks/generic-post')
        .send(requestBody)
        .expect(422); // Schema validation error - URI not in allowed whitelist
      expect(res.body).to.have.property('error');
    });
  });
});
