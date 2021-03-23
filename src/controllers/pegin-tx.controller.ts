import {repository} from '@loopback/repository';
import {post, getModelSchemaRef, requestBody, response} from '@loopback/rest';
import {CreatePeginTxData, NormalizedTx, TxInput, TxOutput} from '../models';
import {SessionRepository} from '../repositories';
import peginAddressVerifier from 'pegin-address-verifier';
import {config} from 'dotenv';

config();

export class PeginTxController {
  constructor(
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) {}

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
      const addressInfo = peginAddressVerifier.getAddressInformation(
        createPeginTxData.refundAddress,
      );
      const validAddress = addressInfo
        ? peginAddressVerifier.canPegIn(addressInfo)
        : false;
      if (!validAddress)
        reject(
          `Invalid Refund Address provided ${createPeginTxData.refundAddress} for network ${network}`,
        );
      Promise.all([
        this.sessionRepository.getAccountInputs(createPeginTxData.sessionId),
        this.sessionRepository.getFeeLevel(
          createPeginTxData.sessionId,
          createPeginTxData.feeLevel,
        ),
      ])
        .then(([inputs, fee]) => {
          outputs.push(
            this.getRSKOutput(
              createPeginTxData.recipient,
              createPeginTxData.refundAddress,
            ),
          );
          outputs.push(
            this.getFederationOutput(
              createPeginTxData.amountToTransferInSatoshi,
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
      op_return_data: '52534b54',
    });
    output.op_return_data += recipient;
    const addressInfo = peginAddressVerifier.getAddressInformation(
      refundAddress,
    );
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

  getFederationOutput(amountToTransferInSatoshi: number): TxOutput {
    const federationAddress =
      process.env.FEDERATION_ADDRESS ??
      'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0';
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
    inputs.forEach(input => {
      capacity += input.amount ? +input.amount : 0;
    });
    return new TxOutput({
      amount: (capacity - (amountToTransferInSatoshi + fee)).toString(),
      address: changeAddress,
    });
  }
}
