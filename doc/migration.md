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
- resolves the target hostname on a **public** DNS-over-HTTPS resolver
- rejects any address in a private, reserved, or link-local range
- rejects IP-literal hosts (e.g. `https://10.0.0.5/api`)
- pins the socket to the validated public IP, re-checking on every redirect hop

A blocked request fails with HTTP `400` and error code `EGRESS_BLOCKED`. The guard fails closed: a resolver error or timeout also denies the connection.

**If your app targets a host that is not publicly resolvable, it may stop working.**
There is no environment-variable opt-out. Contact Hyperproof if your app has a legitimate private-network target.

### `Logger` is synchronous

All logger functions (`Logger.info`, `warn`, `error`, etc.) return `void` instead of `Promise<void>`

Existing `await Logger.info(...)` calls will still compile (`await` on a non-promise is legal), so this is non-breaking.

```ts
// Before
await Logger.info('Fetching users');

// After
Logger.info('Fetching users');
```

`Logger.init()` is no longer necessary and has been removed.

### Renamed types — check these carefully

`ICriteriaPageMessage` was replaced by `IInfoMessage`; `ICriteriaPage.info` is now `IInfoMessage[]`. `IInfoMessage` adds an optional action so a criteria page can render an actionable prompt rather than a bare message.

### Removed

- **`IProofSpec.autoLayout`**: Layout is now applied centrally to every proof, so the opt-in flag no longer exists. See _Layout is automatic_ below.

### Changed signatures

If you override any of these, update the signature.

`HypersyncApp`:

```diff
- public async createDataSource(tokenOrCreds: string | CustomAuthCredentials): Promise<IDataSource>
+ public async createDataSource(tokenOrCreds: string | CustomAuthCredentials, variant?: string): Promise<IDataSource>

- public async onLastUserDeleted(user: TUserProfile, accessToken: string): Promise<void>
+ public async onLastUserDeleted(user: TUserProfile, credentials?: string | CustomAuthCredentials): Promise<void>
```

`onLastUserDeleted` previously received an OAuth `accessToken`, which was meaningless for custom-auth apps. It now receives the app's actual credentials, so the parameter is optional and may be a credentials object.

`RestDataSourceBase` — these became `async`, so overrides must be `async` too and callers must `await` them:

```diff
- protected transformObject(transform: Transform, o: DataObject, params?: DataValueMap): DataObject
+ protected async transformObject(transform: Transform, o: DataObject, params?: DataValueMap): Promise<DataObject>

- protected getPropertyValue(o: any, property: string): DataValue | DataObject | DataObject[] | undefined
+ protected async getPropertyValue(o: any, property: string): Promise<DataValue | DataObject | DataObject[] | undefined>

- protected isPredicateMatch(left: any, right: any, predicate: IPredicateClause[]): boolean
+ protected async isPredicateMatch(left: any, right: any, predicate: IPredicateClause[]): Promise<boolean>
```

These became async because JSONata 2.x evaluation returns a promise — see _JSONata upgraded to 2.2.2_ above.

`Sync.page` is now a `string` rather than a `number`, matching the opaque page tokens the paging schemes produce.

### JSONata upgraded to 2.2.2

`jsonata` moved from `1.8.7` to `2.2.2`. JSONata 2.x contains behavior changes from the 1.x line. Primarily, this change means that jsonata calls return promises that must be `await`ed now.

### Credential fields are validated server-side

The `credentialsMetadata` schema was previously used only to render the UI. It is now enforced on the server before values are used or stored, and an off-menu value is rejected with a `400`.

If your app sets a credential field programmatically to a value that is not one of the offered select options (an auto-discovered region, for example) add that value to the field's options with the new `hidden: true` flag so it validates without appearing in the dropdown.

### Layout is automatic

Every proof now goes through a central layout pass, so a provider no longer needs to call `calcLayoutInfo` itself to get computed column widths, orientation and zoom. Explicit widths you set on a field are preserved; orientation and zoom are recomputed.

### New capabilities

None of these require changes, but they may let you delete code:

- **Proof field and criteria filtering**: override `filterProofFields(fields, proofType, criteriaValues)` or `filterProofCriteria(criteria, proofType)` on `HypersyncApp` to vary a proof's shape by criteria.
- **`applyAdditionalAuthorizationConfig(config, meta, userContext?, configuration?)`**: a new overridable hook on `HypersyncApp` for adding fields to the authorization config returned by the `/config` route. In version 6 this existed only on the connector class, which custom apps do not subclass.
- **`HypersyncPeriod.YearToDate`**: a new proof period.
- **`IProofSpec.sourceDateTimeZone`**: formats date-typed fields as date-only in a fixed IANA time zone for sources that return date-only values where the user's time zone would shift the calendar day.
- **`IDataSet.keepEmptyRows`**: opt out of the automatic drop-empty-rows pass where an all-empty row is meaningful.

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
