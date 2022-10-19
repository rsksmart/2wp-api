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

  constructor(data?: Partial<AccountBalance>) {
    super(data);
  }

  public calculateWalletBalance(addressBalances: AddressBalance[]): void {
    addressBalances.forEach((addressBalance) => {
      const utxoSatoshis = addressBalance.utxoList?.map((utxo) => utxo.satoshis);
      if (utxoSatoshis && utxoSatoshis.length > 0) {
        const addressAmount: number = utxoSatoshis.reduce(
          (accumulator, satoshis) => satoshis + accumulator,
        );
        switch (addressBalance.addressType) {
          case constants.BITCOIN_LEGACY_ADDRESS:
            this.legacy += addressAmount;
            break;
          case constants.BITCOIN_SEGWIT_ADDRESS:
            this.segwit += addressAmount;
            break;
          case constants.BITCOIN_NATIVE_SEGWIT_ADDRESS:
            this.nativeSegwit += addressAmount;
            break;
        }
      }
    });
  }
}

export type AccountBalanceWithRelations = AccountBalance;
