import {
  DataSetResultStatus,
  IDataSetResultPending,
  IDataSource,
  isRestDataSourceBase,
  SyncMetadata
} from './IDataSource';
import { PagingState } from './Paginator';
import {
  IRestDataSetComplete,
  RestDataSetResult,
  RestDataSourceBase
} from './RestDataSourceBase';

import {
  CriteriaSourcedIterator,
  DataObject,
  DataSetIteratorDefinition,
  DataSetSourcedIterator,
  DataValue,
  DataValueMap,
  IProofSpec,
  IteratorSource
} from '@hyperproof/hypersync-models';
import { ILocalizable } from '@hyperproof/integration-sdk';

export interface IIteratorPlanComplete {
  status: DataSetResultStatus.Complete;
  data: {
    iterableArray: IterableObject[];
    subArraySize: number;
  };
}

export type IterableObject = {
  [key: string]: DataValue;
};

export type IteratorPlanDataSetResult =
  | IIteratorPlanComplete
  | IDataSetResultPending;

export type CriteriaTransformers = {
  [key: string]: (data: any, iterandKey: string) => IterableObject[];
};

export const criteriaTransformers: CriteriaTransformers = {
  csvToIterable: (data: any, iterandKey: string) => {
    if (typeof data !== 'string') {
      throw new Error(
        'ServiceDataIterator: CSV criteria data must be a string'
      );
    }
    return data
      .split(',')
      .map((s: string) => s.trim())
      .map((item: string) => ({ [iterandKey]: item }));
  }
};

const MAX_ALLOWABLE_PROPERTIES = 1;
const MAX_ITERABLE_ARRAY_SIZE = 10000;
const MAX_VALIDATION_ITERATIONS = 3; // Number of records validated during sync plan generation

/**
 * Manages iteration over service data for hypersyncs, supporting both dataset and criteria-sourced iteration plans.
 *
 * The `ServiceDataIterator` is responsible for generating iteration plans, controlling iterative data flow, and validating
 * iterable arrays and elements. It interacts with a REST data source to fetch data according to the specified iterator definition.
 */
export class ServiceDataIterator {
  protected restDataSource: RestDataSourceBase;
  protected proofType: string;
  protected principalIterator: DataSetIteratorDefinition;
  protected principalArraySize: number;

  constructor(
    restDataSource: IDataSource,
    dataSetIterator: DataSetIteratorDefinition[],
    proofType: string
  ) {
    const errMessage = this.validateIterator(
      ServiceDataIterator.extractIteratorLayer(dataSetIterator, 1)
    );
    if (errMessage) {
      throw new Error(`Iterator: ${errMessage}`);
    }
    if (!isRestDataSourceBase(restDataSource)) {
      throw new Error(
        'ServiceDataIterator: DataSource must be an instance of RestDataSourceBase'
      );
    }
    this.restDataSource = restDataSource;
    this.proofType = proofType;
    this.principalIterator = ServiceDataIterator.extractIteratorLayer(
      dataSetIterator,
      1
    );
    this.principalArraySize = this.principalIterator.subArraySize ?? 1;
  }

  /**
   * Extracts the target layer from a JSON dataSetIterator array.
   */
  public static extractIteratorLayer(
    dataSetIterator: IProofSpec['dataSetIterator'],
    layer: number
  ) {
    if (!dataSetIterator || dataSetIterator.length === 0) {
      throw new Error(
        'ServiceDataIterator: dataSetIterator is empty or undefined.'
      );
    }

    const iterator = dataSetIterator.find(
      (i: DataSetIteratorDefinition) => i.layer === layer
    );
    if (!iterator) {
      throw new Error(
        `ServiceDataIterator: No matching iterator found for layer: ${layer}`
      );
    }
    return iterator;
  }

  /**
   * Merges the specified key from an iterable object into a parameters map.
   * Supports replacing a given `dataSetParam` value for the benefit
   * of token reuse and extensibility of JSON datasets.
   */
  public static mergeIterandWithParams(
    iterand: IterableObject,
    iterandKey: string,
    params?: DataValueMap
  ) {
    return {
      ...params,
      [iterandKey]: iterand[iterandKey]
    };
  }

