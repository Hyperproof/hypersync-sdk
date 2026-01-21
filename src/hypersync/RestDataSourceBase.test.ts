import { RestDataSourceBase } from './RestDataSourceBase';

import {
  IDataSet,
  IRestDataSourceConfig
} from '@hyperproof/hypersync-models';
import { DataSetResultStatus } from '@hyperproof/hypersync-sdk';
import { ApiClient } from '@hyperproof/integration-sdk';
import { HeadersInit } from 'node-fetch';

// Mock Logger
jest.mock('@hyperproof/integration-sdk', () => {
  return {
    ...jest.requireActual('@hyperproof/integration-sdk'),
    Logger: {
      log: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }
  };
});

describe('RestDataSourceBase', () => {
  let config: IRestDataSourceConfig<IDataSet>;
  let messages: { [key: string]: string };
  let headers: HeadersInit;
  let restDataSourceBase: RestDataSourceBase;

  const mockApiClient = {
    setRetryCount: jest.fn(),
    getUnprocessedResponse: jest.fn(),
    getJson: jest.fn(),
    postJson: jest.fn(),
    patchJson: jest.fn()
  };

  let apiClient = mockApiClient as unknown as ApiClient;

  beforeEach(() => {
    config = {
      baseUrl: 'http://testbaseurl.hyperproof.io',
      dataSets: {
        testDataSet: {
          url: 'testUrl',
          method: 'GET',
          headers: {},
          body: {},
          valueLookups: {},
          description: 'testDescription',
          result: 'object'
        },
        testDataSetArray: {
          url: 'testUrl',
          method: 'GET',
          headers: {},
          body: {},
          valueLookups: {},
          description: 'testDescription',
          result: 'array'
        },
        testDataSetPageBased: {
          url: 'pageBasedUrl',
          method: 'GET',
          pagingScheme: {
            type: 'pageBased',
            request: {
              pageParameter: 'page',
              pageStartingValue: 0,
              limitParameter: 'size',
              limitValue: 5
            },
            pageUntil: 'noDataLeft',
            level: 'connector'
          },
          headers: {},
          body: {},
          valueLookups: {},
          description: 'testDescription',
          result: 'array'
        },
        testDataSetTransforms: {
          url: 'testUrl',
          method: 'GET',
          headers: {},
          body: {},
          valueLookups: {},
          description: 'testDescription',
          result: 'object',
          transform: {
            transformedData: 'data'
          }
        },
        testDataSetLookups: {
          url: 'testUrl',
          method: 'GET',
          headers: {},
          body: {},
          lookups: [
            {
              alias: 'lookupData',
              dataSet: 'lookupDataSet',
              dataSetParams: {
                param1: '{{source.id}}'
              },
              continueOnError: true
            }
          ],
          valueLookups: {},
          description: 'testDescription',
          result: 'object'
        }
      },
      valueLookups: {}
    } as IRestDataSourceConfig<IDataSet>;
    messages = { testMessage: 'This is a test message' };
    headers = { Authorization: 'Bearer token' };
    restDataSourceBase = new RestDataSourceBase(
      config,
      messages,
      headers,
      apiClient
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should create RestDataSourceBase', () => {
    expect(restDataSourceBase).toBeDefined();
  });

  it('should call ApiClient.setRetryCount when setRetryCount is called', () => {
    restDataSourceBase.setRetryCount(3);
    expect(apiClient.setRetryCount).toHaveBeenCalledWith(3);
  });

  it('should call getConfig and return config', async () => {
    expect(restDataSourceBase.getConfig()).toStrictEqual(config);
  });

  it('should call overwriteBaseUrlAndHeaders and update config and headers', () => {
    const newUrl = 'newTestUrl';
    const newHeaders = { Authorization: 'Bearer newToken' };
    restDataSourceBase.overwriteBaseUrlAndHeaders(newUrl, newHeaders);
    expect(restDataSourceBase.getConfig().baseUrl).toBe(newUrl);
    expect(restDataSourceBase.apiClient.headers).toBe(newHeaders);
  });

  it('should add a new data set when addDataSet is called', () => {
    const newDataSet = {
      url: 'newTestUrl',
      method: 'GET',
      headers: {},
      body: {},
      valueLookups: {},
      description: 'newTestDescription',
      result: 'object'
    } as IDataSet;
    restDataSourceBase.addDataSet('newDataSet', newDataSet);
    expect(restDataSourceBase.getConfig().dataSets['newDataSet']).toBe(
      newDataSet
    );
  });

  it('should add a new value lookup when addValueLookup is called', () => {
    const newValueLookup = {
      url: 'newLookupUrl',
      method: 'GET',
      headers: {},
      body: {},
      description: 'newLookupDescription',
      result: 'object'
    };
    restDataSourceBase.addValueLookup('newValueLookup', newValueLookup);
    expect(restDataSourceBase.getConfig().valueLookups['newValueLookup']).toBe(
      newValueLookup
    );
  });

  it('should throw when getUnprocessedResponse is called with an invalid data set', async () => {
    try {
      await restDataSourceBase.getUnprocessedResponse('invalid', {
        testMessage: 'message'
      });
    } catch (err) {
      expect((err as Error).message).toBe('Invalid data set name: invalid');
    }

    expect(apiClient.getUnprocessedResponse).not.toHaveBeenCalled();
  });

  it('should call ApiClient.getUnprocessedResponse when getUnprocessedResponse is called with a valid data set', async () => {
    await restDataSourceBase.getUnprocessedResponse('testDataSet', {
      testMessage: 'message'
    });
    expect(apiClient.getUnprocessedResponse).toHaveBeenCalledWith(
      'testUrl',
      undefined,
      undefined
    );
  });

  it('should call ApiClient.getUnprocessedResponse with resolved URL', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ resolvedUrl });
    await restDataSourceBase.getUnprocessedResponse('testDataSet', params);
    expect(apiClient.getUnprocessedResponse).toHaveBeenCalledWith(
      resolvedUrl,
      undefined,
      undefined
    );
  });

  it('should call processResponse when getData is called with a valid data set', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    const tokenContext = {};
    const response = {
      status: DataSetResultStatus.Complete,
      data: {}
    };
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ relativeUrl: resolvedUrl, tokenContext });
    jest
      .spyOn(restDataSourceBase, 'getDataFromUrl')
      .mockResolvedValue(response);
    const processResponseSpy = jest
      .spyOn(restDataSourceBase as any, 'processResponse')
      .mockResolvedValue(response);
    await restDataSourceBase.getData('testDataSet', params);
    expect(processResponseSpy).toHaveBeenCalledWith(
      'testDataSet',
      config.dataSets['testDataSet'],
      tokenContext,
      response,
      params,
      undefined
    );
  });

  it('should call setHeaders and update headers', () => {
    const newHeaders = { Authorization: 'Bearer newToken' };
    restDataSourceBase.setHeaders(newHeaders);
    expect(restDataSourceBase.apiClient.headers).toBe(newHeaders);
  });

  it('should call getDataObject and return data object', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    const tokenContext = {};
    const response = { status: DataSetResultStatus.Complete, data: {} };
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ relativeUrl: resolvedUrl, tokenContext });
    jest
      .spyOn(restDataSourceBase, 'getDataFromUrl')
      .mockResolvedValue(response);
    const processResponseSpy = jest
      .spyOn(restDataSourceBase as any, 'processResponse')
      .mockResolvedValue(response);
    const result = await restDataSourceBase.getDataObject(
      'testDataSet',
      params
    );
    expect(result).toEqual(response);
  });

  it('should call getDataObjectArray and return data object array', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    const tokenContext = {};
    const response = { status: DataSetResultStatus.Complete, data: [] };
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ relativeUrl: resolvedUrl, tokenContext });
    jest
      .spyOn(restDataSourceBase, 'getDataFromUrl')
      .mockResolvedValue(response);

    const result = await restDataSourceBase.getDataObjectArray(
      'testDataSetArray',
      params
    );
    expect(result).toEqual(response);
  });

  it('should call getDataFromUrl and return data', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    const tokenContext = {};
    // we need to use the two individual response shapes here since we can't just mock getDataFromUrl
    // in the test for that method
    const getJsonResponse = { status: DataSetResultStatus.Complete, json: {} };
    const getDataFromUrlResponse = {
      status: DataSetResultStatus.Complete,
      data: {}
    };
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ relativeUrl: resolvedUrl, tokenContext });
    jest.spyOn(apiClient, 'getJson').mockResolvedValue(getJsonResponse);
    const result = await restDataSourceBase.getDataFromUrl(
      'testDataSet',
      config.dataSets['testDataSet'],
      resolvedUrl,
      params
    );
    expect(result).toEqual(getDataFromUrlResponse);
  });

  it('should call getDataFromUrl with POST method and return data', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    const tokenContext = {};
    // we need to use the two individual response shapes here since we can't just mock getDataFromUrl
    // in the test for that method
    const postJsonResponse = { status: DataSetResultStatus.Complete, json: {} };
    const getDataFromUrlResponse = {
      status: DataSetResultStatus.Complete,
      data: {}
    };
    const requestBody = { key: 'value' };
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ relativeUrl: resolvedUrl, tokenContext });
    jest.spyOn(apiClient, 'postJson').mockResolvedValue(postJsonResponse);
    const result = await restDataSourceBase.getDataFromUrl(
      'testDataSet',
      config.dataSets['testDataSet'],
      resolvedUrl,
      params,
      undefined,
      undefined,
      'POST',
      requestBody
    );
    expect(result).toEqual(getDataFromUrlResponse);
  });

  it('should call getDataFromUrl with PATCH method and return data', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    const tokenContext = {};
    // we need to use the two individual response shapes here since we can't just mock getDataFromUrl
    // in the test for that method
    const patchJsonResponse = {
      status: DataSetResultStatus.Complete,
      json: {}
    };
    const getDataFromUrlResponse = {
      status: DataSetResultStatus.Complete,
      data: {}
    };
    const requestBody = { key: 'value' };
    jest
      .spyOn(restDataSourceBase as any, 'resolveUrlTokens')
      .mockReturnValue({ relativeUrl: resolvedUrl, tokenContext });
    jest.spyOn(apiClient, 'patchJson').mockResolvedValue(patchJsonResponse);
    const result = await restDataSourceBase.getDataFromUrl(
      'testDataSet',
      config.dataSets['testDataSet'],
      resolvedUrl,
      params,
      undefined,
      undefined,
      'PATCH',
      requestBody
    );
    expect(result).toEqual(getDataFromUrlResponse);
  });

  it('should call isArrayResult and return true for array result', () => {
    const isArrayResultSpy = jest
      .spyOn(restDataSourceBase as any, 'isArrayResult')
      .mockReturnValue(true);
    const result = restDataSourceBase['isArrayResult'](
      config.dataSets['testDataSet']
    );
    expect(isArrayResultSpy).toHaveBeenCalledWith(
      config.dataSets['testDataSet']
    );
    expect(result).toBe(true);
  });

  it('should call isArrayResult and return false for object result', () => {
    config.dataSets['testDataSet'].result = 'object';
    const isArrayResultSpy = jest
      .spyOn(restDataSourceBase as any, 'isArrayResult')
      .mockReturnValue(false);
    const result = restDataSourceBase['isArrayResult'](
      config.dataSets['testDataSet']
    );
    expect(isArrayResultSpy).toHaveBeenCalledWith(
      config.dataSets['testDataSet']
    );
    expect(result).toBe(false);
  });

  it('should call transformObject when transformObject is called', () => {
    const transform = { transformed: 'data' };
    const dataObject = {};
    const transformObjectSpy = jest.spyOn(
      restDataSourceBase as any,
      'transformObject'
    );
    restDataSourceBase['transformObject'](transform, dataObject);
    expect(transformObjectSpy).toHaveBeenCalledWith(transform, dataObject);
  });

  it('should call initTokenContext and return token context', () => {
    const params = { testParam: 'paramValue' };
    const initTokenContextSpy = jest
      .spyOn(restDataSourceBase as any, 'initTokenContext')
      .mockReturnValue({});
    const tokenContext = restDataSourceBase['initTokenContext'](params);
    expect(initTokenContextSpy).toHaveBeenCalledWith(params);
    expect(tokenContext).toEqual({});
  });

  it('should call getPropertyValue and return property value', () => {
    const dataObject = { key: { nestedKey: 'value' } };
    const getPropertyValueSpy = jest
      .spyOn(restDataSourceBase as any, 'getPropertyValue')
      .mockReturnValue('value');
    const propertyValue = restDataSourceBase['getPropertyValue'](
      dataObject,
      'key.nestedKey'
    );
    expect(getPropertyValueSpy).toHaveBeenCalledWith(
      dataObject,
      'key.nestedKey'
    );
    expect(propertyValue).toBe('value');
  });

  it('should call isPredicateMatch and return true for matching predicate', () => {
    const left = { key: 'value' };
    const right = { key: 'value' };
    const predicate = [
      {
        leftExpression: { evaluate: () => 'value' },
        rightExpression: { evaluate: () => 'value' }
      }
    ];
    const isPredicateMatchSpy = jest
      .spyOn(restDataSourceBase as any, 'isPredicateMatch')
      .mockReturnValue(true);
    const result = restDataSourceBase['isPredicateMatch'](
      left,
      right,
      predicate
    );
    expect(isPredicateMatchSpy).toHaveBeenCalledWith(left, right, predicate);
    expect(result).toBe(true);
  });

  it('should call isPredicateMatch and return false for non-matching predicate', () => {
    const left = { key: 'value' };
    const right = { key: 'differentValue' };
    const predicate = [
      {
        leftExpression: { evaluate: () => 'value' },
        rightExpression: { evaluate: () => 'differentValue' }
      }
    ];
    const isPredicateMatchSpy = jest
      .spyOn(restDataSourceBase as any, 'isPredicateMatch')
      .mockReturnValue(false);
    const result = restDataSourceBase['isPredicateMatch'](
      left,
      right,
      predicate
    );
    expect(isPredicateMatchSpy).toHaveBeenCalledWith(left, right, predicate);
    expect(result).toBe(false);
  });

  it('should call generateRequestBody and return request body', () => {
    const tokenContext = {};
    const body = { key: 'value' };
    const generateRequestBodySpy = jest
      .spyOn(restDataSourceBase as any, 'generateRequestBody')
      .mockReturnValue(body);
    const requestBody = restDataSourceBase['generateRequestBody'](
      'testDataSet',
      tokenContext,
      body
    );
    expect(generateRequestBodySpy).toHaveBeenCalledWith(
      'testDataSet',
      tokenContext,
      body
    );
    expect(requestBody).toBe(body);
  });

  it('should call validateResponse when validateResponse is called', () => {
    const data = {};
    const source = 'testSource';
    const headers = { 'Content-Type': ['application/json'] };
    const validateResponseSpy = jest.spyOn(
      restDataSourceBase as any,
      'validateResponse'
    );
    restDataSourceBase['validateResponse'](
      'testDataSet',
      data,
      source,
      headers
    );
    expect(validateResponseSpy).toHaveBeenCalledWith(
      'testDataSet',
      data,
      source,
      headers
    );
  });

  it('should call validateResponse and not throw for valid response', () => {
    const data = {};
    const source = 'testSource';
    const headers = { 'Content-Type': ['application/json'] };
    expect(() =>
      restDataSourceBase['validateResponse'](
        'testDataSet',
        data,
        source,
        headers
      )
    ).not.toThrow();
  });

  it('should call validateResponse and throw for invalid response', () => {
    const data = { error: 'Invalid response' };
    const source = 'testSource';
    const headers = { 'Content-Type': ['application/json'] };
    jest
      .spyOn(restDataSourceBase as any, 'validateResponse')
      .mockImplementation(() => {
        throw new Error('Invalid response');
      });
    expect(() =>
      restDataSourceBase['validateResponse'](
        'testDataSet',
        data,
        source,
        headers
      )
    ).toThrow('Invalid response');
  });

  it('should call applyLookups with null data and continue without token resolution error', async () => {
    const dataSetName = 'testDataSetLookups';
    const dataSet = config.dataSets[dataSetName];
    const tokenContext = {};
    const data = null;
    const metadata = undefined;

    const result = await restDataSourceBase['applyLookups'](
      dataSetName,
      dataSet,
      tokenContext,
      data,
      metadata
    );
    expect(result).toEqual(null);
  });
});
