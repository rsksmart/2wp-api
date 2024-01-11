const jsSHA = require('jssha/sha256');

export function sha256(hexString: string) {
  // eslint-disable-next-line new-cap
  const sha = new jsSHA('SHA-256', 'HEX');
  sha.update(hexString);
  return sha.getHash('HEX');
}

export function doubleSha256(hexString: string) {
  return sha256(sha256(hexString));
}
