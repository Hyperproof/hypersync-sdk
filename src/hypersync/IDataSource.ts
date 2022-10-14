import { DataValue, DataObject } from './models';
import { TokenContext } from './tokens';

// Used to map a string value to a supported primitive value.
export type DataValueMap = { [name: string]: DataValue };

// Result returned from IDataSource's getData method.
export interface IGetDataResult<TData = DataObject> {
  data: TData;
  apiUrl: string;
  context?: TokenContext;
}

/**
 * Interface implemented by client objects that provide data from an external source.
 */
export interface IDataSource {
  /**
   * Retrieves data from the service.
   *
   * @param {string} dataSetName Name of the data set to retrieve.
   * @param {object} params Parameter values to be used when retrieving data.  Optional.
   */
  getData<TData = DataObject>(
    dataSetName: string,
    params?: DataValueMap
  ): Promise<IGetDataResult<TData | TData[]>>;
}