  public async generateIteratorPlan(
    dataSetParams: DataValueMap,
    iteratorParams: DataValueMap,
    metadata?: SyncMetadata
  ): Promise<IteratorPlanDataSetResult> {
    let iterableArray: IterableObject[] = [];
    this.restDataSource.setPagingState(PagingState.IterationPlan);
    switch (this.principalIterator.source) {
      case IteratorSource.DataSet: {
        const response = await this.generateArrayFromDataset(
          iteratorParams,
          metadata
        );
        if (response.status !== DataSetResultStatus.Complete) {
          return response as IDataSetResultPending;
        }
        iterableArray = response.data;
        break;
      }
      case IteratorSource.Criteria: {
        iterableArray = this.generateArrayFromCriteria(
          dataSetParams,
          this.principalIterator.criteriaTransformer
        );
        break;
      }
      default:
        throw new Error('ServiceDataIterator: Unsupported iterator source.');
    }

    const errMessage = this.validateIterableArray(iterableArray);
    if (errMessage) {
      throw new Error(`ServiceDataIterator: ${errMessage}`);
    }

    return {
      status: DataSetResultStatus.Complete,
      data: {
        iterableArray,
        subArraySize: this.principalArraySize
      }
    };
  }

  public async iterateDataFlow(
    dataSetName: string,
    iterableSlice: IterableObject[],
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata,
    organization?: ILocalizable
  ): Promise<RestDataSetResult<DataObject[]>> {
    this.restDataSource.setPagingState(
      this.isSingleIteration()
        ? PagingState.SingleIteration
        : PagingState.BatchedIteration
    );
    return this.controlIterativeDataFlow(
      dataSetName,
      iterableSlice,
      params,
      page,
      metadata,
      organization
    );
  }

  protected generateArrayFromCriteria(
    params: DataValueMap,
    transformer?: string
  ) {
    if (!params) {
      throw new Error(
        'ServiceDataIterator: Params are missing.  Unable to generate iterable array from criteria.'
      );
    }
    const criteriaProperty = (this.principalIterator as CriteriaSourcedIterator)
      .criteriaProperty;

    const sourceCriteria = params[criteriaProperty];
    if (!sourceCriteria) {
      throw new Error(
        `ServiceDataIterator: Missing param value matching criteria property '${criteriaProperty}'`
      );
    }
    if (!transformer) {
      throw new Error(
        `ServiceDataIterator: Invalid criteria transformer: ${transformer}`
      );
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        criteriaTransformers,
        transformer
      ) ||
      typeof criteriaTransformers[transformer] !== 'function'
    ) {
      throw new Error(
        `ServiceDataIterator: Criteria transformer '${transformer}' does not exist or is not a function.`
      );
    }

