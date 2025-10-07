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

export class TxHistoryController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.TX_HISTORY_SERVICE)
    protected txHistoryService: TxHistoryService,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
  ) {
    this.logger = getLogger('tx-history-controller');
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

  @get('/tx-history', {
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
    },
  })
  async getTransactionHistory(
    @param.query.string('address', {required: true}) address: string,
    @param.query.number('page') page: number = 1,
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
}
