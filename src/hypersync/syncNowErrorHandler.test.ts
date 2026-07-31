import { recordOperationError, recordOperationRetry } from './metrics';
import { handleSyncNowError, logRateLimitHeaders } from './syncNowErrorHandler';

import { ExternalAPIError, isCustomerSideError, LogContextKey, Logger } from '@hyperproof/integration-sdk';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

jest.mock('./metrics', () => ({
  observeOperationResultRows: jest.fn(),
  recordOperationError: jest.fn(),
  recordOperationRetry: jest.fn(),
  recordOperationSuccess: jest.fn()
}));

jest.mock('./common', () => ({
  ...jest.requireActual('./common'),
  formatHypersyncError: jest.fn((err: any, hypersyncId: string, message: string) => ({
    formatted: true,
    hypersyncId,
    message,
    errMessage: err?.message
  }))
}));

jest.mock('@hyperproof/integration-sdk', () => {
  const actual = jest.requireActual('@hyperproof/integration-sdk');

  // Provide a minimal, mockable ExternalAPIError. Because the module under test
  // and the tests both see this mocked module, `instanceof ExternalAPIError`
  // succeeds on instances constructed from this class.
  class MockExternalAPIError {
    canRetry = jest.fn();
    computeRetry = jest.fn();
    status?: number;
    message?: string;
    headers?: Record<string, string>;
    stack?: string;
    response?: { headers: Record<string, string> };
  }

  return {
    ...actual,
    ExternalAPIError: MockExternalAPIError,
    isCustomerSideError: jest.fn(),
    Logger: {
      log: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }
  };
});

const mockedRecordOperationError = recordOperationError as jest.Mock;
const mockedRecordOperationRetry = recordOperationRetry as jest.Mock;
const mockedIsCustomerSideError = isCustomerSideError as jest.Mock;
const mockedLoggerInfo = Logger.info as jest.Mock;
const mockedLoggerError = Logger.error as jest.Mock;

function buildRes() {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res as express.Response;
}

function buildReq(overrides: Partial<express.Request['body']> = {}): express.Request {
  return {
    body: {
      hypersync: {
        id: 'hs-123',
        settings: { vendorUserId: 'vu-1', criteria: { proofType: 'users' } }
      },
      ...overrides
    }
  } as unknown as express.Request;
}

describe('logRateLimitHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not log when error has no headers', async () => {
    await logRateLimitHeaders({ message: 'boom' });
    expect(mockedLoggerInfo).not.toHaveBeenCalled();
  });

  it('logs only rate-limit keys from err.headers and drops unrelated ones', async () => {
    const err = {
      headers: {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'content-type': 'application/json',
        'x-request-id': 'abc'
      }
    };

    await logRateLimitHeaders(err);

    expect(mockedLoggerInfo).toHaveBeenCalledTimes(1);
    const [msg] = mockedLoggerInfo.mock.calls[0];
    expect(msg).toContain('"x-ratelimit-limit":"100"');
    expect(msg).toContain('"x-ratelimit-remaining":"0"');
    expect(msg).not.toContain('content-type');
    expect(msg).not.toContain('x-request-id');
  });

  it('falls back to err.response.headers when err.headers is absent', async () => {
    const err = {
      response: {
        headers: {
          'x-ratelimit-reset': '1700000000',
          'x-ratelimit-used': '50'
        }
      }
    };

    await logRateLimitHeaders(err);

    const [msg] = mockedLoggerInfo.mock.calls[0];
    expect(msg).toContain('"x-ratelimit-reset":"1700000000"');
    expect(msg).toContain('"x-ratelimit-used":"50"');
  });

  it('prefers err.headers over err.response.headers when both are present', async () => {
    const err = {
      headers: { 'x-ratelimit-limit': '10' },
      response: { headers: { 'x-ratelimit-limit': '999' } }
    };

    await logRateLimitHeaders(err);

    const [msg] = mockedLoggerInfo.mock.calls[0];
    expect(msg).toContain('"x-ratelimit-limit":"10"');
    expect(msg).not.toContain('999');
  });
});

