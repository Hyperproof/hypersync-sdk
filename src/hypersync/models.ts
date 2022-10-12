import {
  IIntegrationSettingsBase,
  ObjectStatus,
  ObjectType
} from '../common';
import {
  HypersyncPeriod,
  HypersyncProofFormat,
  HypersyncResult
} from './enums';
import { IHypersyncSchema } from './ProofProviderBase';

/**
 * Export this model from Fusebit for use in OAuth Hypersyncs.
 */
export { IOAuthTokenResponse } from '@fusebit/oauth-connector';

/**
 * Primitive values supported by Hypersyncs in criteria and data binding.
 * These types may be returned as data from an IDataSource, and they can
 * also be used to filter, sort, and otherwise parameterize the data in a
 * generated Hypersync proof.
 */
export type DataValue = string | number | boolean | BigInt | Date | undefined;

/**
 * Type of data that is returned from an external service.
 */
export type DataObject = {
  [prop: string]: DataValue | DataObject | DataObject[];
};

/**
 * Criteria values used by a Hypersync to retrieve data from an external service.
 */
export type HypersyncCriteria = {
  proofType?: string;
  [name: string]: DataValue;
};

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
