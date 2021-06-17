import {Model, model, property} from '@loopback/repository';
import {Tx} from './tx.model';
import {Vout} from './vout.model';


@model({settings: {strict: false}})
export class BitcoinTx extends Model {
  private indexFederation: number = -1;

  @property({
    type: 'string',
  })
  txId?: string;

  @property({
    type: 'number',
  })
  version?: number;

  @property({
    type: 'array',
    itemType: 'object',
  })
  vin?: Object[];

  @property({
    type: 'array',
    itemType: 'object',
  })
  vout?: Vout[];

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
  confirmations?: number;

  @property({
    type: 'number',
  })
  time?: number;

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
    let returnValue;
    if (this.vout && this.vout.length > 0) {

      if (this.vout.length == 2) {
        return this.vout[Math.abs(this.indexFederation - 1)].scriptPubKey!.addresses[0]!;
      } else {
        for (let i = 0; this.vout && i < this.vout.length && this.indexFederation == -1; i++) {
          if (i != this.indexFederation) {
            if (this.hasOpReturn(i) && !returnValue) {
              returnValue = this.vout[i].scriptPubKey!.addresses[0]!;
            } else {
              returnValue = this.vout[i].scriptPubKey!.addresses[0]!;
            }
          }
        }
      }
    } else {
      throw new Error('Can not access to output tx')
    }
    return returnValue;
  }

  private hasOpReturn(index: number): boolean {
    if (this.vout && this.vout.length > 0) {
      if ((this.vout[index].scriptPubKey!.addresses[0]!).includes('OP_RETURN')) {
        return (true);
      }
      return (false);
    } else {
      throw new Error('Can not access to output tx')
    }
  }
}

export interface BitcoinTxRelations {
  // describe navigational properties here
}

export type BitcoinTxWithRelations = BitcoinTx & BitcoinTxRelations;
