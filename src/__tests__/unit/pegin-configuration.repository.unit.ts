// import {
//   createStubInstance,
//   expect,
//   StubbedInstanceWithSinonAccessor,
// } from '@loopback/testlab';
// import {
//   PeginConfigurationRepository,
//   SessionRepository,
// } from '../../repositories';
// import {PeginConfiguration} from '../../models';
// import {PeginConfigurationController} from '../../controllers';
// describe('PeginConfiguration Repository', () => {
//   let controller: PeginConfigurationController;
//   let peginConfigurationRepository: StubbedInstanceWithSinonAccessor<PeginConfigurationRepository>;
//   let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
//   beforeEach(resetRepositories);
//
//   function resetRepositories() {
//     peginConfigurationRepository = createStubInstance(
//       PeginConfigurationRepository,
//     );
//     sessionRepository = createStubInstance(SessionRepository);
//     controller = new PeginConfigurationController(
//       peginConfigurationRepository,
//       sessionRepository,
//     );
//   }
//
//   it('should get a peginConfiguration given the id 1', async () => {
//     const peginConf = {
//       id: 1,
//       minValue: 100000,
//       maxValue: 100000000000000,
//       federationAddress: 'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0',
//       feePerKb: 10,
//       btcConfirmations: 100,
//     };
//     peginConfigurationRepository.stubs.findById
//       .withArgs('1')
//       .resolves(new PeginConfiguration(peginConf));
//     const {sessionId, ...peginConfiguration} = await controller.get();
//     expect(sessionId).to.match(/[A-Fa-f0-9]{16}/);
//     expect(peginConfiguration).to.deepEqual(peginConf);
//   });
// });
