import jsonata from 'jsonata';
import { HeadersInit } from 'node-fetch';
import queryString from 'query-string';
import { ApiClient, compareValues, Logger } from '../common';
import { StringMap } from './common';
import { DataSetResultStatus } from './enums';
import {
  DataValueMap,
  IDataSetResultComplete,
  IDataSetResultPending
} from './IDataSource';
import { DataSourceBase } from './DataSourceBase';
import { DataObject, DataValue, IErrorInfo } from './models';
import { SyncMetadata } from './Sync';
import { resolveTokens, TokenContext } from './tokens';

const LOOKUP_DEFAULT_VALUE = '__default__';

export type Predicate = { leftProperty: string; rightProperty: string }[];

type Query = { [param: string]: string };
type Transform = { [key: string]: string | string[] };
type FilterClause = { property: string; value: string };
type SortClause = { property: string; direction: 'ascending' | 'descending' };

interface IJoin {
  alias: string;
  dataSet: string;
  dataSetParams?: DataValueMap;
  on: Predicate;
}

interface ILookup {
  alias: string;
  dataSet: string;
  dataSetParams?: DataValueMap;
}

/**
 * Data set information stored in the client configuration file.
 */
export interface IDataSet {
  description: string;
  documentation?: string;
  url: string;
  property?: string;
  query?: Query;
  joins?: IJoin[];
  lookups?: ILookup[];
  filter?: FilterClause[];
  transform?: Transform;
  sort?: SortClause[];
  result: 'array' | 'object';
  isCustom?: boolean;
}

/**
 * Configuration information stored in a JSON file that is used as
 * the input to a RestDataSourceBase instance.
 */
export interface IRestDataSourceConfig {
  baseUrl?: string;
  dataSets: {
    [name: string]: IDataSet;
  };
  valueLookups?: {
    [name: string]: { [key: string]: string };
  };

  /**
   * @deprecated This property has been deprecated in favor of `valueLookups`
   */
  messages?: {
    [name: string]: { [key: string]: string };
  };
}

export interface IRestDataSetComplete<TData = DataObject>
  extends IDataSetResultComplete<TData> {
  headers: { [name: string]: string[] };
  errorInfo?: IErrorInfo;
}

export type RestDataSetResult<TData = DataObject> =
  | IRestDataSetComplete<TData>
  | IDataSetResultPending;

export interface IJoinDataSetDone {
  status: DataSetResultStatus.Complete;
  data: any;
}

export type JoinDataSetResult = IJoinDataSetDone | IDataSetResultPending;

interface IPredicateClause {
  leftExpression: jsonata.Expression;
  rightExpression: jsonata.Expression;
}

/**
 * Base class for a client object that communicates with a REST API.
 * Communication with the API is controlled by a declarative configuration
 * file in JSON format.
 *
 * Connectors should override this class and add support for service-specific
 * functionality like paging.
 */
export class RestDataSourceBase extends DataSourceBase {
  protected config: IRestDataSourceConfig;
  protected apiClient: ApiClient;
  private messages: StringMap;

  constructor(
    config: IRestDataSourceConfig,
    messages: StringMap,
    headers: HeadersInit
  ) {
    super();
    // Make a deep copy of the config to support later modification.
    this.config = {
      baseUrl: config.baseUrl,
      dataSets: { ...config.dataSets },
      valueLookups: { ...(config.valueLookups ?? config.messages) }
    };
    this.messages = messages;
    this.apiClient = new ApiClient(headers, config.baseUrl);
  }

  /**
   * Returns the configuration for the data source.
   */
  public getConfig() {
    return this.config;
  }

  /**
   * Adds a new data set to the collection of configured data sets.
   */
  public addDataSet(name: string, dataSet: IDataSet) {
    if (Object.prototype.hasOwnProperty.call(this.config.dataSets, name)) {
      throw new Error('A data set with that name already exists.');
    }
    this.config.dataSets[name] = dataSet;
  }

