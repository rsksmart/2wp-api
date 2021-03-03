import {repository} from '@loopback/repository';
import {post, getModelSchemaRef, requestBody, response} from '@loopback/rest';
import {CreatePeginTxData, NormalizedTx, TxOutput} from '../models';
import {SessionRepository} from '../repositories';

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
      this.sessionRepository
        .getAccountInputs(createPeginTxData.sessionId)
        .then(inputs => {
          outputs.push(
            this.getRSKOutput(
              createPeginTxData.recipient,
              createPeginTxData.refundAddress,
            ),
          );
          resolve(
            new NormalizedTx({
              inputs,
              outputs,
            }),
          );
        })
        .catch(console.error);
    });
  }

  private getRSKOutput(recipient: string, refundAddress: string): TxOutput {
    const output: TxOutput = new TxOutput({
      amount: '0',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      script_type: 'PAYTOOPRETURN',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      op_return_data: 'OP_RETURN ',
    });
    output.op_return_data += recipient + refundAddress;
    return output;
  }
}
