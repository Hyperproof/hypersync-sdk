# hypersync-sdk

SDK for building [Hypersyncs](https://docs.hyperproof.io/hypersyncs/) that bring data from external sources into [Hyperproof](https://hyperproof.io).

## Documentation

To get started with the Hypersync SDK hop on over to the [SDK documentation](doc/000-toc.md).

## Release Notes

### 3.0.0

- Classes, functions, types, interfaces and enums common to all integration types have been
  moved to @hyperproof/integration-sdk.

- Paging of data set results can now be done delcaratively. For more information on
  declarative paging, see the documentation on [declarative paging](./doc/005-data-sources.md#paging).

- Data sets now support a `method` property that can be set to `GET`, `POST` or `PATCH`. Data
  sets also include a new `body` property which is included in data requests when `POST` or `PATCH` is
  specified.

- Criteria pages can now include messages displayed at the page level. See `ICriteriaPageMessage`.

- The Hypersync SDK now supports the creation of proof types that work with User Access Reviews. The
  documentation section will soon be updated with information on creating these proof types.

- Proof fields can now be laid out automaticaly by setting `autoLayout` to `true` on the proof spec.

- The Hypersync SDK now supports a new integration execution environment that is under active
  development. More information on this environment will be shared in the future.

- Various enhancements and fixes have been made to improve overall quality and reliability.

### 2.1.0

- Add support for Node 18
- Add ability to test for service permissions
- Various bug fixes

### 2.0.0

Version 2.0 of the Hypersync SDK represents the first major enhancement since the
initial release. There are a number of feature enhancements and breaking changes
in this update.

- The Hypersync SDK now depends on two new public packages: `@hyperproof/hypersync-models` and
  `@hyperproof/integration-sdk`. This refactoring has been done to support current and
  future enhancements to integrations in Hyperproof.

- Some types, interfaces and enums have been extracted from `@hyperproof/hypersync-sdk`
  and are now a part of `@hyperproof/hypersync-models`. The complete list of the models
  exposed by `@hyperproof/hypersync-models` can be found in the
  [public repository](https://github.com/Hyperproof/hypersync-models). Hypersync apps that
  depend on these models will need to add a dependency on the package.

- The `OAuthTokenResponse` interface has been moved from the `@hyperproof/hypersync sdk`
  package to `@hyperproof/integration-sdk`. Hypersync apps that depend on this interface
  will need to add a dependency on `@hyperproof/integration-sdk`.

- Enum values in `CredentialFieldType`, `HypersyncCriteriaFieldType`, `HypersyncDataFormat`,
  `HypersyncPageOrientation` and `HypersyncFieldType` have been updated to use Pascal casing.

- The SDK now supports Hyperproof's Connection Health feature. To return connection health
  information in an OAuth Hypersync app, override the `validateAccessToken` method. In a custom auth
  Hypersync app, the `validateCredentials` method is used to determine connection health.

- Proof types can now be grouped by category. When a category is specified in a proof type
  (e.g. in `proofTypes.json`) the user will be required to choose the category first after
  which they can choose a proof type. This categorization is helpful in apps with many proof types.
  If your app uses a `criteriaFields.json` file to provide criteria, you can enable proof
  categories by defining field called `proofCategory`. This field will generally be a select
  control where the options in the select are the proof categories. If you are using a custom
  `ICriteriaProvider` instance, you will need to implement the `generateProofCategoryField` method.

- The `webPageUrl` property of a proof specification is now optional.

- For REST data sources, the optional `filter` property on `dataSet`
  now supports JSONata expressions.

- Various enhancements and fixes have been made to improve overall quality and reliability.

### 1.1.0

#### Rename data source messages to "value lookups".

- Deprecate `messages` property in `dataSource.json` in favor of `valueLookups`.
- Deprecate `$mlookups` in data source expressions in favor of `$vlookup`

### 1.0.0

- Added initial support for design.
- Miscellaneous quality fixes.

### 0.10.0

- Added support for connection health monitoring.
- Data sources can not return detailed error information.
- Miscellaneous quality fixes.

### 0.9.3

- Updates to schema.json files and related types to help with JSON editing.

### 0.9.1

- General clean up and preparation ahead of general availability.

### 0.9.0

- Updated with various improvements.

### 0.8.10

- Initial version
