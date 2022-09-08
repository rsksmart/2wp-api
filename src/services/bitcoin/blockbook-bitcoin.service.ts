import { inject } from "@loopback/core";
import { getLogger, Logger } from "log4js";
import { ServicesBindings } from "../../dependency-injection-bindings";
import { Tx, Utxo } from "../../models";
import { BitcoinAddress } from "../../models/bitcoin-address.model";
import { BitcoinTx } from "../../models/bitcoin-tx.model";
import { calculateBtcTxHash } from "../../utils/btc-utils";
import { AddressService } from "../address.service";
import { Broadcast, TxStatus } from "../broadcast.service";
import { FeeLevel } from "../fee-level.service";
import { TxService } from "../tx-service.service";
import { TxV2Service } from "../tx-v2-service.service";
import { UnusedAddressService } from "../unused-address.service";
import { UtxoProvider } from "../utxo-provider.service";
import { BitcoinService } from "./bitcoin.service";

export class BlockbookBitcoinService implements BitcoinService {

    private logger: Logger;
    constructor(
        @inject('services.TxV2Service')
        protected txV2Service: TxV2Service,
        @inject(ServicesBindings.ADDRESS_SERVICE)
        protected addressService: AddressService,
        @inject('services.UtxoProvider')
        protected utxoProviderService: UtxoProvider,
        @inject('services.TxService')
        protected txService: TxService,
        @inject('services.FeeLevel')
        protected feeLevelProviderService: FeeLevel,
        @inject('services.Broadcast')
        protected broadcastProvider: Broadcast,
        @inject(ServicesBindings.UNUSED_ADDRESS_SERVICE)
        protected unusedAddressService: UnusedAddressService
        ) {
        this.logger = getLogger('blockbook-bitcoin-service');
    }

    getTx(txId: string): Promise<BitcoinTx> {
      this.logger.trace(`[getTx] txId:${txId}`);
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
    getTx2(txId: string): Promise<Tx> {
      this.logger.trace(`[getTx2] txId:${txId}`);
      return this.txService.txProvider(txId).then(r => new Tx(r[0]));
    }
    getUTXOs(address: string): Promise<Utxo[]> {
      this.logger.trace(`[getUTXOs] address:${address}`);
        return this.utxoProviderService.utxoProvider(address)
          .then(r => r.map(uxto => new Utxo(uxto)));
    }
    getAddressInfo(address: string): Promise<BitcoinAddress> {
      this.logger.trace(`[getAddressInfo] address:${address}`);
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
    getFee(blocksToMine: number): Promise<string> {
      this.logger.trace(`[getFee] blocksToMine:${blocksToMine}`);
      return this.feeLevelProviderService.feeProvider(blocksToMine);
    }
    broadcast(rawTx: string): Promise<TxStatus> {
      this.logger.trace(`[broadcast] rawTxHash:${calculateBtcTxHash(rawTx)}`);
      return this.broadcastProvider.broadcast(rawTx).then( r => r[0]);
    }


}