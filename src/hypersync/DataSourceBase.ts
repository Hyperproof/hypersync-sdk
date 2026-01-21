import {
  DataSetResult,
  DataSetResultStatus,
  IDataSetResultComplete,
  IDataSource,
  SyncMetadata
} from './IDataSource';

import { DataObject, DataValueMap } from '@hyperproof/hypersync-models';
import { ILocalizable } from '@hyperproof/integration-sdk';

/**
 * Abstract base class for a data source object.  Provides convenient
 * helper methods which facilitate IDataSource usage.
 */
export abstract class DataSourceBase implements IDataSource {
  /**
   * Retrieves data from the service.  IDataSource method.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data. Optional.
   * @param {string} page The page value to continue fetching data from a previous sync. Optional.
   * @param {object} metadata Metadata from previous sync run if requeued. Optional.
   */
  abstract getData<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata,
    organization?: ILocalizable
  ): Promise<DataSetResult<TData | TData[]>>;

  /**
   * Retrieves a data object singleton from the service.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  public async getDataObject<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IDataSetResultComplete<TData>> {
    const response = await this.getData<TData>(dataSetName, params);
    if (response.status !== DataSetResultStatus.Complete) {
      throw new Error(`Invalid response received for data set: ${dataSetName}`);
    }
    if (Array.isArray(response.data)) {
      throw new Error(`Received array from ${dataSetName}.  Expected object.`);
    }
    return response as IDataSetResultComplete<TData>;
  }

  /**
   * Retrieves a data object collection from the service.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  public async getDataObjectArray<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IDataSetResultComplete<TData[]>> {
    const response = await this.getData<TData[]>(dataSetName, params);
    if (response.status !== DataSetResultStatus.Complete) {
      throw new Error(`Invalid response received for data set: ${dataSetName}`);
    }
    if (!Array.isArray(response.data)) {
      throw new Error(`Received object from ${dataSetName}.  Expected array.`);
    }
    return response as IDataSetResultComplete<TData[]>;
  }
}
