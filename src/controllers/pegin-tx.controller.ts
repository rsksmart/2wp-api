import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {config} from 'dotenv';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import peginAddressVerifier from 'pegin-address-verificator';
import {CreatePeginTxData, NormalizedTx, TxInput, TxOutput} from '../models';
import {SessionRepository} from '../repositories';
import {BridgeService} from '../services';
import SatoshiBig from '../utils/SatoshiBig';

config();

export class PeginTxController {
  constructor(
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) { }

  @post('/pegin-tx')
  @response(201, {
    description: 'Creates a normalized transaction based on the data provided',
    content: {
      'application/json': {schema: getModelSchemaRef(CreatePeginTxData)},
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreatePeginTxData),
        },
      },
    })
    createPeginTxData: CreatePeginTxData,
  ): Promise<NormalizedTx> {
    return new Promise<NormalizedTx>((resolve, reject) => {
      const outputs: TxOutput[] = [];
      const network = process.env.NETWORK ?? 'testnet';
      const bridgeService = new BridgeService();
      const addressInfo = peginAddressVerifier.getAddressInformation(
        createPeginTxData.refundAddress,
      );
      const validAddress = addressInfo
        ? peginAddressVerifier.canPegIn(addressInfo)
        : false;
      if (!validAddress)
        reject(
          new Error(`Invalid Refund Address provided ${createPeginTxData.refundAddress} for network ${network}`),
        );
      Promise.all([
        this.sessionRepository.getAccountInputs(createPeginTxData.sessionId),
        this.sessionRepository.getFeeLevel(
          createPeginTxData.sessionId,
          createPeginTxData.feeLevel,
        ),
        bridgeService.getFederationAddress(),
      ])
        .then(([inputs, fee, federationAddress]) => {
          if (!inputs.length) reject(new Error(`There are no inputs selected for this sessionId ${createPeginTxData.sessionId}`))
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const inputsAmount = inputs.reduce((acc, curr) => ({amount: acc.amount + curr.amount}));
          if (inputsAmount.amount - (createPeginTxData.amountToTransferInSatoshi + fee) <= 0) reject(new Error('The stored input list is has not enough amount'));
          outputs.push(
            this.getRSKOutput(
              createPeginTxData.recipient,
              createPeginTxData.refundAddress,
            ),
          );
          outputs.push(
            this.getFederationOutput(
              createPeginTxData.amountToTransferInSatoshi,
              federationAddress,
            ),
          );
          outputs.push(
            this.getChangeOutput(
              inputs,
              createPeginTxData.changeAddress,
              createPeginTxData.amountToTransferInSatoshi,
              fee,
            ),
          );
          resolve(
            new NormalizedTx({
              inputs,
              outputs,
            }),
          );
        })
        .catch(reject);
    });
  }

  getRSKOutput(recipient: string, refundAddress: string): TxOutput {
    const output: TxOutput = new TxOutput({
      amount: '0',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      script_type: 'PAYTOOPRETURN',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      op_return_data: '52534b5401',
    });
    output.op_return_data += recipient;
    const addressInfo =
      peginAddressVerifier.getAddressInformation(refundAddress);
    switch (addressInfo.type) {
      case 'p2pkh':
        output.op_return_data += `01${addressInfo.scriptPubKey}`;
        break;
      case 'p2sh':
        output.op_return_data += `02${addressInfo.scriptHash}`;
        break;
    }
    return output;
  }

  getFederationOutput(
    amountToTransferInSatoshi: number,
    federationAddress: string,
  ): TxOutput {
    return new TxOutput({
      amount: amountToTransferInSatoshi.toString(),
      address: federationAddress,
    });
  }

  private getChangeOutput(
    inputs: TxInput[],
    changeAddress: string,
    amountToTransferInSatoshi: number,
    fee: number,
  ): TxOutput {
    let capacity = 0;
    const amountToTransferPlusFee = new SatoshiBig(amountToTransferInSatoshi, 'satoshi')
      .plus(new SatoshiBig(fee, 'satoshi'));
    inputs.forEach(input => {
      capacity += input.amount ? +input.amount : 0;
    });
    if (changeAddress === '') {
      changeAddress = inputs[0].address;
    }
    return new TxOutput({
      amount: new SatoshiBig(capacity, 'satoshi').minus(amountToTransferPlusFee).toSatoshiString(),
      address: changeAddress,
    });
  }
}