describe('handleSyncNowError', () => {
  let req: express.Request;
  let res: express.Response;
  const startTime = 1_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    req = buildReq();
    res = buildRes();
  });

  describe('retry path', () => {
    it('retries a retriable ExternalAPIError and returns the retry response', async () => {
      const retryResponse = { maxRetry: 5, delay: 30, metadata: {} };
      const err = new ExternalAPIError(undefined as any, undefined as any) as any;
      err.canRetry.mockReturnValue(true);
      err.computeRetry.mockResolvedValue(retryResponse);

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(err.computeRetry).toHaveBeenCalledTimes(1);
      expect(mockedRecordOperationRetry).toHaveBeenCalledWith('users', 'syncNow', startTime);
      expect(mockedRecordOperationError).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(retryResponse);

      // When retry succeeds we must NOT fall through to the error path.
      expect(mockedLoggerInfo).not.toHaveBeenCalled();
      expect(mockedLoggerError).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('does not attempt retry when ExternalAPIError reports canRetry() === false', async () => {
      const err = new ExternalAPIError(undefined as any, undefined as any) as any;
      err.canRetry.mockReturnValue(false);
      err.message = 'nope';
      mockedIsCustomerSideError.mockReturnValue(false);

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(err.computeRetry).not.toHaveBeenCalled();
      expect(mockedRecordOperationError).toHaveBeenCalledWith('users', 'syncNow', startTime, err);
      expect(mockedRecordOperationRetry).not.toHaveBeenCalled();
    });

    it('falls through to error handling when computeRetry() itself throws', async () => {
      const err = new ExternalAPIError(undefined as any, undefined as any) as any;
      err.canRetry.mockReturnValue(true);
      const retryErr = Object.assign(new Error('retry failed'), { status: 503 });
      err.computeRetry.mockRejectedValue(retryErr);
      mockedIsCustomerSideError.mockReturnValue(false);

      await handleSyncNowError(err, 'users', startTime, req, res);

      // Metrics are recorded against the retry error, not the original error.
      expect(mockedRecordOperationError).toHaveBeenCalledWith('users', 'syncNow', startTime, retryErr);
      expect(mockedRecordOperationRetry).not.toHaveBeenCalled();
      // Response should reflect the retry error too.
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('classification and logging', () => {
    it('logs customer-side errors at INFO and passes the error to recordOperationError', async () => {
      mockedIsCustomerSideError.mockReturnValue(true);
      const err = Object.assign(new Error('creds expired'), { status: 401 });
      process.env.vendor_name = 'TestVendor';

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(mockedRecordOperationError).toHaveBeenCalledWith('users', 'syncNow', startTime, err);
      expect(mockedLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('customer-side error (TestVendor)'),
        expect.objectContaining({ formatted: true, hypersyncId: 'hs-123', message: 'Customer-side error.' })
      );
      expect(mockedLoggerError).not.toHaveBeenCalled();
    });

    it('logs non-customer 5xx errors at ERROR with the formatted failure payload', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err = Object.assign(new Error('db down'), { status: 502 });
      process.env.vendor_name = 'TestVendor';

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(mockedRecordOperationError).toHaveBeenCalledWith('users', 'syncNow', startTime, err);
      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Hypersync invoke failure: TestVendor'),
        expect.objectContaining({ formatted: true, hypersyncId: 'hs-123', message: 'Hypersync invoke failure.' })
      );
    });

    it('logs non-customer 4xx errors at ERROR with the generic message (not formatted payload)', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err = Object.assign(new Error('bad request'), { status: 400 });

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(mockedLoggerError).toHaveBeenCalledWith('Failed to sync Hypersync', err);
    });

    it('treats missing status as 5xx when picking the log channel', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err = new Error('unknown');
      process.env.vendor_name = 'TestVendor';

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Hypersync invoke failure: TestVendor'),
        expect.anything()
      );
    });
  });

  describe('rate-limit header logging', () => {
    it('logs rate-limit headers found on the error', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err = Object.assign(new Error('rate limited'), {
        status: 429,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' }
      });

      await handleSyncNowError(err, 'users', startTime, req, res);

      const rateLimitCall = mockedLoggerInfo.mock.calls.find(
        ([msg]) => typeof msg === 'string' && msg.startsWith('Rate limit headers found:')
      );
      expect(rateLimitCall).toBeDefined();
      expect(rateLimitCall![0]).toContain('"x-ratelimit-remaining":"0"');
    });
  });

  describe('response', () => {
    it('writes the correct status and extendedError shape', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err: any = new Error('explode');
      err.status = 418;
      err.stack = 'stack-trace';

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(res.status).toHaveBeenCalledWith(418);
      expect(res.json).toHaveBeenCalledTimes(1);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.message).toBe('explode');
      expect(body.extendedError[LogContextKey.HypersyncStage]).toBe('syncing');
      expect(body.extendedError[LogContextKey.IntegrationId]).toBe('hs-123');
      expect(body.extendedError[LogContextKey.HypersyncSettings]).toEqual(req.body.hypersync.settings);
      expect(body.extendedError[LogContextKey.StackTrace]).toBe('stack-trace');
      expect(body.extendedError[LogContextKey.StatusCode]).toBe(418);
    });

    it('falls back to 500 when the error has no status or statusCode', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err = new Error('unset');

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.extendedError[LogContextKey.StatusCode]).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    });

    it('honors err.statusCode when err.status is absent', async () => {
      mockedIsCustomerSideError.mockReturnValue(false);
      const err: any = new Error('status-code only');
      err.statusCode = 422;

      await handleSyncNowError(err, 'users', startTime, req, res);

      expect(res.status).toHaveBeenCalledWith(422);
    });
  });
});
