import { expect } from '@loopback/testlab';
import { FlyoverService } from '../../../services/flyover.service';
import { RegisterPayload } from '../../../models/register-payload.model';
import { RskNodeService } from '../../../services/rsk-node.service';
import sinon from 'sinon';
import { MongoDbDataSource } from '../../../datasources/mongodb.datasource';

describe('Service: FlyoverService', () => {
  let flyoverService: FlyoverService;
  let rskNodeService: RskNodeService;

  beforeEach(() => {
    rskNodeService = new RskNodeService();
    const mongoDbDataSource = sinon.createStubInstance(MongoDbDataSource);
    flyoverService = new FlyoverService(mongoDbDataSource);
  });

  afterEach(() => {
    sinon.restore();
  });
	describe('Register:', () => {
    it('should register a pegin native transaction successfully', async () => {
        const mockBlockNumber = 1000;
        sinon.stub(rskNodeService, 'getBlockNumber').resolves(mockBlockNumber);
        sinon.stub(flyoverService, 'set').resolves(true);
    
        const payload: RegisterPayload = new RegisterPayload( {
					"txHash": "996de55f617c8aeb470cd8f0afd829de5169f8bedbc8bc8d45bb0ba656b0385e",
					"type": "pegin",
					"wallet": "leather",
					"addressType": "Native segwit",
					"value": "500000",
					"fee": "1596"
				});

        const result = await flyoverService.register(payload);
        expect(result).to.be.true();
    });
		it('should register a pegout native transaction successfully', async () => {
			const mockBlockNumber = 1000;
			sinon.stub(rskNodeService, 'getBlockNumber').resolves(mockBlockNumber);
			sinon.stub(flyoverService, 'set').resolves(true);
	
			const payload: RegisterPayload = new RegisterPayload( {
					"txHash": "0x807f14318a2f4bc62ae3a14370c243087464740fb2f5b16763f2fb1635708bb4",
					"type": "pegout",
					"value": "8000000000000000",
					"wallet": "Metamask",
					"btcEstimatedFee": "745632",
					"rskGas": "234858360000"
				});

			const result = await flyoverService.register(payload);
			expect(result).to.be.true();
		});
		it('should register a pegout flyover transaction successfully', async () => {
			const mockBlockNumber = 1000;
			sinon.stub(rskNodeService, 'getBlockNumber').resolves(mockBlockNumber);
			sinon.stub(flyoverService, 'set').resolves(true);
	
			const payload: RegisterPayload = new RegisterPayload( {
				"txHash": "0xebafb8b598395d07693e7de1e585fa518293a49b7598b5f33a525a62c09abe78",
				"type": "pegout",
				"value": "5000000000000000",
				"wallet": "Metamask",
				"rskGas": "79040000000000",
				"fee": "100000000000000",
				"provider": "RSK Provider",
				"details": {
					"senderAddress": "0x7509517a1880B14C9d734c55fAc18C7737EC11c5",
					"recipientAddress": "tb1qndk5wmvg0k6p8mg2t8amr65qa4qkg8nstsnea7",
					"blocksToCompleteTransaction": "10"
				},
				"quote": {
					"agreementTimestamp": "1740092905",
					"btcRefundAddress": "tb1qndk5wmvg0k6p8mg2t8amr65qa4qkg8nstsnea7",
					"callFeeOnWei": "100000000000000",
					"depositAddr": "tb1qndk5wmvg0k6p8mg2t8amr65qa4qkg8nstsnea7",
					"depositConfirmations": "10",
					"depositDateLimit": "1740100105",
					"expireBlocks": "6094589",
					"expireDate": "1740093405",
					"gasFeeOnWei": "79040000000000",
					"lbcAddress": "0xc2A630c053D12D63d32b025082f6Ba268db18300",
					"liquidityProviderRskAddress": "0x7c4890a0f1d4bbf2c669ac2d1effa185c505359b",
					"lpBtcAddress": "mvL2bVzGUeC9oqVyQWJ4PxQspFzKgjzAqe",
					"nonce": "8353044002070248232",
					"penaltyFeeOnWei": "10000000000000",
					"productFeeAmountOnWei": "0",
					"rskRefundAddress": "0x7509517a1880B14C9d734c55fAc18C7737EC11c5",
					"transferConfirmations": "2",
					"transferTime": "7200",
					"valueOnWei": "5000000000000000"
				},
				"quoteHash": "70f5973bf6ac8d5ba00ec0f1204b4d372038a953ada2022540654d9a33511b41",
				"acceptedQuoteSignature": "ba40a7fe2af7211d2fb788c5d9cbfced7caab5a932fdecc9910df450fc992b613a5118432edcf6045658f9289c0fac802d9ceba093274719d1a839897a49c67f1b"
			});

			const result = await flyoverService.register(payload);
			expect(result).to.be.true();
		});
		it('should register a pegin flyover transaction successfully', async () => {
			const mockBlockNumber = 1000;
			sinon.stub(rskNodeService, 'getBlockNumber').resolves(mockBlockNumber);
			sinon.stub(flyoverService, 'set').resolves(true);
	
			const payload: RegisterPayload = new RegisterPayload( {
				"acceptedQuoteSignature": "bab6986b5eee4e9455079155d33908b3b81ae2d090deabf8f04fcc5ef911486a4c9a7a2545af1fccfbdf56777a25c0c6a045eaba92355123454881dc0ba1f32c1c",
				"addressType": "Native segwit",
				"details": {
						"blocksToCompleteTransaction": "2",
						"recipientAddress": "0x7509517a1880b14c9d734c55fac18c7737ec11c5",
						"senderAddress": "tb1qndk5wmvg0k6p8mg2t8amr65qa4qkg8nstsnea7"
				},
				"fee": "11028",
				"provider": "teks-staging",
				"quote": {
						"agreementTimestamp": "1740086704",
						"btcRefundAddress": "mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8",
						"callFeeOnSatoshi": "10000",
						"callOnRegister": false,
						"confirmations": "2",
						"contractAddr": "0x7509517a1880b14c9d734c55fac18c7737ec11c5",
						"data": "0x",
						"fedBTCAddr": "2N3GznpmcBbymsK53Q1eh4NCorKbYN9wKr2",
						"gasFeeOnWei": "111872628000",
						"gasLimit": "21000",
						"lbcAddress": "0xc2A630c053D12D63d32b025082f6Ba268db18300",
						"liquidityProviderRskAddress": "0x113ed582b39490cada59b7fc6cffe1dd4cba5e4b",
						"lpBtcAddress": "mtkgpHyZzRspgkt3nUNV7xJRrwnMCPbuPW",
						"lpCallTime": "14400",
						"nonce": "1746424005804806700",
						"penaltyFeeOnWei": "10000000000000",
						"productFeeAmountOnSatoshi": "0",
						"rskRefundAddress": "0x7509517a1880b14c9d734c55fac18c7737ec11c5",
						"timeForDepositInSeconds": "10800",
						"valueOnSatoshi": "500000"
				},
				"quoteHash": "f49c2190c649100e26518937bf072eb172c5e938089f277ebbb2e355dcf00ddc",
				"txHash": "da7cc5b956607830e70c13ab26225439f2f2a427715ed81d8ca714bdf381d7ce",
				"type": "pegin",
				"value": "500000",
				"wallet": "leather"
			});

			const result = await flyoverService.register(payload);
			expect(result).to.be.true();
		});
  });
});
