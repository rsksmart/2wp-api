import {Model, model, property} from '@loopback/repository';
import {AddressBalance} from './address-balance.model';
import * as constants from '../constants';

@model({settings: {strict: false}})
export class AccountBalance extends Model {
  @property({
    type: 'number',
    required: true,
  })
  legacy: number;

  @property({
    type: 'number',
    required: true,
  })
  segwit: number;

  @property({
    type: 'number',
    required: true,
  })
  nativeSegwit: number;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<AccountBalance>) {
    super(data);
  }

  public calculateWalletBalance(addressBalances: AddressBalance[]): void {
    const [legacyTestReg, segwitTestReg, nativeTestReg] = [
      /^[mn][1-9A-HJ-NP-Za-km-z]{26,35}/,
      /^[2][1-9A-HJ-NP-Za-km-z]{26,35}/,
      /^[tb][0-9A-HJ-NP-Za-z]{26,41}/,
    ];
    addressBalances.forEach(addressBalance => {
      const utxoSatoshis = addressBalance.utxoList?.map(utxo => utxo.satoshis);
      if (utxoSatoshis && utxoSatoshis.length > 0) {
        const addressAmount: number = utxoSatoshis.reduce(
          (accumulator, satoshis) => satoshis + accumulator,
        );
        if (legacyTestReg.test(addressBalance.address))
          this.legacy += addressAmount;
        else if (segwitTestReg.test(addressBalance.address))
          this.segwit += addressAmount;
        else if (nativeTestReg.test(addressBalance.address))
          this.nativeSegwit += addressAmount;
      }
    });
  }

  static getAccountType(address: string): string {
    const [legacyTestReg, segwitTestReg, nativeTestReg] = [
      new RegExp(
        process.env.LEGACY_REGEX ?? /^[mn][1-9A-HJ-NP-Za-km-z]{26,35}/,
      ),
      new RegExp(process.env.SEGWIT_REGEX ?? /^[2][1-9A-HJ-NP-Za-km-z]{26,35}/),
      new RegExp(
        process.env.NATIVE_SEGWIT_REGEX ?? /^[tb][0-9A-HJ-NP-Za-z]{26,41}/,
      ),
    ];
    if (legacyTestReg.test(address)) return constants.BITCOIN_LEGACY_ADDRESS;
    else if (segwitTestReg.test(address))
      return constants.BITCOIN_SEGWIT_ADDRESS;
    else if (nativeTestReg.test(address))
      return constants.BITCOIN_NATIVE_SEGWIT_ADDRESS;
    else return constants.BITCOIN_MULTISIGNATURE_ADDRESS;
  }
}

export interface AccountBalanceRelations {
  // describe navigational properties here
}

export type AccountBalanceWithRelations = AccountBalance &
  AccountBalanceRelations;
