import {expect} from '@loopback/testlab';
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import Ajv, {ValidateFunction} from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import {randomBytes} from 'crypto';
import {AtlasEvent, AtlasEventType} from '../../models/atlas/atlas-event.model';
import {PegoutAtlasEventBuilder} from '../../services/atlas/pegout-atlas-event.builder';
import {SqsAtlasEventPublisher} from '../../services/atlas/sqs-atlas-event-publisher';
import {
  PegoutStatusDbDataModel,
  PegoutStatuses,
} from '../../models/rsk/pegout-status-data-model';
import {
  PeginAtlasEventBuilder,
  PeginAtlasEventContext,
} from '../../services/atlas/pegin-atlas-event.builder';
import {
  PeginStatus,
  PeginStatusDataModel,
} from '../../models/rsk/pegin-status-data.model';

const QUEUE_NAME = 'atlas-swap-events.fifo';
const SCHEMA_PATH = path.resolve(process.cwd(), 'schemas/atlas-swap-event.schema.json');

function withDefault(name: string, value: string): void {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

withDefault('NETWORK', 'testnet');
withDefault('RSK_PEGOUT_MINIMUM_CONFIRMATIONS', '10');
withDefault('AWS_REGION', 'us-east-1');
withDefault('AWS_ACCESS_KEY_ID', 'test');
withDefault('AWS_SECRET_ACCESS_KEY', 'test');
withDefault('ATLAS_SQS_ENDPOINT', 'http://localhost:4566');

function givenSwapId(): string {
  return `0x${randomBytes(32).toString('hex')}`;
}

function givenPegin(swapId: string, status: PeginStatus): PeginStatusDataModel {
  const pegin = new PeginStatusDataModel();
  pegin.btcTxId = swapId;
  pegin.status = status;
  pegin.createdOn = new Date('2024-05-01T10:00:00.000Z');
  pegin.rskTxId = `0x${randomBytes(32).toString('hex')}`;
  pegin.rskBlockHeight = 1;
  pegin.rskRecipient = '0x2D623170Cb518434af6c02602334610f194818c1';
  return pegin;
}

function givenPegout(
  swapId: string,
  status: PegoutStatuses,
  data: Partial<PegoutStatusDbDataModel> = {},
): PegoutStatusDbDataModel {
  const pegout = new PegoutStatusDbDataModel();
  pegout.originatingRskTxHash = swapId;
  pegout.rskTxHash = swapId;
  pegout.rskSenderAddress = '0x40d2878B98A9C5A5b7bc3B2FC0e26dfDefCfe737';
  pegout.btcTxHash = randomBytes(32).toString('hex');
  pegout.createdOn = new Date('2024-05-01T10:00:00.000Z');
  pegout.valueRequestedInSatoshis = 10000000;
  pegout.valueInSatoshisToBeReceived = 9995000;
  pegout.status = status;
  return Object.assign(pegout, data);
}

describe('Integration: Atlas peg events over SQS', function () {
  this.timeout(30000);

  let client: SQSClient;
  let publisher: SqsAtlasEventPublisher;
  let validate: ValidateFunction;
  let queueUrl: string;

  before(async () => {
    client = new SQSClient({
      region: process.env.AWS_REGION,
      endpoint: process.env.ATLAS_SQS_ENDPOINT,
    });
    // Idempotent: the queue already exists when created by the LocalStack init
    // hook (docker compose) or by the CI step.
    const {QueueUrl} = await client.send(new CreateQueueCommand({
      QueueName: QUEUE_NAME,
      Attributes: {FifoQueue: 'true', ContentBasedDeduplication: 'false'},
    }));
    queueUrl = QueueUrl!;
    process.env.ATLAS_SQS_QUEUE_URL = queueUrl;
    publisher = new SqsAtlasEventPublisher();

    const ajv = new Ajv({allErrors: true, strict: false});
    addFormats(ajv);
    validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
  });

  after(async () => {
    await drain(20);
    publisher?.destroy();
    client?.destroy();
  });

  beforeEach(async () => {
    await drain(20);
  });

  /**
   * Receives and deletes up to `max` messages, returning them in arrival order.
   * Deleting as we go releases the FIFO message group so the next message of
   * the same peg-out becomes visible.
   */
  async function drain(max: number, minimum = 0): Promise<Message[]> {
    const messages: Message[] = [];
    let emptyPolls = 0;
    while (messages.length < max && emptyPolls < 3) {
      const {Messages} = await client.send(new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
        MessageSystemAttributeNames: ['MessageGroupId', 'MessageDeduplicationId'],
      }));
      if (!Messages?.length) {
        if (messages.length >= minimum && minimum > 0) {
          break;
        }
        emptyPolls++;
        continue;
      }
      emptyPolls = 0;
      for (const message of Messages) {
        messages.push(message);
        await client.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      }
    }
    return messages;
  }

  function parse(message: Message): AtlasEvent {
    return JSON.parse(message.Body!) as AtlasEvent;
  }

  function expectValid(event: AtlasEvent): void {
    validate(event);
    expect(validate.errors ?? []).to.be.empty();
  }

  it('delivers created, pending and completed of one peg-out in order', async () => {
    const swapId = givenSwapId();
    const created = PegoutAtlasEventBuilder.build(
      givenPegout(swapId, PegoutStatuses.RECEIVED),
    )!;
    const pending = PegoutAtlasEventBuilder.build(
      givenPegout(swapId, PegoutStatuses.WAITING_FOR_CONFIRMATION, {
        rskTxHash: `${swapId}_0`,
        createdOn: new Date('2024-05-01T10:01:00.000Z'),
      }),
    )!;
    const completed = PegoutAtlasEventBuilder.build(
      givenPegout(swapId, PegoutStatuses.RELEASE_BTC, {
        rskTxHash: `${swapId}___0`,
        createdOn: new Date('2024-05-01T10:03:04.000Z'),
      }),
      {receivedCreatedOn: new Date('2024-05-01T10:00:00.000Z')},
    )!;

    await publisher.publish(created);
    await publisher.publish(pending);
    await publisher.publish(completed);

    const messages = await drain(10, 3);
    expect(messages).to.have.length(3);

    const events = messages.map(parse);
    expect(events.map(event => event.event_type)).to.eql([
      AtlasEventType.SWAP_CREATED,
      AtlasEventType.SWAP_PENDING,
      AtlasEventType.SWAP_COMPLETED,
    ]);
    events.forEach(event => {
      expect(event.swap_id).to.equal(swapId);
      expectValid(event);
    });
    messages.forEach(message => {
      expect(message.Attributes?.MessageGroupId).to.equal(swapId);
    });
  });

  it('uses a distinct message group per peg-out', async () => {
    const firstSwapId = givenSwapId();
    const secondSwapId = givenSwapId();

    await publisher.publish(
      PegoutAtlasEventBuilder.build(givenPegout(firstSwapId, PegoutStatuses.RECEIVED))!,
    );
    await publisher.publish(
      PegoutAtlasEventBuilder.build(givenPegout(secondSwapId, PegoutStatuses.RECEIVED))!,
    );

    const messages = await drain(10, 2);
    expect(messages).to.have.length(2);

    const groupIds = messages.map(message => message.Attributes?.MessageGroupId);
    expect(new Set(groupIds).size).to.equal(2);
    expect(groupIds.sort()).to.eql([firstSwapId, secondSwapId].sort());
    messages.map(parse).forEach(expectValid);
  });

  it('deduplicates a re-sent event_id inside the FIFO deduplication window', async () => {
    const swapId = givenSwapId();
    const event = PegoutAtlasEventBuilder.build(givenPegout(swapId, PegoutStatuses.RECEIVED))!;

    await publisher.publish(event);
    await publisher.publish(event);

    const messages = await drain(10);
    expect(messages).to.have.length(1);
    expect(parse(messages[0]).event_id).to.equal(event.event_id);
    expect(messages[0].Attributes?.MessageDeduplicationId).to.equal(event.event_id);
  });

  it('delivers a rejected peg-out as a single message', async () => {
    const swapId = givenSwapId();
    const rejected = PegoutAtlasEventBuilder.build(
      givenPegout(swapId, PegoutStatuses.REJECTED, {reason: 'LOW_AMOUNT'}),
    )!;

    await publisher.publish(rejected);

    const messages = await drain(10, 1);
    expect(messages).to.have.length(1);
    const event = parse(messages[0]);
    expect(event.event_type).to.equal(AtlasEventType.SWAP_REJECTED);
    expectValid(event);
  });

  describe('peg-in', () => {
    // `pegin_btc` / `lock_btc` report satoshis, unlike the peg-out logs.
    const context: PeginAtlasEventContext = {
      amountInSatoshis: '50000000',
      rskRecipient: '0x2D623170Cb518434af6c02602334610f194818c1',
    };

    it('delivers created then completed for a locked peg-in, in order', async () => {
      const swapId = givenSwapId();
      const events = PeginAtlasEventBuilder.build(givenPegin(swapId, PeginStatus.LOCKED), context);
      expect(events).to.have.length(2);

      for (const event of events) {
        await publisher.publish(event, 'pegin');
      }

      const messages = await drain(5, 2);
      expect(messages).to.have.length(2);

      const received = messages.map(parse);
      received.forEach(expectValid);
      expect(received.map(event => event.event_type)).to.eql([
        AtlasEventType.SWAP_CREATED,
        AtlasEventType.SWAP_COMPLETED,
      ]);
      // Both events of one peg-in share the group, so order is guaranteed.
      expect(messages.map(m => m.Attributes?.MessageGroupId)).to.eql([swapId, swapId]);
      expect(received.map(event => event.swap_id)).to.eql([swapId, swapId]);
      expect(received[0].event_id).to.not.equal(received[1].event_id);

      // The Bridge credits the whole amount: nothing is lost between the two.
      const created = received[0].data as {input_amount: string};
      const completed = received[1].data as {output_amount: string; fee: string};
      expect(created.input_amount).to.equal('0.50000000');
      expect(completed.output_amount).to.equal(created.input_amount);
      expect(completed.fee).to.equal('0.00000000');
    });

    // The refundable branch is the one that carries an amount: release_requested
    // is the only log of a rejected peg-in that reports what the user sent.
    it('delivers created before rejected for a refundable peg-in, with the amount', async () => {
      const swapId = givenSwapId();
      const events = PeginAtlasEventBuilder.build(
        givenPegin(swapId, PeginStatus.REJECTED_REFUND),
        {amountInSatoshis: '50000000', rejectedReason: '4'},
      );
      expect(events).to.have.length(2);

      for (const event of events) {
        await publisher.publish(event, 'pegin');
      }

      const messages = await drain(5, 2);
      expect(messages).to.have.length(2);

      const received = messages.map(parse);
      received.forEach(expectValid);
      expect(received.map(event => event.event_type)).to.eql([
        AtlasEventType.SWAP_CREATED,
        AtlasEventType.SWAP_REJECTED,
      ]);
      expect(messages.map(m => m.Attributes?.MessageGroupId)).to.eql([swapId, swapId]);
      expect(received[0].event_id).to.not.equal(received[1].event_id);

      expect((received[0].data as {input_amount: string}).input_amount).to.equal('0.50000000');
      const rejected = received[1].data as {
        error_code: string; error_category: string; refund_applicable: boolean;
      };
      expect(rejected.error_code).to.equal('PEGIN_V1_INVALID_PAYLOAD');
      expect(rejected.error_category).to.equal('validation');
      expect(rejected.refund_applicable).to.be.true();
    });

    // The Bridge rejected the peg-in and emitted no refund branch at all, so
    // the code names that absence rather than a reason it does not have.
    it('delivers a rejection the Bridge left with no refund branch', async () => {
      const swapId = givenSwapId();
      const events = PeginAtlasEventBuilder.build(
        givenPegin(swapId, PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '2'},
      );
      expect(events).to.have.length(2);

      for (const event of events) {
        await publisher.publish(event, 'pegin');
      }

      const messages = await drain(5, 2);
      expect(messages).to.have.length(2);

      const received = messages.map(parse);
      received.forEach(expectValid);
      expect(received.map(event => event.event_type)).to.eql([
        AtlasEventType.SWAP_CREATED,
        AtlasEventType.SWAP_REJECTED,
      ]);
      expect(messages.map(m => m.Attributes?.MessageGroupId)).to.eql([swapId, swapId]);

      const rejected = received[1].data as {
        error_code: string; error_category: string; refund_applicable: boolean;
      };
      expect(rejected.error_code).to.equal('PEGIN_REJECTED_NO_REFUND_BRANCH');
      // Derived from rejected_pegin reason=2, the only reason it has.
      expect(rejected.error_category).to.equal('protocol_violation');
      expect(rejected.refund_applicable).to.be.false();
    });

    it('delivers created before rejected for a rejected peg-in', async () => {
      const swapId = givenSwapId();
      const events = PeginAtlasEventBuilder.build(
        givenPegin(swapId, PeginStatus.REJECTED_NO_REFUND),
        {rejectedReason: '3', unrefundableReason: '1'},
      );
      expect(events).to.have.length(2);

      for (const event of events) {
        await publisher.publish(event, 'pegin');
      }

      const messages = await drain(5, 2);
      expect(messages).to.have.length(2);

      const received = messages.map(parse);
      received.forEach(expectValid);
      expect(received.map(event => event.event_type)).to.eql([
        AtlasEventType.SWAP_CREATED,
        AtlasEventType.SWAP_REJECTED,
      ]);
      // Both transitions of one peg-in share the group, so order is guaranteed.
      expect(messages.map(m => m.Attributes?.MessageGroupId)).to.eql([swapId, swapId]);
      expect(received[0].event_id).to.not.equal(received[1].event_id);
    });
  });

});
