import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {config} from 'dotenv';
import {FeeAmountData, FeeRequestData, TxInput, Utxo} from '../models';
import {SessionRepository} from '../repositories';
import {FeeLevel} from '../services';
import SatoshiBig from '../utils/SatoshiBig';

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
      const inputSize = 32 + 5 + 106 + 4;
      const outputsSize = 3 * 34;
      const txBytes = outputsSize + 10 ;
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
            if (accountUtxoList.length === 0) reject(new Error('There are no utxos stored for this account type'));
            inputs = this.selectOptimalInputs(
              accountUtxoList,
              +feeRequestData.amount,
              +new SatoshiBig(fastAmount, 'btc').div(1000)
                .mul(new SatoshiBig(txBytes, 'satoshi')).toSatoshiString(),
              +new SatoshiBig(fastAmount, 'btc').div(1000)
                .mul(new SatoshiBig(inputSize, 'satoshi')).toSatoshiString(),
            );
            if (inputs.length === 0) reject(new Error('The required amount is not satisfied with the current utxo List'));
            const totalBytes: SatoshiBig = new SatoshiBig((inputs.length * +inputSize + txBytes).toString(), 'satoshi');
            fees.fast = Number(
              totalBytes
                .mul(new SatoshiBig(fastAmount, 'btc').div(1000))
                .toSatoshiString()
            );
            fees.average = Number(
              totalBytes
                .mul(new SatoshiBig(averageAmount, 'btc').div(1000))
                .toSatoshiString()
            );
            fees.slow = Number(
              totalBytes
                .mul(new SatoshiBig(lowAmount, 'btc').div(1000))
                .toSatoshiString()
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

  selectOptimalInputs(utxoList: Utxo[], amountToSendInSatoshis: number, baseFee: number, feePerInput: number): TxInput[] {
    const inputs: TxInput[] = [];
    let remainingSatoshisToBePaid = amountToSendInSatoshis + baseFee;
    utxoList.sort((a, b) => b.satoshis - a.satoshis);
    utxoList.forEach((utxo) => {
      if (remainingSatoshisToBePaid > 0) {
        inputs.push(
          new TxInput({
            address: utxo.address,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            address_n: [0],
            // eslint-disable-next-line @typescript-eslint/naming-convention
            prev_hash: utxo.txid,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            prev_index: utxo.vout,
            amount: +utxo.satoshis,
          }),
        );
        remainingSatoshisToBePaid = remainingSatoshisToBePaid + feePerInput - utxo.satoshis;
      }
    });
    return remainingSatoshisToBePaid <= 0 ? inputs : [];
  }
}
