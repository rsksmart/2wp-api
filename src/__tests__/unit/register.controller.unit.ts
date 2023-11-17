import {ExpressContextStub, StubbedInstanceWithSinonAccessor, createStubInstance, expect, sinon, stubExpressContext} from '@loopback/testlab';
import {RegisterController} from '../../controllers/register.controller';
import {RegisterService} from '../../services/register.service';
import {RegisterPayload} from '../../models';
import {SessionRepository} from '../../repositories';

describe('RegisterController', () => {
  let registerController: RegisterController;
  let registerService: RegisterService;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let context: ExpressContextStub;
  let register: sinon.SinonStub;
  let get: sinon.SinonStub;
  let payload = new RegisterPayload({
    sessionId: '43ef33c59294d5033d96cb25b8f94723',
    txHash: '0x',
    type: 'pegin',
    value: 0.005,
    wallet: 'liquality',
    fee: 0.000001,
  });
  let pegoutPayload = new RegisterPayload({
    sessionId: '',
    txHash: '0xb',
    type: 'pegout',
    value: 0.004,
    wallet: 'liquality',
    fee: 0.000002,
  });
  beforeEach(reset);
  function reset() {
    context = stubExpressContext();
    registerService = createStubInstance(RegisterService);
    sessionRepository = createStubInstance(SessionRepository);
    get = sessionRepository.get as sinon.SinonStub;
    register = registerService.register as sinon.SinonStub;
    registerController = new RegisterController(
      registerService,
      context.response,
      sessionRepository,
    );
  }

  it('should register a pegin with a valid sessionId', async () => {
    register.resolves(true);
    get.resolves('43ef33c59294d5033d96cb25b8f94723');
    await registerController.register(payload);
    const result = await context.result;
    sinon.assert.called(sessionRepository.stubs.get);
    sinon.assert.called(register);
    expect(result.statusCode).to.equal(200);
  });

  it('should not register a pegin with an invalid sessionId', async () => {
    get.resolves(null);
    await registerController.register(payload);
    const result = await context.result;
    sinon.assert.called(sessionRepository.stubs.get);
    sinon.assert.notCalled(register);
    expect(result.statusCode).to.equal(200);
  });

  it('should register a pegout with any sessionId', async () => {
    get.resolves(null);
    await registerController.register(pegoutPayload);
    const result = await context.result;
    sinon.assert.called(sessionRepository.stubs.get);
    sinon.assert.called(register);
    expect(result.statusCode).to.equal(200);
  });
});