  /**
   * Retrieves data from the service.  IDataSource method.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data. Optional.
   * @param {string} page The page value to continue fetching data from a previous sync. Optional.
   * @param {object} metadata Metadata from previous sync run if requeued. Optional.
   */
  public async getData<TData>(
    dataSetName: string,
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata
  ): Promise<RestDataSetResult<TData>> {
    await Logger.debug(
      `RestDataSourceBase: Retrieving Hypersync service data for data set '${dataSetName}'`
    );
    const dataSet = this.config.dataSets[dataSetName];
    if (!dataSet) {
      throw new Error(`Invalid data set name: ${dataSetName}`);
    }

    // Resolve tokens in the URL and query string.
    const tokenContext = this.initTokenContext(params);
    let relativeUrl = resolveTokens(dataSet.url, tokenContext);
    const query = { ...dataSet.query };
    if (Object.keys(query).length) {
      for (const key of Object.keys(query)) {
        query[key] = resolveTokens(query[key], tokenContext);
      }
      relativeUrl = `${relativeUrl}?${queryString.stringify(query)}`;
    }

    // Fetch the data from the service.
    const response = await this.getDataFromUrl(
      dataSetName,
      dataSet,
      relativeUrl,
      params,
      page,
      metadata
    );
    if (response.status !== DataSetResultStatus.Complete) {
      return response;
    }

    let data: any = response.data;

    // The `property` attribute can be used to select data out of the response.
    if (dataSet.property) {
      await Logger.info(
        `RestDataSourceBase: Extracting data from '${dataSet.property}' property.`
      );
      const expression = jsonata(dataSet.property);
      data = expression.evaluate(data);
    }

    if (Array.isArray(data)) {
      await Logger.info(
        `RestDataSourceBase: Received array of length ${data.length} from REST API.`
      );
    } else {
      await Logger.info(`RestDataSourceBase: Received object from REST API.`);
    }

    // Join in any other data sets.
    const joinResponse = await this.applyJoins(
      dataSetName,
      dataSet,
      tokenContext,
      data
    );
    if (joinResponse.status !== DataSetResultStatus.Complete) {
      return joinResponse;
    }
    data = joinResponse.data;

    // Apply per-row lookups after joins are complete.
    data = await this.applyLookups(
      dataSetName,
      dataSet,
      tokenContext,
      data,
      metadata
    );

    // If a filter was provided, apply that to the result.
    data = await this.applyFilter(
      dataSetName,
      dataSet,
      tokenContext,
      data,
      params
    );

    const isDataArray = Array.isArray(data);
    if (this.isArrayResult(dataSet) !== isDataArray) {
      if (isDataArray && data.length === 1) {
        data = data[0];
      } else {
        throw new Error(
          `Data returned does not match expected ${dataSet.result} result.`
        );
      }
    }

    // Transform the data if necessary.
    data = await this.applyTransforms(dataSetName, dataSet, data, params);

    // Finally apply the sort.
    if (Array.isArray(data)) {
      data = await this.applySort(dataSetName, dataSet, data, params);
    }

    await Logger.debug(
      `RestDataSourceBase: Data retrieval and processing for '${dataSetName}' complete`
    );

    return {
      status: DataSetResultStatus.Complete,
      data,
      source: response.source,
      headers: response.headers,
      nextPage: response.nextPage,
      errorInfo: response.errorInfo
    };
  }

  /**
   * Sets the headers that will be sent in each request.
   *
   * @param headers Headers to apply to each request.
   */
  protected setHeaders(headers: HeadersInit) {
    this.apiClient = new ApiClient(headers, this.config.baseUrl);
  }

  /**
   * Retrieves a data object singleton from the service.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  public async getDataObject<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IRestDataSetComplete<TData>> {
    const response = await super.getDataObject<TData>(dataSetName, params);
    return response as IRestDataSetComplete<TData>;
  }

  /**
   * Retrieves a data object collection from the service.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  public async getDataObjectArray<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IRestDataSetComplete<TData[]>> {
    const response = await super.getDataObjectArray<TData>(dataSetName, params);
    return response as IRestDataSetComplete<TData[]>;
  }

  /**
   * Retrieves data as JSON from a service-relative URL.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSet Data set for which data is being retrieved.
   * @param {string} relativeUrl Service-relative URL from which data should be retrieved.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   * @param {string} page The page value to continue fetching data from a previous sync. Optional.
   * @param {object} metadata Metadata from previous sync run if requeued. Optional.
   *
   * @returns RestDataSetResult
   */
  protected async getDataFromUrl(
    dataSetName: string,
    dataSet: IDataSet,
    relativeUrl: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params?: DataValueMap,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    page?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    metadata?: SyncMetadata
  ): Promise<RestDataSetResult<any>> {
    await Logger.info(
      `RestDataSourceBase: Retrieving data from URL '${relativeUrl}'`
    );
    const {
      json: data,
      source,
      headers
    } = await this.apiClient.getJson(relativeUrl);
    return { status: DataSetResultStatus.Complete, data, source, headers };
  }

