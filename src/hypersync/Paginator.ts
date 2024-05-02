import {
  IDataSet,
  INextTokenScheme,
  IOffsetAndLimitScheme,
  IPageBasedScheme,
  NextTokenRequest,
  OffsetAndLimitRequest,
  PageBasedRequest,
  PageUntilCondition,
  PagingScheme,
  PagingType
} from '@hyperproof/hypersync-models';
import jsonata from 'jsonata';

const HEADER_PREFIX = 'header:'; // prefix indicating property found in response header
const PROPERTY_ACCESSORS = ['@odata.nextLink']; // Do not evaluate as jsonata expression

export abstract class Paginator {
  currentPage?: number | string;

  /**
   * Add pagination parameters to a request before it is sent.
   *
   * @param relativeUrl Service-relative URL from which data should be retrieved.
   * @param baseUrl The base URL off of which relative URLs stem. Optional.
   * @param page The page value to continue fetching data from a previous sync. Optional.
   */
  public abstract paginateRequest(
    relativeUrl: string,
    baseUrl?: string,
    page?: string
  ): string;

  /**
   * Measure progress and return next page for retrieval
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
   * Apply validation rules for a given paging scheme.
   * Return error message if invalid, undefined otherwise.
   *
   * @param pagingScheme JSON definition of pagination behavior.
   */
  protected abstract validatePagingScheme(
    pagingScheme: PagingScheme
  ): string | undefined;

  /**
   * Factory method to return appropriate constructor
   * given a dataset's declarative paging scheme.
   *
   * @param {PagingScheme} pagingScheme JSON definition of pagination behavior.
   */
  public static createPaginator(pagingScheme: PagingScheme) {
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
      default:
        throw new Error(`Paginator: Invalid paging scheme: ${type}`);
    }
  }

  /**
   * Return length of data array.  Flatten data if necessary using IDataSet property.
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
   * Parse response headers to return target value.
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
   * Determine if query string exists in URL.
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
   * Determine if current iteration is first page in pagination sequence.
   *
   * @param {string} page The page value to continue fetching data from a previous sync.
   */
  protected isFirstPage(page?: string): boolean {
    if (page === undefined) {
      return true;
    }
    return false;
  }
}

/**
 * REST next-token pagination continues paging
 * until token is no longer found in response.
 */
export class NextTokenPaginator extends Paginator {
  private limitParameter: string;
  private limitValue: number;
  private tokenType: 'token' | 'url';
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
    this.limitValue = Number(request.limitValue);
    this.tokenParameter = request.tokenParameter;
  }

  public paginateRequest(
    relativeUrl: string,
    baseUrl?: string,
    page?: string
  ): string {
    this.currentPage = page;
    const delimiter = this.calcUrlDelimiter(relativeUrl, baseUrl);
    if (this.isFirstPage(page)) {
      return `${relativeUrl}${delimiter}${this.limitParameter}=${this.limitValue}`;
    } else if (this.tokenType === 'url') {
      return page as string;
    } else if (this.tokenType === 'token') {
      return `${relativeUrl}${delimiter}${this.limitParameter}=${this.limitValue}&${this.tokenParameter}=${page}`;
    } else {
      throw new Error('Paginator: Invalid paginateRequest parameters.');
    }
  }

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    headers?: { [name: string]: string[] },
    baseUrl?: string
  ): string | undefined {
    if (dataSet.result !== 'array') {
      throw new Error(
        `Paginator: Expected result for paginated requests must be of type array.`
      );
    }
    const pagingScheme = dataSet.pagingScheme as INextTokenScheme;
    const { pageUntil } = pagingScheme;
    const nextTokenExpression = pagingScheme.response.nextToken;

    // Page until next token is null or undefined
    if (pageUntil === PageUntilCondition.NoNextToken && nextTokenExpression) {
      const nextToken = PROPERTY_ACCESSORS.includes(nextTokenExpression)
        ? data[nextTokenExpression]
        : this.getPropertyValue(data, nextTokenExpression);
      if (nextToken === null || nextToken === undefined) {
        return undefined; // Last page detected, halt paging
      } else if (
        this.tokenType === 'url' &&
        !this.isValidUrl(nextToken, baseUrl)
      ) {
        throw new Error(`Paginator: Detected invalid url: ${nextToken}`);
      }
      return nextToken;
    }
  }

  protected validatePagingScheme(
    pagingScheme: INextTokenScheme
  ): string | undefined {
    const request = pagingScheme.request as NextTokenRequest;
    if (!request['limitParameter']) {
      return `Request parameters must be defined for ${pagingScheme.type} schemes.`;
    }
    if (isNaN(+request.limitValue) || +request.limitValue <= 0) {
      // Guard against a non-incrementing loop
      return `Limit value ${this.limitValue} must be a positive integer for ${pagingScheme.type} schemes.`;
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
    if (pagingScheme.tokenType === 'token' && !request['tokenParameter']) {
      return `Token parameter must be defined.`;
    }
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

  public paginateRequest(
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

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    headers?: { [name: string]: string[] }
  ): string | undefined {
    if (dataSet.result !== 'array') {
      throw new Error(
        `Paginator: Expected result for paginated requests must be of type array.`
      );
    }
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

  public paginateRequest(
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

  public getNextPage(
    dataSet: IDataSet,
    data: any,
    headers?: { [name: string]: string[] }
  ): string | undefined {
    if (dataSet.result !== 'array') {
      throw new Error(
        `Paginator: Expected result for paginated requests must be of type array.`
      );
    }
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
