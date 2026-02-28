import {repository} from '@loopback/repository';
import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import * as Sentry from "@sentry/node";
import {PeginConfiguration} from '../models';
import {PeginConfigurationRepository} from '../repositories';
import {BridgeService} from '../services';

export class PeginConfigurationController {
  logger: Logger;

  constructor(
    @repository(PeginConfigurationRepository)
    public peginConfigurationRepository: PeginConfigurationRepository,
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
    const bridgeService = new BridgeService();
    return new Promise<PeginConfiguration>((resolve, reject) => {
      Promise.all([
        bridgeService.getMinPeginValue(),
        bridgeService.getFederationAddress(),
        bridgeService.getPeginAvailability(),
      ])
        .then(([minValue, federationAddress, availability]) => {
          const peginConf = new PeginConfiguration({
            minValue,
            maxValue: availability,
            federationAddress,
            btcConfirmations: Number(process.env.BTC_CONFIRMATIONS) || 100,
          });
          this.logger.debug('[get] Finished');
          resolve(peginConf);
        })
        .catch((e) => {
          this.logger.warn(`[get] Got an error: ${e}`);
          Sentry.captureException(e);
          reject(e);
        });
    });
  }
}
