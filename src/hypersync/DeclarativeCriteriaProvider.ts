import {
  compareValues,
  FieldType,
  ISelectOption
} from '../common';
import fs from 'fs';
import path from 'path';
import { DataSetResultStatus } from './enums';
import {
  IProofCriterionRef,
  IProofCriterionValue,
  ICriteriaPage,
  ICriteriaProvider
} from './ICriteriaProvider';
import { DataValueMap, IDataSource } from './IDataSource';
import { HypersyncCriteria } from './models';
import { resolveTokens, TokenContext } from './tokens';

/**
 * Data used to create an configure an ICriteriaField.
 */
interface ICriteriaFieldConfig {
  type: FieldType;
  property: string;
  label: string;
  isRequired: boolean;
  placeholder?: string;
  defaultDisplayValue?: string;

  dataSet?: string;
  dataSetParams?: DataValueMap;
  valueProperty?: string;
  labelProperty?: string;
  fixedValues?: ISelectOption[];
}

/**
 * Configuration information stored in a JSON file that is used as
 * the input to a DeclarativeCriteriaProvider instance.
 */
interface ICriteriaConfig {
  [name: string]: ICriteriaFieldConfig;
}

/**
 * Provides criteria fields and values to a proof provider using fields declared
 * in a JSON file loaded from the file system.
 */
export class DeclarativeCriteriaProvider implements ICriteriaProvider {
  private dataSource: IDataSource;
  private criteriaFields: ICriteriaConfig;

  constructor(appRootDir: string, dataSource: IDataSource) {
    this.dataSource = dataSource;
    this.criteriaFields = JSON.parse(
      fs.readFileSync(
        path.resolve(appRootDir, 'build/decl/criteriaFields.json'),
        'utf8'
      )
    );
  }

  public async generateCriteriaFields(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext,
    pages: ICriteriaPage[]
  ) {
    let lastCriteriaField;
    let pageNumber: number;

    if (proofCriteria.length === 0) {
      pages[pages.length - 1].isValid = true;
      return;
    }

    for (const criterion of proofCriteria) {
      // Look up the criterion in the set of all criteria for the connector..
      const criteriaField = this.criteriaFields[criterion.name];
      if (!criteriaField) {
        throw new Error(`Unable to find criterion named ${criterion.name}`);
      }

      if (
        criteriaField.type !== FieldType.SELECT &&
        criteriaField.type !== FieldType.TEXT
      ) {
        throw new Error(
          `Unrecognized or unsupported criteria field type: ${criteriaField.type}`
        );
      }

      // If the previous criteria field doesn't have a value, then this criteria
      // field cannot be edited.
      const isDisabled =
        lastCriteriaField &&
        criteriaValues[lastCriteriaField.property] === undefined;

      // Add the criterion field to the metadata.
      pageNumber = criterion.page;
      pages[pageNumber].fields.push({
        name: criteriaField.property,
        type: criteriaField.type,
        label: resolveTokens(criteriaField.label, tokenContext),
        isRequired: criteriaField.isRequired,
        options:
          isDisabled || criteriaField.type !== FieldType.SELECT
            ? []
            : await this.getCriteriaFieldOptions(
                criteriaField,
                criteriaValues,
                tokenContext
              ),
        value: criteriaValues[criteriaField.property] as string | number,
        placeholder: criteriaField.placeholder
          ? resolveTokens(criteriaField.placeholder, tokenContext)
          : undefined,
        isDisabled
      });

      pages[pageNumber!].isValid =
        !isDisabled &&
        (!criteriaField.isRequired ||
          criteriaValues[criteriaField.property] !== undefined);

      // Remember the last criterion so we can determine if we should keep
      // adding more criterion fields or if we should stop.
      lastCriteriaField = criteriaField;
    }
  }

  public async generateProofCriteria(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext
  ) {
    const proofCriteriaFields = proofCriteria.map(
      criterion => this.criteriaFields[criterion.name]
    );
    const criteria: IProofCriterionValue[] = [];
    for (const field of proofCriteriaFields) {
      // If the field is not required and the user did not provide a value,
      // use the defaultDisplayName property as the value.
      if (
        field.isRequired === false &&
        criteriaValues[field.property] === undefined
      ) {
        criteria.push({
          name: field.property,
          label: resolveTokens(field.label, tokenContext),
          value: resolveTokens(field.defaultDisplayValue ?? '', tokenContext)
        });
        continue;
      }

      // Otherwise behavior differs based on the type of field
      switch (field.type) {
        case FieldType.SELECT:
          {
            const options = await this.getCriteriaFieldOptions(
              field,
              criteriaValues,
              tokenContext
            );
            const option = options.find(
              o => o.value === criteriaValues[field.property]
            );
            criteria.push({
              name: field.property,
              label: resolveTokens(field.label, tokenContext),
              value: option?.label
            });
          }
          break;

        case FieldType.TEXT:
          {
            criteria.push({
              name: field.property,
              label: resolveTokens(field.label, tokenContext),
              value: criteriaValues[field.property]
            });
          }
          break;

        default:
          throw new Error(
            `Unrecognized or unsupported criteria field type: ${field.type}`
          );
      }
    }
    return criteria;
  }

  /**
   * Helper method that adds the select control options to a criteria metadata field.
   */
  private async getCriteriaFieldOptions(
    criteriaField: ICriteriaFieldConfig,
    criteria: HypersyncCriteria,
    tokenContext: TokenContext
  ) {
    let data: ISelectOption[] = [];

    if (
      criteriaField.dataSet &&
      criteriaField.valueProperty &&
      criteriaField.labelProperty
    ) {
      // If there are parameters, resolve any embedded tokens.
      const params = criteriaField.dataSetParams;
      if (params) {
        for (const key of Object.keys(params)) {
          const value = params[key];
          if (typeof value === 'string') {
            params[key] = resolveTokens(value, {
              criteria
            });
          }
        }
      }

      // Fetch the data from the service.
      const result = await this.dataSource.getData(
        criteriaField.dataSet,
        params
      );

      if (result.status !== DataSetResultStatus.Complete) {
        throw new Error(
          `Pending response received for critiera field data set: ${criteriaField.dataSet}`
        );
      }

      if (!Array.isArray(result.data)) {
        throw new Error(
          `Invalid criteria field data set: ${criteriaField.dataSet}`
        );
      }

      // Extract the columns we need.
      const valueProperty = criteriaField.valueProperty;
      const labelProperty = criteriaField.labelProperty;
      data = result.data.map(
        item =>
          ({
            value: item[valueProperty] as string | number,
            label: item[labelProperty] as string
          } as ISelectOption)
      );

      // Sort the list of values.
      data.sort((a, b) => compareValues(a.label, b.label));
    }

    // If there are fixed values let's add those to the top.
    if (criteriaField.fixedValues) {
      data = criteriaField.fixedValues
        .map(
          fv =>
            ({
              value: resolveTokens(fv.value as string, tokenContext),
              label: resolveTokens(fv.label, tokenContext)
            } as ISelectOption)
        )
        .concat(data);
    }

    return data;
  }
}
