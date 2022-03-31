import {
  createStubInstance, expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {SessionRepository} from '../../repositories';
import {PeginTxController} from '../../controllers';
import {config} from 'dotenv';
import {sinon} from '@loopback/testlab/dist/sinon';
import * as constants from '../../constants';
import {CreatePeginTxData, NormalizedTx, TxInput, TxOutput} from '../../models';
import {BridgeService} from '../../services';

config();

describe('Pegin Tx controller', () => {
  let getFeeLevel : sinon.SinonStub;
  let getAccountInputs : sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let peginTxController: PeginTxController;
  const sessionId = 'sessionId';
  const inputs = [
    new TxInput({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      address_n: [0],
      address: 'address1',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_hash: 'txId1',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_index: 0,
      amount: 10000,
    }),
    new TxInput({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      address_n: [0],
      address: 'address2',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_hash: 'txId2',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_index: 0,
      amount: 20000,
    })
  ];
  beforeEach(resetRepositories);

  function resetRepositories() {
    sessionRepository = createStubInstance(SessionRepository);
    getAccountInputs = sessionRepository.getAccountInputs as sinon.SinonStub;
    getFeeLevel = sessionRepository.getFeeLevel as sinon.SinonStub;
    peginTxController = new PeginTxController(sessionRepository)
  }
  it('Should create a pegin Tx', () => {
    getAccountInputs.withArgs(sessionId).resolves(inputs);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(2590);
    const request = new CreatePeginTxData({
      amountToTransferInSatoshi: 11000,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      recipient: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return Promise.all([peginTxController.create(request), new BridgeService().getFederationAddress()])
      .then(([normalizedTx, federationAddress]) => expect(normalizedTx).to.be.eql(new NormalizedTx({
        inputs,
        outputs: [
          new TxOutput({
            amount: '0',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            script_type: 'PAYTOOPRETURN',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            op_return_data: '52534b54010x90F8bf6A479f320ead074411a4B0e7944Ea8c9C102ce552812b37e64d8f66f919d0e4222d4244ebe3a',
          }),
          new TxOutput({
            amount: '11000',
            address: federationAddress.toString(),
          }),
          new TxOutput({
            amount: '16410',
            address: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs'
          }),
        ]
      })));
  });
  it('should reject the creation if there is no selected inputs for this sessionId', () => {
    getAccountInputs.withArgs(sessionId).resolves([]);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(2590);
    const request = new CreatePeginTxData({
      amountToTransferInSatoshi: 11000,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      recipient: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return expect(peginTxController.create(request))
      .to.be.rejectedWith(`There are no inputs selected for this sessionId ${sessionId}`);
  });
  it('should reject the creation if the refundAddress are invalid (bech32)', () => {
    const refundAddress = 'tb1qkfcu7q7q6y7xmfe5glp9amsm45x0um59rwwmsmsmd355g32';
    getAccountInputs.withArgs(sessionId).resolves(inputs);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(2590);
    const request = new CreatePeginTxData({
      amountToTransferInSatoshi: 11000,
      refundAddress,
      changeAddress: 'changeAddress',
      recipient: 'rskAddress',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return expect(peginTxController.create(request))
      .to.be.rejectedWith(`Invalid Refund Address provided ${refundAddress} for network testnet`);
  });
  it('should reject the creation if the required amount + fee is no satisfied with the selected inputs', () => {
    getAccountInputs.withArgs(sessionId).resolves(inputs);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(550);
    const request = new CreatePeginTxData({
      amountToTransferInSatoshi: 29500,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: 'changeAddress',
      recipient: 'rskAddress',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return expect(peginTxController.create(request))
      .to.be.rejectedWith(`The stored input list is has not enough amount`);
  });
  it('should create a transaction without change output if it spends all balance', () => {
    getAccountInputs.withArgs(sessionId).resolves(inputs);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(500);
    const request = new CreatePeginTxData({
      amountToTransferInSatoshi: 29500,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: 'changeAddress',
      recipient: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return Promise.all([peginTxController.create(request), new BridgeService().getFederationAddress()])
      .then(([normalizedTx, federationAddress]) => expect(normalizedTx).to.be.eql(new NormalizedTx({
        inputs,
        outputs: [
          new TxOutput({
            amount: '0',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            script_type: 'PAYTOOPRETURN',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            op_return_data: '52534b54010x90F8bf6A479f320ead074411a4B0e7944Ea8c9C102ce552812b37e64d8f66f919d0e4222d4244ebe3a',
          }),
          new TxOutput({
            amount: '29500',
            address: federationAddress.toString(),
          }),
        ]
      })));
  });
});
