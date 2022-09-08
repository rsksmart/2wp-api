import {inject} from '@loopback/core';
import {DefaultKeyValueRepository} from '@loopback/repository';
import {getLogger, Logger} from 'log4js';
import * as constants from '../constants';
import {RedisDataSource} from '../datasources';
import {AddressBalance, FeeAmountData, Session, TxInput, Utxo} from '../models';
import {BtcAddressUtils} from '../utils/btc-utils';

export class SessionRepository extends DefaultKeyValueRepository<Session> {

  logger: Logger;
  btcAddressUtils: BtcAddressUtils = new BtcAddressUtils();

  constructor(@inject('datasources.Redis') dataSource: RedisDataSource) {
    super(Session, dataSource);
    this.logger = getLogger('sessionRepository');
  }

  findAccountUtxos(sessionId: string, accountType: string): Promise<Utxo[]> {
    this.logger.trace(`[findAccountUtxos] sessionId:${sessionId} accountType:${accountType}`);
    return new Promise<Utxo[]>((resolve, reject) => {
      let finalUtxoList: Utxo[] = [];
      this.get(sessionId)
        .then(({addressList}) => {
          addressList?.forEach(({address, utxoList}) => {
            if (
              utxoList && this.btcAddressUtils.validateAddress(address).addressType === accountType
            )
              finalUtxoList = finalUtxoList.concat(
                utxoList.map(utxo => Object.assign({address}, utxo)),
              );
          });
          resolve(finalUtxoList);
        })
        .catch(reject);
    });
  }

  getAccountInputs(sessionId: string): Promise<TxInput[]> {
    this.logger.trace(`[getAccountInputs] sessionId:${sessionId}`);
    return new Promise<TxInput[]>((resolve, reject) => {
      this.get(sessionId)
        .then(({inputs}) => {
          if (inputs) resolve(inputs);
          else resolve([]);
        })
        .catch(reject);
    });
  }

  setInputs(
    sessionId: string,
    inputs: TxInput[],
    fees: FeeAmountData,
  ): Promise<void> {
    this.logger.trace(`[setInputs] sessionId:${sessionId}`);
    return this.get(sessionId).then(sessionObject => {
      sessionObject.inputs = inputs;
      sessionObject.fees = fees;
      return this.set(sessionId, sessionObject);
    });
  }

  addUxos(sessionId: string, addressBalances: AddressBalance[]): Promise<void> {
    this.logger.trace(`[addUxos] sessionId:${sessionId} utxos:${addressBalances.length}`);
    return new Promise<void>((resolve, reject) => {
      this.get(sessionId)
        .then((sessionObject) => {
          sessionObject.addressList = sessionObject.addressList ?
            [...sessionObject.addressList, ...addressBalances] : addressBalances;
          return this.set(sessionId, sessionObject)
        })
        .then(resolve)
        .catch(reject);
    })
  }

  getFeeLevel(sessionId: string, feeLevel: string): Promise<number> {
    this.logger.trace(`[getFeeLevel] sessionId:${sessionId} level:${feeLevel}`);
    return new Promise<number>((resolve, reject) => {
      this.get(sessionId)
        .then(({fees}) => {
          if (fees) {
            switch (feeLevel) {
              case constants.BITCOIN_FAST_FEE_LEVEL:
                resolve(fees.fast);
                break;
              case constants.BITCOIN_AVERAGE_FEE_LEVEL:
                resolve(fees.average);
                break;
              case constants.BITCOIN_SLOW_FEE_LEVEL:
                resolve(fees.slow);
                break;
              default:
                reject(new Error(`Wrong Fee Level: ${feeLevel}`));
            }
          } else {
            reject(
              new Error(
                `There is not fee amount stored for sessionId ${sessionId}`,
              ),
            );
          }
        })
        .catch(reason => {
          this.logger.warn(`[getFeeLevel] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }
}
