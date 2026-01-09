import {
  DataSetMethod,
  GraphQLConnectionsRequest,
  IDataSet,
  IGraphQLConnectionsScheme,
  INextTokenScheme,
  IOffsetAndLimitScheme,
  IPageBasedScheme,
  NextTokenRequest,
  NextTokenType,
  OffsetAndLimitRequest,
  PageBasedRequest,
  PageUntilCondition,
  PagingScheme,
  PagingType
} from '@hyperproof-int/hypersync-models';
import jsonata from 'jsonata';
import set from 'lodash/set';

const HEADER_PREFIX = 'header:'; // Prefix indicating property found in response header
const PROPERTY_ACCESSORS = ['@odata.nextLink']; // Do not evaluate as jsonata expression

export enum PagingState {
  IterationPlan = 'iterationPlan',
  SingleIteration = 'singleIteration',
  BatchedIteration = 'batchedIteration',
  None = 'none'
}

export abstract class Paginator {
  currentPage?: number | string;

  /**
   * Factory method calls appropriate constructor
   * given a dataset's declarative paging scheme.
   *
   * @param {PagingScheme} pagingScheme JSON definition of pagination behavior.
   * @param {DataSetMethod} method HTTP Method. Optional.
   */
  public static createPaginator(
    pagingScheme: PagingScheme,
    method?: DataSetMethod
  ) {
    const type: PagingType = pagingScheme.type;
    switch (type) {
      case PagingType.NextToken:
        return new NextTokenPaginator(pagingScheme as INextTokenScheme);
      case PagingType.PageBased:
        return new PageBasedPaginator(pagingScheme as IPageBasedScheme);
      case PagingType.OffsetAndLimit:
        return new OffsetAndLimitPaginator(
          pagingScheme as IOffsetAndLimitScheme
        );
      case PagingType.GraphQLConnections:
        return new GraphQLConnectionsPaginator(
          pagingScheme as IGraphQLConnectionsScheme,
          method
        );
      default:
        throw new Error(`Paginator: Invalid paging scheme: ${type}`);
    }
  }

  /**
   * Calls appropriate method to add paging parameters to a request.
   * GET paginates querystring. POST paginates message body.
   *
   * @param relativeUrl Service-relative URL from which data should be retrieved.
   * @param baseUrl The base URL off of which relative URLs stem. Optional.
   * @param messageBody Body of the HTTP request.  Optional.
   * @param method HTTP Method. Optional.
   * @param page The page value to continue fetching data from a previous sync. Optional.
   */
  public paginateRequest(
    relativeUrl: string,
    baseUrl?: string,
    messageBody?: { [key: string]: any },
    method?: DataSetMethod,
    page?: string
  ) {
    let pagedRelativeUrl = relativeUrl;
    let pagedMessageBody = messageBody;
    if (method === 'POST') {
      pagedMessageBody = this.paginateMessageBody(messageBody, page);
    } else {
      pagedRelativeUrl = this.paginateQueryString(relativeUrl, baseUrl, page);
    }
    return {
      pagedRelativeUrl,
      pagedMessageBody
    };
  }

  /**
   * Adds pagination parameters to a querystring before it is sent.
   *
   * @param relativeUrl Service-relative URL from which data should be retrieved.
   * @param baseUrl The base URL off of which relative URLs stem. Optional.
   * @param page The page value to continue fetching data from a previous sync. Optional.
   */
  protected abstract paginateQueryString(
    relativeUrl: string,
    baseUrl?: string,
    page?: string
  ): string;

  /**
   * Adds pagination parameters to a message body before it is sent.
   *
   * @param body Body of the HTTP request.  Optional.
   * @param page The page value to continue fetching data from a previous sync. Optional.
   */
  protected abstract paginateMessageBody(
    messageBody?: { [key: string]: any },
    page?: string
  ): { [key: string]: any } | undefined;

