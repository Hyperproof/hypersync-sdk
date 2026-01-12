import { TokenContext } from './tokens';

import {
  DataValueMap,
  HypersyncCriteria,
  HypersyncCriteriaFieldType,
  HypersyncCriteriaValue,
  HypersyncPeriod,
  ICriteriaSearchInput,
  IProofCriterionRef,
  ISelectOption,
  IValidation,
  SchemaCategory
} from '@hyperproof/hypersync-models';
import { CriteriaPageMessageLevel } from '@hyperproof/integration-sdk';

/**
 * Information needed to render a criteria field used in the configuration
 * of a Hypersync.
 */
export interface ICriteriaField {
  name: string;
  type: HypersyncCriteriaFieldType;
  label: string;
  options?: ISelectOption[];
  value?: string | number;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  noOptionsMessage?: string;
  isMulti?: boolean;
  validation?: IValidation;
  savedCriteriaSettings?: DataValueMap;
}

/**
 * A page of criteria fields that can be edited during the configuration
 * of a Hypersync.  Each proof type will expose one or more pages.
 */
export interface ICriteriaPage {
  fields: ICriteriaField[];
  isValid: boolean;
  info?: ICriteriaPageMessage[];
}

export interface ICriteriaPageMessage {
  message: string;
  alertStyle: CriteriaPageMessageLevel;
}

/**
 * Information used by Hyperproof during the configuration of a Hypersync.
 */
export interface ICriteriaMetadata {
  pages: ICriteriaPage[];
  period: HypersyncPeriod;
  useVersioning: boolean;
  suggestedName: string;
  description: string;
  enableExcelOutput: boolean;
}

/**
 * Information used to display a criterion value in a generated proof document.
 */
export interface IProofCriterionValue {
  name: string;
  label: string;
  value: HypersyncCriteriaValue;
  validation?: IValidation;
  savedCriteriaSettings?: DataValueMap;
}

/**
 * Provides criteria metadata and values to a proof provider.
 */
export interface ICriteriaProvider {
  /**
   * Generates the proof category criteria field for the app.
   *
   * Proof category fields are fields that must be filled in before
   * the user can select a proof type.  The set of proof types shown to
   * the user is filtered such that it only shows matching proof types.
   *
   * @param criteriaValues Criteria values selected by the user.
   * @param tokenContext Context object used in resolving placeholder tokens.
   * @param schemaCategory The schema category that the proof type is using. Proof result is then validated against the schema category.
   */
  generateProofCategoryField(
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext,
    schemaCategory?: SchemaCategory
  ): Promise<ICriteriaField | null>;

  /**
   * Adds criteria fields to the provided set of criteria pages.
   *
   * @param proofCriteria References to the criteria to include.
   * @param criteriaValues Criteria values selected by the user.
   * @param tokenContext Context object used in resolving placeholder tokens.
   * @param pages The set of criteria pages.
   */
  generateCriteriaFields(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext,
    pages: ICriteriaPage[],
    search?: string | ICriteriaSearchInput
  ): Promise<void>;

  /**
   * Returns a set of criterion values that can be rendered in a proof document.
   *
   * @param proofCriteria References to the criteria to include.
   * @param criteriaValues Criteria values selected by the user.
   * @param tokenContext Context object used in resolving placeholder tokens.
   */
  generateProofCriteria(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext
  ): Promise<IProofCriterionValue[]>;
}
