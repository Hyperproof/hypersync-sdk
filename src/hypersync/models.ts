import { HypersyncProofFormat, HypersyncResult } from './enums';
import { IHypersyncSchema } from './ProofProviderBase';

import {
  HypersyncCriteria,
  HypersyncPeriod
} from '@hyperproof/hypersync-models';

import { IIntegrationSettingsBase, ObjectStatus, ObjectType } from '../common';

/**
 * Settings that are saved with a Hypersync integration.
 */
export interface IHypersyncIntegrationSettings
  extends IIntegrationSettingsBase {
  vendorUserId: string;
  name: string;
  description?: string;
  criteria: HypersyncCriteria;
  isAutomatic: boolean;
  period: HypersyncPeriod;
  useVersioning: boolean;
  proofFormat: HypersyncProofFormat;
  isSyncing?: boolean;
  syncAttemptedOn?: string;
  syncSucceededOn?: string;
  syncResult?: HypersyncResult;
  failureMessage?: string;
  schema?: IHypersyncSchema;
}

/**
 * Hypersync information stored in Hyperproof.
 */
export interface IHypersync {
  id: string;
  orgId: string;
  appId: string;
  objectType: ObjectType;
  objectId: string;
  settings: IHypersyncIntegrationSettings;
  createdBy: string;
  createdOn: string;
  updatedBy: string;
  updatedOn: string;
  status: ObjectStatus;
}

/**
 * Information about errors encountered during proof generation.
 */
export interface IErrorInfo {
  fields: {
    property: string;
    label: string;
  }[];
  errors: {
    [key: string]: string;
  }[];
}
