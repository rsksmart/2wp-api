import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {config} from 'dotenv';
import {FeeAmountData, FeeRequestData, TxInput, Utxo} from '../models';
import {SessionRepository} from '../repositories';
import {FeeLevel} from '../services';

config();

export class TxFeeController {
  constructor(
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
    @inject('services.FeeLevel')
    protected feeLevelProviderService: FeeLevel,
  ) {}

  @post('/tx-fee')
  @response(200, {
    description: 'FeeRequestData model instance',
    content: {'application/json': {schema: getModelSchemaRef(FeeRequestData)}},
  })
  async getTxFee(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(FeeRequestData, {
            title: 'FeeRequestData',
          }),
        },
      },
    })
    feeRequestData: FeeRequestData,
  ): Promise<FeeAmountData> {
    return new Promise<FeeAmountData>((resolve, reject) => {
      const fast = process.env.FAST_MINING_BLOCK ?? 1;
      const average = process.env.AVERAGE_MINING_BLOCK ?? 6;
      const low = process.env.LOW_MINING_BLOCK ?? 12;
      let inputs: TxInput[] = [];
      const fees: FeeAmountData = new FeeAmountData({
        slow: 0,
        average: 0,
        fast: 0,
      });
      const inputSize = process.env.INPUT_SIZE ?? 180;
      const txBytes = 3 * 34 + 10 + 46;
      Promise.all([
        this.sessionRepository.findAccountUtxos(
          feeRequestData.sessionId,
          feeRequestData.accountType,
        ),
        this.feeLevelProviderService.feeProvider(+fast),
        this.feeLevelProviderService.feeProvider(+average),
        this.feeLevelProviderService.feeProvider(+low),
      ])
        .then(
          ([accountUtxoList, [fastAmount], [averageAmount], [lowAmount]]) => {
            inputs = this.selectOptimalInputs(
              accountUtxoList,
              (+fastAmount / 1000) * txBytes + feeRequestData.amount,
            );
            fees.fast = Number(
              (
                (inputs.length * +inputSize + txBytes) *
                ((+fastAmount / 1000) * 1e8)
              ).toFixed(0),
            );
            fees.average = Number(
              (
                (inputs.length * +inputSize + txBytes) *
                ((+averageAmount / 1000) * 1e8)
              ).toFixed(0),
            );
            fees.slow = Number(
              (
                (inputs.length * +inputSize + txBytes) *
                ((+lowAmount / 1000) * 1e8)
              ).toFixed(0),
            );
            return Promise.all([
              fees,
              this.sessionRepository.setInputs(
                feeRequestData.sessionId,
                inputs,
                fees,
              ),
            ]);
          },
        )
        .then(([feeObj]) => resolve(feeObj))
        .catch(reject);
    });
  }

  selectOptimalInputs(utxoList: Utxo[], amountInSatoshis: number): TxInput[] {
    const inputs: TxInput[] = [];
    let remainingSatoshis = amountInSatoshis;
    utxoList.sort((a, b) => b.satoshis - a.satoshis);
    utxoList.forEach(utxo => {
      if (remainingSatoshis > 0) {
        inputs.push(
          new TxInput({
            address: utxo.address,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            address_n: [0],
            // eslint-disable-next-line @typescript-eslint/naming-convention
            prev_hash: utxo.txid,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            prev_index: utxo.vout,
            amount: (+utxo.amount * 1e8).toFixed(0),
          }),
        );
        remainingSatoshis -= utxo.satoshis;
      }
    });
    return inputs;
  }
}
