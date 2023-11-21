import {
  param,
  get,
  getModelSchemaRef,
  response,
} from '@loopback/rest';
import {FeeAmount} from '../models';
import {inject} from '@loopback/core';
import {FeeLevel} from '../services';

export class EstimateFeeController {
  constructor(
    @inject('services.FeeLevel')
    protected feeLevelProviderService: FeeLevel,
  ) {}

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
