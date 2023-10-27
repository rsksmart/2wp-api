import {ExpressContextStub, createStubInstance, expect, sinon, stubExpressContext} from '@loopback/testlab';
import {RegisterController} from '../../controllers/register.controller';
import {RegisterService} from '../../services/register.service';
import {RegisterPayload} from '../../models';

describe('RegisterController', () => {
  let registerController: RegisterController;
  let registerService: RegisterService;
  let context: ExpressContextStub;
  let register: sinon.SinonStub;
  let payload = new RegisterPayload({
    txHash: '0x',
    type: 'pegin',
    value: 0.005,
    wallet: 'liquality',
    fee: 0.000001,
  });
  beforeEach(reset);
  function reset() {
    context = stubExpressContext();
    registerService = createStubInstance(RegisterService);
    register = registerService.register as sinon.SinonStub;
    registerController = new RegisterController(
      registerService,
      context.response,
    );
  }

  it('should register a new transaction', async () => {
    register.resolves(true);
    await registerController.register(payload);
    const result = await context.result;
    expect(result.statusCode).to.equal(200);
  });

  it('should return 500 if registerService throws an error', async () => {
    register.rejects();
    await registerController.register(payload);
    const result = await context.result;
    expect(result.statusCode).to.equal(500);
  });
});
