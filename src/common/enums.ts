export enum ALERT_CARD_STYLE {
  Success = 'success',
  Info = 'info',
  Warning = 'warning',
  Failure = 'failure',
  Danger = 'danger'
}

export enum AuthorizationType {
  OAUTH = 'oauth',
  CUSTOM = 'custom'
}

export enum FieldType {
  PAIRED_SELECT = 'pairedSelect',
  SELECT = 'select',
  TEXT = 'text',
  SEARCH = 'search',
  RADIO = 'radio',
  KEY_VALUE_SET = 'keyValueSet'
}

export enum CredentialFieldType {
  PASSWORD = 'password',
  TEXT = 'text',
  TEXT_AREA = 'textArea',
  HIDDEN = 'hidden',
  SELECT = 'select'
}

export enum AppId {
  ASANA = 'asana',
  AWS = 'aws',
  AZURE = 'azure',
  GITHUB = 'gitHub',
  JIRA = 'jira',
  JIRA_HS = 'jiraHs',
  SLACK = 'slack'
}

export enum InstanceType {
  JiraCloud = 'jiraCloud',
  JiraServer = 'jiraServer'
}

export enum LogContextKey {
  ApiUrl = 'apiUrl',
  Category = 'category',
  ExtendedMessage = 'extendedMessage',
  HttpVersion = 'httpVersion',
  HypersyncCriteria = 'hypersyncCriteria',
  HypersyncSettings = 'hypersyncSettings',
  HypersyncStage = 'hypersyncStage',
  IntegrationId = 'integrationId',
  Level = 'level',
  Message = 'message',
  Payload = 'payload',
  Referrer = 'referrer',
  RemoteAddress = 'remoteAddress',
  RequestMethod = 'requestMethod',
  RequestPath = 'requestPath',
  ResponseContentLength = 'responseContentLength',
  ResponseTime = 'responseTime',
  StackTrace = 'stackTrace',
  StatusCode = 'statusCode',
  Subscribers = 'subscribers',
  Timestamp = '@timestamp',
  TraceId = 'traceId',
  Url = 'url',
  UserAgent = 'userAgent',
  UserId = 'userId'
}

export enum MimeType {
  APPLICATION_JSON = 'application/json',
  CSV_MIME = 'text/csv',
  FORM_URL_ENCODED = 'application/x-www-form-urlencoded',
  HYPERSYNC_DATA = 'application/vnd.hyperproof.hypersync.data'
}

export enum ObjectType {
  CONTROL = 'control',
  LABEL = 'label',
  ORGANIZATION = 'organization',
  TASK = 'task',
  USER = 'user'
}

export enum ObjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
  PENDING = 'pending',
  CANCELED = 'canceled'
}

export enum ProofLinkState {
  ACCEPTED = 'accepted',
  ACTIVE = 'active',
  OUTDATED = 'outdated',
  REJECTED = 'rejected',
  SUBMITTED = 'submitted',
  UNSUBMITTED = 'unsubmitted'
}

export enum ProofSyncResult {
  NO_UPDATE_NEEDED = 'noUpdateNeeded',
  UPDATED = 'updated',
  MISSING_TOKEN = 'missingToken',
  UNAUTHORIZED = 'unauthorized',
  MISSING_FILE = 'missingFile',
  OTHER_ERROR = 'otherError'
}

export enum Priority {
  Highest = 'highest',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
  Lowest = 'lowest'
}

export enum HttpMethod {
  POST = 'POST',
  PATCH = 'PATCH',
  GET = 'GET',
  PUT = 'PUT',
  DELETE = 'DELETE'
}

export enum HttpHeader {
  Authorization = 'Authorization',
  ContentType = 'Content-Type',
  HyperproofClientSecret = 'hp-client-secret',
  SubscriptionKey = 'hyperproof-subscription-key'
}

export const HYPERPROOF_VENDOR_KEY = 'hyperproof';

export const FOREIGN_VENDOR_USER = 'foreign-vendor-user';
