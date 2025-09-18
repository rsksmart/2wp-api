import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import { BasePath, Fireblocks, FireblocksResponse, GetAPIUsersResponse } from '@fireblocks/ts-sdk';
import {getLogger, Logger} from 'log4js';
import * as https from 'https';
import {FireblocksVaultsRequest, FireblocksVaultsResponse, FireblocksConsoleUsersResponse, FireblocksConsoleUser, FireblocksGenericRequest, FireblocksGenericResponse} from '../models';

export class FireblocksController {
  logger: Logger;

  constructor() {
    this.logger = getLogger('fireblocks-controller');
  }

  @post('/fireblocks/vaults', {
    responses: {
      '200': {
        description: 'Fireblocks Vaults Response',
        content: {
          'application/json': {
            schema: getModelSchemaRef(FireblocksVaultsResponse),
          },
        },
      },
    },
  })
  getVaults(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(FireblocksVaultsRequest)}},
    })
    req: FireblocksVaultsRequest,
  ): Promise<FireblocksVaultsResponse> {
    this.logger.debug('[getVaults] started');
    
    return new Promise<FireblocksVaultsResponse>((resolve, reject) => {
      try {
        this.logger.trace(`[getVaults] Processing request with apikey: ${req.apiKey.substring(0, 8)}...`);

        console.log(req);

        const secretKey = Buffer.from(req.cert, 'base64').toString('utf-8');

        const fireblocks = new Fireblocks({
            apiKey: req.apiKey,
            basePath: BasePath.US,
            secretKey,
        });
        this.logger.trace(`[getVaults] asking for the vaults`);
        this.logger.trace(`[getVaults] fireblocks: ${JSON.stringify(fireblocks)}`);
        console.log(fireblocks);
        fireblocks.vaults.getPagedVaultAccounts({
            limit: 100,
        })
        .then((vaultAccounts) => {
          this.logger.trace(`[getVaults] Successfully processed request`);
          this.logger.trace(`[getVaults] vaultAccounts: ${JSON.stringify(vaultAccounts)}`);
          const response = new FireblocksVaultsResponse({
            vaults: vaultAccounts.data.accounts,
          });
          resolve(response);
        })
        .catch((error) => {
          this.logger.warn(`[getVaults] Something went wrong. error: ${error}`);
          reject(error);
        });
      } catch (error) {
        this.logger.warn(`[getVaults] Something went wrong. error: ${error}`);
        const errorResponse = new FireblocksVaultsResponse({
          vaults: {},
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        reject(errorResponse);
      }
    });
  }

  @post('/fireblocks/transaction', {
    responses: {
      '200': {
        description: 'Fireblocks Transaction Response',
        content: {
          'application/json': {
            schema: {type: 'object'},
          },
        },
      },
    },
  })
  async createTransaction(
    @requestBody({
      content: {'application/json': {
        schema: {
          type: 'object',
          properties: {
            apiKey: {type: 'string'},
            cert: {type: 'string'},
            payload: {
              type: 'object',
              properties: {
                assetId: {type: 'string'},
                amount: {type: 'string'},
                source: {
                  type: 'object',
                  properties: {
                    type: {type: 'string'},
                    id: {type: 'string'},
                  },
                  required: ['type', 'id'],
                },
                destination: {
                  type: 'object',
                  properties: {
                    type: {type: 'string'},
                    subType: {type: 'string'},
                    name: {type: 'string'},
                    oneTimeAddress: {
                      type: 'object',
                      properties: {
                        address: {type: 'string'},
                        tag: {type: 'string'},
                      },
                      required: ['address', 'tag'],
                    },
                  },
                  required: ['type', 'subType', 'name', 'oneTimeAddress'],
                },
                note: {type: 'string'},
              },
              required: ['assetId', 'amount', 'source', 'destination', 'note'],
            },
          },
          required: ['apiKey', 'cert', 'payload'],
        },
      }},
    })
    req: { apiKey: string; cert: string; payload: any },
  ): Promise<object> {
    this.logger.debug('[createTransaction] started');
    try {
      const secretKey = Buffer.from(req.cert, 'base64').toString('utf-8');
      const fireblocks = new Fireblocks({
        apiKey: req.apiKey,
        basePath: BasePath.US,
        secretKey,
      });
      this.logger.trace(`[createTransaction] Payload: ${JSON.stringify(req.payload)}`);
      const tx = await fireblocks.transactions.createTransaction({ transactionRequest: req.payload });
      this.logger.trace(`[createTransaction] Transaction: ${JSON.stringify(tx.data)}`);
      return tx.data;
    } catch (error) {
      this.logger.warn(`[createTransaction] Something went wrong. error: ${error.message}`);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @post('/fireblocks/api-users', {
    responses: {
      '200': {
        description: 'Fireblocks api Users Response',
        content: {
          'application/json': {
            schema: getModelSchemaRef(FireblocksConsoleUsersResponse),
          },
        },
      },
    },
  })
  getApiUsers(
    @requestBody({
      content: {'application/json': {
        schema: {
          type: 'object',
          properties: {
            apiKey: {type: 'string'},
            cert: {type: 'string'},
          },
          required: ['apiKey', 'cert'],
        },
      }},
    })
    req: { apiKey: string; cert: string },
  ): Promise<FireblocksConsoleUsersResponse> {
    this.logger.debug('[getApiUsers] started');
    
    return new Promise<FireblocksConsoleUsersResponse>((resolve, reject) => {
      try {
        const secretKey = Buffer.from(req.cert, 'base64').toString('utf-8');
        const fireblocks = new Fireblocks({
            apiKey: req.apiKey,
            basePath: BasePath.US,
            secretKey,
        });
        this.logger.trace(`[getApiUsers] asking for api users`);
        fireblocks.apiUser.getApiUsers()
        .then((usersResponse: FireblocksResponse<GetAPIUsersResponse>) => {
          const response = new FireblocksConsoleUsersResponse({
            users: usersResponse.data.users.map((user) => new FireblocksConsoleUser(user)),
          });
          resolve(response);
        })
        .catch((error: Error) => {
          this.logger.warn(`[getApiUsers] Something went wrong. error: ${error}`);
          reject(error);
        });
      } catch (error) {
        this.logger.warn(`[getApiUsers] Something went wrong. error: ${error}`);
        const errorResponse = new FireblocksConsoleUsersResponse({
          users: [],
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        reject(errorResponse);
      }
    });
  }

  @post('/fireblocks/generic-post', {
    responses: {
      '200': {
        description: 'Fireblocks Generic POST Response',
        content: {
          'application/json': {
            schema: getModelSchemaRef(FireblocksGenericResponse),
          },
        },
      },
    },
  })
  async genericPost(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(FireblocksGenericRequest)}},
    })
    req: FireblocksGenericRequest,
  ): Promise<FireblocksGenericResponse> {
    this.logger.debug('[genericPost] started');
    
    return new Promise<FireblocksGenericResponse>((resolve, reject) => {
      try {
        this.logger.trace(`[genericPost] Processing request with apikey: ${req.apiKey.substring(0, 8)}...`);
        this.logger.trace(`[genericPost] URI: ${req.uri}`);
        this.logger.trace(`[genericPost] Body data: ${JSON.stringify(req.bodyData)}`);

        const baseUrl = 'https://api.fireblocks.io';
        const fullUrl = `${baseUrl}${req.uri}`;
        const url = new URL(fullUrl);

        const headers = {
          'X-API-Key': req.apiKey,
          'Authorization': `Bearer ${req.jwt}`,
          'Content-Type': 'application/json',
        };

        const postData = req.bodyData ? JSON.stringify(req.bodyData) : '';

        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(postData),
          },
        };

        const httpsRequest = https.request(options, (response: any) => {
          let data = '';
          response.on('data', (chunk: any) => {
            data += chunk;
          });
          response.on('end', () => {
            try {
              const responseData = JSON.parse(data);
              this.logger.trace(`[genericPost] Response status: ${response.statusCode}`);
              this.logger.trace(`[genericPost] Response data: ${JSON.stringify(responseData)}`);
              
              const fireblocksResponse = new FireblocksGenericResponse({
                data: responseData,
                statusCode: response.statusCode,
              });
              resolve(fireblocksResponse);
            } catch (parseError) {
              this.logger.warn(`[genericPost] Failed to parse response. error: ${parseError}`);
              const errorResponse = new FireblocksGenericResponse({
                error: 'Failed to parse response',
                statusCode: response.statusCode || 500,
              });
              reject(errorResponse);
            }
          });
        });

        httpsRequest.on('error', (error: any) => {
          this.logger.warn(`[genericPost] Request failed. error: ${error}`);
          const errorResponse = new FireblocksGenericResponse({
            error: error instanceof Error ? error.message : 'Unknown error',
            statusCode: 500,
          });
          reject(errorResponse);
        });

        httpsRequest.write(postData);
        httpsRequest.end();
      } catch (error) {
        this.logger.warn(`[genericPost] Something went wrong. error: ${error}`);
        const errorResponse = new FireblocksGenericResponse({
          error: error instanceof Error ? error.message : 'Unknown error',
          statusCode: 500,
        });
        reject(errorResponse);
      }
    });
  }

  @post('/fireblocks/generic-get', {
    responses: {
      '200': {
        description: 'Fireblocks Generic GET Response',
        content: {
          'application/json': {
            schema: getModelSchemaRef(FireblocksGenericResponse),
          },
        },
      },
    },
  })
  async genericGet(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(FireblocksGenericRequest)}},
    })
    req: FireblocksGenericRequest,
  ): Promise<FireblocksGenericResponse> {
    this.logger.debug('[genericGet] started');
    
    return new Promise<FireblocksGenericResponse>((resolve, reject) => {
      try {
        this.logger.trace(`[genericGet] Processing request with apikey: ${req.apiKey.substring(0, 8)}...`);
        this.logger.trace(`[genericGet] URI: ${req.uri}`);

        const baseUrl = 'https://api.fireblocks.io';
        const fullUrl = `${baseUrl}${req.uri}`;
        const url = new URL(fullUrl);

        const headers = {
          'X-API-Key': req.apiKey,
          'Authorization': `Bearer ${req.jwt}`,
          'Content-Type': 'application/json',
        };

        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'GET',
          headers,
        };

        const httpsRequest = https.request(options, (response: any) => {
          let data = '';
          response.on('data', (chunk: any) => {
            data += chunk;
          });
          response.on('end', () => {
            try {
              const responseData = JSON.parse(data);
              this.logger.trace(`[genericGet] Response status: ${response.statusCode}`);
              this.logger.trace(`[genericGet] Response data: ${JSON.stringify(responseData)}`);
              
              const fireblocksResponse = new FireblocksGenericResponse({
                data: responseData,
                statusCode: response.statusCode,
              });
              resolve(fireblocksResponse);
            } catch (parseError) {
              this.logger.warn(`[genericGet] Failed to parse response. error: ${parseError}`);
              const errorResponse = new FireblocksGenericResponse({
                error: 'Failed to parse response',
                statusCode: response.statusCode || 500,
              });
              reject(errorResponse);
            }
          });
        });

        httpsRequest.on('error', (error: any) => {
          this.logger.warn(`[genericGet] Request failed. error: ${error}`);
          const errorResponse = new FireblocksGenericResponse({
            error: error instanceof Error ? error.message : 'Unknown error',
            statusCode: 500,
          });
          reject(errorResponse);
        });

        httpsRequest.end();
      } catch (error) {
        this.logger.warn(`[genericGet] Something went wrong. error: ${error}`);
        const errorResponse = new FireblocksGenericResponse({
          error: error instanceof Error ? error.message : 'Unknown error',
          statusCode: 500,
        });
        reject(errorResponse);
      }
    });
  }
}
