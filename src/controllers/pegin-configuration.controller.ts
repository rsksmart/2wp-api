import {repository} from '@loopback/repository';
import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
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
  /**
   * `GET /pegin-configuration` — current peg-in configuration, read live from the RSK Bridge.
   *
   * @returns Minimum peg-in value, maximum value (the Bridge's current peg-in availability), the federation address, and the required BTC confirmations (`BTC_CONFIRMATIONS`, defaulting to 100).
   */
  async get(): Promise<PeginConfiguration> {
    this.logger.debug({method: 'get'}, 'started');
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
          this.logger.debug({method: 'get'}, 'Finished');
          resolve(peginConf);
        })
        .catch((err) => {
          this.logger.warn({method: 'get', err});
          reject(err);
        });
    });
  }
}
