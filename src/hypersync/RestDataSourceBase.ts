import { StringMap } from './common';
import { DataSourceBase } from './DataSourceBase';
import {
  DataSetResultStatus,
  IDataSetResultComplete,
  IDataSetResultPending,
  SyncMetadata
} from './IDataSource';
import { IErrorInfo } from './models';
import { Paginator, PagingState } from './Paginator';
import {
  IterableObject,
  IteratorPlanDataSetResult,
  ServiceDataIterator
} from './ServiceDataIterator';
import { resolveTokens, TokenContext } from './tokens';

import {
  DataObject,
  DataSetIteratorDefinition,
  DataSetMethod,
  DataSetMethodsWithBody,
  DataValue,
  DataValueMap,
  IDataSet,
  IRestDataSourceConfig,
  PagingLevel,
  Transform,
  ValueLookup
} from '@hyperproof/hypersync-models';
import {
  ApiClient,
  compareValues,
  IApiClientResponse,
  ILocalizable,
  Logger
} from '@hyperproof/integration-sdk';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import jsonata from 'jsonata';
import set from 'lodash/set';
import { HeadersInit, Response } from 'node-fetch';
import queryString from 'query-string';

const LOOKUP_DEFAULT_VALUE = '__default__';

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
 * functionality.
 */
export class RestDataSourceBase<
  TDataSet extends IDataSet = IDataSet
