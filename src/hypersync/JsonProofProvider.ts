import { ID_ALL, ID_ANY, ID_NONE, StringMap } from './common';
import { HypersyncTemplate } from './enums';
import { ICriteriaPage, ICriteriaProvider } from './ICriteriaProvider';
import { DataSetResultStatus, IDataSource, SyncMetadata } from './IDataSource';
import { IHypersync } from './models';
import { IProofFile, ProofProviderBase } from './ProofProviderBase';
import { IGetProofDataResponse } from './Sync';
import { dateToLocalizedString } from './time';
import { resolveTokens, TokenContext } from './tokens';

import {
  DataObject,
  HypersyncCriteria,
  HypersyncFieldFormat,
  HypersyncFieldType,
  HypersyncPeriod,
  IHypersyncDefinition,
  IHypersyncField,
  IProofSpec
} from '@hyperproof/hypersync-models';

import { IHyperproofUser, Logger } from '../common';

/**
 * Provides methods for working with proof type definitions stored
 * in a JSON file.
 */
export class JsonProofProvider extends ProofProviderBase {
  private connectorName: string;
  private proofType: string;
  private messages: StringMap;
  private getDefinition: () => Promise<IHypersyncDefinition>;

  constructor(
    connectorName: string,
    proofType: string,
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    messages: StringMap,
    getDefinitionCallback: () => Promise<IHypersyncDefinition>
  ) {
    super(dataSource, criteriaProvider);
    this.connectorName = connectorName;
    this.proofType = proofType;
    this.criteriaProvider = criteriaProvider;
    this.messages = messages;
    this.getDefinition = getDefinitionCallback;
  }

  public async generateCriteriaMetadata(
    criteriaValues: HypersyncCriteria,
    pages: ICriteriaPage[]
  ) {
    const definition = await this.getDefinition();
    const tokenContext = this.initTokenContext(criteriaValues);

    await this.criteriaProvider.generateCriteriaFields(
      definition.criteria.map(c => ({ name: c.name, page: c.page })),
      criteriaValues,
      tokenContext,
      pages
    );

    // If all of the criteria have been specified, build the proof spec
    // so that we can provide some additional values.
    let proofSpec;
    let suggestedName = '';
    if (pages[pages.length - 1].isValid) {
      proofSpec = this.buildProofSpec(definition, tokenContext);
      await this.fetchLookups(proofSpec, tokenContext);
      suggestedName = resolveTokens(proofSpec.suggestedName, tokenContext);
    }

    return {
      pages,
      period: proofSpec?.period || HypersyncPeriod.Monthly,
      useVersioning: proofSpec?.useVersioning || false,
      suggestedName,
      description: resolveTokens(definition.description, tokenContext),
      enableExcelOutput: true
    };
  }

  protected get dataSource() {
    return this.client as IDataSource;
  }