  /**
   * Measures progress and returns next page for retrieval
   * or undefined if all data has been gathered.
   *
   * @param dataSet Data set for which data is being retrieved.
   * @param data Data to be evaluated.
   * @param headers Response headers returned from external service. Optional.
   * @param baseUrl The base URL off of which relative URLs stem. Optional.
   */
  public abstract getNextPage(
    dataSet: IDataSet,
    data: any,
    headers?: { [name: string]: string[] },
    baseUrl?: string
  ): string | undefined;

  /**
   * Applies validation rules for a given paging scheme.
   * Returns error message if invalid, undefined otherwise.
   *
   * @param pagingScheme JSON definition of pagination behavior.
   * @param method HTTP Method. Optional.
   */
  protected abstract validatePagingScheme(
    pagingScheme: PagingScheme,
    method?: DataSetMethod
  ): string | undefined;

  /**
   * Returns length of data array.  Flattens data if necessary using IDataSet property.
   *
   * @param {object} dataSet Data set for which data has been retrieved.
   * @param {*} data Data to be evaluated.
   */
  protected getSizeOfDataArray(dataSet: IDataSet, data: any): number {
    if (dataSet.property) {
      data = this.getPropertyValue(data, dataSet.property);
    }
    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Parses response headers to return target value.
   *
   * @param {*} headers Response headers returned from external service.
   * @param {string} property Key of target element.
   */
  protected getHeaderValue(
    headers: { [name: string]: string[] },
    property: string
  ): string {
    let value: string | string[] = headers[property];
    if (Array.isArray(value)) {
      value = value[0];
    }
    return value;
  }

  /**
   * Retrieves a property value from an object.
   *
   * @param o Object to inspect.
   * @param property Full path to the property in parent.child.property form.
   *
   * @returns The property value or undefined if the property was not found.
   */
  protected getPropertyValue(o: any, property: string) {
    const expression = jsonata(property);
    return expression.evaluate(o);
  }

  /**
   * Determines if query string exists in URL.
   * Returns the appropriate delimiter based on resulting condition.
   *
   * @param {string} relativeUrl Relative URL of service.
   * @param {string} baseUrl BaseURL of service. Optional.
   */
  protected calcUrlDelimiter(relativeUrl: string, baseUrl?: string): string {
    const url = new URL(relativeUrl, baseUrl);
    return url.search ? '&' : '?';
  }

  /**
   * Determines if current iteration is first page in pagination sequence.
   *
   * @param {string} page The page value to continue fetching data from a previous sync.
   */
  protected isFirstPage(page?: string): boolean {
    if (page === undefined) {
      return true;
    }
    return false;
  }

  /**
   * Validates the expected return of a paged data set is array.
   *
   * @param dataSet Data set for which data has been retrieved.
   */
  protected ensureDataSetArray(dataSet: IDataSet): void {
    if (dataSet.result !== 'array' && !dataSet.filter) {
      throw new Error(
        `Paginator: Expected result for paginated requests must be of type array.`
      );
    }
  }
}

/**
 * REST next-token pagination continues paging
 * until token is no longer found in response.
 */
export class NextTokenPaginator extends Paginator {
  private limitParameter?: string;
  private limitValue?: number;
  private tokenType: NextTokenType;
  private tokenParameter?: string;

  constructor(pagingScheme: INextTokenScheme) {
    super();
    const errMessage = this.validatePagingScheme(pagingScheme);
    if (errMessage) {
      throw new Error(`Paginator: ${errMessage}`);
    }

    this.tokenType = pagingScheme.tokenType;
    const request = pagingScheme.request as NextTokenRequest;
    this.limitParameter = request.limitParameter;
    this.limitValue = request.limitValue
      ? Number(request.limitValue)
      : undefined;
    this.tokenParameter = request.tokenParameter;
  }

