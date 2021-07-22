import {sha256} from 'js-sha256';
import {remove0x} from './hex-utils';

export const calculateBtcTxHash = (transaction: string) => {
  let buffer = Buffer.from(remove0x(transaction), 'hex');
  let hash = sha256(buffer);
  buffer = Buffer.from(hash, 'hex');
  hash = sha256(buffer);
  let bufferedHash = Buffer.from(hash, 'hex');
  bufferedHash.reverse();
  return bufferedHash.toString('hex');
};
