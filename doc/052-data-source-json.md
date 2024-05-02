# REST Data Source JSON Format

For Hypersync apps that retrieve data from a REST data source, the [RestDataSourceBase](./005-data-sources.md) class makes it possible to extract, transform and sort multiple data sets without writing code. The `/json/dataSource.json` file is used to define these datasets.

At the top level, a `dataSource.json` file should expose an oject with three properties: `baseUrl`, `dataSets` and `messages`. Note that only `dataSets` is required--`baseUrl` and `messages` are both optional.

## baseUrl

`baseUrl` is a simple string property that is used as a base for all of the `url` properties in the `dataSets` collection. When this property is specified in a `dataSource.json` file, the URLs in the individual data sets are treated as relative.

If the APIs in your data sets do not share a common root, omit the `baseUrl` property and use full URLs in your data set definitions.

## dataSets

A "data set" is a named object used to identify a data object or a data collection (i.e. data array) that can be retrieved from a data source.

There should be one property in the `dataSets` object for each data set that is used by your custom Hypersync app.

Each data set object contains the following properties:

| Property      | Required? | Description                                              |
| ------------- | --------- | -------------------------------------------------------- |
| url           | Yes       | Relative or full URL for the REST API                    |
| method        | No        | `GET`, `POST` or `PATCH`. Default: `GET`.                |
| body          | No        | Body included in `POST` and `PATCH` requests             |
| result        | Yes       | `object` or `array`                                      |
| description   | No        | A description of the data set                            |
| documentation | No        | Link to the REST API documentation                       |
| joins         | No        | Additional data sets to join to this data set            |
| lookups       | No        | Lookups that are retrieved for each object in the result |
| filter        | No        | Predicate applied to retrieved data                      |
| transform     | No        | Transform to apply to each object in the filtered result |
| sort          | No        | Sort to apply to the transformed data                    |
| pagingScheme  | No        | Definition of pagination behavior                        |

## messages

It is often the case that objects returned from a REST API contain property values that need to be formatted before they are presented to the user. For example, an API that returns user information may return a `status` property with values `active` and `deactivated`. In this case it may be desirable to map these values to the strings "Active" and "Inactive" respectively. The `valueLookups` object in `dataSource.json` makes this sort of mapping possible without writing code.

Each property in `valueLookups` can be thought of as a map. The keys of the map are the values that are to be mapped, and the values are the strings that should be used instead of the value that was returned from the REST API.

Once a mapping has been defined under `valueLookups`, it can be referenced in the data sets in your `dataSource.json` file using the `$vlookup` function.

## Example

```
{
  "$schema": "https://cdn.jsdelivr.net/gh/Hyperproof/hypersync-sdk/schema/restDataSource.schema.json",
  "baseUrl": "https://THE_SERVICE.com/api/v2",
  "dataSets": {
    "currentUser": {
      "description": "Returns information about the authorized user.",
      "documentation": "https://THE_SERVICE.com/docs/api/users/me",
      "url": "users/me",
      "transform": {
        "username": "username",
        "firstName": "givenName",
        "lastName": "surname"
      },
      "result": "object"
    },
    "groups": {
      "description": "Returns a list of all the groups in My Service.",
      "documentation": "https://THE_SERVICE.com/docs/api/groups",
      "url": "groups",
      "transform": {
        "id": "id",
        "groupName": "groupName",
        "members": "memberCount"
      },
      "result": "array"
    },
    "users": {
      "description": "Returns a list of all the users in My Service.",
      "documentation": "https://THE_SERVICE.com/docs/api/users",
      "url": "users",
      "transform": {
        "id": "id",
        "firstName": "givenName",
        "lastName": "surname",
        "email": "emailAddress",
        "status": "$vlookup('statuses', status)"
      },
      "result": "array"
    }
  },
  "valueLookups": {
    "statuses": {
      "active": "Active",
      "deactivated": "Inactive"
    }
  }
}

```
