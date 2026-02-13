import {inject} from '@loopback/core';
import {
  Response,
  RestBindings,
  getModelSchemaRef,
  post,
  get,
  requestBody,
  param,
} from '@loopback/rest';
import {Logger, getLogger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {TxHistory} from '../models/tx-history.model';
import {TxHistoryService} from '../services/tx-history.service';
import {BitcoinService, RskNodeService} from '../services';

export class TxHistoryController {
  logger: Logger;
  private readonly rskNodeService: RskNodeService;
  private readonly bitcoinService: BitcoinService;

  constructor(
    @inject(ServicesBindings.BITCOIN_SERVICE)
    bitcoinService: BitcoinService,
    @inject(ServicesBindings.RSK_NODE_SERVICE)
    rskNodeService: RskNodeService,
    @inject(ServicesBindings.TX_HISTORY_SERVICE)
    protected txHistoryService: TxHistoryService,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
  ) {
    this.logger = getLogger('tx-history-controller');
    this.bitcoinService = bitcoinService;
    this.rskNodeService = rskNodeService;
  }

  @post('/tx-history', {
    responses: {
      '200': {
        description: 'Store transaction made through bridge dapp',
      },
    },
  })
  async storeTransaction(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(TxHistory),
        },
      },
    })
    txHistory: TxHistory,
  ): Promise<Response> {
    try {
      const transactionExists = await this.verifyTransactionExists(txHistory);
      if (!transactionExists) {
        return this.response.status(200).send();
      }

      const result = await this.txHistoryService.storeTransaction(txHistory);
      if (result) {
        return this.response.status(200).send();
      }
      this.logger.error(
        `[storeTransaction] Failed to store transaction: ${txHistory.providerHash}`,
      );
      return this.response.status(500).send({
        error: 'Failed to store transaction',
      });
    } catch (error) {
      this.logger.error(`[storeTransaction] Error storing transaction:`, error.message);
      return this.response.status(500).send();
    }
  }

  private async verifyTransactionExists(txHistory: TxHistory): Promise<boolean> {
    const sourceNetwork = txHistory.fromNetworkName?.trim().toLowerCase();

    try {
      if (sourceNetwork === 'bitcoin') {
        await this.bitcoinService.getTx(txHistory.txHash);
      } else if (sourceNetwork === 'rootstock') {
        await this.rskNodeService.getTransaction(txHistory.txHash);
      }

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[verifyTransactionExists] Transaction not found for ${txHistory.fromNetworkName}: ${txHistory.txHash} ${errorMessage}`,
      );
      return false;
    }
  }

  @get('/tx-history', {
    parameters: [
      {
        name: 'address',
        in: 'query',
        required: true,
        schema: {
          type: 'string',
          pattern: '^(0x[a-fA-F0-9]{40}|[13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{38,59}|(bc1p|tb1p)[0-9a-z]{39,59})$',
        },
        description: 'Must be a valid RSK or BTC address',
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: {
          type: 'number',
          minimum: 1,
          default: 1,
        },
        description: 'Page number (must be greater than 0)',
      },
    ],
    responses: {
      '200': {
        description: 'Paginated transaction history for an address',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: getModelSchemaRef(TxHistory, {includeRelations: true}),
                },
                total: {
                  type: 'number',
                  description: 'Total number of transactions for this address',
                },
                page: {
                  type: 'number',
                  description: 'Current page number',
                },
                totalPages: {
                  type: 'number',
                  description: 'Total number of pages',
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid address or page parameter',
      },
    },
  })
  async getTransactionHistory(
    @param.query.string('address', {
      required: true,
      schema: {
        type: 'string',
        pattern: '^(0x[a-fA-F0-9]{40}|[13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{38,59}|(bc1p|tb1p)[0-9a-z]{39,59})$',
      },
    }) address: string,
    @param.query.number('page', {
      schema: {
        type: 'number',
        minimum: 1,
      },
    }) page: number = 1,
  ): Promise<Response> {
    try {
      if (!address) {
        return this.response.status(400).send({
          error: 'Address parameter is required',
        });
      }
      if (page < 1) {
        return this.response.status(400).send({
          error: 'Page parameter must be greater than 0',
        });
      }
      const result = await this.txHistoryService.getTransactionHistoryByAddress(address, page);
      return this.response.status(200).send(result);
    } catch (error) {
      this.logger.error(
        '[getTransactionHistory] Error retrieving transaction history:',
        error.message,
      );
      return this.response.status(500).send();
    }
  }

  @get('/tx-history/{txHash}', {
    parameters: [
      {
        name: 'txHash',
        in: 'path',
        required: true,
        schema: {
          type: 'string',
          pattern: '^[a-fA-F0-9]{64}$|^0x[a-fA-F0-9]{64}$',
        },
        description: 'Must be a valid transaction hash',
      },
    ],
    responses: {
      '200': {
        description: 'Transaction details',
        content: {
          'application/json': {
            schema: getModelSchemaRef(TxHistory, {includeRelations: true}),
          },
        },
      },
      '400': {
        description: 'Invalid transaction hash format',
      },
      '404': {
        description: 'Transaction not found',
      },
    },
  })
  async getTransactionByHash(
    @param.path.string('txHash', {
      schema: {
        type: 'string',
        pattern: '^[a-fA-F0-9]{64}$|^0x[a-fA-F0-9]{64}$',
      },
    }) txHash: string,
  ): Promise<Response> {
    try {
      const transaction = await this.txHistoryService.getTransactionByHash(txHash);
      if (!transaction) {
        return this.response.status(404).send({
          error: 'Transaction not found',
        });
      }
      return this.response.status(200).send(transaction);
    } catch (error) {
      this.logger.error(
        '[getTransactionByHash] Error retrieving transaction:',
        error.message,
      );
      return this.response.status(500).send();
    }
  }
}
