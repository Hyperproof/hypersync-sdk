# Proof Type JSON Format

[No-code proof types](./006-proof-types.md) are stored in a package's `/json/proof` directory. There should be one `.json` file in this directory for each proof type that is visible to the Hypersync app user.

Each proof type file exposes a JSON object with these properties:

| Property    | Required | Description                                                            |
| ----------- | -------- | ---------------------------------------------------------------------- |
| description | Yes      | Description of the proof type                                          |
| criteria    | Yes      | Array of criteria fields that are requried by the proof type           |
| proofSpec   | Yes      | Object that specifies how the proof type should be rendered            |
| overrides   | No       | Proof specs which override the base proof spec based on some condition |

## criteria

The `criteria` property is an array of JSON objects. There is one element in the array for each criteria field that the user needs to specify as part of configuring the proof type. If no criteria are required for a given proof type, the `criteria` property should be an empty array (i.e. `[]`).

Each object in the array has two required properties: `name` and `page`.

| Property | Description                                                                 |
| -------- | --------------------------------------------------------------------------- |
| name     | identifies the criteria field in the [criteria provider](./007-criteria.md) |
| page     | Zero-based index of the page on which the criterion should be shown         |

## proofSpec

The `proofSpec` property in a proof type file is a JSON object that specifies how the proof type should be rendered.

| Property         | Required | Description                                                                                                          |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| period           | Yes      | Default synchronization schedule. Valid values are `daily`, `weekly`, `monthly`, `quarterly` and `yearly`            |
| useVersioning    | Yes      | Whether or not to use versioning by default                                                                          |
| suggestedName    | Yes      | Suggested name for new Hypersyncs using this proof type                                                              |
| format           | Yes      | Format of the fields on the page. Valid values are `tabular` (side by side) or `stacked` (fields stacked vertically) |
| orientation      | Yes      | For PDF proofs, orientation of the generated PDF. Valid values are `portrait` and `landscape`                        |
| title            | Yes      | Title to render at the top of the generated proof                                                                    |
| subtitle         | Yes      | Subtitle to render below the title                                                                                   |
| dataSet          | Yes      | Name of the data set to which the proof type is bound                                                                |
| dataSetParams    | No       | Parameters provided to the data source when retrieving the data set                                                  |
| noResultsMessage | No       | Text to render if no items are found in the data set                                                                 |
| fields           | Yes      | Array of fields to include in the generated proof                                                                    |
| webPageUrl       | No       | URL shown at the bottom of generated proof                                                                           |
| autoLayout       | No       | `true` to automatically layout the fields in the specification. Default: `false`.                                    |
| sort             | No       | Sort applied after all data processing is complete                                                                   |

## overrides

`overrides` is an optional property that includes proof specs that are used in lieu of the default prooc spec based on some condition. For example, if you have a criteria field that lets the user choose a group by name, and if that select control also includes an "All Groups" option, an override an be used to change the layout of the generated proof when the user chooses "All Groups".

If specified, the `overrides` property must be formatted as an array of objects. Each of the objects in the array includes two properties: `condition` and `proofSpec`.

| Property  | Description                                                                          |
| --------- | ------------------------------------------------------------------------------------ |
| condition | Object which specifies the value that must be matched for the override to be applied |
| proofSpec | The proofSpec to use if the condition is met                                         |

## Example

```
{
  "description": "{{messages.PROOF_TYPE_USER_LIST}}",
  "criteria": [{ "name": "group", "page": 0 }],
  "proofSpec": {
    "period": "monthly",
    "useVersioning": true,
    "suggestedName": "{{messages.PROOF_TYPE_USER_LIST}}",
    "format": "tabular",
    "orientation": "landscape",
    "title": "{{messages.CONNECTOR_NAME}}",
    "subtitle": "{{messages.PROOF_TYPE_USER_LIST}}",
    "dataSet": "users",
    "dataSetParams": {
      "group": "{{criteria.group}}"
    },
    "noResultsMessage": "{{messages.NO_USERS}}",
    "sort": [
      {
        "property": "lastName",
        "direction": "ascending"
      }
    ],
    "fields": [
      {
        "property": "firstName",
        "label": "{{messages.LABEL_FIRST_NAME}}",
        "width": "400px",
        "type": "text"
      },
      {
        "property": "lastName",
        "label": "{{messages.LABEL_LAST_NAME}}",
        "width": "400px",
        "type": "text"
      },
      {
        "property": "email",
        "label": "{{messages.LABEL_EMAIL_ADDRESS}}",
        "width": "200px",
        "type": "text"
      },
      {
        "property": "status",
        "label": "{{messages.LABEL_STATUS}}",
        "width": "200px",
        "type": "text"
      }
    ],
    "webPageUrl": "https://myservice.com/users"
  }
}

```
