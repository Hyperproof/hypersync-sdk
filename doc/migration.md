# Hypersync SDK Migration Guide

## Version 6 to Version 7

### Package versions

All three packages are released together at the same version. Update `package.json`:

```json
  "dependencies": {
      "@hyperproof/hypersync-models": "^7.0.0",
      "@hyperproof/hypersync-sdk": "^7.0.0",
      "@hyperproof/integration-sdk": "^7.0.0"
  }
```

### Outbound requests are now SSRF-guarded

**Read this first — it is the change most likely to break a working app.**

Requests made through the SDK's HTTP layer (`ApiClient`, and therefore every `RestDataSourceBase` data set) now go through a guarded agent that:

- allows only `http:` and `https:` schemes,
- resolves the target hostname on a **public** DNS-over-HTTPS resolver rather than the pod's resolver,
- rejects any address in a private, reserved, or link-local range,
- rejects IP-literal hosts (e.g. `https://10.0.0.5/api`),
- pins the socket to the validated public IP, re-checking on every redirect hop.

A blocked request fails with HTTP `400` and error code `EGRESS_BLOCKED`. The guard fails closed: a resolver error or timeout also denies the connection.

**If your app targets a host that is not publicly resolvable — an on-prem server, a private DNS name, a VPN-only endpoint, or a hard-coded internal IP — it will stop working.** There is no environment-variable opt-out. Contact Hyperproof if your app has a legitimate private-network target.

Calls to Hyperproof's own platform endpoints are unaffected; they use the separate unguarded `getInternalAgent` / `createInternalFetchOptions` exports. Only use those for Hyperproof platform hosts, never for a vendor or tenant destination.

### `Logger` is synchronous and writes to stdout

`Logger.debug`, `info`, `warn` and `error` return `void` instead of `Promise<void>`, and no longer POST each event to the Hyperproof API. They now write a structured JSON line to stdout/stderr, and the log pipeline ships it.

Existing `await Logger.info(...)` calls still compile (`await` on a non-promise is legal), so this will not break your build — but the `await` is now pointless and should be removed:

```ts
// Before
await Logger.info('Fetching users');

// After
Logger.info('Fetching users');
```

`Logger.init()` has been removed. Delete any call to it; the subscription key it configured is no longer used for logging.

### Renamed types — check these carefully

Three types were renamed, and **the old names were reused for different, richer types**. A find-and-replace is not safe here; a stale import will still compile and mean the wrong thing.

| Version 6           | Version 7              | Note                                                         |
| ------------------- | ---------------------- | ------------------------------------------------------------ |
| `IExternalUser`     | `IExternalUserRef`     | `IExternalUser` now means an org-scoped external user entity |
| `IExternalGroup`    | `IExternalGroupRef`    | `IExternalGroup` likewise                                    |
| `ExternalPrincipal` | `ExternalPrincipalRef` | —                                                            |

The `*Ref` types are the lightweight shapes (id, name, avatar) you pass when referring to an external principal. The re-used names now extend `IOrgObject` and carry `appId`, `externalUserId` / `externalGroupId` and `instanceIntegrationId`.

`ICriteriaPageMessage` was replaced by `IInfoMessage`; `ICriteriaPage.info` is now `IInfoMessage[]`. `IInfoMessage` adds an optional action so a criteria page can render an actionable prompt rather than a bare message.

### Removed

- **`IProofSpec.autoLayout`** — delete it from your proof specs. Layout is now applied centrally to every proof, so the opt-in flag no longer exists. See _Layout is automatic_ below.
- **`RecordingManager`** (and the `@pollyjs/*` dependencies) is no longer exported from `@hyperproof/integration-sdk`.
- **`HealthStatus.NotImplemented`** is no longer produced. `validateAccessToken` is now a no-op by default instead of throwing `501`, so a connector that never implemented it reports healthy rather than not-implemented. If you branch on `NotImplemented`, remove that branch.

### Changed signatures

If you override any of these, update the signature:

