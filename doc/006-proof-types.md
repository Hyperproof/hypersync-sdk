# Hypersync Proof Types

Hypersync apps expose the data in an external service in the form of proof types. For example, a Hypersync app for a user directory service might expose the following proof types:

- List of Users
- List of Groups
- Group Membership

Each one of these proof types selects the appropriate data from the external service and formats it as appropriate for the type of data. Data can be formatted in tabular, stacked and hierarchical layouts.

Once the user selects a proof type, they may be asked for one or more criteria values. The Group Membership proof type, for example, will likely reuqire that the user specify the name of the group that they are interested in. This information is then used to filter the group membership data. The metadata for these criteria values (e.g. whether the group name is shown as a select control or a text field) comes from the [criteria provider](./007-criteria.md).

Proof types retrieve data from the app's [data source](./005-data-sources.md) by name. The proof type may also provide parameter values to the data source to ensure that the right data is returned.

> **IMPORTANT: Planning Your Proof Types and Fields**  
>>- Define different kinds of proof - Users, Groups, etc...
>>- Define key fields of information needed in each proof type. Make sure your API calls can return these vital elements.
>>- Define how to identify the right resource(s) - This information can be unique to each proof type and will be needed to configure `criteriafields.json` You’ll want to ask the user for these when they author the Hypersync. For example if you want to get configuration information from Azure you might need to know the tenant and subscription and resource group.
>>
> **Tips for finding this info**:
>>- Look at console pages and dashboards. They usually contain all key information by default and are a great starting point.
>>- Look at other similar proof types in other apps.
>>- Always include proof for users and their permissions. See User Access Reviews proof for more information.

### Layouts

A proof type may format the data in the following ways:

| Layout       | Description                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Tabular      | Data is arranged in a table where each row is an item in the data set.                                           |
| Stacked      | Fields in an item are arranged verticially, and that vertical stack is repeated for every row in the result set. |
| Hierarchical | A combination of tabular and/or stacked layouts where some layouts are nested.                                   |

Tabular and stacked layouts can be output as PDF or Excel files. Hierarchical layouts can only be output as PDF.

Tabular and stacked layouts can also be described declaratively using JSON files, while hierarchical proof types currently cannot.

> **NOTE**: We strongly recommend that you don’t use nested layouts.

> **NOTE**: If you use control testing or want to view proof as an Excel file, stick with the simple layouts as nested layouts are not supported. No-code proof types only support simple layouts.

## No-Code Proof Types

The Hypersync SDK makes it possible to define most common proof types using declarative JSON files. Because these JSON files are easy to read and to edit, this no-code solution is recommended over writing TypeScript / JavaScript code for a proof type.

The proof type JSON files live in the `/json/proof` directory. This directory contains one JSON file per proof type. To learn more about the format of these JSON files, see [Proof Type JSON](./055-proof-type-json.md) or check out the examples in the [Hypersync SDK Samples repository](https://github.com/Hyperproof/hypersync-sdk-samples).

The `/json/proofTypes.json` file lists the set of proof types that are currently exposed by an application. Any proof type JSON files that are in your project but not listed in `proofTypes.json` will not be shown to the user. This makes it possible to develop new proof types without exposing them to users until you are ready.

For more information on `proofTypes.json`, see [Proof Types JSON Format](./054-proof-types-json.md).

## Custom Proof Types

For proof types that are hierarchical or which have other features which don't align with the no-code approach, the SDK makes it possible to author proof types in code.

When using code, each proof type is represented as a "proof provider" component. These components derive from the SDK's `ProofProviderBase`:

```
export class MyProofProvider extends ProofProviderBase {
  async generateCriteriaMetadata(
    criteriaValues: HypersyncCriteria,
    pages: ICriteriaPage[]
  ): Promise<ICriteriaMetadata> {
    // TODO: Generate the metadata for the criteria that are shown
    // to the user when configuring this proof type.  Will generally
    // defer to a class that implements ICriteriaProvider.
  }

  async generateSchema(
    criteriaValues: HypersyncCriteria
  ): Promise<IHypersyncSchema> {
    // TODO: Generate the schema for the proof type.  This schema information
    // is used by Hyperproof's automated testing feature.
  }

  async getProofData(
    hypersync: IHypersync,
    hyperproofUser: IHyperproofUser,
    authorizedUser: string,
    syncStartDate: Date,
    page?: string,
    metadata?: SyncMetadata
  ): Promise<IGetProofDataResponse | IProofFile[]> {
    // TODO: Fetch the data from the service and format it.
  }
}

```

Custom proof provider classes should live in the `proof-providers` directory in your package. There should also be an index file (i.e. `index.ts` or `index.js`) that exports each of the proof provider classes.

**index.ts Example**

```
export * from './ListOfUsers';
export * from './ListOfGroups';
export * from './GroupMembership';
```

<br></br>
[Return to Table of Contents](./000-toc.md)
