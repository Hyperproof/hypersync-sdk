# Criteria Fields JSON Format

The `/json/criteriaFields.json` file in a package defines one or more criteria fields that the user can choose from when configuring a Hypersync. These criteria fields can be shared across multiple proof types.

`criteriaFields.json` should expose a single JSON object. There is one property on this object for every criteria field used by your custom app. The value of these properties is an object containing the metadata for the criteria field. That object contains a `type` property which specifies the type of form field to show to the user. The rest of the properties in the object vary based on the chosen type.

## Example

```
{
    "$schema": "https://cdn.jsdelivr.net/gh/Hyperproof/hypersync-sdk/schema/criteriaFields.schema.json",
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
