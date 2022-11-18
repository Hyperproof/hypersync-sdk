import { DataSetResultStatus } from './enums';
import { DataObject, DataValue } from './models';
import { SyncMetadata } from './Sync';
import { TokenContext } from './tokens';

// Used to map a string value to a supported primitive value.
export type DataValueMap = { [name: string]: DataValue };

// Result returned from IDataSource's getData method.
export interface IDataSetResultComplete<TData = DataObject> {
  status: DataSetResultStatus.Complete;
  data: TData;
  apiUrl: string;
  nextPage?: string;
  context?: TokenContext;
}

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
  getData<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap,
    page?: string,
    metadata?: SyncMetadata
  ): Promise<DataSetResult<TData>>;
}
