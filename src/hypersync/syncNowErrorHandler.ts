import { formatHypersyncError } from './common';
import { HypersyncStage } from './enums';
import { recordOperationError, recordOperationRetry } from './metrics';

import { ExternalAPIError, isCustomerSideError, LogContextKey, Logger } from '@hyperproof/integration-sdk';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

/**
 * If the error carries rate-limit response headers, logs them for diagnostic
 * purposes. Exported from this internal module so the invoke route handler in
 * `hypersyncConnector.ts` can reuse it and so it can be unit tested directly.
 */
export async function logRateLimitHeaders(err: any): Promise<void> {
  const headers = err.headers || err.response?.headers;
  if (!headers) {
    return;
  }
  const rateLimitKeys = [
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-retryafter',
    'x-ratelimit-reset',
    'x-ratelimit-used'
  ];
  const rateLimitHeaders = Object.keys(headers)
    .filter(key => rateLimitKeys.includes(key))
    .reduce((obj, key) => {
      return { ...obj, [key]: headers[key] };
    }, {});
  Logger.info(`Rate limit headers found: ${JSON.stringify(rateLimitHeaders)}`);
}

/**
 * Handles an error thrown during a syncNow invocation. Extracted from the
 * invoke route handler in `hypersyncConnector.ts` so that handler stays within
 * the ESLint cyclomatic-complexity budget, and so the branching below can be
 * exercised directly by unit tests.
 *
 * Responsibilities:
 *   - Attempt a retry when the error is a retriable `ExternalAPIError`.
 *   - Record sync-page duration and error metrics.
 *   - Classify customer-side (expected, logged at INFO) vs internal failures
 *     (logged at ERROR) using the shared `isCustomerSideError` classifier.
 *   - Surface rate-limit response headers for diagnostics.
 *   - Write the error response with the standard extended-error payload.
 */
export async function handleSyncNowError(
  syncErr: any,
  proofType: string,
  startTime: number,
  req: express.Request,
  res: express.Response
): Promise<void> {
  let err = syncErr;
  if (err instanceof ExternalAPIError && err.canRetry()) {
    try {
      const retryResponse = await err.computeRetry();
      recordOperationRetry(proofType, 'syncNow', startTime);
      res.json(retryResponse);
      return;
    } catch (retryErr) {
      err = retryErr;
    }
  }

  recordOperationError(proofType, 'syncNow', startTime, err);

  // Customer-side errors are expected operational events (expired credentials,
  // unreachable vendor systems) surfaced to customers via connection health in
  // the product UI. Logging them at ERROR would pollute logs with noise that
  // requires no engineering action, so they go to INFO instead.
  if (isCustomerSideError(err)) {
    Logger.info(
      `Hypersync invoke: customer-side error (${process.env.vendor_name})`,
      formatHypersyncError(err, req.body?.hypersync?.id, 'Customer-side error.')
    );
  } else {
    const status = err.status || err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    if (status >= StatusCodes.INTERNAL_SERVER_ERROR) {
      Logger.error(
        `Hypersync invoke failure: ${process.env.vendor_name}`,
        formatHypersyncError(err, req.body?.hypersync?.id, 'Hypersync invoke failure.')
      );
    } else {
      Logger.error('Failed to sync Hypersync', err);
    }
  }

  await logRateLimitHeaders(err);

  const statusCode = err.status || err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  res.status(statusCode).json({
    message: err.message,
    extendedError: {
      ...err,
      [LogContextKey.HypersyncStage]: HypersyncStage.SYNCING,
      [LogContextKey.IntegrationId]: req.body.hypersync.id,
      [LogContextKey.HypersyncSettings]: req.body.hypersync.settings,
      [LogContextKey.StackTrace]: err.stack,
      [LogContextKey.StatusCode]: statusCode
    }
  });
}
