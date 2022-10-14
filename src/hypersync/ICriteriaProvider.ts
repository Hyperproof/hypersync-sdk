import { FieldType, ISelectOption } from '../common';
import { HypersyncPeriod } from './enums';
import { DataValue, HypersyncCriteria } from './models';
import { TokenContext } from './tokens';

/**
 * Information needed to render a criteria field used in the configuration
 * of a Hypersync.
 */
export interface ICriteriaField {
  name: string;
  type: FieldType;
  label: string;
  options?: ISelectOption[];
  value?: string | number;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
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
 * Reference to a proof criterion and the page on which it should be included.
 */
export interface IProofCriterionRef {
  name: string;
  page: number;
}

/**
 * Information used to display a criterion value in a generated proof document.
 */
export interface IProofCriterionValue {
  name: string;
  label: string;
  value: DataValue;
}

/**
 * Provides criteria metadata and values to a proof provider.
 */
export interface ICriteriaProvider {
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
