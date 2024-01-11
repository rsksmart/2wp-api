import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {AddressService, TxV2Service} from '..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {BitcoinAddress} from '../../models/bitcoin-address.model';
import {BitcoinTx} from '../../models/bitcoin-tx.model';
import {LastBlockService} from '../btc-last-block.service';
import {LastBlockInfo} from '../../models/btc-last-block.model';

export class BitcoinService {
  logger: Logger;
  addressService: AddressService;
  lastBlockService: LastBlockService

  constructor(
    @inject('services.TxV2Service')
    protected txV2Service: TxV2Service,
    @inject(ServicesBindings.ADDRESS_SERVICE)
    addressService: AddressService,
    @inject(ServicesBindings.BTC_LAST_BLOCK_SERVICE)
    lastBlockService: LastBlockService,
  ) {
    this.logger = getLogger('bitcoin-service');
    this.addressService = addressService;
    this.lastBlockService = lastBlockService;
  }

  getTx(txId: string): Promise<BitcoinTx> {
    return new Promise<BitcoinTx>((resolve, reject) => {
      this.txV2Service
        .txV2Provider(txId)
        .then((tx: any) => {
          const responseTx = new BitcoinTx();
          responseTx.txid = tx[0].txid;
          responseTx.version = tx[0].version;
          responseTx.vin = tx[0].vin;
          responseTx.vout = tx[0].vout;
          responseTx.blockhash = tx[0].blockHash;
          responseTx.blockheight = tx[0].blockHeight;
          responseTx.confirmations = tx[0].confirmations;
          responseTx.time = tx[0].time;
          responseTx.blocktime = tx[0].blockTime;
          responseTx.valueOut = tx[0].valueOut;
          responseTx.valueIn = tx[0].valueIn;
          responseTx.fees = tx[0].fees;
          responseTx.hex = tx[0].hex;
          resolve(responseTx);
        })
        .catch(reason => {
          this.logger.warn(`[getTx] Got an error: ${reason}`);
          reject(`Error getting tx ${txId}`);
        });
    });
  }

  getAddressInfo(address: string): Promise<BitcoinAddress> {
    return new Promise<BitcoinAddress>((resolve, reject) => {
      this.addressService.addressProvider(address)
        .then((tx: any) => {
          const responseAddress = new BitcoinAddress();
          responseAddress.address = tx[0].address;
          responseAddress.balance = tx[0].balance;
          responseAddress.page = tx[0].page;
          responseAddress.totalPages = tx[0].totalPages;
          responseAddress.itemsOnPage = tx[0].itemsOnPage;
          responseAddress.totalReceived = tx[0].totalReceived;
          responseAddress.totalSent = tx[0].totalSent;
          responseAddress.unconfirmedBalance = tx[0].unconfirmedBalance;
          responseAddress.unconfirmedTxs = tx[0].unconfirmedTxs;
          responseAddress.txs = tx[0].txs;
          if (responseAddress.txs > 0) {
            responseAddress.txids = tx[0].txids;
          }
          resolve(responseAddress);
        })
        .catch(() => {
          reject(`Error getting address ${address}`);
        });
    });
  }

  getLastBlock(): Promise<LastBlockInfo> {
    return new Promise<LastBlockInfo>((resolve, reject) => {
      this.lastBlockService.lastBlockProvider()
        .then((lbir: any) => {
          const lastBlockInfo = new LastBlockInfo();
          lastBlockInfo.bestBlockHash = lbir[0].backend.bestBlockHash;
          lastBlockInfo.bestHeight = lbir[0].blockbook.bestHeight;
          lastBlockInfo.blocks = lbir[0].backend.blocks;
          lastBlockInfo.chain = lbir[0].backend.chain;
          lastBlockInfo.coin = lbir[0].blockbook.coin;
          lastBlockInfo.inSync = lbir[0].blockbook.inSync;
          lastBlockInfo.syncMode = lbir[0].blockbook.syncMode;
          resolve(lastBlockInfo);
        })
        .catch((e) => {
          reject(`Error getting last block ${e}`);
        });
    });
  }

}
