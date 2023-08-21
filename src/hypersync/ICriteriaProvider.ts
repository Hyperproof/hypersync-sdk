import { TokenContext } from './tokens';

import {
  HypersyncCriteria,
  HypersyncCriteriaFieldType,
  HypersyncCriteriaValue,
  HypersyncPeriod,
  IProofCriterionRef,
  ISelectOption
} from '@hyperproof/hypersync-models';

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
}

/**
 * A page of criteria fields that can be edited during the configuration
 * of a Hypersync.  Each proof type will expose one or more pages.
 */
export interface ICriteriaPage {
  fields: ICriteriaField[];
  isValid: boolean;
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
   */
  generateProofCategoryField(
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext
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
    pages: ICriteriaPage[]
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
