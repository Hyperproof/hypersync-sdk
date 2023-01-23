# Data Sources

A data source is a Hypersync app component that retrieves data from an external service. Data sources can access external services in a variety of ways including REST, GraphQL, and direct database access. Each Hypersync app should contain one data source component that implements the IDataSource interface or derives from a base class that implements IDataSource.

Data sources can retrieve different data sets from the external service. Each data set is accessed by name. For example, a Jira data source might expose three data sets: one for issues, one for labels, and one for users.

Data set names are used in other components like proof types to identify the specific data element or elements needed by that component.

## REST Data Sources

For services that expose their data through a REST API, developers are recommended to derive a data source from the RestDataSource base class. This base class makes it possible to configure the data sets along with filters, sorts, and transformations in a `dataSources.json` file that is included in your package. This makes it possible to configure most of your data retrieval functionality without writing any code.

If your external service uses OAuth for authorization (see [Connections](./004-connections.md)), your app's data source should look like this:

```
export class MyServiceDataSource extends RestDataSource {
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
export class MyServiceDataSource extends RestDataSource {
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

Once you have created your app's `RestDataSource` component and updated the `createDataSource` method in your `HypersyncApp`, add dataSource.json file under the `/decl` directory. The `RestDataSource` base class will automatically load this configuration file when it is instantiated.

For more information on configuring the data sets in your data source using `dataSource.json`, see the [dataSource.json Format page](./052-data-source-json.md).

### Paging

Many REST APIs use a paging mechanism to allow data to be retrieved in chunks. For example, some APIs take a `pageSize` and `pageNumber` argument which specify how many items to return, and the page number to start reading from, respectively.

While it is possible to configure many aspects of your data sets using the `dataSource.json` file, there is currently no mechanism to handle paging. To handle paging properly, you will have to write a bit of code.

To implement paging in a data source that derives from RestDataSource, override the `getDataFromUrl` method:

```
  protected async getDataFromUrl(
    dataSetName: string,
    dataSet: IDataSet,
    relativeUrl: string,
    params: DataValueMap
  ) {
    // No need for paging if we are just getting one object.
    if (dataSet.result === 'object' && !dataSet.filter) {
      return super.getDataFromUrl(dataSetName, dataSet, relativeUrl, params);
    }

    // TODO: Handle paging for My Service here.
    const PAGE_SIZE = 50;
    const results: DataObject[] = [];
    const pageNumber = 0;
    let pageResults;
    do {
        pageResults = await fetchPage(PAGE_SIZE, pageNumber++)
        Array.prototype.push.apply(results, pageResults);
    } while (pageResults.length < PAGE_SIZE)
  }
```

## Custom Data Sources

For services that do not expose data as REST, or for services that use certain REST patterns that are incompatible with RestDataSource (e.g. using POST to retrieve data), the Hypersync SDK makes it possible to create a custom data source.

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
