import {BridgeData} from '../models/rsk/bridge-data.model';

export interface RskBridgeDataProvider {
  getData(startingBlock: string | number): Promise<BridgeData>
}
