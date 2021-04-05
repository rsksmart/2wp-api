import {repository} from '@loopback/repository';
import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginConfiguration, Session} from '../models';
import {PeginConfigurationRepository, SessionRepository} from '../repositories';
import {BridgeService} from '../services';
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
    const bridgeService = new BridgeService(
      process.env.BRIDGE_ADDRESS ??
        '0x0000000000000000000000000000000001000006',
    );
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
