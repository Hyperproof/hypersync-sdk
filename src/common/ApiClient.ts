import { HttpMethod, LogContextKey } from './enums';
import { Logger } from './Logger';
import { IThrottleModel, ThrottleManager } from './throttle';

import AbortController from 'abort-controller';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import fetch, { HeadersInit, Response } from 'node-fetch';

/**
 * Type alias for the tuple of parameters taken by `ApiClient.sendRequest()`.
 *
 * @property url The target URL of the request.  Relative to the `baseUrl` if `baseUrl` is configured in the ApiClient.
 * @property method The HTTP method to use for the request.
 * @property body The request body.
 * @property additionalHeaders Additional headers to merge with the client's `commonHeaders` for the
 *           request.
 */
type ApiClientRequestArgs = [
  url: string,
  method: string,
  body: object | undefined,
  additionalHeaders: HeadersInit | undefined,
  abortController?: AbortController
];

/**
 * Type alias for the set of response headers that are returned from a request.
 */
type ResponseHeaders = { [name: string]: string[] };

/**
 * Type alias for the return type of `ApiClient.sendRequest()`.
 */
export interface IApiClientResponse<T = any> {
  source: string;
  json: T;
  headers: ResponseHeaders;
  status: number;
}
type ApiClientReturnType = Promise<IApiClientResponse>;

/**
 * Generic client for sending requests to external APIs
 */
export class ApiClient {
  protected baseUrl?: string;
  protected commonHeaders: HeadersInit;
  private throttleManager: ThrottleManager<
    ApiClientRequestArgs,
    ApiClientReturnType
  >;

  /**
   * @param commonHeaders Headers to add to all API requests.
   * @param baseUrl The base URL off of which relative URLs provided to `sendRequest()` stem.
   * @param throttleManager If this is a retry of a previously-attempted sync, provide the result
   *        of a call to `ThrottleManager.toBare()` on the `ThrottleManager` used by the previous
   *        run here to track and limit the number of allowable retries. If this is the
   *        first attempt, it should be `undefined`. If too many retries have already been
   *        attempted, a descriptive error will be thrown. If this argument is omitted, management
   *        of the quantity of retries is left to the JobEngine and the suggested delay time
   *        after a retry will not necessarily grow exponentially.
   */
  constructor(
    commonHeaders: HeadersInit,
    baseUrl?: string,
    throttleModel?: IThrottleModel
  ) {
    this.commonHeaders = commonHeaders;
    this.baseUrl = baseUrl;
    this.throttleManager = new ThrottleManager(
      params => this.doSendRequest(...params),
      throttleModel
    );
  }

  public async getJson(url: string, abortController?: AbortController) {
    return this.sendRequest(
      url,
      HttpMethod.GET,
      undefined,
      undefined,
      abortController
    );
  }

  public async postJson(
    url: string,
    body?: object,
    abortController?: AbortController
  ) {
    return this.sendRequest(
      url,
      HttpMethod.POST,
      body,
      undefined,
      abortController
    );
  }

  protected async handleFailedResponse(response: Response, apiUrl: string) {
    const errMsg = await response.text();
    throw createHttpError(
      response.status,
      `Error retrieving JSON from ${apiUrl}: ${errMsg}`,
      {
        [LogContextKey.Headers]: response.headers.raw(),
        [LogContextKey.StatusCode]: response.status,
        [LogContextKey.ApiUrl]: apiUrl,
        [LogContextKey.ExtendedMessage]: errMsg
      }
    );
  }

  public sendRequest(...params: ApiClientRequestArgs) {
    return this.throttleManager.retrieve(params);
  }

  private async doSendRequest(
    ...[
      url,
      method,
      body,
      additionalHeaders,
      abortController
    ]: ApiClientRequestArgs
  ): ApiClientReturnType {
    const apiUrl = this.buildUrl(url);
    await Logger.debug(`Making ${method} request to ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method,
      headers: {
        ...this.commonHeaders,
        ...additionalHeaders
      },
      body: JSON.stringify(body),
      signal: abortController?.signal
    });
    if (!response.ok) {
      await this.handleFailedResponse(response, apiUrl);
    }

    await Logger.debug(`${url} returned ${response.status}`);

    let json: any = undefined;
    const text = await response.text();
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch (e: any) {
        throw createHttpError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          'Failed to convert response body to JSON',
          {
            [LogContextKey.Headers]: response.headers.raw(),
            [LogContextKey.StatusCode]: response.status,
            [LogContextKey.ApiUrl]: url,
            [LogContextKey.ExtendedMessage]: `Response Body: ${text}`
          }
        );
      }
    }

    return {
      source: apiUrl,
      json,
      headers: response.headers.raw(),
      status: response.status
    };
  }

  private buildUrl(url: string): string {
    return this.baseUrl ? new URL(url, this.baseUrl).href : url;
  }
}