  /**
   * Joins in data from other data sets.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSource Data set for which data is being retrieved.
   * @param {*} tokenContext Context object used in token replacement.
   * @param {*} data Data to use as the left-hand side of the join.
   */
  protected async applyJoins(
    dataSetName: string,
    dataSet: IDataSet,
    tokenContext: TokenContext,
    data: any
  ): Promise<JoinDataSetResult> {
    const joins = dataSet.joins;
    if (!joins) {
      return {
        data,
        status: DataSetResultStatus.Complete
      };
    }

    await Logger.info(`RestDataSourceBase: Applying ${joins.length} join(s).`);

    let joinData = Array.isArray(data) ? data : [data];
    for (const join of joins) {
      const response = await this.getData<any>(
        join.dataSet,
        join.dataSetParams
      );
      if (response.status !== DataSetResultStatus.Complete) {
        return response;
      }
      const rhs: any[] = response.data;
      if (!Array.isArray(rhs)) {
        throw new Error('Joined data sets must be array types.');
      }

      // Parse the join clause up front for performance.
      const predicate = join.on.map(condition => ({
        leftExpression: jsonata(condition.leftProperty),
        rightExpression: jsonata(condition.rightProperty)
      }));

      // Perform the join.  Note that only inner joins are supported.
      const results: any[] = [];
      for (const left of joinData) {
        const matches = rhs.filter(right =>
          this.isPredicateMatch(left, right, predicate)
        );

        for (const match of matches) {
          const r = { ...left, [join.alias]: match };
          results.push(r);
        }
      }

      joinData = results;
    }

    return {
      data: joinData,
      status: DataSetResultStatus.Complete
    };
  }

  /**
   * Iterates through the items in the current result and issues getData requests
   * for each lookup defined in the data set.  The result of each lookup is then
   * inserted into the source data using the provided alias.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSet Data set for which data is being retrieved.
   * @param {*} tokenContext Context object used in token replacement.
   * @param {*} data Data object(s) into which lookup values will be inserted.
   * @param {object} metadata Metadata from previous sync run if paging. Optional.
   */
  protected async applyLookups(
    dataSetName: string,
    dataSet: IDataSet,
    tokenContext: TokenContext,
    data: any,
    metadata?: SyncMetadata
  ): Promise<any> {
    const lookups = dataSet.lookups;
    if (!lookups) {
      return data;
    }

    await Logger.info(
      `RestDataSourceBase: Applying ${lookups.length} lookup(s).`
    );

    const result = Array.isArray(data) ? data : [data];
    for (const lookup of lookups) {
      for (const dataObject of result) {
        const params = { ...lookup.dataSetParams };
        if (params) {
          tokenContext['source'] = dataObject;
          for (const key of Object.keys(params)) {
            const value = params[key];
            if (typeof value === 'string') {
              params[key] = resolveTokens(value, tokenContext);
            }
          }
        }

        const response = await this.getData<any>(
          lookup.dataSet,
          params,
          undefined, // Paging is not supported for lookups
          metadata
        );
        if (response.status !== DataSetResultStatus.Complete) {
          throw new Error(
            `Invalid response received for data set: ${dataSetName}`
          );
        }
        dataObject[lookup.alias] = response.data;
      }
    }

    return Array.isArray(data) ? result : result[0];
  }

  /**
   * Applies filters to the data.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSet Data set for which data is being retrieved.
   * @param {*} tokenContext Context object used in token replacement.
   * @param {*} data Data to be filtered.
   * @param {object} params Parameter values to be used when retrieving data.  Optional
   */
  protected async applyFilter(
    dataSetName: string,
    dataSet: IDataSet,
    tokenContext: TokenContext,
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params?: DataValueMap
  ): Promise<any> {
    if (dataSet.filter !== undefined) {
      await Logger.info(`RestDataSourceBase: Filtering data set.`);

      if (!Array.isArray(data)) {
        throw new Error(
          'Filter specified on data set but retrieved data is not an array.'
        );
      }

      const filterCriteria = dataSet.filter.map(criterion => ({
        property: criterion.property,
        value: resolveTokens(criterion.value, tokenContext)
      }));

      data = data.filter(item => {
        for (const criterion of filterCriteria) {
          if (item[criterion.property] !== criterion.value) {
            return false;
          }
        }
        return true;
      });

      // If the return type is an object and we just filtered down to one
      // element in the array, return  the first element as an object.
      if (!this.isArrayResult(dataSet)) {
        if (data.length !== 1) {
          throw new Error(
            `Object result specified for data set but filtered result had ${data.length} items.`
          );
        }
        data = data[0];
      }
    }

    return data;
  }

