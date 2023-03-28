import { AppId, HealthStatus, Priority } from './enums';

export interface IHyperproofUser {
  id: string;
  email: string;
  givenName: string;
  surname: string;
  updatedOn: string;
  language: string;
  locale: string;
  timeZone: string;
}

export interface IExternalUser {
  id?: string;
  givenName: string;
  surname: string;
  email?: string;
  resource?: string;
}

export interface ICommentBody {
  appId: AppId;
  commentTextFormatted: string;
  externalUser: IExternalUser;
  mentionedExternalUsers: IExternalUser[];
  sourceCommentId: string;
  sourceUpdatedOn: string;
}

export interface IIntegrationSettingsBase {
  isEnabled: boolean;
  relatedSettingsId?: string;
}

export interface ITaskPatch {
  taskStatusId?: string;
  priority?: Priority;
  dueDate?: string;
  clearDueDate?: boolean;
  description?: string;
  title?: string;
  externalUser?: IExternalUser;
  externalAssignee?: IExternalUser;
  externalFields?: any;
  taskTemplateId?: string;
}

export interface IConnectionHealth {
  healthStatus: HealthStatus;
  statusCode: number;
  message?: string;
  details?: string;
}
