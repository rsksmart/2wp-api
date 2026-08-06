import {
  param,
  get,
  getModelSchemaRef,
  response,
} from '@loopback/rest';
import {inject} from '@loopback/core';
import {FeeAmount} from '../models';
import {FeeLevel} from '../services';

export class EstimateFeeController {
  constructor(
    @inject('services.FeeLevel')
    protected feeLevelProviderService: FeeLevel,
  ) {}

  /**
   * `GET /estimate-fee/{block}` — estimated fee rate (BTC/byte) for a
   * transaction targeting confirmation within `block` blocks.
   *
   * @param block - Number of blocks the transaction should be confirmed within.
   * @returns The estimated fee amount for that confirmation target.
   */
  @get('/estimate-fee/{block}')
  @response(200, {
    description: 'Estimated fee (Btc/byte) of a transaction wanted to be mined in the specified number of blocks',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FeeAmount),
      },
    },
  })
  async estimateFee(
    @param.path.number('block') block: number,
  ): Promise<FeeAmount> {
    return this.feeLevelProviderService.feeProvider(block)
      .then(([amount]) => new FeeAmount({ amount }))
  }

}
