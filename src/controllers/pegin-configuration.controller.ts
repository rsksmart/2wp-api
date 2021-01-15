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
} from '@loopback/rest';
import {PeginConfiguration} from '../models';
import {PeginConfigurationRepository} from '../repositories';

export class PeginConfigurationController {
  constructor(
    @repository(PeginConfigurationRepository)
    public peginConfigurationRepository : PeginConfigurationRepository,
  ) {}

  @post('/pegin-configuration', {
    responses: {
      '200': {
        description: 'PeginConfiguration model instance',
        content: {'application/json': {schema: getModelSchemaRef(PeginConfiguration)}},
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PeginConfiguration, {
            title: 'NewPeginConfiguration',
            exclude: ['id'],
          }),
        },
      },
    })
    peginConfiguration: Omit<PeginConfiguration, 'id'>,
  ): Promise<PeginConfiguration> {
    return this.peginConfigurationRepository.create(peginConfiguration);
  }

  @get('/pegin-configuration/count', {
    responses: {
      '200': {
        description: 'PeginConfiguration model count',
        content: {'application/json': {schema: CountSchema}},
      },
    },
  })
  async count(
    @param.where(PeginConfiguration) where?: Where<PeginConfiguration>,
  ): Promise<Count> {
    return this.peginConfigurationRepository.count(where);
  }

  @get('/pegin-configuration', {
    responses: {
      '200': {
        description: 'Array of PeginConfiguration model instances',
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
  ): Promise<PeginConfiguration[]> {
    return this.peginConfigurationRepository.find(filter);
  }

  @patch('/pegin-configuration', {
    responses: {
      '200': {
        description: 'PeginConfiguration PATCH success count',
        content: {'application/json': {schema: CountSchema}},
      },
    },
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PeginConfiguration, {partial: true}),
        },
      },
    })
    peginConfiguration: PeginConfiguration,
    @param.where(PeginConfiguration) where?: Where<PeginConfiguration>,
  ): Promise<Count> {
    return this.peginConfigurationRepository.updateAll(peginConfiguration, where);
  }

  @get('/pegin-configuration/{id}', {
    responses: {
      '200': {
        description: 'PeginConfiguration model instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(PeginConfiguration, {includeRelations: true}),
          },
        },
      },
    },
  })
  async findById(
    @param.path.number('id') id: number,
    @param.filter(PeginConfiguration, {exclude: 'where'}) filter?: FilterExcludingWhere<PeginConfiguration>
  ): Promise<PeginConfiguration> {
    return this.peginConfigurationRepository.findById(id, filter);
  }

  @patch('/pegin-configuration/{id}', {
    responses: {
      '204': {
        description: 'PeginConfiguration PATCH success',
      },
    },
  })
  async updateById(
    @param.path.number('id') id: number,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PeginConfiguration, {partial: true}),
        },
      },
    })
    peginConfiguration: PeginConfiguration,
  ): Promise<void> {
    await this.peginConfigurationRepository.updateById(id, peginConfiguration);
  }

  @put('/pegin-configuration/{id}', {
    responses: {
      '204': {
        description: 'PeginConfiguration PUT success',
      },
    },
  })
  async replaceById(
    @param.path.number('id') id: number,
    @requestBody() peginConfiguration: PeginConfiguration,
  ): Promise<void> {
    await this.peginConfigurationRepository.replaceById(id, peginConfiguration);
  }

  @del('/pegin-configuration/{id}', {
    responses: {
      '204': {
        description: 'PeginConfiguration DELETE success',
      },
    },
  })
  async deleteById(@param.path.number('id') id: number): Promise<void> {
    await this.peginConfigurationRepository.deleteById(id);
  }
}
