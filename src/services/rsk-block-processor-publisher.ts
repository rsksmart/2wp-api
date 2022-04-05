
import {RskBlock} from '../models/rsk/rsk-block.model';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';

export default interface RskBlockProcessorPublisher {
    addSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void;
    removeSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void;
    getSubscribers(): FilteredBridgeTransactionProcessor[];
    process(rskBlock: RskBlock): Promise<void>;
}