> extends DataSourceBase {
  protected config: IRestDataSourceConfig<TDataSet>;
  protected apiClient: ApiClient;
  protected messages: StringMap;
  protected headers: HeadersInit;
  protected pagingState: PagingState = PagingState.None;

  public constructor(
    config: IRestDataSourceConfig<TDataSet>,
    messages: StringMap,
    headers: HeadersInit,
    apiClient = new ApiClient(headers, config.baseUrl)
  ) {
    super();
    // Make a deep copy of the config to support later modification.
    this.config = {
      baseUrl: config.baseUrl,
      dataSets: { ...config.dataSets },
      valueLookups: { ...(config.valueLookups ?? config.messages) }
    };
    this.messages = messages;
    this.headers = headers;
    this.apiClient = apiClient;
  }

  public setPagingState(pagingState: PagingState) {
    if (this.pagingState !== PagingState.None) {
      throw new Error('Paging state can only be set once.');
    }
    this.pagingState = pagingState;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async setBaseUrlFromHost(hostUrl?: string): Promise<void> {
    if (!hostUrl) {
      return;
    }
    this.setBaseUrl(hostUrl);
  }

  public async setBaseUrl(baseUrl: string): Promise<void> {
    this.config.baseUrl = baseUrl;
    this.apiClient.setBaseUrl(baseUrl);
  }

  /**
   * Explicitly set the retry count on the DataSource's ApiClient's ThrottleManager
   */
  public setRetryCount(retryCount: number) {
    this.apiClient.setRetryCount(retryCount);
  }

  /**
   * Returns the configuration for the data source.
   */
  public getConfig() {
    return this.config;
  }

  /**
   * allows overwriting the base url and api client's headers
   */
  public overwriteBaseUrlAndHeaders(url: string, headers: HeadersInit) {
    this.config.baseUrl = url;
    this.setHeaders(headers);
  }

  /**
   * Adds a new data set to the collection of configured data sets.
   */
  public addDataSet(name: string, dataSet: TDataSet) {
    if (Object.prototype.hasOwnProperty.call(this.config.dataSets, name)) {
      throw new Error('A data set with that name already exists.');
    }
    this.config.dataSets[name] = dataSet;
  }

  /**
   * Adds a new value lookup to the collection of configured value lookups.
   */
  public addValueLookup(name: string, valueLookup: ValueLookup) {
    if (!this.config.valueLookups) {
      this.config.valueLookups = {};
    }
    if (Object.prototype.hasOwnProperty.call(this.config.valueLookups, name)) {
      throw new Error('A value lookup with that name already exists.');
    }
    this.config.valueLookups[name] = valueLookup;
  }

  public async getUnprocessedResponse(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<Response> {
    const dataSet = this.config.dataSets[dataSetName];
    if (!dataSet) {
      throw new Error(`Invalid data set name: ${dataSetName}`);
    }

    // Resolve tokens in the URL and query string.
    const { resolvedUrl } = this.resolveUrlTokens(params, dataSet);

    await Logger.info(
      `RestDataSourceBase: Retrieving RAW response from URL '${resolvedUrl}'`
    );

    return this.apiClient.getUnprocessedResponse(
      resolvedUrl,
      undefined,
      dataSet.isAbsoluteUrl
    );
  }

  public async generateIteratorPlan(
    proofType: string,
    dataSetIterator: DataSetIteratorDefinition[],
    dataSetParams: DataValueMap,
    iteratorParams: DataValueMap,
    metadata?: SyncMetadata
  ): Promise<IteratorPlanDataSetResult> {
    const iterator = new ServiceDataIterator(this, dataSetIterator, proofType);
    return iterator.generateIteratorPlan(
      dataSetParams,
      iteratorParams,
      metadata
    );
  }

  public async iterateDataFlow(
    proofType: string,
    dataSetName: string,
    dataSetIterator: DataSetIteratorDefinition[],
    iterableSlice: IterableObject[],
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata,
    organization?: ILocalizable
  ): Promise<RestDataSetResult<DataObject[]>> {
    const iterator = new ServiceDataIterator(this, dataSetIterator, proofType);
    return iterator.iterateDataFlow(
      dataSetName,
      iterableSlice,
      params,
      page,
      metadata,
      organization
    );
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
    metadata?: SyncMetadata,
    organization?: ILocalizable
  ): Promise<RestDataSetResult<TData>> {
    await Logger.debug(
      `RestDataSourceBase: Retrieving Hypersync service data for data set '${dataSetName}'`
    );
    const dataSet = this.config.dataSets[dataSetName];
    if (!dataSet) {
      throw new Error(`Invalid data set name: ${dataSetName}`);
    }

    // Resolve tokens in the URL and query string.
    const { resolvedUrl: relativeUrl, tokenContext } = this.resolveUrlTokens(
      params,
      dataSet
    );

    let requestBody;
    if (dataSet.method && DataSetMethodsWithBody.includes(dataSet.method)) {
      requestBody = this.generateRequestBody(
        dataSetName,
        tokenContext,
        dataSet.body,
        params
      );
    }

    let response;
    if (dataSet.pagingScheme) {
      // Fetch paginated data from the service.
      response = await this.pageDataFromUrl(
        dataSetName,
        dataSet,
        relativeUrl,
        params,
        page,
        metadata,
        dataSet.method,
        requestBody,
        dataSet.headers,
        organization
      );
    } else {
      // Fetch the data from the service.
      response = await this.getDataFromUrl(
        dataSetName,
        dataSet,
        relativeUrl,
        params,
        page,
        metadata,
        dataSet.method,
        requestBody,
        dataSet.headers,
        organization
      );
    }

    if (response.status !== DataSetResultStatus.Complete) {
      return response;
    }

    return this.processResponse(
      dataSetName,
      dataSet,
      tokenContext,
      response,
      params,
      metadata
    );
  }

  private resolveUrlTokens(
    params: DataValueMap | undefined,
    dataSet: TDataSet
  ) {
    const tokenContext = this.initTokenContext(params);
    let resolvedUrl = resolveTokens(dataSet.url, tokenContext);
    const query = { ...dataSet.query };
    if (Object.keys(query).length) {
      for (const key of Object.keys(query)) {
        query[key] = resolveTokens(query[key], tokenContext);
      }

      // Only include query parameters that have a non-empty value.
      const filteredQuery = Object.keys(query).reduce(
        (acc: DataValueMap, key) => {
          if (query[key] && query[key].length > 0) {
            acc[key] = query[key];
          }
          return acc;
        },
        {}
      );

      if (Object.keys(filteredQuery).length !== 0) {
        resolvedUrl = `${resolvedUrl}?${queryString.stringify(filteredQuery)}`;
      }
    }

    return { resolvedUrl, tokenContext };
  }

  /**
   * Processes data retrieved from the service.  This includes applying joins,
   * lookups, filters, transforms and sorting.
   *
   * @param dataSetName Name of the data set to retrieve.
   * @param dataSet The data set to retrieve
   * @param tokenContext The token context to use when resolving tokens.
   * @param response The result of the data retrieval.
   * @param params Parameter values to be used when retrieving data. Optional.
   * @param metadata Metadata from previous sync run if requeued. Optional.
   */
  protected async processResponse<TData>(
    dataSetName: string,
    dataSet: TDataSet,
    tokenContext: TokenContext,
    response: IRestDataSetComplete<TData>,
    params?: DataValueMap,
    metadata?: SyncMetadata
  ): Promise<RestDataSetResult<TData>> {
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
      } else if (
        this.isArrayResult(dataSet) &&
        [null, undefined].includes(data)
      ) {
        // Allow for offset pagination beyond end of record set
        data = [];
      } else {
        throw new Error(
          `Data returned from ${dataSetName} response ${
            dataSet.property ? `'.${dataSet.property}' property` : 'body'
          } does not match expected ${dataSet.result} result.`
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
   * Alias for getDataObject that only permits dataSets with PUT method
   */
  public async putDataObject<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IRestDataSetComplete<TData>> {
    this.validateRequestMethod(dataSetName, DataSetMethod.PUT);
    const response = await super.getDataObject<TData>(dataSetName, params);
    return response as IRestDataSetComplete<TData>;
  }

  /**
   * Alias for getDataObject that only permits dataSets with POST method
   */
  public async postDataObject<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IRestDataSetComplete<TData>> {
    this.validateRequestMethod(dataSetName, DataSetMethod.POST);
    const response = await super.getDataObject<TData>(dataSetName, params);
    return response as IRestDataSetComplete<TData>;
  }

  /**
   * Alias for getDataObject that only permits dataSets with PATCH method
   */
  public async patchDataObject<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IRestDataSetComplete<TData>> {
    this.validateRequestMethod(dataSetName, DataSetMethod.PATCH);
    const response = await super.getDataObject<TData>(dataSetName, params);
    return response as IRestDataSetComplete<TData>;
  }

  private validateRequestMethod(
    dataSetName: string,
    method: DataSetMethod
  ): void {
    const dataSet = this.config.dataSets[dataSetName];
    if (dataSet?.method !== method) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Called ${method}DataObject with a dataSet that does not use ${method} method`
      );
    }
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
   * @param {DataSetMethod} method REST HTTP Method. Optional.
   * @param {object} requestBody Request body of the HTTP request. Optional.
   * @param {object} requestHeaders Additional headers to be included in the HTTP request. Optional.
   * @param {*} organization The localization data to be used for formatting. Optional.
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
    metadata?: SyncMetadata,
    method?: DataSetMethod,
    requestBody?: any,
    requestHeaders?: { [key: string]: string },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    organization?: ILocalizable
  ): Promise<RestDataSetResult<any>> {
    await Logger.info(
      `RestDataSourceBase: Retrieving data from URL '${relativeUrl}'`
    );
    let response: IApiClientResponse<any>;

    switch (method) {
      case DataSetMethod.PATCH:
        response = await this.apiClient.patchJson(
          relativeUrl,
          requestBody,
          requestHeaders
        );
        break;
      case DataSetMethod.POST:
        response = await this.apiClient.postJson(
          relativeUrl,
          requestBody,
          requestHeaders
        );

        break;
      case DataSetMethod.PUT:
        response = await this.apiClient.putJson(
          relativeUrl,
          requestBody,
          requestHeaders
        );
        break;
      case DataSetMethod.GET:
      case undefined:
        response = await this.apiClient.getJson(relativeUrl, requestHeaders);
        break;
      default:
        throw createHttpError(
          StatusCodes.METHOD_NOT_ALLOWED,
          `RestDataSourceBase does not support ${method} requests`
        );
    }

    const { json: data, source, headers } = response;
    this.validateResponse(dataSetName, data, source, headers);

    return {
      status: DataSetResultStatus.Complete,
      data,
      source,
      headers
    };
  }

  /**
   * Retrieves paginated data as JSON from a service-relative URL.
   * Pagination can be aggregated at the job (default) or connector level.
   *
   * @param {string} dataSetName Name of the data set.
   * @param {object} dataSet Data set for which data is being retrieved.
   * @param {string} relativeUrl Service-relative URL from which data should be retrieved.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   * @param {string} page The page value to continue fetching data from a previous sync. Optional.
   * @param {object} metadata Metadata from previous sync run if requeued. Optional.
   * @param {DataSetMethod} method REST HTTP Method. Optional.
   * @param {object} requestBody Body of the HTTP request. Optional.
   * @param {object} requestHeaders Additional headers to be included in the HTTP request. Optional.
   * @param {*} organization The localization data to be used for formatting. Optional.
   *
   * @returns RestDataSetResult
   */
  private async pageDataFromUrl(
    dataSetName: string,
    dataSet: IDataSet,
    relativeUrl: string,
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata,
    method?: DataSetMethod,
    requestBody?: any,
    requestHeaders?: { [key: string]: string },
    organization?: ILocalizable
  ): Promise<RestDataSetResult<any>> {
    const baseUrl = this.config.baseUrl;
    const paginator = Paginator.createPaginator(dataSet.pagingScheme!, method);

    if (this.isConnectorLevelPaging(dataSet)) {
      const results: any = [];
      let connectorPage: string | undefined;
      let response;
      do {
        const { pagedRelativeUrl, pagedMessageBody } =
          paginator.paginateRequest(
            relativeUrl,
            baseUrl,
            requestBody,
            method,
            connectorPage
          );
        response = await this.getDataFromUrl(
          dataSetName,
          dataSet,
          pagedRelativeUrl,
          params,
          page,
          metadata,
          method,
          pagedMessageBody,
          requestHeaders,
          organization
        );

        if (response.status !== DataSetResultStatus.Complete) {
          return response;
        }

        if (dataSet.property) {
          const resultsAtProperty = this.getPropertyValue(
            response.data,
            dataSet.property
          );
          results.push(...((resultsAtProperty ?? []) as DataObject[]));
        } else {
          results.push(...(response.data ?? []));
        }

        connectorPage = paginator.getNextPage(
          dataSet,
          response.data,
          response.headers,
          baseUrl
        );
      } while (connectorPage !== undefined);
      return {
        ...response,
        source: baseUrl
          ? new URL(relativeUrl, baseUrl).toString()
          : relativeUrl,
        data: dataSet.property ? set({}, dataSet.property, results) : results
      };
    } else {
      // Default to job level paging
      const { pagedRelativeUrl, pagedMessageBody } = paginator.paginateRequest(
        relativeUrl,
        baseUrl,
        requestBody,
        method,
        page
      );
      const response = await this.getDataFromUrl(
        dataSetName,
        dataSet,
        pagedRelativeUrl,
        params,
        page,
        metadata,
        method,
        pagedMessageBody,
        requestHeaders,
        organization
      );

      if (response.status !== DataSetResultStatus.Complete) {
        return response;
      }

      const nextPage: string | undefined = paginator.getNextPage(
        dataSet,
        response.data,
        response.headers,
        baseUrl
      );
      return {
        ...response,
        source: baseUrl
          ? new URL(relativeUrl, baseUrl).toString()
          : relativeUrl,
        nextPage
      };
    }
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
        if (!dataObject || typeof dataObject !== 'object') {
          await Logger.warn(
            `RestDataSourceBase: Skipping invalid data object in lookup of type: ${typeof dataObject}`
          );
          continue;
        }
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
        if (lookup.delaySeconds) {
          const { delaySeconds } = lookup;
          if (isNaN(delaySeconds) || delaySeconds < 0 || delaySeconds > 1) {
            throw new Error(
              `Invalid delay seconds number: ${delaySeconds} for data set: ${dataSetName}.  Must be less than or equal to 1.`
            );
          }
          await new Promise(resolve =>
            setTimeout(resolve, delaySeconds * 1000)
          );
        }

        try {
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
        } catch (error) {
          if (lookup.continueOnError === true) {
            await Logger.warn(
              `Continuing upon error performing lookup for data set: ${lookup.dataSet}`,
              JSON.stringify(error)
            );
            continue;
          }
          throw error;
        }
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

      // TODO: HYP-35127: "property" is not the best name for the LHS in
      // a filter criterion now that we support expressions.
      const filterCriteria = dataSet.filter.map(criterion => ({
        expression: jsonata(criterion.property),
        value:
          criterion.value && typeof criterion.value === 'string'
            ? resolveTokens(criterion.value, tokenContext)
            : criterion.value
      }));

      data = data.filter(item => {
        for (const criterion of filterCriteria) {
          if (criterion.expression.evaluate(item) !== criterion.value) {
            return false;
          }
        }
        return true;
      });

      // If the return type is an object and we just filtered down to one
      // element in the array, return the first element as an object.
      if (!this.isArrayResult(dataSet)) {
        switch (data.length) {
          case 0:
            data = undefined;
            break;
          case 1:
            data = data[0];
            break;
          default:
            throw new Error(
              `Object result specified for data set but filtered result had ${data.length} items.`
            );
        }
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
  protected isArrayResult(dataSet: IDataSet) {
    return dataSet.result === 'array';
  }

  /**
   * Helper function that transforms a single object.
   *
   * @param {object} transform Transform to apply to the data.
   * @param {object} o Object to be transformed.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  protected transformObject(
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

      const valueLookupFunction = (lookupName: string, value: string) => {
        if (!valueLookups) {
          throw new Error(
            `Invalid value lookup: ${lookupName}.  No value lookups defined.`
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
          return lookup[LOOKUP_DEFAULT_VALUE];
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
            return lookup[lookupValue];
          } else if (LOOKUP_DEFAULT_VALUE in lookup) {
            return lookup[LOOKUP_DEFAULT_VALUE];
          } else {
            return value;
          }
        }
      };

      expression.registerFunction('vlookup', valueLookupFunction);
      expression.registerFunction('mlookup', (lookupName, value) => {
        console.warn('$mlookup is deprecated.  Please use $vlookup.');
        return valueLookupFunction(lookupName, value);
      });

      // Evaluate the expression and resolve any remaining tokens.
      let expressionResult = expression.evaluate(o);
      if (typeof expressionResult === 'string') {
        // Since we may be operating on data returned from the service, we
        // can't rule out the possibility of the service returning data that
        // contains token-like references.  We suppress errors in this case
        // because we want to just ignore these tokens.
        expressionResult = resolveTokens(expressionResult, tokenContext, true);
      }

      result[key] = expressionResult;
    }

    return result;
  }

  protected initTokenContext(params?: DataValueMap): TokenContext {
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
  protected getPropertyValue(
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
  protected isPredicateMatch(
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

  /**
   * Generates request body before it is sent via POST or PATCH
   * by replacing tokens found in request at all levels in JSON object.
   *
   * @param dataSetName Name of the data set to retrieve.
   * @param tokenContext Dictionary of values to use in place of tokens.
   * @param body Request body of a POST or PATCH to be created or modified. Optional.
   * @param params Parameter values to be used when retrieving data. Optional.
   */
  protected generateRequestBody(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dataSetName: string,
    tokenContext: TokenContext,
    body?: string | object | undefined,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params?: DataValueMap
  ): string | object | undefined {
    if (!body) {
      return body;
    }
    return resolveTokens(body as object | string, tokenContext);
  }

  /**
   * Validates response model of the external service.
   * Derived class may throw error when model is unexpected or error is detected.
   *
   * @param dataSetName Name of the retrieved data set.
   * @param data Data returned from the external service.
   * @param source API endpoint of the external service.
   * @param headers Response headers returned from external service.
   */
  protected validateResponse(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dataSetName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    source: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    headers: { [name: string]: string[] }
  ): void {
    // No validation applied by default
  }

  protected isConnectorLevelPaging(dataSet: IDataSet): boolean {
    if (dataSet.pagingScheme?.level === PagingLevel.Connector) {
      return true;
    } else if (
      dataSet.pagingScheme &&
      [PagingState.IterationPlan, PagingState.BatchedIteration].includes(
        this.pagingState
      )
    ) {
      return true;
    }
    return false;
  }
}
