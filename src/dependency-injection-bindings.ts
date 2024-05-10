
export const ConstantsBindings = {
  MONGO_DB_USER: 'constants.mongoDbUser',
  MONGO_DB_PASSWORD: 'constants.mongoDbPassword',
  MONGO_DB_HOST: 'constants.mongoDbHost',
  MONGO_DB_PORT: 'constants.mongoDbPort',
  MONGO_DB_DATABASE: 'constants.mongoDbDatabase',
  MONGO_DB_AUTH_SOURCE: 'constants.mongoDbAuthSource',
  INITIAL_BLOCK: 'constants.initialBlock',
  MIN_DEPTH_FOR_SYNC: 'constants.minDepthForSync',
  SYNC_INTERVAL_TIME: 'constants.syncIntervalTime'
};

export const DatasourcesBindings = {
  MONGO_DB_DATASOURCE: 'datasources.MongoDbDataSource',
  TX_V2_PROVIDER: 'datasources.txV2Provider',
  BTC_LAST_BLOCK_PROVIDER: 'datasources.lastBlockProvider'
};

export const ServicesBindings = {
  BITCOIN_SERVICE: 'services.BitcoinService',
  RSK_NODE_SERVICE: 'services.RskNodeService',
  PEGIN_STATUS_DATA_SERVICE: 'services.PeginStatusDataService',
  PEGOUT_STATUS_DATA_SERVICE: 'services.PegoutStatusDataService',
  PEGIN_STATUS_SERVICE: 'services.PeginStatusService',
  SYNC_STATUS_DATA_SERVICE: 'services.SyncStatusDataService',
  RSK_CHAIN_SYNC_SERVICE: 'services.RskChainSyncService',
  PEGIN_DATA_PROCESSOR: 'services.PeginDataProcessor',
  PEGOUT_DATA_PROCESSOR: 'services.PegoutDataProcessor',
  DAEMON_SERVICE: 'services.DaemonService',
  BRIDGE_SERVICE: 'services.BridgeService',
  ADDRESS_SERVICE: 'services.AddressService',
  BTC_LAST_BLOCK_SERVICE: 'services.LastBlockService',
  UNUSED_ADDRESS_SERVICE: 'services.UnusedAddressService',
  RSK_BLOCK_PROCESSOR_PUBLISHER: 'services.RskBlockProcessorPublisher',
  PEGOUT_STATUS_SERVICE: 'services.PegoutStatusService',
  UTXO_PROVIDER_SERVICE: 'services.UtxoProvider',
  REGISTER_SERVICE: 'services.RegisterService',
  FEATURES_SERVICE: 'services.FeaturesDataService',
  FLYOVER_SERVICE: 'services.FlyoverService',
};
