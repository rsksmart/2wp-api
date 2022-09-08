import { getLogger, Logger } from "log4js";
import { Tx, Utxo } from "../../models";
import { BitcoinAddress } from "../../models/bitcoin-address.model";
import { BitcoinTx } from "../../models/bitcoin-tx.model";
import { Vin } from "../../models/vin.model";
import { Vout } from "../../models/vout.model";
import { calculateBtcTxHash } from "../../utils/btc-utils";
import { TxStatus } from "../broadcast.service";
import { BitcoinService } from "./bitcoin.service";

export class MockedBitcoinService implements BitcoinService {
    private logger: Logger;

    constructor() {
        this.logger = getLogger('mocked-bitcoin-service');
    }
    
    getTx(txId: string): Promise<BitcoinTx> {
        this.logger.trace(`[getTx] txId:${txId}`);
        let mockedBitcoinTx = new BitcoinTx();
        mockedBitcoinTx.txId = txId;
        mockedBitcoinTx.blockHash = 'ababab';
        mockedBitcoinTx.blockHeight = 1;
        mockedBitcoinTx.blockTime = new Date().getTime();
        mockedBitcoinTx.confirmations = 1000;
        mockedBitcoinTx.vin = [];
        mockedBitcoinTx.vin.push(new Vin());
        mockedBitcoinTx.vout = [];
        mockedBitcoinTx.vout.push(new Vout());
        mockedBitcoinTx.vout[0].valueSat = 10000;
        mockedBitcoinTx.vout[0].addresses = ['2N1y7hSneV9HuWnpLTtGqdRnway1Ag3dQoj'];

        // Add the details you need for this mocked transaction
        return Promise.resolve(mockedBitcoinTx);
    }

    getTx2(txId: string): Promise<Tx> {
        this.logger.trace(`[getTx2] txId:${txId}`);
        let mockedBitcoinTx = new Tx();
        // Add the details you need for this mocked transaction
        return Promise.resolve(mockedBitcoinTx);
    }

    getUTXOs(address: string): Promise<Utxo[]> {
        this.logger.trace(`[getUTXOs] address:${address}`);
        let utxos: Utxo[] = [];
        utxos.push(new Utxo());
        utxos[0].address = '2N1y7hSneV9HuWnpLTtGqdRnway1Ag3dQoj';
        utxos[0].amount = '10000000';
        utxos[0].confirmations = 1000;
        utxos[0].height = 1;
        utxos[0].satoshis = 10000000;
        utxos[0].txid = 'ababab';
        utxos[0].vout = 0;
        // Add the details you need for this mocked transaction
        return Promise.resolve(utxos);
    }

    getAddressInfo(address: string): Promise<BitcoinAddress> {
        this.logger.trace(`[getAddressInfo] address:${address}`);
        let mockedAddressInfo = new BitcoinAddress();
        // Add the details you need for this mocked transaction
        return Promise.resolve(mockedAddressInfo);
    }

    getFee(blocksToMine: number): Promise<string> {
        this.logger.trace(`[getFee] blocksToMine:${blocksToMine}`);
        // These values were taken from tx-fee.controller.ts:getTxFee
        switch (blocksToMine) {
            case (process.env.FAST_MINING_BLOCK || 1):
                return Promise.resolve('10');
            case (process.env.AVERAGE_MINING_BLOCK || 6):
                return Promise.resolve('5');
            case (process.env.LOW_MINING_BLOCK || 12):
                return Promise.resolve('1');
        }
        return Promise.resolve('0');
    }
    
    broadcast(rawTx: string): Promise<TxStatus> {
        this.logger.trace(`[broadcast] rawTxHash:${calculateBtcTxHash(rawTx)}`);
        return Promise.resolve({ result: 'ok' });
    }

}