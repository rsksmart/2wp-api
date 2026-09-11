#!/usr/bin/env node
/**
 * Creates the Atlas SWAP events FIFO queue.
 *
 * LocalStack's `init/ready.d` hooks (see `ci/localstack-init`) do not run when
 * LocalStack is started as a GitHub Actions service container, so the queue is
 * created explicitly there. Written against the AWS SDK already in the
 * dependency tree rather than the AWS CLI, so it behaves the same on a hosted
 * runner and under `act`.
 */
const {SQSClient, CreateQueueCommand} = require('@aws-sdk/client-sqs');

const region = process.env.AWS_REGION || 'us-east-1';
const endpoint = process.env.ATLAS_SQS_ENDPOINT || 'http://localhost:4566';
const queueName = process.env.ATLAS_SQS_QUEUE_NAME || 'atlas-swap-events.fifo';

async function main() {
  const client = new SQSClient({region, endpoint});
  try {
    const {QueueUrl} = await client.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {FifoQueue: 'true', ContentBasedDeduplication: 'false'},
      }),
    );
    console.log(QueueUrl);
  } finally {
    client.destroy();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
