# 2wp API

This API exposes a number of methods to perform 2wp operations.

This API uses [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) for bitcoin data types.

## Methods

- [getPeginConfiguration](#getPeginConfiguration)
- [initiateOperation](#initiateOperation)
- [getBalance](#getBalance)
- [createPeginTransaction](#createPeginTransaction)
- [broadcastPeginTransaction](#broadcastPeginTransaction)
- [getPeginStatus](#getPeginStatus)
- [getPegoutConfiguration](#getPegoutConfiguration)

### getPeginConfiguration

```
getPeginConfiguration(): Configuration
```

This method will return a [PeginConfiguration](#PeginConfiguration) object.


### initiateOperation

```
initiateOperation(): String
```

Notes:
- returns: This method starts an operation returning its identifier.

### getBalance

```
getBalance(operationId: String,m addresses: List<String>): Number
```

Notes:
- addresses: should be a list of string encoded BTC addresses (bech32/base58). The API will only process the first 10 addresses.
- returns: This method will return a summatory of the UTXOs balance for the parameterized addresses.

### createPeginTransaction

```
createPeginTransaction(
    operationId: String, 
    amountToTransferInWeis: String, 
    recipient: String, 
    refundAddress: String, 
    feeLevel: FeeLevel
): Buffer
```

Notes:
- amountToTransferInWeis: Weis. Represents the amount the recipient address will receive.
- receipient: RSK address. Where the Weis will be sent.
- refundAddress: String. Base58 address where to return the BTC if the peg-in fails. (Doesn't support BECH32).
- feeLevel: How many satoshis is the user willing to pay for this transaction to be mined. see [FeeLevel](#FeeLevel).
- returns: The constructed transaction, serialized following bitcoin serialization.

### broadcastPeginTransaction

```
broadcastTransaction(operationId: String, rawTransaction: Buffer): String
```

Notes:
- rawTransaction: It is the Buffer representing the signed transaction. It should be bitcoin serialized.
- This method returns the txId for the rawTransaction.

### getPeginStatus

```
getPeginStatus(txId: String): PeginStatus
```

Notes:
- txId: this must be a BTC transaction hash (wtxid).
- returns: status of the pegin. See [PeginStatus](#PeginStatus).

## Data types

### PeginConfiguration

```
{
    minValue: Number,
    maxValue: Number,
    federationAddress: String,
    feePerKB: Number,
    btcConfirmations: Number
}
```

Notes:
- minValue: Satoshis.
- maxValue: Satoshis.
- federationAddress: base58 address.
- feePerKB: Satoshis.
- btcConfirmations: number of BTC blocks for a peg-in transaction to be processed.

### FeeLevel

```
FeeLevel {
    low,
    medium,
    high
}
```

### PeginStatus

```
{
    creationDate: Date,
    amountTransferred: Number,
    recipientAddress: String,
    status: Status,
    peginConfirmations: Number,
    rejectionReason: RejectionReason,
    pegoutStatus: PegoutStatus?
}
```

Notes:
- recipientAddress: rsk recipient address
- [Status](#Status). Status can't be `rejected_no_refund`. If status is `rejected_refund`. pegoutStatus should have more information.
- [RejectionReason](#RejectionReason)
- [PegoutStatus](#PegoutStatus)

### Status

```
Status {
    waiting_confirmations,
    confirmed,
    rejected_no_refund,
    rejected_refund
}
```

- waiting_confirmations: transaction still waiting BTC confirmations
- confirmed: peg-in processed successfully
- rejected_no_refund: peg-in failed and can't be refunded
- rejected_refund: peg-in failed and will be refunded

### PegoutStatus

```
{
    amountToRelease: Number,
    releaseAddress: String,
    pegoutConfirmations: Number,
    released: Boolean
}
```

### RejectionReason

```
RejectionReason {
    lockingCapSurpassed,
    v0_MultisigSender,
    v1_InvalidPayload
}
```