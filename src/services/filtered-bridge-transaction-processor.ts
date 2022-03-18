import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';

export default interface FilteredBridgeTransactionProcessor {
    process(transaction: RskTransaction): Promise<void>;
    getFilters(): BridgeDataFilterModel[];
}
  