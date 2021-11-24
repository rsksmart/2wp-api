import {inject} from '@loopback/core';
import {DefaultKeyValueRepository} from '@loopback/repository';
import {RedisDataSource} from '../datasources';
import {AccountBalance, AddressBalance, FeeAmountData, Session, TxInput, Utxo} from '../models';
import * as constants from '../constants';

export class SessionRepository extends DefaultKeyValueRepository<Session> {
  constructor(@inject('datasources.Redis') dataSource: RedisDataSource) {
    super(Session, dataSource);
  }

  findAccountUtxos(sessionId: string, accountType: string): Promise<Utxo[]> {
    return new Promise<Utxo[]>((resolve, reject) => {
      let finalUtxoList: Utxo[] = [];
      this.get(sessionId)
        .then(({addressList}) => {
          addressList?.forEach(({address, utxoList}) => {
            if (
              utxoList &&
              AccountBalance.getAccountType(address) === accountType
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
    return this.get(sessionId).then(sessionObject => {
      sessionObject.inputs = inputs;
      sessionObject.fees = fees;
      return this.set(sessionId, sessionObject);
    });
  }

  addUxos(sessionId: string, addressBalances: AddressBalance[]): Promise<void> {
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
        .catch(reject);
    });
  }
}
