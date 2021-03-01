import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  put,
  del,
  requestBody,
  response,
} from '@loopback/rest';
import {CreatePeginTxData} from '../models';
import {SessionRepository} from '../repositories';

export class PeginTxController {
  constructor(
    @repository(SessionRepository)
    public sessionRepository : SessionRepository,
  ) {}

  @post('/pegin-tx')
  @response(200, {
    description: 'Creates a normalized transaction based on the data provided',
    content: {'application/json': {schema: getModelSchemaRef(CreatePeginTxData)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreatePeginTxData, {
            title: 'New PeginTxData',
          }),
        },
      },
    })
    createPeginTxData: Omit<CreatePeginTxData, ''>,
  ): Promise<CreatePeginTxData> {
    return new Promise<CreatePeginTxData>((resolve, reject) => {

    });
  }
}
