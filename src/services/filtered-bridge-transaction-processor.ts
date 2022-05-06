import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import { ExtendedBridgeTx } from './node-bridge-data.provider';

export default interface FilteredBridgeTransactionProcessor {
    process(transaction: ExtendedBridgeTx): Promise<void>;
    getFilters(): BridgeDataFilterModel[];
}
