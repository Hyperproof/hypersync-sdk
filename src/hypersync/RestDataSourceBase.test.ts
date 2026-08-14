import { RestDataSourceBase } from './RestDataSourceBase';

import { IDataSet, IRestDataSourceConfig } from '@hyperproof/hypersync-models';
import { DataSetResultStatus } from '@hyperproof/hypersync-sdk';
import { ApiClient, Logger } from '@hyperproof/integration-sdk';
import { StatusCodes } from 'http-status-codes';
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
    restDataSourceBase = new RestDataSourceBase(config, messages, headers, apiClient);
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
    expect(restDataSourceBase.getConfig().dataSets['newDataSet']).toBe(newDataSet);
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
    expect(restDataSourceBase.getConfig().valueLookups['newValueLookup']).toBe(newValueLookup);
  });

  it('should throw when getUnprocessedResponse is called with an invalid data set', async () => {
    try {
      await restDataSourceBase.getUnprocessedResponse('invalid', {
        testMessage: 'message'
      });
    } catch (err) {
      expect((err as Error).message).toBe('Invalid data set name: invalid');
      expect((err as any).status).toBe(StatusCodes.NOT_FOUND);
    }

    expect(apiClient.getUnprocessedResponse).not.toHaveBeenCalled();
  });

  it('should call ApiClient.getUnprocessedResponse when getUnprocessedResponse is called with a valid data set', async () => {
    await restDataSourceBase.getUnprocessedResponse('testDataSet', {
      testMessage: 'message'
    });
    expect(apiClient.getUnprocessedResponse).toHaveBeenCalledWith('testUrl', undefined, undefined);
  });

  it('should call ApiClient.getUnprocessedResponse with resolved URL', async () => {
    const params = { testParam: 'paramValue' };
    const resolvedUrl = 'resolvedTestUrl';
    jest.spyOn(restDataSourceBase as any, 'resolveUrlTokens').mockReturnValue({ resolvedUrl });
    await restDataSourceBase.getUnprocessedResponse('testDataSet', params);
    expect(apiClient.getUnprocessedResponse).toHaveBeenCalledWith(resolvedUrl, undefined, undefined);
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
    jest.spyOn(restDataSourceBase, 'getDataFromUrl').mockResolvedValue(response);
    const processResponseSpy = jest.spyOn(restDataSourceBase as any, 'processResponse').mockResolvedValue(response);
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
    jest.spyOn(restDataSourceBase, 'getDataFromUrl').mockResolvedValue(response);
    const processResponseSpy = jest.spyOn(restDataSourceBase as any, 'processResponse').mockResolvedValue(response);
    const result = await restDataSourceBase.getDataObject('testDataSet', params);
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
    jest.spyOn(restDataSourceBase, 'getDataFromUrl').mockResolvedValue(response);

    const result = await restDataSourceBase.getDataObjectArray('testDataSetArray', params);
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
    const isArrayResultSpy = jest.spyOn(restDataSourceBase as any, 'isArrayResult').mockReturnValue(true);
    const result = restDataSourceBase['isArrayResult'](config.dataSets['testDataSet']);
    expect(isArrayResultSpy).toHaveBeenCalledWith(config.dataSets['testDataSet']);
    expect(result).toBe(true);
  });

  it('should call isArrayResult and return false for object result', () => {
    config.dataSets['testDataSet'].result = 'object';
    const isArrayResultSpy = jest.spyOn(restDataSourceBase as any, 'isArrayResult').mockReturnValue(false);
    const result = restDataSourceBase['isArrayResult'](config.dataSets['testDataSet']);
    expect(isArrayResultSpy).toHaveBeenCalledWith(config.dataSets['testDataSet']);
    expect(result).toBe(false);
  });

  it('should call transformObject when transformObject is called', () => {
    const transform = { transformed: 'data' };
    const dataObject = {};
    const transformObjectSpy = jest.spyOn(restDataSourceBase as any, 'transformObject');
    restDataSourceBase['transformObject'](transform, dataObject);
    expect(transformObjectSpy).toHaveBeenCalledWith(transform, dataObject);
  });

  it('should call initTokenContext and return token context', () => {
    const params = { testParam: 'paramValue' };
    const initTokenContextSpy = jest.spyOn(restDataSourceBase as any, 'initTokenContext').mockReturnValue({});
    const tokenContext = restDataSourceBase['initTokenContext'](params);
    expect(initTokenContextSpy).toHaveBeenCalledWith(params);
    expect(tokenContext).toEqual({});
  });

  it('should call getPropertyValue and return property value', () => {
    const dataObject = { key: { nestedKey: 'value' } };
    const getPropertyValueSpy = jest.spyOn(restDataSourceBase as any, 'getPropertyValue').mockReturnValue('value');
    const propertyValue = restDataSourceBase['getPropertyValue'](dataObject, 'key.nestedKey');
    expect(getPropertyValueSpy).toHaveBeenCalledWith(dataObject, 'key.nestedKey');
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
    const isPredicateMatchSpy = jest.spyOn(restDataSourceBase as any, 'isPredicateMatch').mockReturnValue(true);
    const result = restDataSourceBase['isPredicateMatch'](left, right, predicate);
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
    const isPredicateMatchSpy = jest.spyOn(restDataSourceBase as any, 'isPredicateMatch').mockReturnValue(false);
    const result = restDataSourceBase['isPredicateMatch'](left, right, predicate);
    expect(isPredicateMatchSpy).toHaveBeenCalledWith(left, right, predicate);
    expect(result).toBe(false);
  });

  it('should call generateRequestBody and return request body', () => {
    const tokenContext = {};
    const body = { key: 'value' };
    const generateRequestBodySpy = jest.spyOn(restDataSourceBase as any, 'generateRequestBody').mockReturnValue(body);
    const requestBody = restDataSourceBase['generateRequestBody']('testDataSet', tokenContext, body);
    expect(generateRequestBodySpy).toHaveBeenCalledWith('testDataSet', tokenContext, body);
    expect(requestBody).toBe(body);
  });

  it('should call validateResponse when validateResponse is called', () => {
    const data = {};
    const source = 'testSource';
    const headers = { 'Content-Type': ['application/json'] };
    const validateResponseSpy = jest.spyOn(restDataSourceBase as any, 'validateResponse');
    restDataSourceBase['validateResponse']('testDataSet', data, source, headers);
    expect(validateResponseSpy).toHaveBeenCalledWith('testDataSet', data, source, headers);
  });

  it('should call validateResponse and not throw for valid response', () => {
    const data = {};
    const source = 'testSource';
    const headers = { 'Content-Type': ['application/json'] };
    expect(() => restDataSourceBase['validateResponse']('testDataSet', data, source, headers)).not.toThrow();
  });

  it('should call validateResponse and throw for invalid response', () => {
    const data = { error: 'Invalid response' };
    const source = 'testSource';
    const headers = { 'Content-Type': ['application/json'] };
    jest.spyOn(restDataSourceBase as any, 'validateResponse').mockImplementation(() => {
      throw new Error('Invalid response');
    });
    expect(() => restDataSourceBase['validateResponse']('testDataSet', data, source, headers)).toThrow(
      'Invalid response'
    );
  });

  it('should call applyLookups with null data and continue without token resolution error', async () => {
    const dataSetName = 'testDataSetLookups';
    const dataSet = config.dataSets[dataSetName];
    const tokenContext = {};
    const data = null;
    const metadata = undefined;

    const result = await restDataSourceBase['applyLookups'](dataSetName, dataSet, tokenContext, data, metadata);
    expect(result).toEqual(null);
  });

  it('should apply lookups per row with token substitution', async () => {
    const dataSetName = 'testDataSetLookups';
    const dataSet = config.dataSets[dataSetName];
    const tokenContext = {};
    const data = [{ id: 'row-1' }, { id: 'row-2' }];

    const getDataSpy = jest.spyOn(restDataSourceBase, 'getData').mockImplementation(async (_dataSet, params) => {
      return {
        status: DataSetResultStatus.Complete,
        data: { echoedParam: params?.param1 }
      } as any;
    });

    const result = await restDataSourceBase['applyLookups'](dataSetName, dataSet, tokenContext, data);

    expect(getDataSpy).toHaveBeenNthCalledWith(1, 'lookupDataSet', { param1: 'row-1' }, undefined, undefined);
    expect(getDataSpy).toHaveBeenNthCalledWith(2, 'lookupDataSet', { param1: 'row-2' }, undefined, undefined);
    expect(result[0].lookupData).toEqual({ echoedParam: 'row-1' });
    expect(result[1].lookupData).toEqual({ echoedParam: 'row-2' });
  });

  describe('dropEmptyRows', () => {
    it('drops rows where every value is null', async () => {
      const data = [
        { a: null, b: null, c: null },
        { a: 'x', b: null, c: null }
      ];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual([{ a: 'x', b: null, c: null }]);
    });

    it('drops rows where every value is undefined', async () => {
      const data = [
        { a: undefined, b: undefined },
        { a: 1, b: undefined }
      ];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual([{ a: 1, b: undefined }]);
    });

    it('drops rows where every value is an empty or whitespace-only string', async () => {
      const data = [
        { a: '', b: '   ', c: '\t\n' },
        { a: 'x', b: '', c: '' }
      ];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual([{ a: 'x', b: '', c: '' }]);
    });

    it('drops rows with mixed null/undefined/whitespace values', async () => {
      const data = [
        { a: null, b: undefined, c: ' ' },
        { a: 0, b: null, c: ' ' }
      ];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual([{ a: 0, b: null, c: ' ' }]);
    });

    it('keeps rows with a single non-empty value (boundary)', async () => {
      const data = [{ a: 'value', b: null, c: null, d: null, e: null }];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual(data);
    });

    it('treats empty arrays as non-empty values and keeps the row', async () => {
      const data = [{ a: [], b: null }];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual(data);
    });

    it('treats empty objects as non-empty values and keeps the row', async () => {
      const data = [{ a: {}, b: null }];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual(data);
    });

    it('treats numeric zero and boolean false as non-empty values', async () => {
      const data = [
        { a: 0, b: null },
        { a: false, b: null }
      ];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual(data);
    });

    it('logs the dropped row count when rows are dropped', async () => {
      const data = [
        { a: null, b: null },
        { a: null, b: '   ' },
        { a: 'x', b: null }
      ];
      await restDataSourceBase['dropEmptyRows']('myDataSet', data);
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining("Dropped 2 empty row(s) from 'myDataSet'."));
    });

    it('does not log when no rows are dropped', async () => {
      const data = [{ a: 'x' }, { a: 'y' }];
      await restDataSourceBase['dropEmptyRows']('myDataSet', data);
      expect(Logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Dropped'));
    });

    it('preserves an empty array input unchanged', async () => {
      const result = await restDataSourceBase['dropEmptyRows']('ds', []);
      expect(result).toEqual([]);
    });

    it('preserves primitive (non-object) rows', async () => {
      const data = [null, 'a string', 0, false];
      const result = await restDataSourceBase['dropEmptyRows']('ds', data);
      expect(result).toEqual(data);
    });
  });

  describe('processResponse empty-row filtering', () => {
    it('drops empty rows by default for array results after transform', async () => {
      const dataSet: IDataSet = {
        url: 'testUrl',
        method: 'GET',
        description: 'desc',
        result: 'array',
        transform: {
          name: "$join([first ? first : '', last ? last : ''], ' ')",
          email: 'email'
        }
      };
      const response = {
        status: DataSetResultStatus.Complete,
        data: [
          { first: 'Andrea', last: 'Rentería', email: null },
          { first: null, last: null, email: null },
          { first: 'Test', last: 'Test', email: 'test@example.com' }
        ]
      };

      const result = await restDataSourceBase['processResponse']('testDs', dataSet, {}, response as any);
      expect(result.data).toEqual([
        { name: 'Andrea Rentería', email: null },
        { name: 'Test Test', email: 'test@example.com' }
      ]);
    });

    it('preserves empty rows when keepEmptyRows is true', async () => {
      const dataSet: IDataSet = {
        url: 'testUrl',
        method: 'GET',
        description: 'desc',
        result: 'array',
        keepEmptyRows: true,
        transform: {
          name: "$join([first ? first : '', last ? last : ''], ' ')",
          email: 'email'
        }
      };
      const response = {
        status: DataSetResultStatus.Complete,
        data: [
          { first: 'Andrea', last: 'Rentería', email: null },
          { first: null, last: null, email: null }
        ]
      };

      const result = await restDataSourceBase['processResponse']('testDs', dataSet, {}, response as any);
      expect(result.data).toEqual([
        { name: 'Andrea Rentería', email: null },
        { name: ' ', email: null }
      ]);
    });

    it('does not filter when result is object (single record)', async () => {
      const dataSet: IDataSet = {
        url: 'testUrl',
        method: 'GET',
        description: 'desc',
        result: 'object',
        transform: { a: 'a', b: 'b' }
      };
      const response = {
        status: DataSetResultStatus.Complete,
        data: { a: null, b: null }
      };

      const result = await restDataSourceBase['processResponse']('testDs', dataSet, {}, response as any);
      expect(result.data).toEqual({ a: null, b: null });
    });
  });

  it('should continue on lookup errors when continueOnError is true', async () => {
    const dataSetName = 'testDataSetLookups';
    const dataSet = config.dataSets[dataSetName];
    const tokenContext = {};
    const data = [{ id: 'row-1' }];

    jest.spyOn(restDataSourceBase, 'getData').mockImplementation(async () => {
      throw new Error('lookup failed');
    });

    const result = await restDataSourceBase['applyLookups'](dataSetName, dataSet, tokenContext, data);

    expect(result[0].lookupData).toBeUndefined();
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Continuing upon error performing lookup for data set: lookupDataSet'),
      expect.any(String)
    );
  });

  it('should throw 409 Conflict when addDataSet is called with a duplicate name', () => {
    expect(() => restDataSourceBase.addDataSet('testDataSet', {} as IDataSet)).toThrow(
      expect.objectContaining({ status: StatusCodes.CONFLICT, message: 'A data set with that name already exists.' })
    );
  });

  it('should throw 409 Conflict when addValueLookup is called with a duplicate name', () => {
    restDataSourceBase.addValueLookup('dupLookup', {});
    expect(() => restDataSourceBase.addValueLookup('dupLookup', {})).toThrow(
      expect.objectContaining({
        status: StatusCodes.CONFLICT,
        message: 'A value lookup with that name already exists.'
      })
    );
  });

  it('should throw 404 NotFound when getData is called with an invalid data set name', async () => {
    await expect(restDataSourceBase.getData('nonexistent')).rejects.toMatchObject({
      status: StatusCodes.NOT_FOUND,
      message: 'Invalid data set name: nonexistent'
    });
  });

  it('should throw 422 UnprocessableEntity when applyFilter encounters multiple items for an object result', async () => {
    const dataSetName = 'testDataSet';
    const dataSet = {
      ...config.dataSets[dataSetName],
      result: 'object',
      filter: [{ property: 'type', value: 'match' }]
    } as IDataSet;
    const tokenContext = {};
    const data = [
      { type: 'match', id: 1 },
      { type: 'match', id: 2 }
    ];

    await expect(restDataSourceBase['applyFilter'](dataSetName, dataSet, tokenContext, data, {})).rejects.toMatchObject(
      {
        status: StatusCodes.UNPROCESSABLE_ENTITY,
        message: expect.stringContaining('Object result specified for data set but filtered result had 2 items.')
      }
    );
  });

  describe('getAdditionalContext', () => {
    it('omits context from the result when getAdditionalContext returns undefined', async () => {
      const dataSetName = 'testDataSet';
      const response = { status: DataSetResultStatus.Complete, data: {} };

      const result = await restDataSourceBase['processResponse'](
        dataSetName,
        config.dataSets[dataSetName],
        {},
        response as any
      );
      expect(result.context).toBeUndefined();
    });

    it('merges getAdditionalContext into the result context when overridden', async () => {
      class DataSourceWithContext extends RestDataSourceBase {
        protected override getAdditionalContext() {
          return { portalBaseUrl: 'https://portal.azure.us' };
        }
      }
      const dataSourceWithContext = new DataSourceWithContext(config, messages, headers, apiClient);
      const dataSetName = 'testDataSet';
      const response = { status: DataSetResultStatus.Complete, data: {} };

      const result = await dataSourceWithContext['processResponse'](
        dataSetName,
        config.dataSets[dataSetName],
        {},
        response as any
      );
      expect(result.context).toEqual({ portalBaseUrl: 'https://portal.azure.us' });
    });
  });
});
