import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {BridgeData} from '../models/rsk/bridge-data.model';

export interface RskBridgeDataProvider {
  configure(filters: Array<BridgeDataFilterModel>): void;
  getData(startingBlock: string | number): Promise<BridgeData>;
}
