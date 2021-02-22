import {repository} from '@loopback/repository';
import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginConfiguration, Session} from '../models';
import {PeginConfigurationRepository, SessionRepository} from '../repositories';
import crypto from 'crypto';

export class PeginConfigurationController {
  constructor(
    @repository(PeginConfigurationRepository)
    public peginConfigurationRepository: PeginConfigurationRepository,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) {}

  @get('/pegin-configuration', {
    responses: {
      '200': {
        description: 'Pegin configuration info',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: getModelSchemaRef(PeginConfiguration, {
                includeRelations: true,
              }),
            },
          },
        },
      },
    },
  })
  async get(): Promise<PeginConfiguration> {
    const session = {
      _id: crypto.randomBytes(16).toString('hex'),
      balance: 0,
    };
    await this.sessionRepository.set(session._id, new Session(session));
    const peginConfig = await this.peginConfigurationRepository.findById('1');
    return new Promise<PeginConfiguration>(resolve => {
      peginConfig.sessionId = session._id;
      resolve(peginConfig);
    });
  }
}