```ts
// HypersyncApp
createDataSource(tokenOrCreds: string | CustomAuthCredentials, variant?: string): Promise<IDataSource>
onLastUserDeleted(user: TUserProfile, credentials?: string | CustomAuthCredentials): Promise<void>
applyAdditionalAuthorizationConfig(
  config: IAuthorizationConfigBase,
  meta: ParsedQs,
  userContext?: UserContext,
  configuration?: StringMap
): Promise<void>   // was synchronous, and took only (config, meta)

// RestDataSourceBase — these are now async; overrides must return promises
protected transformObject(...): Promise<DataObject>
protected getPropertyValue(...): Promise<...>
protected isPredicateMatch(...): Promise<boolean>
```

`onLastUserDeleted` previously received an OAuth `accessToken: string`, which was meaningless for custom-auth apps. It now receives the app's actual credentials.

`Sync.page` is now a `string` rather than a `number`, matching the opaque page tokens the paging schemes produce.

### JSONata upgraded to 2.2.2

`jsonata` moved from `1.8.7` to `2.2.2` (which also resolves CVE-2026-52746). JSONata 2.x contains behavior changes from the 1.x line. **Review and re-test every `transform` expression in your `dataSource.json`** rather than assuming they carry over unchanged.

### Credential fields are validated server-side

The `credentialsMetadata` schema was previously used only to render the UI. It is now enforced on the server before values are used or stored, and an off-menu value is rejected with a `400`.

If your app sets a credential field programmatically to a value that is not one of the offered select options — an auto-discovered region, for example — add that value to the field's options with the new `hidden: true` flag so it validates without appearing in the dropdown.

### Layout is automatic

Every proof now goes through a central layout pass, so a provider no longer needs to call `calcLayoutInfo` itself to get computed column widths, orientation and zoom. Explicit widths you set on a field are preserved; orientation and zoom are recomputed.

