import {Application} from '@loopback/core';
import {expect, sinon} from '@loopback/testlab';
import {SQSClient} from '@aws-sdk/client-sqs';
import {
  ATLAS_SCHEMA_VERSION,
  ATLAS_SOURCE,
  ATLAS_SWAP_TYPE,
  AtlasEvent,
  AtlasEventType,
} from '../../../../models/atlas/atlas-event.model';
import {isAtlasEventsEnabled} from '../../../../services/atlas/atlas-event-publisher';
import {SqsAtlasEventPublisher} from '../../../../services/atlas/sqs-atlas-event-publisher';
import {NoopAtlasEventPublisher} from '../../../../services/atlas/noop-atlas-event-publisher';
import {DependencyInjectionHandler} from '../../../../dependency-injection-handler';
import {ConstantsBindings, ServicesBindings} from '../../../../dependency-injection-bindings';

const sandbox = sinon.createSandbox();

const QUEUE_URL = 'http://localhost:4566/000000000000/atlas-swap-events.fifo';

const event: AtlasEvent = {
  event_id: '2b0a2f8c-5a4a-4a6f-8a4c-6d1b2f3a4c5d',
  event_type: AtlasEventType.SWAP_CREATED,
  swap_id: '0x8e0b47b0c60f7e02b41ee1b7d4f0d4e3f9a1c2b3d4e5f60718293a4b5c6d7e8f',
  swap_type: ATLAS_SWAP_TYPE,
  source: ATLAS_SOURCE,
  schema_version: ATLAS_SCHEMA_VERSION,
  emitted_at: '2024-05-01T10:00:00.000Z',
  data: {
    provider: 'powpeg',
    source_chain: 'rootstock_testnet',
    destination_chain: 'bitcoin_testnet',
    input_asset: 'RBTC',
    output_asset: 'BTC',
    input_amount: '0.10000000',
    input_amount_usd: null,
    wallet_address: '0x40d2878B98A9C5A5b7bc3B2FC0e26dfDefCfe737',
    wallet_type: null,
    quote_id: null,
  },
};

describe('Service: SqsAtlasEventPublisher', () => {
  const originalEnv = {
    queueUrl: process.env.ATLAS_SQS_QUEUE_URL,
    endpoint: process.env.ATLAS_SQS_ENDPOINT,
    region: process.env.AWS_REGION,
    enabled: process.env.ATLAS_EVENTS_ENABLED,
  };

  beforeEach(() => {
    process.env.ATLAS_SQS_QUEUE_URL = QUEUE_URL;
    process.env.ATLAS_SQS_ENDPOINT = 'http://localhost:4566';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    sandbox.restore();
    restore('ATLAS_SQS_QUEUE_URL', originalEnv.queueUrl);
    restore('ATLAS_SQS_ENDPOINT', originalEnv.endpoint);
    restore('AWS_REGION', originalEnv.region);
    restore('ATLAS_EVENTS_ENABLED', originalEnv.enabled);
  });

  function restore(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  it('sends the event to the configured queue as a FIFO message', async () => {
    const send = sandbox.stub(SQSClient.prototype, 'send').resolves({MessageId: 'id'} as never);
    const publisher = new SqsAtlasEventPublisher();

    await publisher.publish(event);

    sinon.assert.calledOnce(send);
    const {input} = send.firstCall.args[0] as unknown as {input: Record<string, string>};
    expect(input.QueueUrl).to.equal(QUEUE_URL);
    expect(input.MessageGroupId).to.equal(event.swap_id);
    expect(input.MessageDeduplicationId).to.equal(event.event_id);
  });

  it('sends a parseable body that preserves the whole envelope', async () => {
    const send = sandbox.stub(SQSClient.prototype, 'send').resolves({MessageId: 'id'} as never);
    const publisher = new SqsAtlasEventPublisher();

    await publisher.publish(event);

    const {input} = send.firstCall.args[0] as unknown as {input: Record<string, string>};
    expect(JSON.parse(input.MessageBody)).to.eql(event);
  });

  it('resolves and does not propagate when SQS rejects', async () => {
    sandbox.stub(SQSClient.prototype, 'send').rejects(new Error('queue unavailable'));
    const publisher = new SqsAtlasEventPublisher();

    await publisher.publish(event);
  });

  it('does not touch SQS when the Noop publisher is used', async () => {
    const send = sandbox.stub(SQSClient.prototype, 'send').resolves({} as never);

    await new NoopAtlasEventPublisher().publish(event);

    sinon.assert.notCalled(send);
  });

  describe('feature flag', () => {
    it('is off unless ATLAS_EVENTS_ENABLED is exactly "true"', () => {
      for (const value of ['false', 'TRUE', '1', 'yes', '']) {
        process.env.ATLAS_EVENTS_ENABLED = value;
        expect(isAtlasEventsEnabled()).to.be.false();
      }
      delete process.env.ATLAS_EVENTS_ENABLED;
      expect(isAtlasEventsEnabled()).to.be.false();
      process.env.ATLAS_EVENTS_ENABLED = 'true';
      expect(isAtlasEventsEnabled()).to.be.true();
    });

    it('binds the Noop publisher when disabled', async () => {
      process.env.ATLAS_EVENTS_ENABLED = 'false';
      const send = sandbox.stub(SQSClient.prototype, 'send').resolves({} as never);
      const app = new Application();
      DependencyInjectionHandler.configureDependencies(app);

      expect(await app.get(ConstantsBindings.ATLAS_EVENTS_ENABLED)).to.be.false();
      const publisher = await app.get<NoopAtlasEventPublisher>(ServicesBindings.ATLAS_EVENT_PUBLISHER);
      expect(publisher).to.be.instanceOf(NoopAtlasEventPublisher);

      await publisher.publish(event);
      sinon.assert.notCalled(send);
    });

    it('binds the SQS publisher when enabled', async () => {
      process.env.ATLAS_EVENTS_ENABLED = 'true';
      const app = new Application();
      DependencyInjectionHandler.configureDependencies(app);

      expect(await app.get(ConstantsBindings.ATLAS_EVENTS_ENABLED)).to.be.true();
      const publisher = await app.get<SqsAtlasEventPublisher>(ServicesBindings.ATLAS_EVENT_PUBLISHER);
      expect(publisher).to.be.instanceOf(SqsAtlasEventPublisher);
      publisher.destroy();
    });
  });
});
