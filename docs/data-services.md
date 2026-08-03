# Data services

Persistence in `2wp-api` is built around one shared contract, `GenericDataService<Type>` (`src/services/generic-data-service.ts`):

```ts
interface GenericDataService<Type extends SearchableModel> {
  getById(id: any): Promise<Type>;
  getMany(query?: any): Promise<Array<Type>>;
  set(data: Type): Promise<boolean>;
  delete(id: any): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

`Type` must extend `SearchableModel` (`src/models/rsk/searchable-model.ts`).

## The MongoDB base implementation

`MongoDbDataService<Type, T>` (`src/services/mongodb-data.service.ts`) is an abstract class that implements `GenericDataService<Type>` once, backed by Mongoose. It owns the shared plumbing — lazy connection (`ensureConnection`/`start`/`stop`), `getById`, `getMany`, `set` (upsert), and `delete` — and leaves four things for a subclass to fill in:

| Method | What a concrete service provides |
|---|---|
| `getLoggerName()` | Logger name for this service |
| `getConnector()` | The Mongoose model to query (after ensuring the connection is established) |
| `getByIdFilter(id)` | The Mongo filter used by `getById`/`delete` |
| `getManyFilter(filter?)` | The Mongo filter used by `getMany` |

## Real implementations

| Class | Backs | Notes |
|---|---|---|
| `FeaturesMongoDbDataService` (`features-mongo.service.ts`) | `FeaturesDataService` — feature flags | `getByIdFilter`/`getManyFilter` are unimplemented (throw) — only `getAll()` is used in practice |
| `SyncStatusMongoService` (`sync-status-mongo.service.ts`) | `SyncStatusDataService` — RSK chain sync cursor | Adds `getBestBlock()` (highest `rskBlockHeight`) |
| `PeginStatusMongoDbDataService` (`pegin-status-data-services/pegin-status-mongo.service.ts`) | `PeginStatusDataService` — peg-in tracking | Adds `deleteByRskBlockHeight` |
| `PegoutStatusMongoDbDataService` (`pegout-status-data-services/pegout-status-mongo.service.ts`) | `PegoutStatusDataService` — peg-out tracking | Adds several `getMany*`/`getLastBy*` lookups used by the pegout status builder |
| `FlyoverService` (`flyover.service.ts`) | Flyover (fast peg-in/peg-out) status | Extends the base directly (no separate named interface); adds `getFlyoverStatus`, which also calls `RskNodeService` to decide whether a tracked Flyover tx has finished |

Each subclass defines its own Mongoose schema and model (kept private to its file — "these model interfaces and classes are required for Mongo but we don't want them exposed out of this layer", per the source comments) and is wired up as a dependency-injected service via `ServicesBindings` (`src/dependency-injection-bindings.ts`, `src/dependency-injection-handler.ts`).

## Adding a new one

1. Define the model this service will store (extending `SearchableModel` where relevant) and, if it needs its own consumer-facing method set, a small interface for it (see `SyncStatusDataService`, `PeginStatusDataService`, `PegoutStatusDataService`).
2. Extend `MongoDbDataService<YourModel, YourMongoModel>`, define the Mongoose schema/model privately in the file, and implement `getLoggerName`, `getConnector`, `getByIdFilter`, `getManyFilter`.
3. Add any query methods beyond the base CRUD contract that your consumers actually need (as the pegin/pegout/sync-status services do).
4. Register the new service in `src/dependency-injection-bindings.ts` / `src/dependency-injection-handler.ts` so it can be injected via `@inject(ServicesBindings.<YOUR_SERVICE>)`.
