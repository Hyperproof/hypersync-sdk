import AbortController from 'abort-controller';
import createHttpError from 'http-errors';
import fetch, { HeadersInit, Response } from 'node-fetch';
import { HttpMethod, LogContextKey } from './enums';
import { Logger } from './Logger';
import { IThrottleModel, ThrottleManager } from './throttle';

/**
 * Type alias for the tuple of parameters taken by `ApiClient.sendRequest()`.
 *
 * @property relativeUrl The target URL of the request relative to the `baseUrl` of the client.
 * @property method The HTTP method to use for the request.
 * @property body The request body.
 * @property additionalHeaders Additional headers to merge with the client's `commonHeaders` for the
 *           request.
 */
type ApiClientRequestArgs = [
  relativeUrl: string,
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
  apiUrl: string;
  json: T;
  headers: ResponseHeaders;
}
type ApiClientReturnType = Promise<IApiClientResponse>;

/**
 * Generic client for sending requests to external APIs
 */
export class ApiClient {
  protected baseUrl: string;
  protected commonHeaders: HeadersInit;
  private throttleManager: ThrottleManager<
    ApiClientRequestArgs,
    ApiClientReturnType
  >;

  /**
   * @param baseUrl The base URL off of which relative URLs provided to `sendRequest()` stem.
   * @param commonHeaders Headers to add to all API requests.
   * @param throttleManager If this is a retry of a previously-attempted sync, provide the result
   *        of a call to `ThrottleManager.toBare()` on the `ThrottleManager` used by the previous
   *        run here to track and limit the number of allowable retries. If this is the
   *        first attempt, it should be `undefined`. If too many retries have already been
   *        attempted, a descriptive error will be thrown. If this argument is omitted, management
   *        of the quantity of retries is left to the JobEngine and the suggested delay time
   *        after a retry will not necessarily grow exponentially.
   */
  constructor(
    baseUrl: string,
    commonHeaders: HeadersInit,
    throttleModel?: IThrottleModel
  ) {
    this.baseUrl = baseUrl;
    this.commonHeaders = commonHeaders;
    this.throttleManager = new ThrottleManager(
      params => this.doSendRequest(...params),
      throttleModel
    );
  }

  public async getJson(relativeUrl: string, abortController?: AbortController) {
    return this.sendRequest(
      relativeUrl,
      HttpMethod.GET,
      undefined,
      undefined,
      abortController
    );
  }

  public async postJson(
    relativeUrl: string,
    body?: object,
    abortController?: AbortController
  ) {
    return this.sendRequest(
      relativeUrl,
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
        [LogContextKey.StatusCode]: response.status,
        [LogContextKey.ApiUrl]: apiUrl,
        [LogContextKey.ExtendedMessage]: errMsg
      }
    );
  }

  private sendRequest(...params: ApiClientRequestArgs) {
    return this.throttleManager.retrieve(params);
  }

  private async doSendRequest(
    ...[
      relativeUrl,
      method,
      body,
      additionalHeaders,
      abortController
    ]: ApiClientRequestArgs
  ): ApiClientReturnType {
    const apiUrl = this.buildUrl(relativeUrl);
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

    await Logger.debug(`${relativeUrl} returned ${response.status}`);

    const json = await response.json();
    return { apiUrl, json, headers: response.headers.raw() };
  }

  private buildUrl(relativeUrl: string): string {
    return new URL(relativeUrl, this.baseUrl).href;
  }
}
