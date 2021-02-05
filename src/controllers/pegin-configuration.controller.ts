import {
  Filter,
  repository,
} from '@loopback/repository';
import {
  param,
  get,
  getModelSchemaRef,
} from '@loopback/rest';
import {PeginConfiguration, Session} from '../models';
import {PeginConfigurationRepository, SessionRepository} from '../repositories';
import crypto from 'crypto';

export class PeginConfigurationController {
  constructor(
    @repository(PeginConfigurationRepository)
    public peginConfigurationRepository : PeginConfigurationRepository,
    @repository(SessionRepository)
    public sessionRepository : SessionRepository,
  ) {}


  @get('/pegin-configuration', {
    responses: {
      '200': {
        description: 'Pegin configuration info',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: getModelSchemaRef(PeginConfiguration, {includeRelations: true}),
            },
          },
        },
      },
    },
  })
  async find(
    @param.filter(PeginConfiguration) filter?: Filter<PeginConfiguration>,
  ): Promise<PeginConfiguration> {
    const session = {
      _id: crypto.randomBytes(16).toString('hex'),
      balance: 0,
    };
    return new Promise<PeginConfiguration>((resolve, reject) => {
      Promise.all([
        this.sessionRepository.create(new Session(session)),
        this.peginConfigurationRepository.findById('1',filter),
      ])
        .then(([sessionCreated, peginConfig]) => {
          peginConfig.sessionId = sessionCreated._id;
          resolve(peginConfig);
        })
        .catch(reject);
    });
  }
}
