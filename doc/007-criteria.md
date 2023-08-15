# Hypersync Proof Type Criteria

When the user chooses a [proof type](./006-proof-types.md) in a Hypersync app, they will often need to provide one or more criteria values to properly parameterize the proof. Hyperproof and the Hypersync app work together to present the user with a set of form fields that make it easy to capture the data that is required. The Hypersync app's job in this scenario is to provide criteria metadata which specifies how the different criteria fields should appear in Hyperproof. For example, the criteria metadata specifies the type of control to show as well as the text in the label above the field.

Criteria metadata may be built up incrementally. A Hypersync app will generally return only the first field's metadata when queried by Hyperproof. When the user provides a value for that field, the value is sent back to the Hyperproof app in a subsequent request for criteria metadata. The Hypersync app can then use the first value provided by the user to figure out exactly what option to show next. This back-and-forth repeats until all of the criteria required by the proof type have been provided.

Criteria fields may be spread across multiple pages in the Hypersync wizard. For example, if seven criteria fields are required for a given proof type, four can be shown to the user on the first page, and when the user has provided all four of those values, they can be taken to the second page where to fill in the last three fields.

The Hypersync SDK uses criteria provider components to surface criteria metadata and criteria values to Hyperproof. The SDK also includes a `JsonCriteriaProvider` component that can be used to easily surface criteria metadata using a declarative `criteriaFields.json` as the source. This makes it possible to define and configure criteria fields with no code.

For more advanced scenarios, the SDK's `ICriteriaProvider` interface allows you to build your own criteria provider.

> NOTE: If you are defining your proof types with JSON, there is no need for you to create your own criteria provider. For these proof types the SDK has built-in support for `JsonProofProvider` and the `criteriaFields.json` file described below.

# No-Code Criteria Provider

The `JsonProofProvider` class in the SDK makes it easy to define criteria metadata without writing code. To use this class, begin by creating a `criteriaFields.json` in the `/json` directory. The file should have the following format:

```
{
  "$schema": "https://cdn.jsdelivr.net/gh/Hyperproof/hypersync-sdk/schema/criteriaFields.schema.json",
  "groupName": {
    "type": "select",
    "property": "group",
    "label": "Group Name",
    "isRequired": true,
    "dataSet": "groups",
    "valueProperty": "id",
    "labelProperty": "groupName",
    "fixedValues": [
      {
        "value": "{{constants.ID_ALL}}",
        "label": "All Groups"
      }
    ]
  }
  ...
}
```

`groupName` in this example is a criterion field that allows the user to select a group by name in the Hyperproof UI. There should be one entry in this file for every criteria field to be shown to the user.

For more information on the `criteriaFields.json` format, see [Criteria Fields JSON Format](./053-criteria-fields-json.md).

# Custom Criteria Provider

For some advanced scenarios it may be necessary to write your own criteria provider. The SDK provides the ICriteriaProvider interface which you can use to build a custom criteria provider.

The `ICriteriaProvider` interface has three methods: `generateProofCategoryField`, `generateCriteriaFields` and `generateProofCriteria`.

`generateProofCategoryField` returns a proof category criteria field that can be used to filter proof types by category. For apps with a small number of proof types where a category is not required, this method should return `null`.

`generateCriteriaFields` is invoked as the user is creating or editing a Hypersync. This method returns criteria metadata to Hyperproof in the form of an `ICriteraMetadata` object. This object contains the fields that the user needs to configure for the proof type, as well as some default values for the Hypersync name, frequency of execution, and versioning benavior. As mentioned above this method is called iteratively as the user configures the Hypersync.

`generateProofCriteria` is called at sync time. This method is responsible for formatting the configured criteria so that they can be included in a the generated proof. `generateProofCriteria` will generally apply transforms and perform lookups in order to properly format the criteria.

```
class MyCriteriaProvider implements ICriteriaProvider{
  generateProofCategoryField(
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext
  ): Promise<ICriteriaField | null> {
    // TODO: Return an initialized ICriteriaField to be used as the proof
    // category if categorization is desired.  Otherwise return null.
  }

  async generateCriteriaFields(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext,
    pages: ICriteriaPage[]
  ): Promise<ICriteriaMetadata> {
    // TODO: Generate an ICriteriaMetdata instance containing the metadata for
    // the fields the user needs to configure, as well as defaults for the Hyperysnc
    // name, frequency of execution, and versioning behavior.
  }

  async generateProofCriteria(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext
  ): Promise<IProofCriterionValue[]> {
    // TODO: Return a set of criterion values that can be rendered in a proof document
  }
}
```

Once you have implemented your custom `ICriteriaProvider`, override the `createCriteriaProvider` method on `HypersyncApp` to return your new class:

```
  public async createCriteriaProvider(
    dataSource: IDataSource
  ): Promise<ICriteriaProvider> {
    return new MyCriteriaProvider(dataSource);
  }
```

<br></br>
[Return to Table of Contents](./000-toc.md)
