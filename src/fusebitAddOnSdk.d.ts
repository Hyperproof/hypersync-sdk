/**
 * Custom type definitions for @fusebit/add-on-sdk.
 *
 * https://fusebit.io/docs/authoring-guide/programming-model/
 */

declare module '@fusebit/add-on-sdk' {
  /**
   * Method of invocation for the call coming into Fusebit.
   */
  enum Method {
    Get = 'GET',
    Post = 'POST',
    Put = 'PUT',
    Delete = 'DELETE',
    Cron = 'CRON'
  }

  /**
   * Identifying information for an item in Fusebit storage.
   */
  interface IStorageItem {
    storageId: string;
    tags: object;
    etag: string;
    expires: string;
  }

  /**
   * Fusebit storage data object.
   */
  interface IStorageDataObject {
    etag: string;
    tags: object;
    expires: string;
    data: any;
  }

  /**
   * Options which can be passed to IStorage.list() to control the data
   * that is returned from the method.
   */
  interface IListStorageOptions {
    count?: number;
    next?: string;
  }

  interface IListStorageResult {
    items: IStorageItem[];
    next?: string;
  }

  interface IStorageClient {
    // https://fusebit.io/docs/reference/fusebit-http-api/#operation/getStorage
    get(storageSubId: string): Promise<IStorageDataObject>;

    // https://fusebit.io/docs/reference/fusebit-http-api/#operation/putStorage
    put(data: any, storageSubId: string): Promise<IStorageDataObject>;

    // https://fusebit.io/docs/reference/fusebit-http-api/#operation/deleteStorage
    delete(
      storageSubId: string,
      recursive?: boolean,
      forceRecursive?: boolean
    ): Promise<undefined>;

    // https://fusebit.io/docs/reference/fusebit-http-api/#operation/getStorageList
    list(
      storageSubId: string,
      options?: IListStorageOptions
    ): Promise<IListStorageResult>;
  }

  interface IFusebitContext {
    accountId: string;
    subscriptionId: string;
    boundaryId: string;
    functionId: string;
    configuration: { [key: string]: string };
    method: Method;
    baseUrl?: string;
    url?: string;
    path?: string;
    query?: { [key: string]: string | string[] };
    headers?: { [key: string]: string };
    body?: any;
    fusebit: {
      functionAccessToken: string;
      caller: {
        permissions: string[];
        accessToken: string;
      };
    };
    storage: IStorageClient;
  }

  function createStorageClient(
    ctx: IFusebitContext,
    accessToken: string,
    storageIdPrefix: string
  ): Promise<IStorageClient>;

  function debug(message: string, ...params: any[]): void;

  function getFunctionUrl(
    ctx: IFusebitContext,
    accessToken: string,
    boundaryId: string,
    functionId: string
  ): Promise<string>;
}
