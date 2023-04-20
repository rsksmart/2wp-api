import {
  createStubInstance, expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {SessionRepository} from '../../repositories';
import {PeginTxController} from '../../controllers';
import {config} from 'dotenv';
import {sinon} from '@loopback/testlab/dist/sinon';
import * as constants from '../../constants';
import {CreatePeginTxData, InputPerFee, NormalizedTx, TxInput, TxOutput} from '../../models';
import {BridgeService, TxService} from '../../services';

config();

describe('Pegin Tx controller', () => {
  let getFeeLevel : sinon.SinonStub;
  let getAccountInputs : sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let txService: TxService;
  let txProvider: sinon.SinonStub;
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
  const inputs2 = [
    new TxInput({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      address_n: [0],
      address: 'address1',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_hash: 'txId1',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_index: 0,
      amount: 100000,
    }),
    new TxInput({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      address_n: [0],
      address: 'address2',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_hash: 'txId2',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      prev_index: 0,
      amount: 200000,
    })
  ];
  const inputsPerFee = new InputPerFee({
    fast: inputs,
    average: inputs,
    slow: inputs,
  });
  const inputsPerFee2 = new InputPerFee({
    fast: inputs2,
    average: inputs2,
    slow: inputs2,
  });
  const env = process.env;
  beforeEach(resetRepositories);
  const setDustEnv = (dustValue: string) => {
    process.env.BURN_DUST_VALUE = dustValue;
  }
  const resetEnv = () => {
    process.env = env;
  }
  after(resetEnv);

  function resetRepositories() {
    sessionRepository = createStubInstance(SessionRepository);
    txService = {txProvider: sinon.stub()};
    txProvider = txService.txProvider as sinon.SinonStub;
    getAccountInputs = sessionRepository.getAccountInputs as sinon.SinonStub;
    getFeeLevel = sessionRepository.getFeeLevel as sinon.SinonStub;
    peginTxController = new PeginTxController(sessionRepository, txService);
  }
  it('Should create a pegin Tx', () => {
    getAccountInputs.withArgs(sessionId).resolves(inputsPerFee);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(2590);
    txProvider.resolves([{ hex: 'testTx'}]);
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
    getAccountInputs.withArgs(sessionId).resolves({fast: [], average: [], slow: []});
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(2590);
    txProvider.resolves([{ hex: 'testTx'}]);
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
    getAccountInputs.withArgs(sessionId).resolves(inputsPerFee);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(2590);
    txProvider.resolves([{ hex: 'testTx'}]);
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
    getAccountInputs.withArgs(sessionId).resolves(inputsPerFee);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(550);
    txProvider.resolves([{ hex: 'testTx'}]);
    const request = new CreatePeginTxData({
      amountToTransferInSatoshi: 29500,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: 'changeAddress',
      recipient: 'rskAddress',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return expect(peginTxController.create(request))
      .to.be.rejectedWith(`The stored input list has not enough amount`);
  });
  it('should create a transaction without change output if it spends all balance', () => {
    getAccountInputs.withArgs(sessionId).resolves(inputsPerFee);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(500);
    txProvider.resolves([{ hex: 'testTx'}]);
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
  it('should create a transaction without burn dust value higher than 30000 Sats', () => {
    setDustEnv('40000');
    getAccountInputs.withArgs(sessionId).resolves(inputsPerFee2);
    getFeeLevel.withArgs(sessionId, constants.BITCOIN_FAST_FEE_LEVEL).resolves(500);
    txProvider.resolves([{ hex: 'testTx'}]);
    const requestWithoutBurnDust = new CreatePeginTxData({
      amountToTransferInSatoshi: 269499,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: 'changeAddress',
      recipient: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    const requestWithBurnDust = new CreatePeginTxData({
      amountToTransferInSatoshi: 269500,
      refundAddress: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      changeAddress: 'changeAddress',
      recipient: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
      sessionId,
      feeLevel: constants.BITCOIN_FAST_FEE_LEVEL,
    });
    return Promise.all([peginTxController.create(requestWithoutBurnDust), new BridgeService().getFederationAddress()])
        .then(([normalizedTx, federationAddress]) => expect(normalizedTx).to.be.eql(new NormalizedTx({
          inputs: inputs2,
          outputs: [
            new TxOutput({
              amount: '0',
              // eslint-disable-next-line @typescript-eslint/naming-convention
              script_type: 'PAYTOOPRETURN',
              // eslint-disable-next-line @typescript-eslint/naming-convention
              op_return_data: '52534b54010x90F8bf6A479f320ead074411a4B0e7944Ea8c9C102ce552812b37e64d8f66f919d0e4222d4244ebe3a',
            }),
            new TxOutput({
              amount: '269499',
              address: federationAddress.toString(),
            }),
            new TxOutput({
              amount: '30001',
              address: 'changeAddress',
            }),
          ]
        })))
        .then(() => Promise.all([peginTxController.create(requestWithBurnDust), new BridgeService().getFederationAddress()]))
        .then(([normalizedTx, federationAddress]) => expect(normalizedTx).to.be.eql(new NormalizedTx({
          inputs: inputs2,
          outputs: [
            new TxOutput({
              amount: '0',
              // eslint-disable-next-line @typescript-eslint/naming-convention
              script_type: 'PAYTOOPRETURN',
              // eslint-disable-next-line @typescript-eslint/naming-convention
              op_return_data: '52534b54010x90F8bf6A479f320ead074411a4B0e7944Ea8c9C102ce552812b37e64d8f66f919d0e4222d4244ebe3a',
            }),
            new TxOutput({
              amount: '269500',
              address: federationAddress.toString(),
            }),
          ]
        })))
  });
});
