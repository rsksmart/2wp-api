import {inject} from '@loopback/core';
import {DefaultKeyValueRepository} from '@loopback/repository';
import {RedisDataSource} from '../datasources';
import {AccountBalance, Session, Utxo} from '../models';

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
}
