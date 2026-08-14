import { isCustomerSideError, safeMetric } from '@hyperproof/integration-sdk';
import client from 'prom-client';

const integrationType = process.env.integration_type ?? 'unknown';

/**
 * Duration of a single connector operation.
 *
 * Labels:
 * - integration_type: e.g. 'aws', 'jiraCloud'
 * - proof_type: e.g. 'ec2RunningInstances', 'ec2SecurityGroups'
 * - action: 'syncNow' | 'generateSyncPlan' | 'generateSchema'
 * - status: 'success' | 'error' | 'retry'
 */
export const operationDuration = new client.Histogram({
  name: 'connector_operation_duration_seconds',
  help: 'Duration of a single connector operation',
  labelNames: ['integration_type', 'proof_type', 'action', 'status'] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600]
});

/**
 * Count of terminal operation failures, classified by error category.
 * Retries are NOT counted here — only final errors that surface to the caller.
 *
 * Labels:
 * - integration_type: e.g. 'aws', 'jira-cloud'
 * - proof_type: e.g. 'ec2RunningInstances'
 * - error_category: 'customer_side' | 'internal'
 */
export const operationErrors = new client.Counter({
  name: 'connector_operation_errors_total',
  help: 'Total number of operation failures by error category',
  labelNames: ['integration_type', 'proof_type', 'error_category'] as const
});

/**
 * Number of proof data files returned per operation.
 *
 * Labels:
 * - integration_type: e.g. 'aws', 'jira-cloud'
 * - proof_type: e.g. 'ec2RunningInstances'
 */
export const operationResultRows = new client.Histogram({
  name: 'connector_operation_result_rows',
  help: 'Number of proof data files returned per operation',
  labelNames: ['integration_type', 'proof_type'] as const,
  buckets: [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
});

/**
 * Names of the three connector operations that are instrumented. Exposed
 * as a union type so the `action` label on {@link operationDuration} stays
 * consistent across call sites.
 */
export type OperationAction = 'syncNow' | 'generateSyncPlan' | 'generateSchema';

/**
 * Terminal outcome of a connector operation as recorded in the duration
 * histogram. Each value has a dedicated public helper so callers can't
 * misspell the label.
 */
type OperationStatus = 'success' | 'error' | 'retry';

/**
 * Classification of a terminal operation failure, derived via
 * {@link isCustomerSideError} inside {@link recordOperationError}.
 */
type ErrorCategory = 'customer_side' | 'internal';

/**
 * Shared underlying observer: computes elapsed seconds from `startTime` and
 * records it against {@link operationDuration} with the supplied status label.
 * Fail-safe — a metrics failure must never break the actual operation.
 *
 * Not exported: callers should use {@link recordOperationSuccess},
 * {@link recordOperationError}, or {@link recordOperationRetry} so the status
 * label can't be misspelled.
 */
function observeDuration(proofType: string, action: OperationAction, status: OperationStatus, startTime: number) {
  safeMetric(() =>
    operationDuration.observe(
      { integration_type: integrationType, proof_type: proofType, action, status },
      (Date.now() - startTime) / 1000
    )
  );
}

/**
 * Records a successful operation's duration.
 * @param startTime The `Date.now()` value captured when the operation began.
 */
export function recordOperationSuccess(proofType: string, action: OperationAction, startTime: number) {
  observeDuration(proofType, action, 'success', startTime);
}

/**
 * Records a failed operation: observes the duration with `status=error`
 * AND increments {@link operationErrors}, classifying the failure as
 * customer-side or internal via {@link isCustomerSideError}. One call per
 * error site — callers no longer need to remember to update two separate
 * metrics.
 *
 * Use this for terminal failures surfaced to the caller; use
 * {@link recordOperationRetry} for retriable failures that will be retried
 * by the platform.
 */
export function recordOperationError(proofType: string, action: OperationAction, startTime: number, err: unknown) {
  observeDuration(proofType, action, 'error', startTime);
  incrementOperationErrors(proofType, isCustomerSideError(err) ? 'customer_side' : 'internal');
}

/**
 * Records an operation that ended by requesting a retry.
 */
export function recordOperationRetry(proofType: string, action: OperationAction, startTime: number) {
  observeDuration(proofType, action, 'retry', startTime);
}

/**
 * Increments {@link operationErrors} with fail-safe error handling.
 * Not exported — callers should go through {@link recordOperationError},
 * which also records the failure's duration and owns the classification.
 */
function incrementOperationErrors(proofType: string, errorCategory: ErrorCategory) {
  safeMetric(() =>
    operationErrors.inc({
      integration_type: integrationType,
      proof_type: proofType,
      error_category: errorCategory
    })
  );
}

/**
 * Records operation result row count with fail-safe error handling.
 */
export function observeOperationResultRows(proofType: string, rowCount: number) {
  safeMetric(() => operationResultRows.observe({ integration_type: integrationType, proof_type: proofType }, rowCount));
}