  protected paginateQueryString(
    relativeUrl: string,
    baseUrl?: string,
    page?: string
  ): string {
    this.currentPage = page;
    const delimiter = this.calcUrlDelimiter(relativeUrl, baseUrl);
    if (this.isFirstPage(page)) {
      if (!this.limitParameter) {
        return `${relativeUrl}`;
      }
      return `${relativeUrl}${delimiter}${this.limitParameter}=${this.limitValue}`;
    }

    switch (this.tokenType) {
      case NextTokenType.Url:
        return page as string;
      case NextTokenType.Token:
        page = encodeURIComponent(page as string);
        if (!this.limitParameter) {
          return `${relativeUrl}${delimiter}${this.tokenParameter!}=${page}`;
        }
        return `${relativeUrl}${delimiter}${this.limitParameter}=${
          this.limitValue
        }&${this.tokenParameter!}=${page}`;
      default:
        throw new Error(
          'Paginator: Unable to paginate querystring.  Invalid token type.'
        );
    }
  }

  protected paginateMessageBody(
    messageBody?: { [key: string]: any },
    page?: string
  ) {
    this.currentPage = page;
    if (!messageBody || typeof messageBody !== 'object') {
      throw new Error(
        `Paginator: Invalid POST request body: ${JSON.stringify(messageBody)}`
      );
    }
    if (
      ![NextTokenType.Token, NextTokenType.SearchArray].includes(this.tokenType)
    ) {
      throw new Error(
        `Paginator: POST method pagination does not support ${this.tokenType}.  Type must be token or search array.`
      );
    }
    if (this.limitParameter) {
      set(messageBody, this.limitParameter, this.limitValue);
    }
    if (!this.isFirstPage(page)) {
      set(
        messageBody,
        this.tokenParameter!,
        this.tokenType === NextTokenType.SearchArray
          ? this.formatSearchArrayToken(page!)
          : page
      );
    }
    return messageBody;
  }

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    headers?: { [name: string]: string[] },
    baseUrl?: string
  ): string | undefined {
    this.ensureDataSetArray(dataSet);
    const pagingScheme = dataSet.pagingScheme as INextTokenScheme;
    const { pageUntil } = pagingScheme;
    const nextTokenExpression = pagingScheme.response.nextToken;

    // Page until next token is null or undefined
    if (pageUntil === PageUntilCondition.NoNextToken && nextTokenExpression) {
      let nextToken;
      const isHeaderProperty = nextTokenExpression.startsWith(HEADER_PREFIX);
      if (PROPERTY_ACCESSORS.includes(nextTokenExpression)) {
        nextToken = data[nextTokenExpression];
      } else if (headers && isHeaderProperty) {
        nextToken = this.getHeaderValue(
          headers,
          nextTokenExpression.slice(HEADER_PREFIX.length)
        );
      } else {
        nextToken = this.getPropertyValue(data, nextTokenExpression);
      }
      if (nextToken === null || nextToken === undefined || nextToken === '') {
        return undefined; // Last page detected, halt paging
      }
      if (
        this.tokenType === NextTokenType.Url &&
        !this.isValidUrl(nextToken, baseUrl)
      ) {
        throw new Error(`Paginator: Detected invalid url: ${nextToken}`);
      }
      return String(nextToken);
    }
  }

  protected validatePagingScheme(
    pagingScheme: INextTokenScheme
  ): string | undefined {
    const request = pagingScheme.request as NextTokenRequest;
    if (request['limitParameter'] || request['limitValue']) {
      // if either is defined, then
      if (!request['limitParameter']) {
        // limit parameter cannot be undefined if limit value is defined
        return `Request parameters must be defined for ${pagingScheme.type} schemes.`;
      }
      if (!request['limitValue']) {
        // limit value cannot be undefined if limit parameter is defined
        return `Limit value must be defined if request parameters are defined for ${pagingScheme.type} schemes.`;
      }
      if (isNaN(+request.limitValue) || +request.limitValue <= 0) {
        // limit value must be be a positive integer
        // Guard against a non-incrementing loop
        return `Limit value ${this.limitValue} must be a positive integer for ${pagingScheme.type} schemes.`;
      }
    }
    if (
      pagingScheme.pageUntil === PageUntilCondition.NoNextToken &&
      !pagingScheme.response?.nextToken
    ) {
      return `Next token path must be defined for paging condition: ${pagingScheme.pageUntil}.`;
    }
    if (!pagingScheme.tokenType) {
      return `Token type must be defined for ${pagingScheme.type} schemes.`;
    }
    if (
      (pagingScheme.tokenType === NextTokenType.Token ||
        pagingScheme.tokenType === NextTokenType.SearchArray) &&
      !request['tokenParameter']
    ) {
      return `Token parameter must be defined.`;
    }
  }

