import { StubbedInstanceWithSinonAccessor, createStubInstance, expect, sinon } from "@loopback/testlab";
import { PeginConfigurationRepository } from "../../repositories";
import { PeginConfigurationController } from "../../controllers";
import { BridgeService } from "../../services";
import { PeginConfiguration } from "../../models";

describe('pegin configuration controller', () => {
  const sandbox = sinon.createSandbox();
  let peginConfigurationRepository: StubbedInstanceWithSinonAccessor<PeginConfigurationRepository>;
  let peginConfigurationController: PeginConfigurationController;
  beforeEach(resetRepositories);
  afterEach(() => {
    sandbox.restore();
  });

  function resetRepositories() {
    peginConfigurationRepository = createStubInstance(PeginConfigurationRepository);
    peginConfigurationController = new PeginConfigurationController(peginConfigurationRepository)
  }

  it('should get pegin configuration', async () => {
    sandbox.stub(BridgeService.prototype, 'getMinPeginValue').resolves(0);
    sandbox.stub(BridgeService.prototype, 'getFederationAddress').resolves('federation-address');
    sandbox.stub(BridgeService.prototype, 'getPeginAvailability').resolves(1);
    const result = await peginConfigurationController.get();
    expect(result).to.be.instanceOf(PeginConfiguration);
  });
});