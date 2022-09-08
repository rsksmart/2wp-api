import {BridgeEvent} from "bridge-transaction-parser";

export interface ExtendedBridgeEvent extends BridgeEvent{
    arguments: {
        sender: string;
        amount: number;
        reason: string;
        receiver: string;
        btcDestinationAddress: string;
        btcRawTransaction: string;
        rskTxHash: string;
        btcTxHash: string;
        protocolVersion: string;
        senderBtcAddress: string;
    };
}
