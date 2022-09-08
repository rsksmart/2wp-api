import { Tx, Utxo } from "../../models";
import { BitcoinAddress } from "../../models/bitcoin-address.model";
import { BitcoinTx } from "../../models/bitcoin-tx.model";
import { TxStatus } from "../broadcast.service";

export interface BitcoinService {
    getTx(txId: string): Promise<BitcoinTx>;
    getTx2(txId: string): Promise<Tx>;

    getUTXOs(address: string): Promise<Utxo[]>;

    getAddressInfo(address: string): Promise<BitcoinAddress>;

    getFee(blocksToMine: number): Promise<string>;

    broadcast(rawTx: string): Promise<TxStatus>;
}