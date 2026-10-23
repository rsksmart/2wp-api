import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {MAX_ADDRESS_INFO_TXIDS} from '../../config/resource-budgets';
import {AddressesInfoController} from '../../controllers';
import {AddressList} from '../../models';
import {BitcoinAddress} from '../../models/bitcoin-address.model';
import {BitcoinService} from '../../services';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../utils/resource-budget';

const ADDRESS = 'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1';

const givenAddressInfo = (txidCount: number): BitcoinAddress =>
  new BitcoinAddress({
    address: ADDRESS,
    balance: '3000',
    totalReceived: '5000',
    totalSent: '2000',
    unconfirmedBalance: '0',
    unconfirmedTxs: '0',
    txs: txidCount,
    txids: Array.from({length: txidCount}, (_, i) => String(i).padStart(64, '0')),
    page: 1,
    totalPages: 1,
    itemsOnPage: txidCount,
  });

describe('AddressesInfoController: resource budgets', () => {
  let bitcoinService: SinonStubbedInstance<BitcoinService> & BitcoinService;
  let controller: AddressesInfoController;

  beforeEach(() => {
    resetMetricCounters();
    bitcoinService = sinon.createStubInstance(
      BitcoinService,
    ) as SinonStubbedInstance<BitcoinService> & BitcoinService;
    controller = new AddressesInfoController(bitcoinService);
  });

  it('leaves a txid list exactly at the budget untouched', async () => {
    bitcoinService.getAddressInfo.resolves(givenAddressInfo(MAX_ADDRESS_INFO_TXIDS));

    const response = await controller.getAddressesInfo(
      new AddressList({addressList: [ADDRESS]}),
    );

    expect(response.addressesInfo![0].txids).to.have.length(MAX_ADDRESS_INFO_TXIDS);
    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.ADDRESS_INFO_TXIDS,
      }),
    ).to.equal(0);
  });

  it('truncates and records a violation one txid over the budget', async () => {
    bitcoinService.getAddressInfo.resolves(
      givenAddressInfo(MAX_ADDRESS_INFO_TXIDS + 1),
    );

    const response = await controller.getAddressesInfo(
      new AddressList({addressList: [ADDRESS]}),
    );

    expect(response.addressesInfo![0].txids).to.have.length(MAX_ADDRESS_INFO_TXIDS);
    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.ADDRESS_INFO_TXIDS,
      }),
    ).to.equal(1);
  });
});
