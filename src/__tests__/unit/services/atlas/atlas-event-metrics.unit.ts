import {expect, sinon} from '@loopback/testlab';
import {AtlasEventType} from '../../../../models/atlas/atlas-event.model';
import {
  ATLAS_EVENTS_PUBLISHED_METRIC,
  AtlasEventMetrics,
} from '../../../../services/atlas/atlas-event-metrics';
import {Logger} from '../../../../utils/logger';

type StubbedLogger = Logger & {
  info: sinon.SinonStub;
  warn: sinon.SinonStub;
  error: sinon.SinonStub;
  debug: sinon.SinonStub;
};

const givenLogger = (): StubbedLogger => (<StubbedLogger> <unknown> {
  info: sinon.stub(),
  warn: sinon.stub(),
  error: sinon.stub(),
  debug: sinon.stub(),
});

const linesOf = (logger: StubbedLogger): Record<string, unknown>[] =>
  [...logger.info.getCalls(), ...logger.warn.getCalls()]
    .map(call => call.args[0] as Record<string, unknown>);

describe('Service: AtlasEventMetrics', () => {

  it('counts a success and a failure separately per flow and event type', () => {
    const metrics = new AtlasEventMetrics(givenLogger());

    metrics.recordSuccess(AtlasEventType.SWAP_CREATED, 'pegin');
    metrics.recordSuccess(AtlasEventType.SWAP_CREATED, 'pegin');
    metrics.recordSuccess(AtlasEventType.SWAP_CREATED, 'pegout');
    metrics.recordSuccess(AtlasEventType.SWAP_COMPLETED, 'pegin');
    metrics.recordFailure(AtlasEventType.SWAP_CREATED, 'pegin');

    expect(metrics.total('success', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(2);
    expect(metrics.total('success', AtlasEventType.SWAP_CREATED, 'pegout')).to.equal(1);
    expect(metrics.total('success', AtlasEventType.SWAP_COMPLETED, 'pegin')).to.equal(1);
    expect(metrics.total('failure', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(1);
    expect(metrics.total('failure', AtlasEventType.SWAP_COMPLETED, 'pegout')).to.equal(0);
  });

  it('emits one log line per publication with a stable metric field', () => {
    const logger = givenLogger();
    const metrics = new AtlasEventMetrics(logger);

    metrics.recordSuccess(AtlasEventType.SWAP_CREATED, 'pegin');
    metrics.recordFailure(AtlasEventType.SWAP_REJECTED, 'pegout');

    const lines = linesOf(logger);
    expect(lines).to.have.length(2);
    expect(lines[0]).to.containEql({
      metric: ATLAS_EVENTS_PUBLISHED_METRIC,
      status: 'success',
      flow: 'pegin',
      eventType: 'swap.created',
      total: 1,
    });
    expect(lines[1]).to.containEql({
      metric: ATLAS_EVENTS_PUBLISHED_METRIC,
      status: 'failure',
      flow: 'pegout',
      eventType: 'swap.rejected',
      total: 1,
    });
  });

  // The field name is the contract with the log aggregator: it is what an alert
  // queries, so renaming it for style would silently break the alert.
  it('names the metric atlas_events_published_total', () => {
    expect(ATLAS_EVENTS_PUBLISHED_METRIC).to.equal('atlas_events_published_total');
  });

  it('reports the running total, not just the last publication', () => {
    const logger = givenLogger();
    const metrics = new AtlasEventMetrics(logger);

    for (let i = 0; i < 3; i++) {
      metrics.recordSuccess(AtlasEventType.SWAP_PENDING, 'pegout');
    }

    expect(linesOf(logger).map(line => line.total)).to.eql([1, 2, 3]);
  });

  it('never throws, whatever the logger does', () => {
    const logger = givenLogger();
    logger.info.throws(new Error('log pipeline is down'));
    logger.warn.throws(new Error('log pipeline is down'));
    const metrics = new AtlasEventMetrics(logger);

    expect(() => metrics.recordSuccess(AtlasEventType.SWAP_CREATED, 'pegin')).to.not.throw();
    expect(() => metrics.recordFailure(AtlasEventType.SWAP_CREATED, 'pegin')).to.not.throw();

    // The count still advanced: the counter does not depend on the logger.
    expect(metrics.total('success', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(1);
    expect(metrics.total('failure', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(1);
  });

  it('records an unspecified flow without losing the publication', () => {
    const metrics = new AtlasEventMetrics(givenLogger());

    metrics.recordSuccess(AtlasEventType.SWAP_CREATED);

    expect(metrics.total('success', AtlasEventType.SWAP_CREATED)).to.equal(1);
    expect(metrics.total('success', AtlasEventType.SWAP_CREATED, 'pegin')).to.equal(0);
  });

});
