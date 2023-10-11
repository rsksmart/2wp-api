import { StubbedInstanceWithSinonAccessor, createStubInstance, expect, sinon } from "@loopback/testlab";
import { PeginConfigurationRepository, SessionRepository } from "../../repositories";
import { PeginConfigurationController } from "../../controllers";
import { BridgeService } from "../../services";
import { PeginConfiguration } from "../../models";

describe('pegin configuration controller', () => {
  const sandbox = sinon.createSandbox();
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let peginConfigurationRepository: StubbedInstanceWithSinonAccessor<PeginConfigurationRepository>;
  let peginConfigurationController: PeginConfigurationController;
  beforeEach(resetRepositories);
  afterEach(() => {
    sandbox.restore();
  });

  function resetRepositories() {
    sessionRepository = createStubInstance(SessionRepository);
    peginConfigurationRepository = createStubInstance(PeginConfigurationRepository);
    peginConfigurationController = new PeginConfigurationController(peginConfigurationRepository, sessionRepository)
  }

  it('should get pegin configuration', async () => {
    sandbox.stub(BridgeService.prototype, 'getMinPeginValue').resolves(0);
    sandbox.stub(BridgeService.prototype, 'getFederationAddress').resolves('federation-address');
    sandbox.stub(BridgeService.prototype, 'getPeginAvailability').resolves(1);
    const result = await peginConfigurationController.get();
    sinon.assert.called(sessionRepository.stubs.set);
    sinon.assert.called(sessionRepository.stubs.expire);
    expect(result).to.be.instanceOf(PeginConfiguration);
  });
});