    const iterableArray = criteriaTransformers[
      transformer as keyof CriteriaTransformers
    ](sourceCriteria, this.principalIterator.iterandKey);
    return iterableArray;
  }

  protected async generateArrayFromDataset(
    params: DataValueMap,
    metadata?: SyncMetadata
  ) {
    const dataSet = (this.principalIterator as DataSetSourcedIterator).dataSet;
    const response = await this.restDataSource.getData(
      dataSet!,
      params,
      undefined,
      metadata
    );

    if (response.status !== DataSetResultStatus.Complete) {
      return response;
    }

    const { data: iterableArray } = response;

    if (!Array.isArray(iterableArray)) {
      throw new Error(
        `ServiceDataIterator: Iterable array of type ${typeof iterableArray} must be an array.`
      );
    }

    return {
      data: iterableArray,
      status: DataSetResultStatus.Complete
    };
  }

  protected async controlIterativeDataFlow(
    dataSetName: string,
    iterableSlice: IterableObject[],
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata,
    organization?: ILocalizable
  ): Promise<RestDataSetResult<DataObject[]>> {
    const accumulator: IRestDataSetComplete<DataObject[]> = {
      status: DataSetResultStatus.Complete,
      data: [],
      headers: {},
      source: undefined,
      nextPage: undefined,
      context: undefined
    };

    for (const iteration of iterableSlice) {
      const mergedParams = ServiceDataIterator.mergeIterandWithParams(
        iteration,
        this.principalIterator.iterandKey,
        params
      );

      let response = await this.restDataSource.getData<DataObject[]>(
        dataSetName,
        mergedParams,
        page,
        metadata,
        organization
      );

      if (response.status !== DataSetResultStatus.Complete) {
        return response;
      }

      if (!Array.isArray(response.data)) {
        throw new Error(
          `ServiceDataIterator: Expected data to be an array, but received: ${typeof response.data}`
        );
      }

      response = await this.handleDataSetIteration(iteration, response);

      if (response.status !== DataSetResultStatus.Complete) {
        return response;
      }

      this.updateResponseFields(response, accumulator);
    }

    return accumulator;
  }

  protected async handleDataSetIteration(
    iteration: IterableObject,
    response: IRestDataSetComplete<DataObject[]>
  ): Promise<RestDataSetResult<DataObject[]>> {
    return response;
  }

  protected updateResponseFields(
    response: IRestDataSetComplete<DataObject[]>,
    accumulator: IRestDataSetComplete<DataObject[]>
  ): void {
    if (response.data) accumulator.data.push(...response.data);
    if (response.headers) accumulator.headers = response.headers;
    if (response.source) accumulator.source = response.source;
    if (response.nextPage && this.isSingleIteration())
      accumulator.nextPage = response.nextPage;
    if (response.context) accumulator.context = response.context;
  }

  /**
   * Performs validation on the provided JSON iterator configuration.
   * Returns an error message string if validation fails, otherwise undefined.
   */
  protected validateIterator(
    iterator: DataSetIteratorDefinition
  ): string | undefined {
    if (iterator.subArraySize !== undefined && iterator.subArraySize <= 0) {
      return 'Sub-array size must be greater than 0';
    }
    if (!iterator.iterandKey || iterator.iterandKey.trim() === '') {
      return 'Iterator must specify a non-empty iterandKey property';
    }
    switch (iterator.source) {
      case IteratorSource.DataSet:
        if (
          !(iterator as DataSetSourcedIterator).dataSet ||
          (iterator as DataSetSourcedIterator).dataSet.trim() === ''
        ) {
          return 'Dataset iterator must specify a non-empty dataSet property';
        }
        break;
      case IteratorSource.Criteria:
        if (
          !(iterator as CriteriaSourcedIterator).criteriaProperty ||
          (iterator as CriteriaSourcedIterator).criteriaProperty.trim() === ''
        ) {
          return 'Criteria iterator must specify a non-empty criteriaProperty property';
        }
        if (
          !(iterator as CriteriaSourcedIterator).criteriaTransformer ||
          (iterator as CriteriaSourcedIterator).criteriaTransformer.trim() ===
            ''
        ) {
          return 'Criteria iterator must specify a non-empty criteriaTransformer property';
        }
        if (
          !(
            (iterator as CriteriaSourcedIterator).criteriaTransformer in
            criteriaTransformers
          )
        ) {
          return `Criteria iterator specifies unknown criteriaTransformer: '${
            (iterator as CriteriaSourcedIterator).criteriaTransformer
          }'`;
        }
        break;
      default:
        return `Invalid iterator source: ${
          (iterator as DataSetSourcedIterator | CriteriaSourcedIterator).source
        }`;
    }
    return;
  }

  /**
   * Performs validation on the principal array to be returned and orchestrated at the Job level.
   * The origin of this array argument may be criteria selection or async call.
   * Returns an error message string if validation fails, otherwise undefined.
   */
  protected validateIterableArray(
    iterableArray: IterableObject[]
  ): string | undefined {
    if (iterableArray.length === 0) {
      return 'Invalid iterableArray.  Must be a non-empty array';
    }
    if (iterableArray.length > MAX_ITERABLE_ARRAY_SIZE) {
      return `Invalid iterableArray.  Length exceeds maximum of ${MAX_ITERABLE_ARRAY_SIZE}.  Found ${iterableArray.length} elements.`;
    }
    for (const [index, element] of iterableArray.entries()) {
      if (index >= MAX_VALIDATION_ITERATIONS) {
        break;
      }
      const error = this.validateIterableElement(element);
      if (error) {
        return `Invalid iterableArray. Element at index ${index}: ${error}`;
      }
    }
    return;
  }

  /**
   * Inspects individual elements of the principal array.
   * Returns an error message string if validation fails, otherwise undefined.
   */
  protected validateIterableElement(
    element: IterableObject
  ): string | undefined {
    if (typeof element !== 'object' || element === null) {
      return 'Must be a JSON object';
    }
    if (!(this.principalIterator.iterandKey in element)) {
      return `Missing iterand key: '${this.principalIterator.iterandKey}'`;
    }
    if (Object.keys(element).length > MAX_ALLOWABLE_PROPERTIES) {
      return `Only ${MAX_ALLOWABLE_PROPERTIES} property is allowed to be present in an iterable element.  Found ${
        Object.keys(element).length
      } properties.
      Use declarative transforms to reshape data.`;
    }
    return;
  }

  /**
   * Determines if current sync iteration is single (meaning an iterable slice size of one)
   * or batched (with a size greater than one).  This influences paging state and nextPage handling.
   */
  protected isSingleIteration(): boolean {
    return this.principalArraySize === 1;
  }
}
