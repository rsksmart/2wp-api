import {expect} from '@loopback/testlab';
import Web3 from 'web3';
import {Log} from '../../../models/rsk/log.model';
import {PeginStatus, PeginStatusDataModel} from '../../../models/rsk/pegin-status-data.model';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {RegisterBtcTransactionDataParser} from '../../../services/register-btc-transaction-data.parser';
import {ensure0x, remove0x} from '../../../utils/hex-utils';
import {getRandomAddress} from '../../helper';

const LOCK_BTC_SIGNATURE = '0xec2232bdbe54a92238ce7a6b45d53fb31f919496c6abe1554be1cc8eddb6600a';
const PEGIN_BTC_SIGNATURE = '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a';
const REJECTED_PEGIN_SIGNATURE = '0x708ce1ead20561c5894a93be3fee64b326b2ad6c198f8253e4bb56f1626053d6';
const RELEASE_REQUESTED_SIGNATURE = '0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790';
const UNREFUNDABLE_PEGIN_SIGNATURE = '0x69073e221478d71cc3860ecec3a103276058912f7ebbbb37422d597842b1f4fb';
const REGISTER_BTC_TRANSACTION_SIGNATURE = '0x43dc0656';

const BRIDGE_ABI = [{
  "name": "registerBtcTransaction",
  "type": "function",
  "constant": true,
  "inputs": [
    {
      "name": "tx",
      "type": "bytes"
    },
    {
      "name": "height",
      "type": "int256"
    },
    {
      "name": "pmt",
      "type": "bytes"
    }
  ],
  "outputs": []
}];

const encodeRegisterBtcTransactionParameters = (tx: string, height: number, pmt: string) => {
  const web3 = new Web3();
  const registerBtcTransactionAbi = BRIDGE_ABI.find(m => m.name == 'registerBtcTransaction');
  if (!registerBtcTransactionAbi) {
    throw new Error('registerBtcTransaction can\'t be found in bridge ABI!');
  }
  return web3.eth.abi.encodeParameters(
    registerBtcTransactionAbi.inputs,
    [tx, height, pmt]
  );
};

const txHash = '0x604aaf3de25d0ab07c209b564cf1a4e7084e8750eaef23bf89966a1d2e7f19ad';

const getFakeRegisterBtcTransactionData = () => {
  const rawTx = ensure0x('0200000000010272c877b54c252ae3eaf4062ee80f8bc7d48e7d18269ecf319a0d7607def42e62000000004847304402202eb62bf7492cd45d8301ab6b4abfacd1a14d4bf74eb3c90aeb87f40b1d5be0ca022038ac9549765b7ad952c098e7b96dbc69cfc4ad0c5d4191e56fe618883a57057b01feffffffe679416ea007ea3515758bc5849dcabc423e840572074202d8cabbb532899e0f010000001716001468b4bdc83bda13fd1fe03a882508508f474fe3a8feffffff02438a1200000000001976a914a4cafae1627623d26e9bd72193beb863cd26b91088ac00e1f505000000001976a91499d7a8922b29bf765bc0ed4f208c29a1681d652988ac000247304402202c2dadda8ef412d58cbc30978257aee3c7e27add6d04e8d091b218a86e20263202204ebecb32500fe15075d9bc0ebc9709fd8df19fd560a695f9cabc7bf49874f1ff01210307d079a1a8d804c1f532104867114402a7b7eee84dfc01d73687e32c2677bb8474070000');;
  return remove0x(encodeRegisterBtcTransactionParameters(rawTx, 1, ensure0x('')));
};

describe('Service: RegisterBtcTransactionDataParser', () => {

  it('parses a transaction with no logs as null', async () => {
    let tx = new RskTransaction();
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.null;
  });

  it('parses a transaction with a random log as null', async () => {
    let tx = new RskTransaction();
    tx.logs.push(new Log());
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.null;
  });

  it('parses a transaction with a PEGIN_BTC log properly', async () => {
    let recipient = getRandomAddress();

    let tx = new RskTransaction();
    tx.data = REGISTER_BTC_TRANSACTION_SIGNATURE + getFakeRegisterBtcTransactionData();
    let log = new Log();
    log.topics = [PEGIN_BTC_SIGNATURE, recipient];
    tx.logs.push(log);
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      expect(result.rskRecipient).to.be.equal(recipient);
      expect(result.status).to.be.equal(PeginStatus.LOCKED);
      expect(result.btcTxId).to.be.equal(txHash);
    }
  });

  it('parses a transaction with a LOCK_BTC log properly', async () => {
    let tx = new RskTransaction();
    tx.data = REGISTER_BTC_TRANSACTION_SIGNATURE + getFakeRegisterBtcTransactionData();
    let log = new Log();
    log.topics = [LOCK_BTC_SIGNATURE];
    tx.logs.push(log);
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      expect(result.rskRecipient).to.be.null; // ATM the parsing of a LOCK_BTC can't set the recipient
      expect(result.status).to.be.equal(PeginStatus.LOCKED);
      expect(result.btcTxId).to.be.equal(txHash);
    }
  });

  it('parses a transaction with just a REJECTED_PEGIN log as null (should never happen :))', async () => {
    let tx = new RskTransaction();
    tx.data = REGISTER_BTC_TRANSACTION_SIGNATURE + getFakeRegisterBtcTransactionData();
    let log = new Log();
    log.topics = [REJECTED_PEGIN_SIGNATURE];
    tx.logs.push(log);
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.null;
  });

  it('parses a transaction with REJECTED_PEGIN and RELEASE_REQUESTED logs as a rejected pegin with refund', async () => {
    let tx = new RskTransaction();
    tx.data = REGISTER_BTC_TRANSACTION_SIGNATURE + getFakeRegisterBtcTransactionData();
    let log = new Log();
    log.topics = [REJECTED_PEGIN_SIGNATURE, RELEASE_REQUESTED_SIGNATURE];
    tx.logs.push(log);
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      expect(result.rskRecipient).to.be.null; // ATM the parsing of a REJECTED_PEGIN can't set the recipient
      expect(result.status).to.be.equal(PeginStatus.REJECTED_REFUND);
      expect(result.btcTxId).to.be.equal(txHash);
    }
  });

  it('parses a transaction with REJECTED_PEGIN and UNREFUNDABLE_PEGIN logs as a rejected pegin with no refund', async () => {
    let tx = new RskTransaction();
    tx.data = REGISTER_BTC_TRANSACTION_SIGNATURE + getFakeRegisterBtcTransactionData();
    let log = new Log();
    log.topics = [REJECTED_PEGIN_SIGNATURE, UNREFUNDABLE_PEGIN_SIGNATURE];
    tx.logs.push(log);
    const thisService = new RegisterBtcTransactionDataParser();
    let result = await thisService.parse(tx);

    expect(result).to.be.instanceOf(PeginStatusDataModel);
    if (result) {
      expect(result.rskRecipient).to.be.null; // ATM the parsing of a REJECTED_PEGIN can't set the recipient
      expect(result.status).to.be.equal(PeginStatus.REJECTED_NO_REFUND);
      expect(result.btcTxId).to.be.equal(txHash);
    }
  });

});
