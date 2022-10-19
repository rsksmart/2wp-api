import { RskBlock } from '../../../../models/rsk/rsk-block.model';
import { BlockTransactionObject, Transaction } from 'web3-eth';
import { expect } from '@loopback/testlab';

describe('Model: RskBlock', () => {

    it('should create an RskBlock with a transaction from a web3Block', async () => {

        const hash = '0x0002';
        const parentHash = '0x0001';
        const height = 2;
        const input = '0x000002';
        const transactionHash = '0x002';

        const web3Transaction: Transaction = <Transaction> {
            hash: transactionHash,
            input
        };

        const web3Block: BlockTransactionObject = <BlockTransactionObject> {
            number: height,
            hash,
            parentHash,
            timestamp: 1000,
            transactions: [web3Transaction]
        };

        const rskBlock = RskBlock.fromWeb3BlockWithTransactions(web3Block);

        new Date(Number(web3Block.timestamp) * 1000);

        expect(rskBlock.hash).to.equal(hash);
        expect(rskBlock.parentHash).to.equal(parentHash);
        expect(rskBlock.height).to.equal(height);
        expect(rskBlock.transactions[0].blockHash).to.equal(hash);
        expect(rskBlock.transactions[0].blockHeight).to.equal(height);
        expect(rskBlock.transactions[0].createdOn.getTime()).to.equal(new Date(Number(web3Block.timestamp) * 1000).getTime());
        expect(rskBlock.transactions[0].data).to.equal(input);
        expect(rskBlock.transactions[0].hash).to.equal(transactionHash);

    });

});
