import ExtendedBridgeTx from '../extended-bridge-tx';
import { PegoutStatuses, PegoutStatusDbDataModel, RejectedPegoutReasons } from '../../models/rsk/pegout-status-data-model';
import { BRIDGE_EVENTS } from '../../utils/bridge-utils';
import { BtcAddressUtils, fromWeiNumberToSatoshiNumber } from '../../utils/btc-utils';
import {ExtendedBridgeEvent} from "../../models/types/bridge-transaction-parser";
import { isAvailable } from '../../utils/ts-utils';

export class PegoutStatusBuilder {

    public static async fillRequestReceivedStatus(extendedBridgeTx: ExtendedBridgeTx):Promise<PegoutStatusDbDataModel> {
        const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
        const releaseRequestReceivedEvent:ExtendedBridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;
        const rskSenderAddress = <string> releaseRequestReceivedEvent!.arguments.sender;
        const btcDestinationAddressHash160 = <string> releaseRequestReceivedEvent!.arguments.btcDestinationAddress;
        const utility = new BtcAddressUtils();
        const btcDestinationAddress = utility.getBtcAddressFromHash(btcDestinationAddressHash160);
        const amount = <number> releaseRequestReceivedEvent!.arguments.amount;

        const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
        status.createdOn = extendedBridgeTx.createdOn;
        status.originatingRskTxHash = extendedBridgeTx.txHash;
        status.rskTxHash = extendedBridgeTx.txHash;
        status.rskBlockHeight = extendedBridgeTx.blockNumber;
        status.rskSenderAddress = rskSenderAddress;
        status.btcRecipientAddress = btcDestinationAddress;
        status.valueRequestedInSatoshis = fromWeiNumberToSatoshiNumber(amount);
        status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
        status.status = PegoutStatuses.RECEIVED;
        status.rskBlockHash = extendedBridgeTx.blockHash;
        status.originatingRskBlockHash = extendedBridgeTx.blockHash;
        status.isNewestStatus = true;

        return status;
    }

    public static async fillRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx):Promise<PegoutStatusDbDataModel> {
        const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
        const releaseRequestRejectedEvent: ExtendedBridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED)!;

        const {sender: rskSenderAddress, amount, reason} = releaseRequestRejectedEvent.arguments;

        const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

        status.createdOn = extendedBridgeTx.createdOn;
        status.originatingRskTxHash = extendedBridgeTx.txHash;
        status.rskTxHash = extendedBridgeTx.txHash;
        status.rskBlockHeight = extendedBridgeTx.blockNumber;
        status.rskSenderAddress = rskSenderAddress;
        status.valueRequestedInSatoshis = fromWeiNumberToSatoshiNumber(amount);
        if (isAvailable(RejectedPegoutReasons, reason)) {
            status.reason = RejectedPegoutReasons[reason];
        }
        status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
        status.status = PegoutStatuses.REJECTED;
        status.isNewestStatus = true;
        return status;
    }

}