  /**
   * Transforms the filtered data by adding, changing or removing properties.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSet Data set for which data is being retrieved.
   * @param {*} data Data to be transformed.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  protected async applyTransforms(
    dataSetName: string,
    dataSet: IDataSet,
    data: any,
    params?: DataValueMap
  ): Promise<any> {
    const transform = dataSet.transform;
    if (!transform) {
      return data;
    }

    await Logger.info(`RestDataSourceBase: Transforming data set.`);

    if (Array.isArray(data)) {
      return data.map(item => this.transformObject(transform, item, params));
    } else {
      return this.transformObject(transform, data, params);
    }
  }

  /**
   * Sorts the data.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSet Data set for which data is being retrieved.
   * @param {*} data Data to be sorted.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   * @returns
   */
  protected async applySort(
    dataSetName: string,
    dataSet: IDataSet,
    data: any[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params?: DataValueMap
  ): Promise<any[]> {
    const sort = dataSet.sort;
    if (!sort) {
      return data;
    }

    await Logger.info(`RestDataSourceBase: Sorting data set.`);

    data.sort((a, b) => {
      for (const s of sort) {
        const dir = s.direction === 'ascending' ? 1 : -1;
        const compare = compareValues(
          a[s.property] as DataValue,
          b[s.property] as DataValue
        );
        if (compare < 0) {
          return -1 * dir;
        } else if (compare > 0) {
          return 1 * dir;
        }
        // Otherwise continue...
      }
      return 0;
    });

    return data;
  }

  /**
   * Helper function that returns true if the given data set returns an array
   * of data elements and false if the data set returns a single object.
   *
   * @param {object} dataSet Data set for which data is being retrieved.
   */
  private isArrayResult(dataSet: IDataSet) {
    return dataSet.result === 'array';
  }

  /**
   * Helper function that transforms a single object.
   *
   * @param {object} transform Transform to apply to the data.
   * @param {object} o Object to be transformed.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  private transformObject(
    transform: Transform,
    o: DataObject,
    params?: DataValueMap
  ) {
    const result: DataObject = {};

    const tokenContext = this.initTokenContext(params);
    const valueLookups = this.config.valueLookups;

    for (const key of Object.keys(transform)) {
      let jsonataExpression = transform[key];
      // If the jsonataExpression is an array just join the strings
      // together.  We allow them to be stored as arrays for readability.
      if (Array.isArray(jsonataExpression)) {
        jsonataExpression = jsonataExpression.join('');
      }
      const expression = jsonata(jsonataExpression);

      const lookupValueFunction = (lookupName: string, value: string) => {
        if (!valueLookups) {
          throw new Error(
            `Invalid value lookup: ${lookupName}.  No value defined.`
          );
        }
        const lookup = valueLookups[lookupName];
        if (!lookup) {
          throw new Error(`Unable to find data set lookup: ${lookupName}`);
        }

        if (value === undefined || value === null) {
          if (lookup[LOOKUP_DEFAULT_VALUE] === undefined) {
            throw new Error(
              `Invalid lookup: ${lookupName}.  Default value not defined.`
            );
          }
          return resolveTokens(lookup[LOOKUP_DEFAULT_VALUE], tokenContext);
        } else {
          if (
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
          ) {
            throw new Error(`Invalid data set lookup value: ${lookupName}`);
          }
          const lookupValue = value.toString();
          if (lookupValue in lookup) {
            return resolveTokens(lookup[lookupValue], tokenContext);
          } else if (LOOKUP_DEFAULT_VALUE in lookup) {
            return resolveTokens(lookup[LOOKUP_DEFAULT_VALUE], tokenContext);
          } else {
            return value;
          }
        }
      };

      expression.registerFunction('vlookup', lookupValueFunction);
      expression.registerFunction('mlookup', (lookupName, value) => {
        console.warn('$mlookup is deprecated.  Please use $vlookup.');
        return lookupValueFunction(lookupName, value);
      });

      result[key] = expression.evaluate(o);
    }

    return result;
  }

  private initTokenContext(params?: DataValueMap): TokenContext {
    return {
      ...params,
      messages: this.messages
    };
  }

  /**
   * Retrieves a property value from an object.
   *
   * @param o Object to inspect.
   * @param property Full path to the property in parent.child.property form.
   *
   * @returns The property value or undefined if the property was not found.
   */
  private getPropertyValue(
    o: any,
    property: string
  ): DataValue | DataObject | DataObject[] | undefined {
    const expression = jsonata(property);
    return expression.evaluate(o);
  }

  /**
   * Returns true if object on left matches object on right based on provided predicate.
   *
   * @param left Object on left side of join.
   * @param right Object on right side of join.
   * @param predicate Predicate to use for comparison.
   */
  private isPredicateMatch(
    left: any,
    right: any,
    predicate: IPredicateClause[]
  ) {
    for (const clause of predicate) {
      if (
        clause.leftExpression.evaluate(left) !==
        clause.rightExpression.evaluate(right)
      ) {
        return false;
      }
    }
    return true;
  }
}
