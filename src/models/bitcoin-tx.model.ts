
import {Model, model, property} from '@loopback/repository';
import {getLogger, Logger} from 'log4js';
import {AddressUtilImplementation, AddressUtils} from '../utils/addressUtils';
import {Tx} from './tx.model';
import {Vin} from './vin.model';
import {Vout} from './vout.model';


@model({settings: {strict: false}})
export class BitcoinTx extends Model {
  private indexFederation: number = -1;
  private rskDestinationAddress: string;
  private btcRefundData: string;
  private logger: Logger;

  @property({
    type: 'string',
  })
  txId: string;

  @property({
    type: 'number',
  })
  version: number;

  @property({
    type: 'array',
    itemType: 'object',
  })
  vin: Vin[];

  @property({
    type: 'array',
    itemType: 'object',
  })
  vout: Vout[];

  @property({
    type: 'string',
  })
  blockhash?: string;

  @property({
    type: 'number',
  })
  blockheight?: number;

  @property({
    type: 'number',
  })
  confirmations: number;

  @property({
    type: 'number',
  })
  time: number;

  @property({
    type: 'number',
  })
  blocktime?: number;

  @property({
    type: 'string',
  })
  valueOut?: string;

  @property({
    type: 'string',
  })
  valueIn?: string;

  @property({
    type: 'string',
  })
  fees?: string;

  @property({
    type: 'string',
    required: true,
  })
  hex: string;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Tx>) {
    super(data);
    this.logger = getLogger('BitcoinTxModel');
  }

  public isSentToFederationAddress(federationAddress: string): boolean {
    for (let i = 0; this.vout && i < this.vout.length && this.indexFederation == -1; i++) {
      if (federationAddress == this.vout[i].scriptPubKey!.addresses[0]!) {
        this.indexFederation = i;
      }
    }
    return (this.indexFederation == -1);
  }

  public getTxSentAmount(): number {
    if (this.vout && this.vout.length > 0 && this.indexFederation) {
      return Number(this.vout[this.indexFederation]!.value!);
    } else {
      throw new Error('Can not access to output tx')
    }
  }

  public getTxSentAddress(): string {
    if (this.vout && this.vout.length > 0) {
      return this.vout[this.indexFederation].scriptPubKey!.addresses[0]!;
    } else {
      throw new Error('Can not access to output tx')
    }
  }

  public getTxRefundAddressAddress(): string {
    let returnValue = '';
    let foundOpReturn = false;
    if (this.vout && this.vout.length > 0) {
      if (this.vout.length == 2) { // Return change address (no OP_RETURN)
        return this.vout[Math.abs(this.indexFederation - 1)].scriptPubKey!.addresses[0]!;
      } else {
        for (let i = 0; this.vout && i < this.vout.length && !foundOpReturn; i++) {
          if (i != this.indexFederation) {
            const voutData = this.vout[i].scriptPubKey!.addresses[0]!;
            if (this.hasRefundOpReturn(voutData)) {
              this.parseOpReturn(voutData);
              let utility: AddressUtils = new AddressUtilImplementation();
              returnValue = utility.getRefundAddress(this.btcRefundData);
              foundOpReturn = true;
            } else {
              if (returnValue == '') {  // Return first change address
                returnValue = this.vin[0].addresses[0];  //TODO: Validate with Jose in case that is a pegin not created by the app
              }
            }
          }
        }
      }
    } else {
      throw new Error('Can not access to output tx')
    }
    return returnValue;
  }

  private hasRefundOpReturn(data: string): boolean {
    if (this.hasOpReturn(data)) { // Includes version 01 in the same if
      if (data.length == 102) { //Contain refund address
        return (true);
      }
    }
    return (false);
  }

  private hasOpReturn(data: string): boolean {
    if (data.includes('OP_RETURN 52534b5401')) { // Includes version 01 in the same if
      if (data.length == 102 || data.length == 60) { //Contain refund address
        this.logger.debug('Tx contanins OPT_RETURN value:  ', this.txId);
        return (true);
      } else {
        //TODO: log
        throw new Error('Can not parse OP_RETURN parameter. Invalid transaction');
      }
    }
    return (false);
  }

  private parseOpReturn(vout: string) {
    if (!this.rskDestinationAddress) { // If is parsed because has btcRefundData..no parse again
      this.rskDestinationAddress = vout.substring(20, 60);
      if (vout.length > 40) {
        this.btcRefundData = vout.substring(60, 102);
      }
    }
  }
}

export interface BitcoinTxRelations {
  // describe navigational properties here
}

export type BitcoinTxWithRelations = BitcoinTx & BitcoinTxRelations;
