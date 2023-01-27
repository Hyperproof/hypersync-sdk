# messages.json Format

The `/json/messages.json` file in a package is used to contain the strings in your custom app that are visible to the user. While it is possible to hard-code the strings directly into proof types, criteria fields, etc., we recommend keeping all of these strings together in `messages.json`.

`messages.json` should contain one JSON object. The properties of that object are the strings in your app.

## Example

```
{
    LABEL_FIRST_NAME: 'First Name',
    LABEL_LAST_NAME: 'Last Name',
    LABEL_PASSWORD: 'Password,
    PROOF_TYPE_MEMBERSHIP_LIST: 'Membership List',
    PROOF_TYPE_USER_LIST: 'User List',
    SERVICE_NAME: 'My Service'
}
```
