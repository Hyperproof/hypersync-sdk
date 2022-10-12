import Sdk from '@fusebit/add-on-sdk';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';

/**
 * Response provided to the JobEngine denoting that a retry is requested.
 */
export interface IRetryResponse {
  metadata: object;
  maxRetry: number;
  delay: number;
}

/**
 * An error similar to those raised by calls to fetch().
 */
export interface IFetchLikeError {
  response?: string;
  message?: string;
}

/**
 * Interface describing a function which performs a request to the remote API and returns its
 * response.
 */
interface IRequestSender<RequestType, ResponseType> {
  (request: RequestType): ResponseType;
}

/**
 * Object which can be preserved between retries to track their quantity.
 * @property {number} totalTries The total number of times this `ThrottleManager` has been reused.
 * @property {number} maxTries The maximum number of tries this manager should execute before giving
 *           up. Note: this functionality is ultimately handled by the Job Engine.
 */
export interface IThrottleModel {
  totalTries?: number;
  maxTries?: number;
}

/**
 * Implements a backoff-retry strategy for handling rate limits.
 *
 * @template RequestType An object containing everything needed to perform a request.
 * @template ResponseType The return type, if any, produced by a call to the `sendRequest` function
 *           provided to the `ThrottleManager` constructor.
 */
export class ThrottleManager<RequestType, ResponseType> {
  private _sendRequest: IRequestSender<RequestType, ResponseType>;
  private _maxTries: number;
  private _totalTries: number;

