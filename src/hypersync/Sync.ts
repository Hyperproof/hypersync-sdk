import {
  ExternalAPIError,
  HyperproofApiClient,
  Logger
} from '../common';
import { formatHypersyncError } from './common';
import { HypersyncResult } from './enums';
import { HypersyncStorageClient } from './HypersyncStorageClient';
import { IHypersync } from './models';
import { IHypersyncContents, IProofFile } from './ProofProviderBase';

/**
 * Used to store abitrary synchronization state across multiple sync iterations.
 */
export type SyncMetadata = { [key: string]: any };

/**
 * Detailed response object that may be returned from getProofData.
 */
export interface IGetProofDataResponse {
  data: IProofFile[];
  nextPage?: string;
  combine?: boolean;
  metadata?: SyncMetadata;
  delay?: number;
  retry?: boolean;
  maxRetry?: number;
  publishResult?: boolean;
  syncResult?: HypersyncResult;
  failureMessage?: string;
}

export class Sync {
  public hyperproofClient: HyperproofApiClient;
  public user: object;
  public storage: HypersyncStorageClient;
  public objectKey: string;
  public hypersync: IHypersync;
  public syncStartDate: Date;
  public page?: number;
  public metadata?: SyncMetadata;

  /**
   * @param {HyperproofApiClient} hyperproofClient The client to talk to Hyperproof
   * @param {IUserContext} user Information about the user in the external system.
   * @param {HypersyncStorageClient} storage The storage client for Hypersyncs
   * @param {string} objectKey The key for the object the hypersync is targetting
   * @param {Hypersync} hypersync The Hypersync to run the sync for
   * @param {string} syncStartDate The ISO-8601 string for moment the sync started
   * @param {number} page The page of data to retrieve.  Optional.
   * @param {SyncMetadata} metadata Hypersync-specific synchronization state.  Optional.
   */
  constructor(
    hyperproofClient: HyperproofApiClient,
    user: object,
    storage: HypersyncStorageClient,
    objectKey: string,
    hypersync: IHypersync,
    syncStartDate: string,
    page?: number,
    metadata?: SyncMetadata
  ) {
    this.hyperproofClient = hyperproofClient;
    this.user = user;
    this.storage = storage;
    this.objectKey = objectKey;
    this.hypersync = hypersync;
    this.syncStartDate = syncStartDate ? new Date(syncStartDate) : new Date();
    this.page = page;
    this.metadata = metadata;
  }

  /**
   * Executes the sync operation. Gets data from the external source and returns it as proof-formatted JSON
   */
  async run() {
    try {
      const data = await this.getProofData();
      const response = Array.isArray(data)
        ? {
            data
          }
        : data;
      response.data.forEach(proofFile => this.formatProof(proofFile.contents));
      return response;
    } catch (err) {
      if (
        err instanceof ExternalAPIError &&
        err?.computeRetry &&
        err.throttleManager
      ) {
        return err.computeRetry();
      }
      await Logger.error(
        `Hypersync Sync Error: ${process.env.vendor_name}`,
        formatHypersyncError(err, this.objectKey, 'Sync failure')
      );
      throw err;
    }
  }

  /**
   * If a sync fails, the previous proof items posted need to be marked as unhealthy (for versioned proof).
   * However, if a hypersync's settings have changed, the old proof that was posted may not match any
   * future proof, so there won't be any way to mark it as healthy again.
   *
   * The default implementation of this method will match only the hypersync's criteria. So if the user changes
   * the hypersync settings, then gets a sync failure, it will not mark the previous proof as unhealthy
   */
  getVersioningParams() {
    return { ...this.hypersync.settings.criteria };
  }

  /**
   * To be overridden by derived classes
   * Gets data from an external source and returns it
   *
   * This should return a single object or array of ProofDataItem objects with the following properties:
   * filename, contents, id (optional for single objects)
   *
   * @returns {ProofDataItem | ProofDataItem[]}
   */
  async getProofData(): Promise<IProofFile[] | IGetProofDataResponse> {
    throw Error('Not implemented');
  }

  /**
   * To be overridden by derived classes.  Formats the contents of an IProofFile.
   *
   * @param {Object} contents The contents of the item to be posted back to Hyperproof as proof.
   */
  formatProof(contents: IHypersyncContents) {
    return contents;
  }
}