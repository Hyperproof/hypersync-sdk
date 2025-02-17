# Proof Types JSON Format

The `/json/proofTypes.json` file in a package lists the JSON proof types that are exposed by the custom app.

`proofTypes.json` should expose one JSON object. There should be one property on this object for each JSON proof type that should be shown to the user.

The name of each property must match the name of a JSON proof type under `/json/proof`. For example, if you have a JSON proof type called `groupMembershipList.json`, your proof types object should be a property called `groupMembershipList`.

The value of each property is a simple object containing a `label` property along with an optional `category`.

If a category is specified, it will be used to match the proof against the proof category chosen by the user. For more information on proof categories, see [Criteria Fields JSON Format](./053-criteria-fields-json.md).

The label attribute is the human-readable name of the proof type. It is shown to the user in the Proof Type field.

An additional optional property 'schemaCategory' is required if the Hypersync is to be used in the 'Access Reviews' module.

## Example

```
{
    "$schema": "https://cdn.jsdelivr.net/gh/Hyperproof/hypersync-sdk/schema/proofProviders.schema.json",
    "groupMembershipList": {
        "label": "{{messages.PROOF_TYPE_MEMBERSHIP_LIST}}",
        "category": "users"
    },
    "userList": {
        "label": "{{messages.PROOF_TYPE_USER_LIST}}",
        "category": "users"
    },
    "deviceList": {
        "label": "{{messages.PROOF_TYPE_DEVICE_LIST}}",
        "category": "devices"
    },
    "listOfUsersApplication": {
        "label": "{{messages.PROOF_TYPE_USER_LIST}}",
        "schemaCategory": "uarApplication"
    }   
}
```
