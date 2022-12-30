/* eslint-disable @typescript-eslint/no-unused-vars */
import { IHyperproofUser } from '../common';
import {
  HypersyncDataFormat,
  HypersyncFieldFormat,
  HypersyncFieldType,
  HypersyncPageOrientation,
  HypersyncTemplate
} from './enums';
import {
  ICriteriaMetadata,
  ICriteriaPage,
  IProofCriterionValue
} from './ICriteriaProvider';
import { DataObject, HypersyncCriteria, IHypersync } from './models';
import { IGetProofDataResponse, SyncMetadata } from './Sync';

/**
 * Field information that is used in the layout of a generated proof document.
 * Note that the width and type values are only specified if they have non-default values.
 */
export interface IHypersyncProofField {
  property: string;
  label: string;
  width?: string;
  type?: HypersyncFieldType;
  format?: HypersyncFieldFormat;
}

/**
 * Field information that is returned as part of a Hypersync schema object.
 */
export interface IHypersyncSchemaField {
  property: string;
  label: string;
  type: HypersyncFieldType;
}

/**
 * Schema information generated from a configured Hypersync.  Used by the
 * testing features in Hyperproof.
 */
export interface IHypersyncSchema {
  format: HypersyncDataFormat;
  isHierarchical: boolean;
  fields: IHypersyncSchemaField[];
}

/**
 * Top-level layout object within a proof document.  Lays out the fields
 * in the proof array that is associated with the proof doc.
 */
export interface IHypersyncProofLayout<TField = IHypersyncProofField> {
  format: HypersyncDataFormat;
  fields: TField[];
  label?: string;
  noResultsMessage?: string;
  subLayouts?: IHypersyncProofSubLayout<TField>[];
}

/**
 * Nested layout object within a proof document.
 */
export interface IHypersyncProofSubLayout<TField = IHypersyncProofField>
  extends IHypersyncProofLayout<TField> {
  collection: string;
}

// TODO: HYP-23126: Why is type (really integrationType) in the contents?  Can't that
// be inferred from the appId on the parent row?
/**
 * The contents of a generated Hypersync proof document.
 */
export interface IHypersyncContents {
  type: string;
  title: string;
  subtitle: string;
  source?: string;
  webPageUrl?: string;
  orientation?: HypersyncPageOrientation;
  zoom?: number;
  userTimeZone: string;
  criteria: IProofCriterionValue[];
  proofFormat: string;
  template: HypersyncTemplate;
  layout: IHypersyncProofLayout;
  proof: DataObject[];
  authorizedUser: string;
  collector: string;
  collectedOn: string;
}

/**
 * A generated Hypersync proof document.
 */
export interface IProofFile<TContents = IHypersyncContents> {
  id?: string;
  filename: string;
  contents: TContents;
}

/**
 * Abstract base class for a proof provider.  Proof providers provide all
 * of the schema and data that is required for a given proof type.
 */
export class ProofProviderBase<T = any> {
  protected client: T;

  constructor(client: T) {
    this.client = client;
  }

  public static proofType: string;
  public static proofTypeLabel: string;

  /**
   * Returns TRUE if this proof type should be shown for the given criteria.
   *
   * @param {*} criteriaValues Criteria values chosen by the user ahead of choosing proof type.
   */
  static matchesCriteria(criteriaValues: HypersyncCriteria) {
    return true;
  }

  /**
   * Generates the criteria metadata for the proof type.  Metadata is appended
   * to the pages array that is passed in as an argument.
   *
   * @param {*} criteriaValues Criteria values chosen by the user.
   * @param {*} pages Array of pages to display to the user when selecting criteria.
   */
  async generateCriteriaMetadata(
    criteriaValues: HypersyncCriteria,
    pages: ICriteriaPage[]
  ): Promise<ICriteriaMetadata> {
    throw new Error(
      'generateCriteriaMetadata must be implemented by derived class.'
    );
  }

  /**
   * Generates the schema for the proof type.  This schema is used in the
   * automated testing functionality.
   *
   * @param {*} criteriaValues Criteria values chosen by the user.
   */
  async generateSchema(
    criteriaValues: HypersyncCriteria
  ): Promise<IHypersyncSchema> {
    throw new Error('generateSchema must be implemented by derived class.');
  }

  /**
   * Retrieves the data needed to generate proof files for the proof type.
   *
   * @param {*} hypersync The Hypersync that is being synced.
   * @param {*} hyperproofUser The Hyperproof user who created the Hypersync.
   * @param {string} authorizedUser User name, email or other unique identifer for the external user.
   * @param {*} syncStartDate Date and time at which the sync started.
   * @param {*} page The current page in the sync.  Optional.
   * @param {*} metadata Additional metadata associated with the sync.  Optional.
   *
   * @returns An array of objects which can be used to generate the actual proof
   * files.  Each element in the array corresponds to one proof file that should
   * be genrated and uploaded to Hyperproof.  May optionally return an object that
   * contains this array in a .data member along with related pagination properties.
   * This option is useful if the provider needs to paginate large data sets.
   */
  async getProofData(
    hypersync: IHypersync,
    hyperproofUser: IHyperproofUser,
    authorizedUser: string,
    syncStartDate: Date,
    page?: string,
    metadata?: SyncMetadata
  ): Promise<IGetProofDataResponse | IProofFile[]> {
    throw new Error('getProofData must be implemented by derived class.');
  }
}