`calcLayoutInfo` is now non-mutating — it returns freshly-sized field objects instead of writing widths back into its input. If you call it directly, **use the returned `fields`**; the previous behavior of mutating in place is gone. (This also fixes a bug: providers commonly pass a shared layout singleton, and the old mutation froze the first sync's column widths for the life of the connector process.)

The column width factor also increased from 7.5 to 8.5 to suit the Open Sans → Geist font change, so expect slightly wider columns.

### New capabilities

None of these require changes, but they may let you delete code:

- **Proof type catalog** — a new `GET /prooftypecatalog` route returns every built-in proof type with resolved names, category and schema category. Override `getProofTypeCatalog`, or use the `buildProofTypeCatalog` helper if you don't use `ProofProviderFactory`.
- **Proof field and criteria filtering** — override `filterProofFields(fields, proofType, criteriaValues)` or `filterProofCriteria(criteria, proofType)` on `HypersyncApp` to vary a proof's shape by criteria.
- **OAuth variants** — `resolveVariant` and `getVariants` support connectors with multiple OAuth environments (e.g. commercial vs. gov). Variant-prefixed configuration keys (`gov_oauth_client_id`) are overlaid onto the un-prefixed key at request time, and the variant is persisted on the connection and reused on refresh.
- **Prometheus metrics** — `GET /metrics` is served automatically, with request duration, error and in-flight counters plus per-proof-type sync metrics.
- **Graceful shutdown** — `HttpServer` traps `SIGTERM`/`SIGINT` and drains in-flight syncs instead of letting them abort on deploy rollout.
- **`HypersyncPeriod.YearToDate`** — a new proof period.
- **`IProofSpec.sourceDateTimeZone`** — formats date-typed fields as date-only in a fixed IANA time zone, for sources that return date-only values where the user's time zone would shift the calendar day.
- **`IDataSet.keepEmptyRows`** — opt out of the automatic drop-empty-rows pass where an all-empty row is meaningful.
- **`RestDataSourceBase.getBaseUrl()`** and an overridable `getAdditionalContext()`.

## Version 6

### Package versions

Update package.json imports to the following versions:

```json
  "dependencies": {
      "@hyperproof/hypersync-models": "^6.0.0",
      "@hyperproof/hypersync-sdk": "^6.0.0",
      "@hyperproof/integration-sdk": "^6.0.0"
  }
```

Update the package.json devDependencies accordingly:

```json
  "devDependencies": {
      "@types/node": "22.10.10"
  }
```

Due to specific type dependencies, the types.node package needs to be updated to a specific version. Note there is no wildcard caret ^ in the version number.

If your code imported classes, types, interfaces, or enums from one of the other packages, those imports need to be updated after making this change.

### IP address allowlist change (US Only)

New internal infrastructure for custom apps running version ^6.0.0 of the hypersync-sdk will cause the outgoing API calls to come from a new IP address. If you had previously added a Hyperproof address to your private server's allowlist, you may need to add additional addresses for your custom app to continue to function. See the "Integrations" IP Address for your instance of Hyperproof: https://help.hyperproof.app/en/articles/14303850-hyperproof-instances

### OAuth callback change (US Only)

For the same reason as the IP address change, a new callback URL is required for all custom apps using oauth. Previous addresses are formatted according to the following template:

```
https://api.us-west-1.fusebit.hyperproof.app/v1/run/sub-f63bb714ec30473e/org-{orgId}/{customAppId}/callback
```

The new URL template is:

```
https://hpip.hyperproof.app/v1/run/hpprod/org-{orgId}/{customAppId}/callback
```

It is a known issue that Hypersync SDK version 1.2.4 generates incomplete, only relative URLs. Use the following base URLs for your Hyperproof instance:

- Hyperproof US: `https://hpip.hyperproof.app/v1/run/hpprod`
- Hyperproof EU: `https://hpip.hyperproof.eu/v1/run/hpprodeu`

Update your oauth client's callback URL with this new value.

## Version 2.X to Version 3.0

Version 3.0 of the Hypersync SDK includes a number of new capabilities that require small changes to Hypersync apps that use version 2.1 or earlier.

### Package Versions

The Hypersync SDK functionality is distributed via three Node packages:

| Package                      | Version | Description                 |
| ---------------------------- | ------- | --------------------------- |
| @hyperproof/hypersync-sdk    | 3.0.2   | Core Hypersync SDK          |
| @hyperproof/hypersync-models | 5.0.0   | Supporting Hypersync models |
| @hyperproof/integration-sdk  | 1.0.2   | Common integration elements |

All of the functionality needed to develop Hypersync applications is now exported from `@hyperproof/hypersync-sdk`. There is no longer a need to include dependencies to `@hyperproof/hypersync-models` or `@hyperproof/integration-sdk`.

The `dependencies` section of your app's `package.json` file should be updated as follows:

```
  "dependencies": {
    "@hyperproof/hypersync-sdk": "^3.0.2",
    ...
  }
```

If your code imported classes, types, interfaces, or enums from one of the other packages, those imports will need to be updated after making this change.

### Updated Execution Environment

Hypersync apps in Hyperproof EU execute in an updated execution environment. A couple of changes need to be made to existing Hypersync apps to allow them to run in Hyperproof EU.

The primary difference between the Hyperproof execution environment and the Hyperproof EU execution environment is the way that Hypersync apps are started. Hyperproof EU requires an `up` script in `package.json` which creates an initializes an HTTP server in the app.

#### Add `up` script to `package.json`

The required `up` command should be added to the `scripts` section of `package.json` as follows:

Example:

```
  "scripts": {
    "up": "node ./build/start.js",
    ...
  }
```

#### Create start.ts

After adding the `up` command, create a new file called `start.ts` under your package's `/src` directory. It should contian the following content:

```
import { MyApp } from './MyApp';

import { HttpServer } from '@hyperproof/integration-sdk';

const server = new HttpServer();
const app = new MyApp();
server.startListening(app.start());

```

Where "MyApp" is the name of your custom app.

After making these changes, when you build your app it will produce `./build/start.js` that is referenced by the `up` command.

Once you have made this change, your custom Hypersync app will function correctly in either the Hyperproof or Hyperproof EU environments.

> **NOTE**
>
> If you want to deploy your custom app to Hyperproof EU, you will need [HP CLI version](./hyperproof-cli.md) version 1.1.0.0 or higher. See the `--domain` option on the `hp signin` command.
