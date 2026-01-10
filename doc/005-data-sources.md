# Data Sources

A data source is a Hypersync app component that retrieves data from an external service. Data sources can access external services in a variety of ways including REST, GraphQL, and direct database access. Each Hypersync app should contain one data source component that implements the IDataSource interface or derives from a base class that implements IDataSource.

Data sources can retrieve different data sets from the external service. Each data set is accessed by name. For example, a Jira data source might expose three data sets: one for issues, one for labels, and one for users.

Data set names are used in other components like proof types to identify the specific data element or elements needed by that component.

> **NOTE**: Data sets can and _should_ be re-used across multiple proof types, and can also be used in non-proof scenarios such as collecting user data during the `validateCredentials` process.

## REST Data Sources

For services that expose their data through a REST API, developers are recommended to derive a data source from the RestDataSourceBase base class. This base class makes it possible to configure the data sets along with filters, sorts, and transformations in a `dataSources.json` file that is included in your package. You can configure most of your data retrieval functionality without writing any code.

If your external service uses OAuth for authorization (see [Connections](./004-connections.md)), your app's data source should look like this:

```
export class MyServiceDataSource extends RestDataSourceBase {
  constructor(accessToken: string) {
    super(config as IRestDataSourceConfig, Messages, {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    });
  }
}

```

You should also have `createDataSource` method like this in your app's `HypersyncApp` class:

```
public async createDataSource(accessToken: string): Promise<IDataSource> {
  return new MyServiceDataSource(accessToken);
}
```

For services that use some other form of authorization, use the following pattern:

```
export class MyServiceDataSource extends RestDataSourceBase {
  constructor(credentials: CustomAuthCredentials) {
    // TODO: Update the headers below for your REST service.
    super(config as IRestDataSourceConfig, Messages, {
      Authorization: `Basic ...`,
      'Content-Type': 'application/json'
    });
  }
}
```

And in your HypersyncApp:

```
public async createDataSource(credentials: CustomAuthCredentials): Promise<IDataSource> {
  return new MyServiceDataSource(credentials);
}
```

### dataSource.json File

Once you have created your app's `RestDataSourceBase` component and updated the `createDataSource` method in your `HypersyncApp`, add dataSource.json file under the `/json` directory. The `RestDataSourceBase` base class will automatically load this configuration file when it is instantiated.

For more information on configuring the data sets in your data source using `dataSource.json`, see the [dataSource.json Format page](./052-data-source-json.md).

### Paging

Many REST APIs use a paging mechanism to allow data to be retrieved in chunks. For example, some APIs take a `pageSize` and `pageNumber` argument which specify how many items to return, and the page number to start reading from, respectively.

Four paging styles are supported: **Page Based**, **Offset And Limit**, **Next Token**, and **GraphQL Connections**. As a default, query string parameters will be programatically added to an API url. If POST is designated as the data source HTTP method, paging parameters are added to the body of the request.

1.  **Page Based.** Begin paging at a starting value and increment the page value by 1 after each iteration (1, 2, 3, etc). Return at most `limitValue` items per page.

```json
"pagingScheme": {
  "type": "pageBased",
  "request": {
    "pageParameter": "pageNumber",
    "pageStartingValue": 1,
    "limitParameter": "pageSize",
    "limitValue": 100
  },
  "pageUntil": "noDataLeft"
}
```

The mandatory `request` property in the paging scheme constructs the paged query string. The query string of the first API call from the above example will be: `?pageNumber=1&pageSize=100`. Each paging scheme must include a `pageUntil` property which defines the point at which pagination stops. If `reachTotalCount` condition is applied, `totalCount` must be defined in the response object, which represents the path to the total combined number of items in the data returned from the external service.\*

2.  **Offset And Limit.** Begin paging at a starting value and increment the offset by the number of elements in a full page (0, 100, 200, 300, etc). Return at most `limitValue` items per page.

```json
"pagingScheme": {
  "type": "offsetAndLimit",
  "request": {
    "offsetParameter": "offset",
    "offsetStartingValue": 0,
    "limitParameter": "limit",
    "limitValue": 100
  },
  "response": {
    "totalCount": "pagination.total"
  },
  "pageUntil": "reachTotalCount"
}
```

The mandatory `request` property in the paging scheme constructs the paged query string. The query string of the first API call from the above example will be: `?offset=0&limit=100`. Each paging scheme must include a `pageUntil` property which defines the point at which pagination stops. If `reachTotalCount` condition is applied, `totalCount` must be defined in the response object. This string value represents the path to the total combined number of items in the data returned from the external service.\*

3.  **Next Token.** Begin paging and continue until `nextToken` is no longer provided. Return at most `limitValue` items per page. Tokens may be a unique string returned from the external service or a url.

```json
"pagingScheme": {
  "type": "nextToken",
  "request": {
    "tokenParameter": "token",
    "limitParameter": "size",
    "limitValue": 20
  },
  "response": {
    "nextToken": "next.token"
  },
  "pageUntil": "noNextToken",
  "tokenType": "token"
}
```

The mandatory `request` property in the paging scheme constructs the paged query string. The query string of the first API call from the above example will be: `?size=20`. Each successive call will be structured in the pattern: `?size=20&token=891b629672384d04`. Each paging scheme must include a `pageUntil` property which defines the point at which pagination stops. When `noNextToken` condition is applied, `nextToken` must be included in the response object. This string value represents the path to the expected value in the data returned from the external service.\*

4.  **GraphQL Connections.** Following the GraphQL [Connections](https://graphql.org/learn/pagination/#connection-specification) specification, continue paging until `hasNextPage` is false. Return at most `limitValue` items per page. Supports forward, non-nested pagination.

```json
"body": {
  "query": "query($first: Int, $after: String) { attributes(first: $first, after: $after) { nodes { id name } pageInfo { endCursor hasNextPage } } }",
  "variables": {
    "first": 500
  }
},
"method": "POST",
"property": "data.attributes.nodes",
"pagingScheme": {
  "type": "graphqlConnections",
  "request": {
    "limitParameter": "first",
    "limitValue": 500
  },
  "response": {
    "pageInfo": "data.attributes.pageInfo"
  },
  "pageUntil": "noNextPage"
}
```

The paging scheme dynamically adds the `first` and `after` variables to the body of a request. The `after` variable is defined using the `endCursor` string from the preceding response. `pageInfo` must be included in the paging scheme response object. This string value represents the path to the `pageInfo` object in the data returned from the external service.

\*If values are to be found in the response header, apply the `header:` prefix.

## Custom Data Sources

For services that do not expose data as REST, or for services that use certain REST patterns that are incompatible with RestDataSourceBase, the Hypersync SDK makes it possible to create a custom data source.

To begin, define your data source class using one of the patterns below.

**OAuth Authorization**

```
export class MyServiceDataSource implements IDataSource {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }
}
```

**Custom Authentication**

```
export class MyServiceDataSource implements IDataSource {
  private credentials: CustomAuthCredentials;

  constructor(credentials: CustomAuthCredentials) {
    this.credentials = credentials;
  }
}
```

Once you have created the class and a properly formatted constructor, all that is left is to implement the `getData` method. This is the only method defined in the `IDataSource` interface.

```
async getData(
  dataSetName: string,
  params?: DataValueMap
): Promise<DataSetResult<DataObject | DataObject[]>> {
  // TODO: Retrieve the data set by name using the provided parameters.
}
```

<br></br>
[Return to Table of Contents](./000-toc.md)
