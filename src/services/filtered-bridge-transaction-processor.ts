import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import ExtendedBridgeTx from './extended-bridge-tx';

export default interface FilteredBridgeTransactionProcessor {
    process(transaction: ExtendedBridgeTx): Promise<void>;
    getFilters(): BridgeDataFilterModel[];
}
