# hypersync-sdk

SDK for building [Hypersyncs](https://docs.hyperproof.io/hypersyncs/) that bring data from external sources into [Hyperproof](https://hyperproof.io).

## Documentation

To get started with the Hypersync SDK hop on over to the [SDK documentation](doc/000-toc.md).

## Release Notes

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
