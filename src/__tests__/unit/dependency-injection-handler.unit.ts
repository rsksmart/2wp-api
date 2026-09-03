import {Application} from '@loopback/core';
import {expect} from '@loopback/testlab';
import {DependencyInjectionHandler} from '../../dependency-injection-handler';
import {ConstantsBindings, ServicesBindings} from '../../dependency-injection-bindings';

/**
 * Atlas SWAP events are emitted only while the daemon processes Bridge
 * transactions. These tests keep that rule enforceable: if someone moves a
 * daemon-only binding back into the shared list, the API process regains the
 * ability to publish and CI turns red here.
 */
const DAEMON_ONLY_BINDINGS = [
  ConstantsBindings.ATLAS_EVENTS_ENABLED,
  ServicesBindings.ATLAS_EVENT_PUBLISHER,
  ServicesBindings.PEGIN_DATA_PROCESSOR,
  ServicesBindings.PEGOUT_DATA_PROCESSOR,
  ServicesBindings.RSK_BLOCK_PROCESSOR_PUBLISHER,
  ServicesBindings.DAEMON_SERVICE,
];

// Bindings the REST API controllers inject, which must stay in the shared list.
const SHARED_BINDINGS = [
  ServicesBindings.BITCOIN_SERVICE,
  ServicesBindings.RSK_NODE_SERVICE,
  ServicesBindings.BRIDGE_SERVICE,
  ServicesBindings.PEGIN_STATUS_DATA_SERVICE,
  ServicesBindings.PEGOUT_STATUS_DATA_SERVICE,
  ServicesBindings.PEGIN_STATUS_SERVICE,
  ServicesBindings.PEGOUT_STATUS_SERVICE,
  ServicesBindings.SYNC_STATUS_DATA_SERVICE,
  ServicesBindings.FEATURES_SERVICE,
  ServicesBindings.BACKOFFICE_FEATURE_FLAGS_SERVICE,
];

describe('DependencyInjectionHandler', () => {

  describe('the API process', () => {
    let app: Application;

    beforeEach(() => {
      app = new Application();
      DependencyInjectionHandler.configureDependencies(app);
    });

    for (const binding of DAEMON_ONLY_BINDINGS) {
      it(`does not bind ${binding}`, () => {
        expect(app.isBound(binding)).to.be.false();
      });
    }

    for (const binding of SHARED_BINDINGS) {
      it(`binds ${binding}`, () => {
        expect(app.isBound(binding)).to.be.true();
      });
    }

    it('cannot resolve the Atlas event publisher', async () => {
      await expect(app.get(ServicesBindings.ATLAS_EVENT_PUBLISHER)).to.be.rejected();
    });
  });

  describe('the daemon process', () => {
    let app: Application;

    beforeEach(() => {
      app = new Application();
      DependencyInjectionHandler.configureDependencies(app);
      DependencyInjectionHandler.configureDaemonDependencies(app);
    });

    for (const binding of [...DAEMON_ONLY_BINDINGS, ...SHARED_BINDINGS]) {
      it(`binds ${binding}`, () => {
        expect(app.isBound(binding)).to.be.true();
      });
    }
  });

});
