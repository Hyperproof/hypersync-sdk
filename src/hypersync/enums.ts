export enum HypersyncTemplate {
  UNIVERSAL = 'universal',
  JIRA_ISSUE_DETAILS = 'jira_issue_details'
}

export enum HypersyncDataFormat {
  STACKED = 'stacked',
  TABULAR = 'tabular',
  CUSTOM = 'custom'
}

export enum HypersyncPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
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

export enum HypersyncPageOrientation {
  PORTRAIT = 'Portrait',
  LANDSCAPE = 'Landscape'
}

export enum HypersyncFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date'
}

export enum HypersyncFieldFormat {
  Percent = 'percent'
}

export enum HypersyncStage {
  AUTHORING = 'authoring',
  SYNCING = 'syncing'
}

export enum HypersyncProofFormat {
  PDF = 'pdf',
  Excel = 'excel'
}