  /**
   * Converts string representation of token into underlying array format.
   *
   * @param {string} searchArray Token value in the format: '[123456789, "c8b8e4edf184a64"]'
   */
  private formatSearchArrayToken(searchArray: string) {
    try {
      const parsedSearchArray = JSON.parse(searchArray);
      if (Array.isArray(parsedSearchArray)) {
        return parsedSearchArray;
      }
    } catch {
      return searchArray;
    }
    return searchArray;
  }

  /**
   * Checks whether a token represents a valid URL when constructed with optional base.
   * Returns true if valid, false otherwise.
   */
  private isValidUrl(token: string, base?: string) {
    try {
      new URL(token, base);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * REST page-based pagination begins paging at an initial value
 * and increments the page value by 1 after each page iteration.
 */
export class PageBasedPaginator extends Paginator {
  private pageParameter: string;
  private pageStartingValue: number;
  private limitParameter: string;
  private limitValue: number;

  constructor(pagingScheme: IPageBasedScheme) {
    super();
    const errMessage = this.validatePagingScheme(pagingScheme);
    if (errMessage) {
      throw new Error(`Paginator: ${errMessage}`);
    }

    const request = pagingScheme.request as PageBasedRequest;
    this.pageParameter = request.pageParameter;
    this.pageStartingValue = Number(request.pageStartingValue);
    this.limitParameter = request.limitParameter;
    this.limitValue = Number(request.limitValue);
  }

  protected paginateQueryString(
    relativeUrl: string,
    baseUrl?: string,
    page?: string
  ): string {
    this.currentPage = this.isFirstPage(page)
      ? this.pageStartingValue
      : Number(page);
    const delimiter = this.calcUrlDelimiter(relativeUrl, baseUrl);
    return `${relativeUrl}${delimiter}${this.pageParameter}=${this.currentPage}&${this.limitParameter}=${this.limitValue}`;
  }

  protected paginateMessageBody(
    messageBody?: { [key: string]: any },
    page?: string
  ) {
    this.currentPage = this.isFirstPage(page)
      ? this.pageStartingValue
      : Number(page);
    if (!messageBody || typeof messageBody !== 'object') {
      throw new Error(
        `Paginator: Invalid POST request body: ${JSON.stringify(messageBody)}`
      );
    }
    set(messageBody, this.pageParameter, this.currentPage);
    set(messageBody, this.limitParameter, this.limitValue);
    return messageBody;
  }

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    headers?: { [name: string]: string[] }
  ): string | undefined {
    this.ensureDataSetArray(dataSet);
    if (this.currentPage === null || this.currentPage === undefined) {
      throw new Error(
        'Paginator: currentPage must be defined while paginating request to external service.'
      );
    }
    const currentPage = this.currentPage as number;
    const pagingScheme = dataSet.pagingScheme as IPageBasedScheme;
    const { pageUntil } = pagingScheme;
    const totalCount = pagingScheme.response?.totalCount;

    // Page until no data is left
    if (pageUntil === PageUntilCondition.NoDataLeft) {
      const length = this.getSizeOfDataArray(dataSet, data);
      if (length === 0 || length < this.limitValue) {
        return undefined;
      }
      const nextPage = String(currentPage + 1);
      return nextPage;

      // Page until totalCount is reached
    } else if (pageUntil === PageUntilCondition.ReachTotalCount && totalCount) {
      let totalExpected;
      const isHeaderProperty = totalCount.startsWith(HEADER_PREFIX);
      if (headers && isHeaderProperty) {
        totalExpected = this.getHeaderValue(
          headers,
          totalCount.slice(HEADER_PREFIX.length)
        );
        totalExpected = parseInt(totalExpected);
      } else {
        totalExpected = this.getPropertyValue(data, totalCount);
      }
      if (isNaN(+totalExpected)) {
        return undefined;
      }
      const nextPage = String(currentPage + 1);
      const totalCollected =
        this.limitValue *
        (currentPage + (this.pageStartingValue === 0 ? 1 : 0));
      if (totalExpected > totalCollected) {
        return nextPage;
      }
      return undefined;
    }
  }

  protected validatePagingScheme(
    pagingScheme: IPageBasedScheme
  ): string | undefined {
    const request = pagingScheme.request as PageBasedRequest;
    if (
      isNaN(+request['pageStartingValue']) ||
      !request['pageParameter'] ||
      !request['limitParameter']
    ) {
      return `Request parameters must be defined for ${pagingScheme.type} schemes.`;
    }
    if (isNaN(+request.limitValue) || +request.limitValue <= 0) {
      // Guard against a non-incrementing loop
      return `Limit value ${this.limitValue} must be a positive integer for page-based schemes.`;
    }
    if (
      pagingScheme.pageUntil === PageUntilCondition.ReachTotalCount &&
      !pagingScheme.response?.totalCount
    ) {
      return `totalCount must be defined for paging condition: ${pagingScheme.pageUntil}.`;
    }
  }
}

/**
 * REST offset-and-limit pagination begins paging at an initial value
 * and increments the offset by the number of elements in a full page.
 */
export class OffsetAndLimitPaginator extends Paginator {
  private offsetParameter: string;
  private offsetStartingValue: number;
  private limitParameter: string;
  private limitValue: number;

  constructor(pagingScheme: IOffsetAndLimitScheme) {
    super();
    const errMessage = this.validatePagingScheme(pagingScheme);
    if (errMessage) {
      throw new Error(`Paginator: ${errMessage}`);
    }

    const request = pagingScheme.request as OffsetAndLimitRequest;
    this.offsetParameter = request.offsetParameter;
    this.offsetStartingValue = Number(request.offsetStartingValue);
    this.limitParameter = request.limitParameter;
    this.limitValue = Number(request.limitValue);
  }

  protected paginateQueryString(
    relativeUrl: string,
    baseUrl?: string,
    page?: string
  ): string {
    this.currentPage = this.isFirstPage(page)
      ? this.offsetStartingValue
      : Number(page);
    const delimiter = this.calcUrlDelimiter(relativeUrl, baseUrl);
    return `${relativeUrl}${delimiter}${this.offsetParameter}=${this.currentPage}&${this.limitParameter}=${this.limitValue}`;
  }

  protected paginateMessageBody(
    messageBody?: { [key: string]: any },
    page?: string
  ) {
    this.currentPage = this.isFirstPage(page)
      ? this.offsetStartingValue
      : Number(page);
    if (!messageBody || typeof messageBody !== 'object') {
      throw new Error(
        `Paginator: Invalid POST request body: ${JSON.stringify(messageBody)}`
      );
    }
    set(messageBody, this.offsetParameter, this.currentPage);
    set(messageBody, this.limitParameter, this.limitValue);
    return messageBody;
  }

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    headers?: { [name: string]: string[] }
  ): string | undefined {
    this.ensureDataSetArray(dataSet);
    if (this.currentPage === null || this.currentPage === undefined) {
      throw new Error(
        'Paginator: currentPage must be defined while paginating request to external service.'
      );
    }
    const currentPage = this.currentPage as number;
    const pagingScheme = dataSet.pagingScheme as IOffsetAndLimitScheme;
    const { pageUntil } = pagingScheme;
    const totalCount = pagingScheme.response?.totalCount;

    // Page until no data is left
    if (pageUntil === PageUntilCondition.NoDataLeft) {
      const length = this.getSizeOfDataArray(dataSet, data);
      if (length === 0 || length < this.limitValue) {
        return undefined;
      }
      const nextPage = String(currentPage + this.limitValue);
      return nextPage;

      // Page until totalCount is reached
    } else if (pageUntil === PageUntilCondition.ReachTotalCount && totalCount) {
      let totalExpected;
      const isHeaderProperty = totalCount.startsWith(HEADER_PREFIX);
      if (headers && isHeaderProperty) {
        totalExpected = this.getHeaderValue(
          headers,
          totalCount.slice(HEADER_PREFIX.length)
        );
        totalExpected = parseInt(totalExpected);
      } else {
        totalExpected = this.getPropertyValue(data, totalCount);
      }
      if (isNaN(+totalExpected)) {
        return undefined;
      }
      const nextPage = currentPage + this.limitValue;
      if (totalExpected && totalExpected >= nextPage) {
        return String(nextPage);
      }
      return undefined;
    }
  }

  protected validatePagingScheme(
    pagingScheme: IOffsetAndLimitScheme
  ): string | undefined {
    const request = pagingScheme.request as OffsetAndLimitRequest;
    if (
      isNaN(+request['offsetStartingValue']) ||
      !request['offsetParameter'] ||
      !request['limitParameter']
    ) {
      return `Request parameters must be defined for ${pagingScheme.type} schemes.`;
    }
    if (isNaN(+request.limitValue) || +request.limitValue <= 0) {
      // Guard against a non-incrementing loop
      return `Limit value ${this.limitValue} must be a positive integer for offset-and-limit schemes.`;
    }
    if (
      pagingScheme.pageUntil === PageUntilCondition.ReachTotalCount &&
      !pagingScheme.response?.totalCount
    ) {
      return `totalCount must be defined for paging condition: ${pagingScheme.pageUntil}.`;
    }
  }
}

/**
 * GraphQL connections pagination continues paging
 * following cursors until hasNextPage is false.
 */
export class GraphQLConnectionsPaginator extends Paginator {
  private limitParameter: 'first' | string;
  private limitValue: number;

