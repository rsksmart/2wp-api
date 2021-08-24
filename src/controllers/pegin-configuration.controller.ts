import {repository} from '@loopback/repository';
import {get, getModelSchemaRef} from '@loopback/rest';
import crypto from 'crypto';
import {PeginConfiguration, Session} from '../models';
import {PeginConfigurationRepository, SessionRepository} from '../repositories';
import {BridgeService} from '../services';

export class PeginConfigurationController {
  constructor(
    @repository(PeginConfigurationRepository)
    public peginConfigurationRepository: PeginConfigurationRepository,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) { }

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
    const ttlSessionDBExpire =
      process.env.TTL_SESSIONDB_EXPIRE_MILLISECONDS ?? 10800;
    await this.sessionRepository.set(session._id, new Session(session));
    await this.sessionRepository.expire(session._id, +ttlSessionDBExpire);
    const bridgeService = new BridgeService();
    return new Promise<PeginConfiguration>((resolve, reject) => {
      Promise.all([
        bridgeService.getMinPeginValue(),
        bridgeService.getFederationAddress(),
        bridgeService.getPeginAvailability(),
      ])
        .then(([minValue, federationAddress, availability]) => {
          const peginConf = new PeginConfiguration({
            minValue: minValue,
            maxValue: availability,
            federationAddress: federationAddress,
            btcConfirmations: Number(process.env.BTC_CONFIRMATIONS) ?? 100,
            sessionId: session._id,
          });
          resolve(peginConf);
        })
        .catch(reject);
    });
  }
}
