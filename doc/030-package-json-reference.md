# Custom Hypersync App package.json Reference

Every custom Hypersync app must have a `package.json` file that contains certain properties. Hyperproof uses these property values to properly identify and display your custom Hypersync app in the Hyperproof user interface.

The `package.json` file for a custom Hypersync app must contain the values shown below.:

```
{
    "name": "custom-hypersync-app",
    "version": "1.0.0",
    "app_hyperproof": {
        "name": "My Custom Hypersync App",
        "appType": "hypersync",
        "authType": "custom",
        "category": "Identity Services",
        "descriptionCapabilities": "This integration extracts user and group information from The Target Service.",
        "debug": true,
        "staticIp": false,
        "schemaCategories": [
          "uarApplication", "uarDirectory"
        ]
    },
    ...
}
```
NOTE: `schemaCategories` array is optional and only required for Hypersyncs that need to utilize the Access Review module.

NOTE: When attempting to upgrade existing Hypersyncs to the `schemaCategories` for Access Review proofs, you must first delete the existing Hypersync using the CLI command `hp customapps delete`. This ensures that the new `schemaCategories` definition is added to your Hypersync.   

## name

The `name` property is a standard `package.json` attribute. All custom Hypersync apps must include this property.

The package name is used as an identifier by the Hyperproof CLI so care should be taken when choosing the package name.

More information on the name attribute can be found [here](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name).

## version

The `version` property is also a standard `package.json` attribute. This value is stored by Hyperproof when the custom Hypersync app is imported, and it is shown in the console when running commands such as `hp customapps list`.

Hyperproof recommends following [semver](https://semver.org/) versioning when making changes to custom Hypersync apps.

More information on the version attribute can be found [here](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name).

## app_hyperproof

The `app_hyperproof` value in `package.json` is an object that contains values that Hyperproof uses to properly expose and run your custom Hypersync app. The object must contain the values in the table below.

| Attribute               | Description                                                                                                                                                                                                                                                                              |
| ----------------------- |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| name                    | The name of your application as shown in the Hyperproof UI.                                                                                                                                                                                                                              |
| appType                 | The type of custom app. Must be set to `hypersync`.                                                                                                                                                                                                                                      |
| authType                | The type of authentication/authorization used by your application. Acceptable values are `custom` or `oauth`.                                                                                                                                                                            |
| category                | The category of your custom Hypersync app as shown in the Add Hypersync wizard. This value is also shown under Connected Accounts when viewing connection information. Can be any string value but it is recommended to reuse an existing category if applicable.                        |
| descriptionCapabilities | Description shown to the user when inspecting a connection under Connected Accounts.                                                                                                                                                                                                     |
| debug                   | True to include debug information (e.g. `Logger.debug` output) in the logs.                                                                                                                                                                                                              |
| staticIp                | Boolean value (true or false) which indicates whether or not a static IP is required. If your target service is on premise or lives behind a firewall setting this to true will allow you to open a port for your custom Hypersync app to talk to the target service. Defaults to false. |
| schemaCategories        | Optional Array value containing one or both of the UAR categories `uarApplication` or `uarDirectory` for use in Access Review Hypersyncs                                                                                                                                                 |
