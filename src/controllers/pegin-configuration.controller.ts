import {repository} from '@loopback/repository';
import {get, getModelSchemaRef} from '@loopback/rest';
import crypto from 'crypto';
import {getLogger, Logger} from 'log4js';
import {PeginConfiguration, Session} from '../models';
import {PeginConfigurationRepository, SessionRepository} from '../repositories';
import {BridgeService} from '../services';

export class PeginConfigurationController {
  logger: Logger;

  constructor(
    @repository(PeginConfigurationRepository)
    public peginConfigurationRepository: PeginConfigurationRepository,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) {
    this.logger = getLogger('pegin-configuration-controller');
  }

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
    this.logger.debug('[get] started');
    return new Promise<PeginConfiguration>(async (resolve, reject) => {
      const session = {
        _id: crypto.randomBytes(16).toString('hex'),
        balance: 0,
      };
      const ttlSessionDBExpire =
        process.env.TTL_SESSIONDB_EXPIRE_MILLISECONDS ?? 3600000;
      await this.sessionRepository.set(session._id, new Session(session));
      await this.sessionRepository.expire(session._id, +ttlSessionDBExpire);
      this.logger.trace(`[get] Got session ${session._id}`);
      const bridgeService = new BridgeService();

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
          this.logger.debug('[get] Finished');
          resolve(peginConf);
        })
        .catch((e) => {
          this.logger.warn(`[get] Got an error: ${e}`);
          reject(e);
        });
    });
  }
}