  constructor(pagingScheme: IGraphQLConnectionsScheme, method?: DataSetMethod) {
    super();
    const errMessage = this.validatePagingScheme(pagingScheme, method);
    if (errMessage) {
      throw new Error(`Paginator: ${errMessage}`);
    }
    const request = pagingScheme.request as GraphQLConnectionsRequest;
    this.limitParameter = request.limitParameter;
    this.limitValue = Number(request.limitValue);
  }

  protected paginateQueryString(
    relativeUrl: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    baseUrl?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    page?: string
  ): string {
    return relativeUrl; // No change
  }

  protected paginateMessageBody(
    messageBody?: { [key: string]: any },
    page?: string
  ) {
    this.currentPage = page;
    if (!messageBody || typeof messageBody !== 'object' || !messageBody.query) {
      throw new Error(
        `Paginator: Invalid GraphQL request body: ${JSON.stringify(
          messageBody
        )}`
      );
    }
    return {
      ...messageBody,
      variables: {
        ...messageBody.variables,
        [this.limitParameter]: this.limitValue,
        after: this.currentPage
      }
    };
  }

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    headers?: { [name: string]: string[] }
  ): string | undefined {
    this.ensureDataSetArray(dataSet);
    const pagingScheme = dataSet.pagingScheme as IGraphQLConnectionsScheme;
    const { pageUntil } = pagingScheme;
    if (pageUntil === PageUntilCondition.NoNextPage) {
      const pageInfoExpression = pagingScheme.response.pageInfo;
      const pageInfo = this.getPropertyValue(data, pageInfoExpression);
      const hasNextPage: boolean = pageInfo.hasNextPage;
      const endCursor: string = pageInfo.endCursor;
      return hasNextPage === true ? endCursor : undefined;
    }
  }

  protected validatePagingScheme(
    pagingScheme: IGraphQLConnectionsScheme,
    method?: DataSetMethod
  ): string | undefined {
    const request = pagingScheme.request as GraphQLConnectionsRequest;
    if (!request['limitParameter']) {
      return `Request parameters must be defined for ${pagingScheme.type} schemes.`;
    }
    if (isNaN(+request.limitValue) || +request.limitValue <= 0) {
      // Guard against a non-incrementing loop
      return `Limit value ${this.limitValue} must be a positive integer for ${pagingScheme.type} schemes.`;
    }
    if (method !== 'POST') {
      return `GraphQL pagination scheme ${pagingScheme.type} supports POST method.`;
    }
    return undefined;
  }
}
