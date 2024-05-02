import {
  ICriteriaField,
  ICriteriaPage,
  ICriteriaProvider,
  IProofCriterionValue
} from './ICriteriaProvider';
import { DataSetResultStatus, IDataSource } from './IDataSource';
import { resolveTokens, TokenContext } from './tokens';

import {
  HypersyncCriteria,
  HypersyncCriteriaFieldType,
  ICriteriaConfig,
  ICriteriaFieldConfig,
  IProofCriterionRef,
  ISelectOption
} from '@hyperproof/hypersync-models';
import { compareValues, Logger } from '@hyperproof/integration-sdk';
import fs from 'fs';
import path from 'path';

/**
 * Provides criteria fields and values to a proof provider using fields declared
 * in a JSON file loaded from the file system.
 */
export class JsonCriteriaProvider implements ICriteriaProvider {
  private dataSource: IDataSource;
  private criteriaFields: ICriteriaConfig;

  constructor(appRootDir: string, dataSource: IDataSource) {
    this.dataSource = dataSource;
    const configFile = path.resolve(appRootDir, 'json/criteriaFields.json');
    this.criteriaFields = fs.existsSync(configFile)
      ? JSON.parse(fs.readFileSync(configFile, 'utf8'))
      : ({} as ICriteriaConfig);
  }

  /**
   * Returns the configuration for the criteria provider.
   */
  public getConfig() {
    return this.criteriaFields;
  }

  /**
   * Adds a new criteria field to the collection of configured criteria fields.
   */
  public addCriteriaField(name: string, criteriaField: ICriteriaFieldConfig) {
    if (this.criteriaFields[name]) {
      throw new Error('A criteria field with that name already exists.');
    }
    this.criteriaFields[name] = criteriaField;
  }

  public async generateProofCategoryField(
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext
  ): Promise<ICriteriaField | null> {
    // Look for the proofCategory item in the config.  This is optional so
    // if the config is not found, return null to let the caller know.
    // Supported for built-in as well as custom Hypersync apps.
    const categoryConfig =
      this.criteriaFields['hp_proofCategory'] ||
      this.criteriaFields['proofCategory'];
    if (!categoryConfig) {
      return null;
    }

    return this.buildCriteriaField(
      categoryConfig,
      criteriaValues,
      tokenContext,
      false
    );
  }

  public async generateCriteriaFields(
    proofCriteria: IProofCriterionRef[],
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext,
    pages: ICriteriaPage[]
  ) {
    let lastConfig;
    let pageNumber: number;

    if (proofCriteria.length === 0) {
      pages[pages.length - 1].isValid = true;
      return;
    }

    for (const criterion of proofCriteria) {
      // Look up the criterion in the set of all criteria for the connector..
      const config = this.criteriaFields[criterion.name];
      if (!config) {
        throw new Error(`Unable to find criterion named ${criterion.name}`);
      }

      if (
        config.type !== HypersyncCriteriaFieldType.Select &&
        config.type !== HypersyncCriteriaFieldType.Text
      ) {
        throw new Error(
          `Unrecognized or unsupported criteria field type: ${config.type}`
        );
      }

      // If the previous criteria field config doesn't have a value, then
      // this criteria field cannot be edited.
      const isDisabled =
        lastConfig && criteriaValues[lastConfig.property] === undefined;

      // Add the criterion field to the metadata.
      pageNumber = criterion.page;

      while (pageNumber >= pages.length) {
        pages.push({ isValid: false, fields: [] });
      }

      pages[pageNumber].fields.push(
        await this.buildCriteriaField(
          config,
          criteriaValues,
          tokenContext,
          isDisabled
        )
      );

      pages[pageNumber!].isValid =
        !isDisabled &&
        (!config.isRequired || criteriaValues[config.property] !== undefined);

      // Remember the last criterion so we can determine if we should keep
      // adding more criterion fields or if we should stop.
      lastConfig = config;
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
        case HypersyncCriteriaFieldType.Select:
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

        case HypersyncCriteriaFieldType.Text:
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
   * Helper method that builds a criteria field from a criteria field configuration
   * object along with some other data.
   */
  private async buildCriteriaField(
    config: ICriteriaFieldConfig,
    criteriaValues: HypersyncCriteria,
    tokenContext: TokenContext,
    isDisabled?: boolean
  ): Promise<ICriteriaField> {
    return {
      name: config.property,
      type: config.type,
      label: resolveTokens(config.label, tokenContext),
      isRequired: config.isRequired,
      options:
        isDisabled || config.type !== HypersyncCriteriaFieldType.Select
          ? []
          : await this.getCriteriaFieldOptions(
              config,
              criteriaValues,
              tokenContext
            ),
      value: criteriaValues[config.property] as string | number,
      placeholder: config.placeholder
        ? resolveTokens(config.placeholder, tokenContext)
        : undefined,
      isDisabled
    };
  }

  /**
   * Helper method that adds the select control options to a criteria metadata field.
   */
  private async getCriteriaFieldOptions(
    config: ICriteriaFieldConfig,
    criteria: HypersyncCriteria,
    tokenContext: TokenContext
  ) {
    let data: ISelectOption[] = [];

    if (config.dataSet && config.valueProperty && config.labelProperty) {
      // If there are parameters, resolve any embedded tokens.
      const params = config.dataSetParams;
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
      let nextPage = undefined;
      do {
        // Fetch the data from the service.
        const result: any = await this.dataSource.getData(
          config.dataSet,
          params,
          nextPage
        );

        if (result.status !== DataSetResultStatus.Complete) {
          throw new Error(
            `Pending response received for critiera field data set: ${config.dataSet}`
          );
        }

        if (!Array.isArray(result.data)) {
          throw new Error(`Invalid criteria field data set: ${config.dataSet}`);
        }

        nextPage = result.nextPage;
        // Extract the columns we need.
        const valueProperty = config.valueProperty;
        const labelProperty = config.labelProperty;
        data = result.data
          .map(
            (item: any) =>
              ({
                value: item[valueProperty] as string | number,
                label: item[labelProperty] as string
              } as ISelectOption)
          )
          .concat(data);
        await Logger.info(
          `getCriteriaFieldOptions ${
            nextPage
              ? `paging nextPage: ${nextPage}.`
              : `has no nextPage to return.`
          }`
        );
      } while (nextPage);
      data.sort((a, b) => compareValues(a.label, b.label));
    }

    // If there are fixed values let's add those to the top.
    if (config.fixedValues) {
      data = config.fixedValues
        .map(
          fv =>
            ({
              value:
                typeof fv.value === 'string'
                  ? resolveTokens(fv.value, tokenContext)
                  : fv.value,
              label: resolveTokens(fv.label, tokenContext)
            } as ISelectOption)
        )
        .concat(data);
    }

    return data;
  }
}
