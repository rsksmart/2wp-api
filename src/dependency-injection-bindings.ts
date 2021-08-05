
export const ConstantsBindings = {
  MONGO_DB_URI: 'constants.mongoDbUri',
  INITIAL_BLOCK: 'constants.initialBlock',
  MIN_DEPTH_FOR_SYNC: 'constants.minDepthForSync',
  SYNC_INTERVAL_TIME: 'constants.syncIntervalTime'
};

export const DatasourcesBindings = {
  MONGO_DB_DATASOURCE: 'datasources.MongoDbDataSource',
  TX_V2_PROVIDER: 'datasources.txV2Provider',
  RSK_BRIDGE_DATA_PROVIDER: 'datasources.RskBridgeDataProvider'
};

export const ServicesBindings = {
  BITCOIN_SERVICE: 'services.BitcoinService',
  RSK_NODE_SERVICE: 'services.RskNodeService',
  PEGIN_STATUS_DATA_SERVICE: 'services.PeginStatusDataService',
  PEGIN_STATUS_SERVICE: 'services.PeginStatusService',
  SYNC_STATUS_DATA_SERVICE: 'services.SyncStatusDataService',
  RSK_CHAIN_SYNC_SERVICE: 'services.RskChainSyncService',
  DAEMON_SERVICE: 'services.DaemonService'
};
