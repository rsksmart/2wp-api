import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import { BasePath, Fireblocks } from '@fireblocks/ts-sdk';
import {getLogger, Logger} from 'log4js';
import {FireblocksVaultsRequest, FireblocksVaultsResponse} from '../models';

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
}
