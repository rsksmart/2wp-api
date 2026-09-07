import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {Mongoose} from 'mongoose';
import {MongoDbDataSource} from '../../../datasources/mongodb.datasource';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Mongoose's own `STATES`: a two-way map between the code and its name. */
const STATES = {
  0: 'disconnected',
  1: 'connected',
  disconnected: 0,
  connected: 1,
} as unknown as Mongoose['STATES'];

function givenMongoose(readyState = 1) {
  return {
    STATES,
    connection: {readyState},
    disconnect: sinon.stub().resolves(),
  } as unknown as Mongoose;
}

function givenDataSource() {
  return new MongoDbDataSource('u', 'p', 'h', '27017', 'db', 'admin');
}

/**
 * The datasource is where the finding lives.
 *
 * `getConnection` built a resolved promise, hung the connection attempt off it
 * as a *derived* promise, and returned the original. The attempt's rejection
 * therefore belonged to nobody: not to the caller, who got a promise that had
 * already resolved, and not to any request chain. It went to
 * `unhandledRejection` and took the process with it.
 */
describe('Datasource: MongoDbDataSource connection handling', () => {
  let ds: MongoDbDataSource;
  let connect: sinon.SinonStub;

  beforeEach(() => {
    ds = givenDataSource();
    connect = sinon.stub(ds, 'connect');
  });

  afterEach(() => sinon.restore());

  describe('the failure reaches the caller', () => {
    it('rejects when connecting fails, instead of resolving', async () => {
      connect.rejects(new Error('ECONNREFUSED'));

      await expect(ds.getConnection()).to.be.rejectedWith(/ECONNREFUSED/);
    });

    it('leaves no rejection for the process to handle', async () => {
      // The whole finding in one assertion. A rejection nobody owns is not a
      // failed request, it is a dead process.
      const orphans: unknown[] = [];
      const collect = (reason: unknown) => orphans.push(reason);
      process.on('unhandledRejection', collect);
      try {
        connect.rejects(new Error('boom'));

        await ds.getConnection().catch(() => {});
        await delay(50);

        expect(orphans).to.be.empty();
      } finally {
        process.off('unhandledRejection', collect);
      }
    });

    it('resolves to the connection once it is established', async () => {
      const mongoose = givenMongoose();
      connect.callsFake(async () => {
        ds.mongoose = mongoose;
      });

      expect(await ds.getConnection()).to.equal(mongoose);
    });

    it('does not reconnect once connected', async () => {
      ds.mongoose = givenMongoose();

      await ds.getConnection();

      sinon.assert.notCalled(connect);
    });
  });

  describe('concurrent callers share one attempt', () => {
    it('connects once for many simultaneous callers', async () => {
      // Without this, an outage turns every in-flight request into its own
      // connection attempt and its own failure. Survivable once the policy is
      // inverted, but it is load and noise for nothing.
      connect.rejects(new Error('down'));

      await Promise.allSettled([
        ds.getConnection(),
        ds.getConnection(),
        ds.getConnection(),
      ]);

      sinon.assert.calledOnce(connect);
    });

    it('gives every caller the same failure', async () => {
      connect.rejects(new Error('down'));

      const results = await Promise.allSettled([
        ds.getConnection(),
        ds.getConnection(),
      ]);

      expect(results.map(r => r.status)).to.eql(['rejected', 'rejected']);
    });
  });

  describe('a failure is not remembered', () => {
    it('reconnects after Mongo comes back', async () => {
      // The mode that matters, and the one memoization gets wrong: a cached
      // in-flight promise that is never cleared caches the *failure* forever,
      // and the process never recovers even though the database has.
      const mongoose = givenMongoose();
      connect.onFirstCall().rejects(new Error('down'));
      connect.onSecondCall().callsFake(async () => {
        ds.mongoose = mongoose;
      });

      await ds.getConnection().catch(() => {});

      expect(await ds.getConnection()).to.equal(mongoose);
    });
  });

  describe('disconnecting', () => {
    it('waits for the disconnect before resolving', async () => {
      const mongoose = givenMongoose();
      let released = false;
      (mongoose.disconnect as unknown as sinon.SinonStub).callsFake(async () => {
        await delay(20);
        released = true;
      });
      ds.mongoose = mongoose;

      await ds.disconnect();

      expect(released).to.be.true();
    });

    it('rejects when the disconnect fails, instead of orphaning it', async () => {
      const mongoose = givenMongoose();
      (mongoose.disconnect as unknown as sinon.SinonStub).rejects(
        new Error('stuck'),
      );
      ds.mongoose = mongoose;

      await expect(ds.disconnect()).to.be.rejectedWith(/stuck/);
    });

    it('does nothing when already disconnected', async () => {
      // The guard compared a state *name* against the string `'0'`, so it was
      // true for every state there is and this method always ran.
      const mongoose = givenMongoose(0);
      ds.mongoose = mongoose;

      await ds.disconnect();

      sinon.assert.notCalled(mongoose.disconnect as unknown as sinon.SinonStub);
    });

    it('does nothing when there is no connection at all', async () => {
      await expect(ds.disconnect()).to.be.fulfilled();
    });
  });
});