  /**
   * Construct a ThrottleManager, optionally continuing to track the number of re-instantiations this
   * manager has undergone using the bare representation of a previously-used ThrottleManager.
   *
   * @throws {HttpError} If the ThrottleManager has been re-instantiated too many times.
   */
  constructor(
    sendRequest: IRequestSender<RequestType, ResponseType>,
    {
      maxTries = COMMON_MAX_RETRIES,
      totalTries = 0
    }: IThrottleModel | undefined = {}
  ) {
    this._sendRequest = sendRequest;
    this._maxTries = maxTries;
    this._totalTries = totalTries + 1;
    if (this._totalTries > this._maxTries)
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Still unable to complete sync after ${this._maxTries} attempts. ` +
          'This is likely due to rate limiting by the vendor API. Please try again later.'
      );
  }

  get maxTries() {
    return this._maxTries;
  }

  get totalTries() {
    return this._totalTries;
  }

  /**
   * @returns The data needed to re-initialize this ThrottleManager.
   */
  toModel(): IThrottleModel {
    return {
      totalTries: this._totalTries,
      maxTries: this._maxTries
    };
  }

  /**
   * Try to send the request using `_sendRequest()`.
   *
   * @throws {ExternalAPIError} Any exception thrown by `_sendRequest()` is wrapped with an
   *         `ExternalAPIError` instance and propagated.
   */
  async retrieve(request: RequestType): Promise<ResponseType> {
    try {
      return await this._sendRequest(request);
    } catch (e) {
      throw this._makeError(e);
    }
  }

  _makeError<ErrorType>(error: ErrorType): ExternalAPIError<ErrorType> {
    return new ExternalAPIError(this, error);
  }
}

/**
 * This is the type of error thrown if a request fails.
 *
 * It includes a reference to the underlying error and a reference to the `ThrottleManager`
 * which originally sent the request.
 */
export class ExternalAPIError<RequestError extends IFetchLikeError> {
  throttleManager: ThrottleManager<any, any>;
  error: RequestError;

  constructor(throttleManager: ThrottleManager<any, any>, error: RequestError) {
    this.throttleManager = throttleManager;
    this.error = error;
  }

  /** @returns The response code extracted from the original error, or undefined if it couldn't be
   * found. */
  get responseCode(): number | undefined {
    return findAttr(
      ['status', 'code', 'responseCode'],
      this.error,
      this.error.response
    );
  }

  /**
   * Alias for responseCode
   */
  get status() {
    return this.responseCode;
  }

  get message() {
    return (
      this.error?.message ||
      `Unknown ExternalAPIError: ${this.responseCode || 'unknown status code'}`
    );
  }

  /**
   * Generate a RetryResponse object to provide to the job engine.
   *
   * Determines a delay to request either by the suggestion from the API or according to an
   * exponential backoff strategy.
   *
   * @returns {IRetryResponse} Object to provide to the job engine in order to schedule a retry.
   * @throws {RequestError} If the error could not be determined to be due to throttling/rate
   *         limiting.
   */
  computeRetry(): IRetryResponse {
    let delay;
    const headers = this._findHeadersInError();
    if (headers) {
      const suggestedDelay = extractDelayFromResponseHeaders(headers);
      if (suggestedDelay) {
        delay = suggestedDelay + jitteredBackoff(1);
      }
    }
    if (!delay) {
      if (
        this.responseCode == 429 ||
        (this.responseCode == 403 && /rate limit/i.test(this.message))
      ) {
        delay = jitteredBackoff(this.throttleManager.totalTries);
      } else {
        Sdk.debug(
          'ExternalAPIError does not appear to have been caused by a rate limit. Propagating the original error.'
        );
        throw this.error;
      }
    }
    const retryInfo = {
      data: [],
      metadata: {
        throttleManager: this.throttleManager.toModel()
      },
      maxRetry: this.throttleManager.maxTries,
      delay
    };
    Sdk.debug(
      'A rate limit appears to have been triggered. Suggesting retry response:',
      retryInfo
    );
    return retryInfo;
  }

  /** Attempts to return the header object in an error similar to those raised by `fetch()`. */
  _findHeadersInError() {
    return findAttr(['headers'], this.error, this.error.response);
  }
}

/**
 * Determine how long to wait until resending a request to avoid throttling.
 *
 * Returns exponentially longer amounts of time, on average, proportional to how many times
 * the request has been sent. A random jitter is applied to avoid stampedes. This
 * is implemented via a random multiplier on the entire exponential term to maximize
 * the effect of the entropy.
 *
 * @param triesSoFar How many times the request has been sent so far.
 * @param baseDelay The minimum value that can be returned.
 * @param maxValue The maximum value that can be returned.
 * @returns The minimum amount of time in seconds to wait before re-sending a request.
 */
const jitteredBackoff = (
  triesSoFar: number,
  baseDelay = 8,
  maxValue = 64
): number =>
  Math.min(
    Math.ceil(
      baseDelay + Math.random() * (baseDelay * 2 ** triesSoFar - baseDelay)
    ),
    maxValue
  );

/**
 * @param possibleNames The set of names, in order of precedence, under which the desired data
 *                      may be stored in the target objects. Implicitly case-insensitive.
 * @param targets The objects, in order of precedence, to search for an attribute with one of the
 *                possible names.
 * @returns The first non-undefined attribute with one of the possible names found in one
 *          of the targets, or `undefined` if no such attribute was found.
 */
const findAttr = (possibleNames: (string | undefined)[], ...targets: any[]) => {
  const lowercaseNames = possibleNames.map(name => name?.toLowerCase());
  for (const target of targets) {
    if (target) {
      for (const name of Object.keys(target)) {
        if (lowercaseNames.includes(name.toLowerCase()) && target[name]) {
          return target[name];
        }
      }
    }
  }
};

/**
 * Attempt to extract a server's suggested delay-time from an object containing a failed response's
 * headers on a best-effort basis.
 *
 * This generalized function is preferred over API-specific implementations because APIs are often
 * not actually consistent in their rate limit responses, despite what their documentation may claim
 * (often, APIs route your request through multiple services, some of which may not be correctly
 * configured to provide standardized responses).
 *
 * If this function doesn't work for a new API, you can simply modify it to account for the new
 * API's responses--take care not to affect the existing logic, though (place your new check toward
 * the end of the function so it is only executed after all of the existing checks fail).
 *
 * @param headers An object mapping the response's headers to their values. This may (or may not)
 *        include headers such as X-RateLimit-Remaining or Retry-After, which can be used to
 *        determine how long the next request should be delayed.
 * @returns The number of seconds the server suggests we wait before trying again, or `undefined` if
 *          a suggestion could not be determined from the headers.
 */
const extractDelayFromResponseHeaders = (
  headers: object
): number | undefined => {
  try {
    const retryAfter = findAttr(['retry-after'], headers);
    if (retryAfter) {
      Sdk.debug('Got value from Retry-After header.');
      return Number(retryAfter);
    }
    const rateLimitRemaining = findAttr(['x-ratelimit-remaining'], headers);
    if (rateLimitRemaining !== '' && Number(rateLimitRemaining) === 0) {
      const rateLimitReset = findAttr(['x-ratelimit-reset'], headers);
      if (rateLimitReset) {
        Sdk.debug('Got value from X-RateLimit headers.');
        return Math.max(
          0,
          (new Date(Number(rateLimitReset) * 1000).getTime() - Date.now()) /
            1000
        );
      }
    }
  } catch (ignored) {
    return undefined;
  }
};

const COMMON_MAX_RETRIES = 4;