  public async generateSchema(criteriaValues: HypersyncCriteria) {
    const definition = await this.getDefinition();
    const tokenContext = this.initTokenContext(criteriaValues);
    const proofSpec = this.buildProofSpec(definition, tokenContext);
    return {
      format: proofSpec.format,
      isHierarchical: false,
      fields: proofSpec.fields.map(f => ({
        property: f.property,
        label: resolveTokens(f.label, tokenContext),
        type: f.type || HypersyncFieldType.Text
      }))
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getProofData(
    hypersync: IHypersync,
    hyperproofUser: IHyperproofUser,
    authorizedUser: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncStartDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    page?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    metadata?: SyncMetadata
  ): Promise<IProofFile[] | IGetProofDataResponse> {
    await Logger.info(`Generating declarative proof type ${this.proofType}`);
    const combine = true;
    const settings = hypersync.settings;
    const criteriaValues = settings.criteria;
    const definition = await this.getDefinition();
    const tokenContext = this.initTokenContext(criteriaValues);
    const proofSpec = this.buildProofSpec(definition, tokenContext);
    await this.fetchLookups(proofSpec, tokenContext);

    const params = proofSpec.dataSetParams;
    if (params) {
      for (const key of Object.keys(params)) {
        const value = params[key];
        if (typeof value === 'string') {
          params[key] = resolveTokens(value, tokenContext);
        }
      }
    }

    const response = await this.dataSource.getData(
      proofSpec.dataSet,
      params,
      page,
      metadata
    );

    if (response.status !== DataSetResultStatus.Complete) {
      return {
        ...response,
        data: []
      };
    }

    const {
      data,
      source,
      context: dataSourceContext,
      nextPage,
      errorInfo
    } = response;

    if (dataSourceContext) {
      tokenContext.dataSource = dataSourceContext;
    }

    const dateFields = proofSpec.fields.filter(f => f.type === 'date');
    const numberFields = proofSpec.fields.filter(f => f.type === 'number');
    if (dateFields.length || numberFields.length) {
      if (Array.isArray(data)) {
        data.forEach(row => {
          this.addFormattedValues(
            row,
            dateFields,
            numberFields,
            hyperproofUser
          );
        });
      } else {
        this.addFormattedValues(data, dateFields, numberFields, hyperproofUser);
      }
    }

    // Since Job Engine seeks the first job-level page, assign
    // empty list for subsequent pages to optimize performance.
    let displayProofCriteria = true;
    if (combine === true && page !== undefined) {
      displayProofCriteria = false;
    }
    const criteria = displayProofCriteria
      ? await this.criteriaProvider.generateProofCriteria(
          definition.criteria,
          criteriaValues,
          tokenContext
        )
      : [];

    // Push the raw data into the token context so that properties like
    // webPageUrl can pull in values from the retrieved data.  This is
    // most useful in stacked pages where there is only a single object.
    tokenContext['data'] = data;

    // Proof is always stored as an array.
    const proof = Array.isArray(data) ? data : [data];

    return {
      data: [
        {
          filename: settings.name,
          contents: {
            type: process.env.integration_type!,
            title: resolveTokens(proofSpec.title, tokenContext),
            subtitle: resolveTokens(proofSpec.subtitle, tokenContext),
            source: source,
            ...(proofSpec.webPageUrl && {
              webPageUrl: resolveTokens(proofSpec.webPageUrl, tokenContext)
            }),
            orientation: proofSpec.orientation,
            userTimeZone: hyperproofUser.timeZone,
            criteria,
            proofFormat: settings.proofFormat,
            template: HypersyncTemplate.UNIVERSAL,
            layout: {
              format: proofSpec.format,
              noResultsMessage:
                proof.length > 0 || !proofSpec.noResultsMessage
                  ? ''
                  : resolveTokens(proofSpec.noResultsMessage, tokenContext),
              fields: proofSpec.fields.map(f => ({
                property: f.property,
                label: resolveTokens(f.label, tokenContext),
                width: f.width,
                type: f.type === HypersyncFieldType.Text ? undefined : f.type
              }))
            },
            proof,
            authorizedUser,
            collector: this.connectorName,
            collectedOn: dateToLocalizedString(
              syncStartDate,
              hyperproofUser.timeZone,
              hyperproofUser.language,
              hyperproofUser.locale
            )!,
            errorInfo
          }
        }
      ],
      nextPage,
      combine
    };
  }

  /**
   * Initializes and returns a token context object that is used when resolving
   * token values.  Note that the `lookups` object is initially empty because
   * a) fetching lookups is expensive and b) lookups aren't need in all cases.
   * To populate the lookups member see fetchLookups.
   */
  private initTokenContext(criteria: HypersyncCriteria): TokenContext {
    return {
      messages: this.messages,
      constants: {
        ID_ALL: ID_ALL,
        ID_ANY: ID_ANY,
        ID_NONE: ID_NONE
      },
      criteria,
      lookups: {}
    };
  }

  /**
   * Creates a proof specification object by combining the base proof spec in
   * the proof type definion with any overrides that have matching conditions.
   */
  private buildProofSpec(
    definition: IHypersyncDefinition,
    tokenContext: TokenContext
  ) {
    let proofSpec = definition.proofSpec;
    if (definition.overrides) {
      for (const override of definition.overrides) {
        const conditionValue = resolveTokens(
          override.condition.value,
          tokenContext
        );
        if (
          conditionValue ===
          resolveTokens(override.condition.criteria, tokenContext)
        ) {
          proofSpec = {
            ...proofSpec,
            ...override.proofSpec
          };
        }
      }
    }
    return proofSpec;
  }

  /**
   * Fetches lookup values that are declared in a proof specification.
   * The result of the fetch is added to the tokenContext so that it
   * may be referenced by tokens in the proof specification.
   */
  private async fetchLookups(
    proofSpec: IProofSpec,
    tokenContext: TokenContext
  ) {
    if (proofSpec.lookups) {
      for (const lookup of proofSpec.lookups) {
        const params = lookup.dataSetParams;
        if (params) {
          for (const key of Object.keys(params)) {
            const value = params[key];
            if (typeof value === 'string') {
              params[key] = resolveTokens(value, tokenContext);
            }
          }
        }
        const response = await this.dataSource.getData(
          lookup.dataSet,
          lookup.dataSetParams
        );
        if (response.status !== DataSetResultStatus.Complete) {
          throw new Error(
            `Pending response received for proof specification lookup data set: ${lookup.dataSet}`
          );
        }
        const lookups = tokenContext.lookups as TokenContext;
        lookups[lookup.name] = response.data;
      }
    }
  }

  private addFormattedValues(
    proofRow: DataObject,
    dateFields: IHypersyncField[],
    numberFields: IHypersyncField[],
    hyperproofUser: IHyperproofUser
  ) {
    if (dateFields.length) {
      this.addFormattedDates(proofRow, dateFields, hyperproofUser);
    }
    if (numberFields.length) {
      this.addFormattedNumbers(proofRow, numberFields);
    }
  }

  /**
   * Helper method that adds formatted date properties to a proof row.
   */
  private addFormattedDates(
    proofRow: DataObject,
    dateFields: IHypersyncField[],
    hyperproofUser: IHyperproofUser
  ) {
    for (const dateField of dateFields) {
      const dateValue = proofRow[dateField.property];
      if (dateValue instanceof Date || typeof dateValue === 'string') {
        proofRow[dateField.property + 'Formatted'] = dateToLocalizedString(
          dateValue,
          hyperproofUser.timeZone,
          hyperproofUser.language,
          hyperproofUser.locale
        )!;
      }
    }
  }

  /**
   * Helper method that adds formatted numbers properties to a proof row.
   */
  private addFormattedNumbers(
    proofRow: DataObject,
    numberFields: IHypersyncField[]
  ) {
    for (const numberField of numberFields) {
      const numberValue = proofRow[numberField.property];
      if (typeof numberValue === 'number') {
        proofRow[numberField.property + 'Formatted'] = this.formatNumber(
          numberValue,
          numberField
        );
      }
    }
  }

  private formatNumber(value: number, numberField: IHypersyncField) {
    if (numberField.format === HypersyncFieldFormat.Percent) {
      if (value) {
        return `${value.toFixed(2)}%`;
      } else if (value == 0) {
        return '0%';
      }
      return '';
    }

    return value.toString();
  }
}
