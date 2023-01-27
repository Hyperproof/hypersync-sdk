# Proof Types JSON Format

The `/json/proofTypes.json` file in a package lists the JSON proof types that are exposed by the custom app.

`proofTypes.json` should expose one JSON object. There should be one property on this object for each JSON proof type that should be shown to the user.

The name of each property must match the name of a JSON proof type under `/json/proof`. For example, if you have a JSON proof type called `groupMembershipList.json`, your proof types object should be a property called `groupMembershipList`.

The value of each property is a simple object containing a label. This label is shown to the user in a Proof Type field.

## Example

```
{
    "$schema": "https://cdn.jsdelivr.net/gh/Hyperproof/hypersync-sdk/schema/proofProviders.schema.json",
    "groupMembershipList": {
        "label": "{{messages.PROOF_TYPE_MEMBERSHIP_LIST}}"
    },
    "userList": {
        "label": "{{messages.PROOF_TYPE_USER_LIST}}"
    }
}
```
