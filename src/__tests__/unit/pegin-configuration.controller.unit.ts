import {
  createStubInstance,
  expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {
  PeginConfigurationRepository,
  SessionRepository,
} from '../../repositories';
import {PeginConfiguration, Session} from '../../models';
import {PeginConfigurationController} from '../../controllers';
import {givenPeginConfiguration} from '../helper';
describe('PeginConfiguration controller', () => {
  let controller: PeginConfigurationController;
  let peginConfigurationRepository: StubbedInstanceWithSinonAccessor<PeginConfigurationRepository>;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  beforeEach(resetRepositories);

  function resetRepositories() {
    peginConfigurationRepository = createStubInstance(
      PeginConfigurationRepository,
    );
    sessionRepository = createStubInstance(SessionRepository);
    controller = new PeginConfigurationController(
      peginConfigurationRepository,
      sessionRepository,
    );
  }

  it('should get a peginConfiguration given the id 1', async () => {
    const peginConf = {
      id: 1,
      minValue: 100000,
      maxValue: 100000000000000,
      federationAddress: 'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0',
      feePerKb: 10,
      btcConfirmations: 100,
    };
    peginConfigurationRepository.stubs.findById
      .withArgs('1')
      .resolves(new PeginConfiguration(peginConf));
    sessionRepository.stubs.create.resolves(
      new Session({
        _id: 'test_id',
        balance: 0,
      }),
    );
    const pc = await controller.get();
    expect(pc).to.deepEqual(givenPeginConfiguration(peginConf));
  });
});
