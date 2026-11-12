import {CoreTags} from '@loopback/core';
import {expect} from '@loopback/testlab';
import {TwpapiApplication} from '../../application';
import {DaemonRunner} from '../../daemon-runner';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {
  FlyoverHealthCheck,
  PowpegHealthCheck,
  ProviderHealthCheck,
  ProviderHealthJob,
  ProviderHealthStore,
} from '../../services/provider-health';

describe('Provider health: wiring', () => {
  it('runs the job in the API, checking PowPeg and Flyover and writing the shared store', async () => {
    const app = new TwpapiApplication();
    const binding = app.getBinding(ServicesBindings.PROVIDER_HEALTH_JOB);

    expect(binding.tagMap).to.have.property(CoreTags.LIFE_CYCLE_OBSERVER);
    const apiJob = await app.get<ProviderHealthJob>(
      ServicesBindings.PROVIDER_HEALTH_JOB,
    );
    const checks = (apiJob as unknown as {checks: ProviderHealthCheck[]}).checks;
    expect(checks.map(check => check.constructor)).to.deepEqual([
      PowpegHealthCheck,
      FlyoverHealthCheck,
    ]);
    const sharedStore = await app.get(ServicesBindings.PROVIDER_HEALTH_STORE);
    expect((apiJob as unknown as {store: ProviderHealthStore}).store).to.equal(sharedStore);
    expect((checks[1] as unknown as {store: ProviderHealthStore}).store).to.equal(
      sharedStore,
    );
  });

  it('does not run the job in the daemon, which serves no /health', () => {
    const daemon = new DaemonRunner();

    expect(daemon.isBound(ServicesBindings.PROVIDER_HEALTH_JOB)).to.be.false();
  });
});
