import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import Big from 'big.js';
import {config} from 'dotenv';
import {getLogger, Logger} from 'log4js';
import * as constants from '../constants';
import {FeeAmountData, FeeRequestData, TxInput, Utxo} from '../models';
import {SessionRepository} from '../repositories';
import {FeeLevel} from '../services';
import SatoshiBig from '../utils/SatoshiBig';

config();

export class TxFeeController {
  logger: Logger;

  constructor(
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
    @inject('services.FeeLevel')
    protected feeLevelProviderService: FeeLevel,
  ) {
    this.logger = getLogger('tx-fee-controller');
  }

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
    this.logger.debug(`[getTxFee] started with session: ${feeRequestData.sessionId}`);
    return new Promise<FeeAmountData>((resolve, reject) => {
      const fast = process.env.FAST_MINING_BLOCK ?? 1;
      const average = process.env.AVERAGE_MINING_BLOCK ?? 6;
      const low = process.env.LOW_MINING_BLOCK ?? 12;
      let fees: FeeAmountData = new FeeAmountData({
        slow: 0,
        average: 0,
        fast: 0,
        wereInputsStored: false,
      });
      const txHeaderSize = 13;
      const inputSize = 32 + 4 + 71 + 34 + 4;
      /**
       * taken from: https://en.bitcoin.it/wiki/Transaction#General_format_of_a_Bitcoin_transaction_.28inside_a_block.29
       * Tx header: 10 (generic header) + inputs count (is a varint, it will be usually 1 byte, with 2 bytes we should be covered) + 1 byte (outputs count)
       * inputs: 32 (prev tx hash) + 4 (prev tx output index) + ~70 (signature, 71 to be sure) + 34 (public key) + 4 (sequence nbr)
       * outputs: 8 (value) + 24 (output script)
       */
      const outputsSize = 3 * (8 + 24);
      const txBytes = txHeaderSize + outputsSize;
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
            this.logger.trace(`[getTxFee] got fees: fast: ${fastAmount}. average: ${averageAmount}, low: ${lowAmount}`);
            const satoshiPerByte = {
              fast: new SatoshiBig(fastAmount, 'btc').div(1000),
              average: new SatoshiBig(averageAmount, 'btc').div(1000),
              slow: new SatoshiBig(lowAmount, 'btc').div(1000),
            };
            this.logger.trace(`[getTxFee] Fee per byte Sat/byte:  Fast - ${satoshiPerByte.fast}. Average - ${satoshiPerByte.average}. Slow - ${satoshiPerByte.slow}`);
            if (accountUtxoList.length === 0) reject(new Error('There are no utxos stored for this account type'));
            const {selectedInputs, enoughBalance} = this.selectOptimalInputs(
              accountUtxoList,
              +feeRequestData.amount,
              satoshiPerByte.fast.mul(new Big(txBytes)).toNumber(),
              satoshiPerByte.fast.mul(new Big(inputSize)).toNumber(),
            );
            if (selectedInputs.length === 0) reject(new Error('The required amount is not satisfied with the current utxo List'));
            const totalBytes: SatoshiBig = new SatoshiBig((selectedInputs.length * +inputSize + txBytes).toString(), 'satoshi');
            this.logger.trace(`[getTxFee] Total Bytes: ${totalBytes} (inputs: ${selectedInputs.length})`);
            fees.fast = totalBytes.mul(satoshiPerByte.fast).toNumber();
            fees.average = totalBytes.mul(satoshiPerByte.average).toNumber();
            fees.slow = totalBytes.mul(satoshiPerByte.slow).toNumber();
            fees = TxFeeController.checkFeeBoundaries(fees);
            fees.wereInputsStored = enoughBalance;
            this.logger.trace(`[getTxFee] Calculated fees for the peg-in. fast: ${fees.fast}. average: ${fees.average}. slow: ${fees.slow}`);
            this.logger.trace(`[getTxFee] ${enoughBalance ? '' : 'not'} enough balance to pay fees.`);
            return Promise.all([
              fees,
              enoughBalance ? this.sessionRepository.setInputs(
                feeRequestData.sessionId,
                selectedInputs,
                fees,
              ) : null,
            ]);
          },
        )
        .then(([feeObj]) => {
          this.logger.trace(`[getTxFee] Finished fee calculation!`);
          return resolve(feeObj);
        })
        .catch((reason) => {
          this.logger.warn(`[getTx] There was an error: ${reason}`);
          return reject(reason);
        });
    });
  }

  selectOptimalInputs(utxoList: Utxo[], amountToSendInSatoshis: number, baseFee: number, feePerInput: number): {selectedInputs: TxInput[]; enoughBalance: boolean} {
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
    return {
      selectedInputs: inputs,
      enoughBalance: remainingSatoshisToBePaid <= 0
    };
  }

  private static checkFeeBoundaries(fees: FeeAmountData) {
    const checkedFees: FeeAmountData = new FeeAmountData({
      slow: 0,
      average: 0,
      fast: 0,
      wereInputsStored: false,
    });
    checkedFees.slow = Math.min(Math.max(fees.slow, constants.BITCOIN_MIN_SATOSHI_FEE), constants.BITCOIN_MAX_SATOSHI_FEE);
    checkedFees.average = Math.min(Math.max(fees.average, constants.BITCOIN_MIN_SATOSHI_FEE), constants.BITCOIN_MAX_SATOSHI_FEE);
    checkedFees.fast = Math.min(Math.max(fees.fast, constants.BITCOIN_MIN_SATOSHI_FEE), constants.BITCOIN_MAX_SATOSHI_FEE);
    return checkedFees;
  }
}
