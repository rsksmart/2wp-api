import {
  createStubInstance,
  expect,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {SessionRepository} from '../../repositories';
import {BalanceController} from '../../controllers';
import {UtxoProvider} from '../../services';
import {sinon} from '@loopback/testlab/dist/sinon';
import {AccountBalance, GetBalance, WalletAddress} from '../../models';

describe('balance controller', () => {
  let utxoProviderService: UtxoProvider;
  let utxoProvider: sinon.SinonStub;
  let sessionRepository: StubbedInstanceWithSinonAccessor<SessionRepository>;
  let balanceController: BalanceController;
  const request: GetBalance = new GetBalance({
    sessionId: '77fdc76e4da0b9fb9d75d46b0961b34e',
    addressList: [
      {
        path: [2147483692, 2147483649, 2147483648, 0, 0],
        serializedPath: "m/44'/1'/0'/0/0",
        address: 'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1',
      },
      {
        path: [2147483692, 2147483649, 2147483648, 1, 0],
        serializedPath: "m/44'/1'/0'/1/0",
        address: 'mqCjBpQ75Y5sSGzFtJtSQQZqhJze9eaKjV',
      },
      {
        path: [2147483697, 2147483649, 2147483648, 0, 0],
        serializedPath: "m/49'/1'/0'/0/0",
        address: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
      },
      {
        path: [2147483697, 2147483649, 2147483648, 1, 0],
        serializedPath: "m/49'/1'/0'/1/0",
        address: '2NCZ2CNYiz4rrHq3miUHerUMcLyeWU4gw9C',
      },
      {
        path: [2147483732, 2147483649, 2147483648, 0, 0],
        serializedPath: "m/84'/1'/0'/0/0",
        address: 'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0',
      },
      {
        path: [2147483732, 2147483649, 2147483648, 1, 0],
        serializedPath: "m/84'/1'/0'/1/0",
        address: 'tb1qfuk3j0l4qn4uzstc47uwk68kedmjwuucl7avqr',
      },
    ].map(obj => new WalletAddress(obj)),
  });
  beforeEach(resetRepositories);

  function resetRepositories() {
    utxoProviderService = {utxoProvider: sinon.stub()};
    utxoProvider = utxoProviderService.utxoProvider as sinon.SinonStub;
    sessionRepository = createStubInstance(SessionRepository);
    balanceController = new BalanceController(
      utxoProviderService,
      sessionRepository,
    );
  }
  it('should return a computed balance for a set of addresses', async () => {
    utxoProvider.resolves([
      {
        txid: '',
        vout: 0,
        amount: 0.000001,
        satoshis: 100,
        height: 3254698,
        confirmations: 1542,
      },
    ]);
    const balance = await balanceController.getBalance(request);
    sinon.assert.callCount(utxoProvider, 6);
    sinon.assert.called(sessionRepository.stubs.replaceById);
    expect(balance).deepEqual(
      new AccountBalance({
        segwit: 200,
        nativeSegwit: 200,
        legacy: 200,
      }),
    );
  });
});
