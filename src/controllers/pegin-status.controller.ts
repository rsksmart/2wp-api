import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginStatus, Status} from '../models';


export class PeginStatusController {
  constructor(
  ) { }

  @get('get-pegin-status', {
    responses: {
      '200': {
        description: 'get the status of a Pegin Transaction',
        content: {
          'application/json': {
            schema: getModelSchemaRef(PeginStatus, {includeRelations: true}),
          },
        },
      },
    },
  })
  getTx(txId: string): Promise<PeginStatus> {
    return new Promise<PeginStatus>((resolve) => {
      const responsePeginStatus = new PeginStatus(txId);
      responsePeginStatus.rskRecipient = "rskRecipient"; // TODO
      responsePeginStatus.rskTxId = "rskTxId" // TODO
      responsePeginStatus.rskBlockHeight = 0; //TODO
      responsePeginStatus.status = Status.waiting_confirmations;
      responsePeginStatus.btcConfirmation = 0; // TOOD

      resolve(responsePeginStatus);
    })
  }
}

