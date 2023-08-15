# Criteria Fields JSON Format

The `/json/criteriaFields.json` file in a package defines one or more criteria fields that the user can choose from when configuring a Hypersync. These criteria fields can be shared across multiple proof types.

`criteriaFields.json` should expose a single JSON object. There is one property on this object for every criteria field used by your custom app. The value of these properties is an object containing the metadata for the criteria field. That object contains a `type` property which specifies the type of form field to show to the user. The rest of the properties in the object vary based on the chosen type.

## Proof Category Field

If your app has many proof types, consider adding a criteria field called `proofCategory`. When a criteria field is found with this name, it will be automatically selected as the first criteria field shown to the user. Once the user has chosen a category value from this field, the set of proof types will be filtered to match that category. See [Proof Types JSON Format](./054-proof-types-json.md) for more information.

## Example

```
{
    "$schema": "https://cdn.jsdelivr.net/gh/Hyperproof/hypersync-sdk/schema/criteriaFields.schema.json",
    "proofCategory": {
        "type": "select",
        "property": "proofCategory",
        "label": "{{messages.LABEL_PROOF_CATEGORY}}",
        "isRequired": true,
        "fixedValues": [
            {
                "value": "users",
                "label": "{{messages.LABEL_USERS}}"
            },
            {
                "value": "devices",
                "label": "{{messages.LABEL_DEVICES}}"
            }
        ]
    },
    "groupId": {
        "type": "select",
        "property": "group",
        "label": "{{messages.LABEL_GROUP_NAME}}",
        "isRequired": true,
        "dataSet": "groups",
        "valueProperty": "id",
        "labelProperty": "groupName",
        "fixedValues": [
            {
            "value": "{{constants.ID_ALL}}",
            "label": "{{messages.LABEL_ALL_GROUPS}}"
            }
        ]
    },
    "userStatus": {
        "type": "select",
        "property": "userStatus",
        "label": "{{messages.LABEL_USER_STATUS}}",
        "isRequired": true,
        "fixedValues": [
            {
                "value": "active",
                "label": "{{messages.LABEL_USER_STATUS_ACTIVE}}"
            },
            {
                "value": "inactive",
                "label": "{{messages.LABEL_USER_STATUS_INACTIVE}}"
            }
        ]
    },
    "search": {
        "type": "text",
        "property": "search",
        "label": "{{messages.LABEL_SEARCH}}",
        "placeholder": "{{messages.PLACEHOLDER_SEARCH}}",
        "isRequired": true
    }
}
```
