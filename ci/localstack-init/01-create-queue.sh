#!/bin/bash
set -euo pipefail

awslocal sqs create-queue \
  --queue-name atlas-swap-events.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false
