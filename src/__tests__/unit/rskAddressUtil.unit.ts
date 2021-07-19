import {expect} from '@loopback/testlab';
import {RskAddressUtilImplementation} from '../../utils/rskAddressUtils';

describe('RskAddressUtil', () => {
  const utils = new RskAddressUtilImplementation();

  it('Verify RSK Address derivation from sender ', async () => {
    const data = '483045022100f0fc7ee92939b95d4b28c4443147ab05c4e4e4d0f054e6eebae8a5c72e5f60f302205be8d9eb2ed2883eb1145d96b78ca9aa30050a7acf5696ed13e3e27aef8a4b20012102b495b736715d9d4637d130fc95bae49702b66872c577bf052aa160f54c44748a';
    const rskAddress = 'mmKHb84m7CyVWT1u9WMfNzQrwdM9QZMkYv';

    const addressDerivated = utils.getRskAddressFromPubKeyHash(data);
    expect.equal(rskAddress, addressDerivated);
  });
  it('Verify RSK Address derivation from OP_RETURN', async () => {
    const data = '6a2e52534b5401729549cce0d0c78cb1dec0772002a29a57f875b001a9f52aa98bc503ce36f5a0cf3d7a8d62f7730401';

    const rskAddress = 'mw1cBx6mmA9h3PKDDqLAW6Nw2pe6vV1xDg';

    const addressDerivated = utils.getRskAddressFromOpReturn(data.substring(34, 54));
    expect.equal(rskAddress, addressDerivated);
  });
});
