import { expect, sinon } from "@loopback/testlab"
import { BroadcastController } from "../../controllers";
import { BroadcastRequest } from "../../models";
import { Broadcast } from "../../services";

describe('broadcast controller', () => {
  let broadcastProviderService: Broadcast;
  let broadcastProvider: sinon.SinonStub;
  let broadcastController: BroadcastController;
  const request: BroadcastRequest = new BroadcastRequest({data: 'broadcast-data'});
  beforeEach(resetRepositories);

  function resetRepositories() {
    broadcastProviderService = {broadcast: sinon.stub()};
    broadcastProvider = broadcastProviderService.broadcast as sinon.SinonStub;
    broadcastController = new BroadcastController(broadcastProviderService);
  }

  it('should broadcast a tx', async () => {
    broadcastProvider.resolves([{result: 'broadcast-result'}]);
    const result = await broadcastController.sendTx(request);
    sinon.assert.calledOnce(broadcastProvider);
    sinon.assert.calledWith(broadcastProvider, request.data);
    expect(result.txId).equal('broadcast-result');
  });
});
