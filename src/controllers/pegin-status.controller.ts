import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {MongoDbDataSource} from '../datasources/mongodb.datasource';
import {PeginStatus} from '../models';
import {PeginStatusDataModel} from '../models/rsk/pegin-status-data.model';
import {PeginStatusService, TxV2Service} from '../services';
import {GenericDataService} from '../services/generic-data-service';
import {PeginStatusMongoDbDataService} from '../services/pegin-status-data-services/pegin-status-mongo.service';
import {BitcoinService} from '../services/pegin-status/bitcoin.service';

export class PeginStatusController {
  private peginStatusService: PeginStatusService;

  constructor(
    @inject('services.TxV2Service')
    protected txV2Service: TxV2Service,
    protected bitcoinService: BitcoinService = new BitcoinService(txV2Service),
  ) {
    const MONGO_DB_URI: string = `mongodb://${process.env.RSK_DB_USER}:${process.env.RSK_DB_PASS}@${process.env.RSK_DB_URL}:${process.env.RSK_DB_PORT}/${process.env.RSK_DB_NAME}`;
    const rskDataService: GenericDataService<PeginStatusDataModel> =
      new PeginStatusMongoDbDataService(new MongoDbDataSource(MONGO_DB_URI));
    this.peginStatusService = new PeginStatusService(bitcoinService, rskDataService);
  }

  @get('/pegin-status', {
    parameters: [{name: 'txId', schema: {type: 'string'}, in: 'query'}],
    responses: {
      '200': {
        description: 'return informartion for Pegin Status',
        content: {
          'application/json': {
            schema: getModelSchemaRef(PeginStatus, {includeRelations: true}),
          },
        },
      },
    },
  })
  getTx(txId: string): Promise<PeginStatus> {
    //FIXME: filter request incorrect and return our errors and not loopback error
    return this.peginStatusService.getPeginSatusInfo(txId);
  }
}

