import { ID_ALL, ID_ANY, ID_NONE, ID_UNDEFINED, StringMap } from './common';
import { HypersyncTemplate } from './enums';
import { ICriteriaPage, ICriteriaProvider } from './ICriteriaProvider';
import {
  DataSetResultStatus,
  IDataSource,
  isRestDataSourceBase,
  SyncMetadata
} from './IDataSource';
import { calcLayoutInfo } from './layout';
import { MESSAGES } from './messages';
import { IHypersync } from './models';
import {
  IHypersyncProofField,
  IProofFile,
  ProofProviderBase
} from './ProofProviderBase';
import { IterableObject } from './ServiceDataIterator';
import { IGetProofDataResponse, IHypersyncSyncPlanResponse } from './Sync';
import { dateToLocalizedString } from './time';
import { resolveTokens, TokenContext } from './tokens';

import {
  DataObject,
  DataValueMap,
  HypersyncCriteria,
  HypersyncFieldFormat,
  HypersyncFieldType,
  HypersyncPeriod,
  ICriteriaSearchInput,
  IHypersyncDefinition,
  IHypersyncField,
  IProofSpec,
  IteratorSource
} from '@hyperproof/hypersync-models';
import { ILocalizable, Logger } from '@hyperproof/integration-sdk';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';

import { validateDataSchema } from '../schema-proof/common';

