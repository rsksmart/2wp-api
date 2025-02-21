// import { expect } from '@loopback/testlab';
// import { FlyoverService } from '../../../services/flyover.service';
// import { RegisterPayload } from '../../../models/register-payload.model';
// import { FlyoverStatusModel } from '../../../models/flyover-status.model';
// import { RskNodeService } from '../../../services/rsk-node.service';
// import sinon from 'sinon';

// describe('Service: FlyoverService', () => {
//   let flyoverService: FlyoverService;
//   let rskNodeService: RskNodeService;

//   beforeEach(() => {
//     rskNodeService = new RskNodeService();
//     flyoverService = new FlyoverService();
//   });

//   afterEach(() => {
//     sinon.restore();
//   });
// describe('Service: FlyoverService', () => {
//     it('should register a pegin native transaction successfully', async () => {
//         const mockBlockNumber = 1000;
//         sinon.stub(rskNodeService, 'getBlockNumber').resolves(mockBlockNumber);
//         sinon.stub(flyoverService, 'set').resolves(true);
    
//         const payload: RegisterPayload = {
//             "txHash": "0x807f14318a2f4bc62ae3a14370c243087464740fb2f5b16763f2fb1635708bb4",
//             "type": "pegout",
//             "value": "8000000000000000",
//             "wallet": "Metamask",
//             "btcEstimatedFee": "745632",
//             "rskGas": "234858360000"
//         };

//         const result = await flyoverService.register(payload);
//         expect(result).to.be.true();
//       });
// });
