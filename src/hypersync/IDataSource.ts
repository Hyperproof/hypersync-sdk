import { IErrorInfo } from './models';
import { RestDataSourceBase } from './RestDataSourceBase';
import { TokenContext } from './tokens';

import { DataObject, DataValueMap } from '@hyperproof/hypersync-models';
import { ILocalizable } from '@hyperproof/integration-sdk';

export enum DataSetResultStatus {
  Complete = 'complete',
  Pending = 'pending'
}

// Result returned from IDataSource's getData method.
export interface IDataSetResultComplete<TData> {
  status: DataSetResultStatus.Complete;
  data: TData;
  source?: string;
  nextPage?: string;
  context?: TokenContext;
  errorInfo?: IErrorInfo;
}

/**
 * Used to store abitrary synchronization state across multiple sync iterations.
 */
export type SyncMetadata = { [key: string]: any };

export interface IDataSetResultPending {
  status: DataSetResultStatus.Pending;
  delay: number;
  maxRetry: number;
  metadata: SyncMetadata;
}

export type DataSetResult<TData> =
  | IDataSetResultComplete<TData>
  | IDataSetResultPending;

/**
 * Interface implemented by client objects that provide data from an external source.
 */
export interface IDataSource {
  /**
   * Retrieves data from the service.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data. Optional.
   * @param {string} page The page value to continue fetching data from a previous sync.
   *  This has the same value as the nextPage property returned from the previous sync
   *  if the status was Complete. Optional.
   * @param {object} metadata Metadata from previous sync run if requeued. Only returned
   *  from the previous sync if the status was Pending. Optional.
   */
  getData(
    dataSetName: string,
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata,
    organization?: ILocalizable
  ): Promise<DataSetResult<DataObject | DataObject[]>>;
}

export function isRestDataSourceBase(
  dataSource: IDataSource
): dataSource is RestDataSourceBase {
  return (dataSource as RestDataSourceBase).getConfig() !== undefined;
}
