export enum HypersyncTemplate {
  UNIVERSAL = 'universal',
  JIRA_ISSUE_DETAILS = 'jira_issue_details'
}

export enum HypersyncStage {
  AUTHORING = 'authoring',
  SYNCING = 'syncing'
}

export enum HypersyncProofFormat {
  PDF = 'pdf',
  Excel = 'excel'
}

export enum HypersyncResult {
  Success = 'success',
  FailureBadRequest = 'failureBadRequest',
  FailureForbidden = 'failureForbidden',
  FailureIncomplete = 'failureIncomplete',
  FailureNotFound = 'failureNotFound',
  FailureSyncTooLarge = 'failureSyncTooLarge',
  FailureTooManyRequests = 'failureTooManyRequests',
  FailureUnauthorized = 'failureUnauthorized',
  FailureUnexpected = 'failureUnexpected',
  FailureUnknown = 'failureUnknown'
}
