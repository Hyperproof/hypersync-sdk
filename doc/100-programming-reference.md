# Programming Model for Hypersync Apps

TODO: this needs work.

## HypersyncApp Base Class

All Hypersync packages have export an initialized instance of the HypersyncApp base class.

```
class MyHypersync extends HypersyncApp {
    ...
}
```

## Data Source

A Hypersync data source is a class that communicates with the external service to retrieve data. Because Hypersyncs typically need to extract various kinds of data from these external services, data sources are able to retrieve data for multiple data sets. Each data set has an associated name which can be used to extract the data for that data set.

### Declarative Data Sources

For REST based services, the SDK provides a DeclarativeDataSource that allows you to define your data source and its data sets declaratively (i.e. without writing code).

```
export class MyDataSource extends DeclarativeDataSource {

}
```

### Custom Data Sources

If the service you are connecting to is not REST, or if you would like to connect to the service using some other communication facility like an SDK, you can create your own custom data source. Simply create an object that implements the `IDataSource` interface.

```
export class MyDataSource implements IDataSource {

    public getData(
        dataSetName: string,
        params?: DataValueMap
    ) : Promise<IGetDataResult<TData | TData[]>> {

        // Use dataSetName to retrieve the data from the service.
        ...
    }

}
```

## Proof Types
