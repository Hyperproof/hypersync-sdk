import { HypersyncProofFormat, HypersyncResult } from './enums';
import { IHypersyncSchema } from './ProofProviderBase';

import {
  HypersyncCriteria,
  HypersyncPeriod,
  SchemaCategory
} from '@hyperproof/hypersync-models';
import {
  IIntegration,
  IIntegrationSettingsBase,
  IntegrationSettingsClass
} from '@hyperproof/integration-sdk';

/**
 * Settings that are saved with a Hypersync integration.
 */
export interface IHypersyncIntegrationSettings
  extends IIntegrationSettingsBase {
  class: IntegrationSettingsClass.Hypersync;
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
export interface IHypersync
  extends IIntegration<IHypersyncIntegrationSettings> {
  schemaCategory?: SchemaCategory;
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