const SAVED_CRITERIA_SUFFIX = 'SavedCriterion';

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
    pages: ICriteriaPage[],
    search?: string | ICriteriaSearchInput
  ) {
    const definition = await this.getDefinition();
    const tokenContext = this.initTokenContext(criteriaValues);

    await this.criteriaProvider.generateCriteriaFields(
      definition.criteria.map(c => ({ name: c.name, page: c.page })),
      criteriaValues,
      tokenContext,
      pages,
      search
    );

    // If all of the criteria have been specified, build the proof spec
    // so that we can provide some additional values.
    let proofSpec;
    let suggestedName = '';
    if (pages[pages.length - 1].isValid) {
      proofSpec = this.buildProofSpec(definition, tokenContext);
      await this.fetchLookups(proofSpec, tokenContext);
      const criteriaLabels = this.findCriteriaLabels(
        pages,
        tokenContext.criteria as HypersyncCriteria
      );
      suggestedName = resolveTokens(proofSpec.suggestedName, {
        ...tokenContext,
        criteriaLabels
      });
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

  public async generateSyncPlan(
    criteriaValues: HypersyncCriteria,
    metadata?: SyncMetadata,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    retryCount?: number
  ): Promise<IHypersyncSyncPlanResponse> {
    await Logger.info(`Generating sync plan for proof ${this.proofType}`);
    const definition = await this.getDefinition();
    const tokenContext = this.initTokenContext(criteriaValues);
    const proofSpec: IProofSpec = this.buildProofSpec(definition, tokenContext);

    if (proofSpec.dataSetIterator) {
      if (!isRestDataSourceBase(this.dataSource)) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          'Hypersync does not support data source iteration.'
        );
      }
      await this.fetchLookups(proofSpec, tokenContext);

      const dataSetParams = proofSpec.dataSetParams ?? {};
      if (dataSetParams) {
        this.resolveTokensForParams(dataSetParams, tokenContext);
      }
      this.addSavedCriteriaToParams(dataSetParams, criteriaValues);

      let iteratorParams = {};
      // Resolve tokens for principal iterator params
      for (const iterator of proofSpec.dataSetIterator) {
        if (
          iterator.layer === 1 &&
          iterator.source === IteratorSource.DataSet
        ) {
          iteratorParams = iterator.dataSetParams ?? {};
          this.resolveTokensForParams(iteratorParams, tokenContext);
        }
      }

      const response = await this.dataSource.generateIteratorPlan(
        this.proofType,
        proofSpec.dataSetIterator,
        dataSetParams,
        iteratorParams,
        metadata
      );
      if (response.status !== DataSetResultStatus.Complete) {
        return {
          ...response,
          syncPlan: {}
        };
      }
      const { data: iteratorPlan } = response;
      return {
        syncPlan: {
          iteratorPlan,
          combine: true
        }
      };
    }

    return {
      syncPlan: {
        combine: true
      }
    };
  }

  public async getProofData(
    hypersync: IHypersync,
    organization: ILocalizable,
    authorizedUser: string,
    syncStartDate: Date,
    page?: string,
    metadata?: SyncMetadata,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    retryCount?: number,
    iterableSlice?: IterableObject[]
  ): Promise<IProofFile[] | IGetProofDataResponse> {
    await Logger.info(`Generating declarative proof type ${this.proofType}`);
    const settings = hypersync.settings;
    const criteriaValues = settings.criteria;
    const definition = await this.getDefinition();
    const tokenContext = this.initTokenContext(criteriaValues);
    const proofSpec: IProofSpec = this.buildProofSpec(definition, tokenContext);
    await this.fetchLookups(proofSpec, tokenContext);

    const params = proofSpec.dataSetParams;
    if (params) {
      this.resolveTokensForParams(params, tokenContext);
    }
    this.addSavedCriteriaToParams(params, criteriaValues);

    let response;
    if (proofSpec.dataSetIterator) {
      if (!isRestDataSourceBase(this.dataSource)) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          'Hypersync does not support data source iteration.'
        );
      }
      response = await this.dataSource.iterateDataFlow(
        this.proofType,
        proofSpec.dataSet,
        proofSpec.dataSetIterator,
        iterableSlice || [],
        params,
        page,
        metadata,
        organization
      );
    } else {
      response = await this.dataSource.getData(
        proofSpec.dataSet,
        params,
        page,
        metadata,
        organization
      );
    }

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

    if (hypersync.schemaCategory) {
      validateDataSchema(hypersync, data);
    }

    const dateFields = proofSpec.fields.filter(f => f.type === 'date');
    const numberFields = proofSpec.fields.filter(f => f.type === 'number');
    if (dateFields.length || numberFields.length) {
      if (Array.isArray(data)) {
        data.forEach(row => {
          this.addFormattedValues(row, dateFields, numberFields, organization);
        });
      } else {
        this.addFormattedValues(data, dateFields, numberFields, organization);
      }
    }

    let resolvedFields = proofSpec.fields.map(f => ({
      property: f.property,
      label: resolveTokens(f.label, tokenContext),
      width: f.width,
      type: f.type === HypersyncFieldType.Text ? undefined : f.type
    })) as IHypersyncProofField[];

    let zoom = 1;
    if (proofSpec.autoLayout === true) {
      const layoutInfo = calcLayoutInfo(
        resolvedFields,
        Array.isArray(data) ? data : [data]
      );
      resolvedFields = layoutInfo.fields;
      zoom = layoutInfo.zoom;
    }

    // Since Job Engine seeks the first job-level page, assign
    // empty list for subsequent pages to optimize performance.
    let displayProofCriteria = true;
    if (page !== undefined) {
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
            userTimeZone: organization.timeZone,
            criteria,
            proofFormat: settings.proofFormat,
            template: HypersyncTemplate.UNIVERSAL,
            layout: {
              format: proofSpec.format,
              noResultsMessage:
                proof.length > 0 || !proofSpec.noResultsMessage
                  ? ''
                  : resolveTokens(proofSpec.noResultsMessage, tokenContext),
              fields: resolvedFields
            },
            proof,
            authorizedUser,
            collector: this.connectorName,
            collectedOn: dateToLocalizedString(
              syncStartDate,
              organization.timeZone,
              organization.language,
              organization.locale
            )!,
            errorInfo,
            zoom
          }
        }
      ],
      nextPage
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
        ID_NONE: ID_NONE,
        ID_UNDEFINED: ID_UNDEFINED
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
        const operand = resolveTokens(
          override.condition.criteria,
          tokenContext
        );
        const isUndefinedEval = operand === ID_UNDEFINED; // evaluate for undefined criteria value
        const conditionValue = resolveTokens(
          override.condition.value,
          tokenContext,
          false,
          isUndefinedEval
        );
        if (
          conditionValue === operand ||
          (isUndefinedEval && typeof conditionValue === 'undefined')
        ) {
          const shouldOverrideDataSetParams =
            override.proofSpec?.dataSetParams ?? false;
          proofSpec = {
            ...proofSpec,
            ...override.proofSpec,
            ...(shouldOverrideDataSetParams && {
              dataSetParams: {
                ...proofSpec.dataSetParams,
                ...override.proofSpec.dataSetParams
              }
            })
          };
        }
      }
    }
    Logger.debug('Using proof specification', JSON.stringify(proofSpec));
    if (!proofSpec.noResultsMessage) {
      proofSpec.noResultsMessage = MESSAGES.Default.NoResultsMessage;
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
          this.resolveTokensForParams(params, tokenContext);
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

  private resolveTokensForParams(
    params: DataValueMap,
    tokenContext: TokenContext
  ) {
    for (const key of Object.keys(params)) {
      const value = params[key];
      if (typeof value === 'string') {
        params[key] = resolveTokens(value, tokenContext);
      }
    }
  }

  /**
   * Performs reverse lookup of criteria labels for hypersync
   * suggested name.
   */
  private findCriteriaLabels(
    pages: ICriteriaPage[],
    criteria?: HypersyncCriteria
  ) {
    const criteriaLabels: { [key: string]: any } = {};
    const fields = pages.flatMap(page => page.fields);
    for (const criterion in criteria) {
      const criteriaField = fields.find(field => field.name === criterion);
      if (!criteriaField || !criteriaField.options) {
        continue;
      }
      criteriaLabels[criterion] = criteriaField.options.find(
        option => option.value === criteria[criterion]
      )?.label;
    }
    return criteriaLabels;
  }

  private addFormattedValues(
    proofRow: DataObject,
    dateFields: IHypersyncField[],
    numberFields: IHypersyncField[],
    organization: ILocalizable
  ) {
    if (dateFields.length) {
      this.addFormattedDates(proofRow, dateFields, organization);
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
    organization: ILocalizable
  ) {
    for (const dateField of dateFields) {
      if (proofRow[dateField.property + 'Formatted']) {
        continue; // don't overwrite existing formatted date
      }
      const dateValue = proofRow[dateField.property];
      if (dateValue instanceof Date || typeof dateValue === 'string') {
        proofRow[dateField.property + 'Formatted'] = dateToLocalizedString(
          dateValue,
          organization.timeZone,
          organization.language,
          organization.locale
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
      if (proofRow[numberField.property + 'Formatted']) {
        continue; // don't overwrite existing formatted number
      }
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

  private addSavedCriteriaToParams(
    params: DataValueMap | undefined,
    criteriaValues: HypersyncCriteria
  ) {
    if (params && this.criteriaValuesHaveSavedCriterion(criteriaValues)) {
      for (const key in criteriaValues) {
        if (key.endsWith(SAVED_CRITERIA_SUFFIX)) {
          params[key] = (criteriaValues[key] as any).data;
        }
      }
    }
  }

  private criteriaValuesHaveSavedCriterion(criteriaValues: HypersyncCriteria) {
    for (const key in criteriaValues) {
      if (key.endsWith(SAVED_CRITERIA_SUFFIX)) {
        return true;
      }
    }
    return false;
  }
}
