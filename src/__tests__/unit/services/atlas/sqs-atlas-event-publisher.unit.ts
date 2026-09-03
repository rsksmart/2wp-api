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
import {
  SqsAtlasEventPublisher,
  assertQueueUrlConfigured,
} from '../../../../services/atlas/sqs-atlas-event-publisher';
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

  describe('publication metric', () => {
    it('records a success when SQS accepts the message', async () => {
      sandbox.stub(SQSClient.prototype, 'send').resolves({MessageId: 'id'} as never);
      const publisher = new SqsAtlasEventPublisher();

      await publisher.publish(event, 'pegout');

      expect(publisher.metrics.total('success', event.event_type, 'pegout')).to.equal(1);
      expect(publisher.metrics.total('failure', event.event_type, 'pegout')).to.equal(0);
      publisher.destroy();
    });

    it('records a failure when SQS rejects it, and still does not throw', async () => {
      sandbox.stub(SQSClient.prototype, 'send').rejects(new Error('queue unavailable'));
      const publisher = new SqsAtlasEventPublisher();

      await publisher.publish(event, 'pegin');

      expect(publisher.metrics.total('failure', event.event_type, 'pegin')).to.equal(1);
      expect(publisher.metrics.total('success', event.event_type, 'pegin')).to.equal(0);
      publisher.destroy();
    });

    // Counters are keyed by flow and event type, so a peg-in rejection must not
    // land in the peg-out bucket, nor be confused with a swap.created.
    it('counts a peg-in rejection under its own flow and event type', async () => {
      sandbox.stub(SQSClient.prototype, 'send').resolves({MessageId: 'id'} as never);
      const publisher = new SqsAtlasEventPublisher();
      const rejection = {
        ...event,
        event_id: '7c1f0f4e-2b3a-4d5c-8e6f-9a0b1c2d3e4f',
        event_type: AtlasEventType.SWAP_REJECTED,
        data: {
          error_category: 'validation',
          error_code: 'PEGIN_V1_INVALID_PAYLOAD',
          error_message: 'Peg-in rejected by the Bridge: PEGIN_V1_INVALID_PAYLOAD',
          refund_applicable: true,
        },
      } as AtlasEvent;

      await publisher.publish(rejection, 'pegin');

      expect(publisher.metrics.total('success', AtlasEventType.SWAP_REJECTED, 'pegin')).to.equal(1);
      expect(publisher.metrics.total('success', AtlasEventType.SWAP_REJECTED, 'pegout')).to.equal(0);
      expect(publisher.metrics.total('success', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(0);
      publisher.destroy();
    });

    it('records a failed peg-in rejection as a loss, not a success', async () => {
      sandbox.stub(SQSClient.prototype, 'send').rejects(new Error('queue unavailable'));
      const publisher = new SqsAtlasEventPublisher();
      const rejection = {...event, event_type: AtlasEventType.SWAP_REJECTED} as AtlasEvent;

      await publisher.publish(rejection, 'pegin');

      expect(publisher.metrics.total('failure', AtlasEventType.SWAP_REJECTED, 'pegin')).to.equal(1);
      expect(publisher.metrics.total('success', AtlasEventType.SWAP_REJECTED, 'pegin')).to.equal(0);
      publisher.destroy();
    });

    // A metric named published_total must not count events that were never
    // published: with the flag off nothing reaches the queue and nothing counts.
    it('counts nothing when the Noop publisher discards the event', async () => {
      const publisher = new NoopAtlasEventPublisher();

      await publisher.publish(event, 'pegin');

      expect(publisher.metrics.total('success', event.event_type, 'pegin')).to.equal(0);
      expect(publisher.metrics.total('failure', event.event_type, 'pegin')).to.equal(0);
    });
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
      DependencyInjectionHandler.configureDaemonDependencies(app);

      expect(await app.get(ConstantsBindings.ATLAS_EVENTS_ENABLED)).to.be.false();
      const publisher = await app.get<NoopAtlasEventPublisher>(ServicesBindings.ATLAS_EVENT_PUBLISHER);
      expect(publisher).to.be.instanceOf(NoopAtlasEventPublisher);

      await publisher.publish(event);
      sinon.assert.notCalled(send);
    });

    it('binds the SQS publisher when enabled', async () => {
      process.env.ATLAS_EVENTS_ENABLED = 'true';
      const app = new Application();
      DependencyInjectionHandler.configureDaemonDependencies(app);

      expect(await app.get(ConstantsBindings.ATLAS_EVENTS_ENABLED)).to.be.true();
      const publisher = await app.get<SqsAtlasEventPublisher>(ServicesBindings.ATLAS_EVENT_PUBLISHER);
      expect(publisher).to.be.instanceOf(SqsAtlasEventPublisher);
      publisher.destroy();
    });
  });

  // An empty queue url does not disable publication, it breaks it: every send
  // would fail, be swallowed by publish(), and the events lost with no retry.
  // A daemon with the switch on and no queue is misconfigured, so it aborts.
  describe('queue url configuration', () => {
    it('throws when ATLAS_SQS_QUEUE_URL is unset', () => {
      delete process.env.ATLAS_SQS_QUEUE_URL;

      expect(() => new SqsAtlasEventPublisher()).to.throw(/ATLAS_SQS_QUEUE_URL is not set/);
    });

    it('throws when ATLAS_SQS_QUEUE_URL is empty or blank', () => {
      for (const value of ['', '   ', '\t']) {
        process.env.ATLAS_SQS_QUEUE_URL = value;
        expect(() => new SqsAtlasEventPublisher()).to.throw(/ATLAS_SQS_QUEUE_URL is not set/);
      }
    });

    it('returns the trimmed url when it is configured', () => {
      process.env.ATLAS_SQS_QUEUE_URL = `  ${QUEUE_URL}  `;

      expect(assertQueueUrlConfigured()).to.equal(QUEUE_URL);
    });

    // The failure has to surface where the daemon starts, not on the first
    // peg-out hours later.
    it('fails the daemon binding when enabled without a queue url', () => {
      process.env.ATLAS_EVENTS_ENABLED = 'true';
      delete process.env.ATLAS_SQS_QUEUE_URL;
      const app = new Application();
      DependencyInjectionHandler.configureDaemonDependencies(app);

      return expect(
        app.get(ServicesBindings.ATLAS_EVENT_PUBLISHER),
      ).to.be.rejectedWith(/ATLAS_SQS_QUEUE_URL is not set/);
    });

    // With the switch off no queue is needed, so a missing url must not stop
    // the daemon from booting.
    it('does not require a queue url while the switch is off', async () => {
      process.env.ATLAS_EVENTS_ENABLED = 'false';
      delete process.env.ATLAS_SQS_QUEUE_URL;
      const app = new Application();
      DependencyInjectionHandler.configureDaemonDependencies(app);

      const publisher = await app.get<NoopAtlasEventPublisher>(ServicesBindings.ATLAS_EVENT_PUBLISHER);
      expect(publisher).to.be.instanceOf(NoopAtlasEventPublisher);
    });
  });

  // publish() is documented never to reject. With the feature off the logger is
  // the only thing that can fail, and it must not take peg processing down.
  it('resolves even if the logger throws while discarding the event', async () => {
    const publisher = new NoopAtlasEventPublisher();
    sandbox
      .stub(publisher['logger'], 'debug')
      .throws(new Error('log pipeline unavailable'));

    await publisher.publish(event, 'pegin');
  });
});
