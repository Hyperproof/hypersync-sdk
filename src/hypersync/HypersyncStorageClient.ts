import Sdk, { FusebitContext } from '@fusebit/add-on-sdk';
import {
  IUserConnection,
  IUserConnectionPatch,
  listAllStorageKeys,
  getHpUserFromUserKey,
  Logger
} from '../common';
import createHttpError from 'http-errors';
import StatusCodes from 'http-status-codes';

/**
 * Storage client that can be used to access the Hypersync connection information
 * that is stored in the Hypersync service's storage root.
 */
export class HypersyncStorageClient {
  private fusebitContext: FusebitContext;
  private storage: Sdk.StorageClient;

  private constructor(
    fusebitContext: FusebitContext,
    storage: Sdk.StorageClient
  ) {
    this.fusebitContext = fusebitContext;
    this.storage = storage;
  }

  public static async createInstance(
    fusebitContext: FusebitContext,
    storageIdPrefix?: string
  ) {
    if (!storageIdPrefix) {
      storageIdPrefix = `boundary/services/function/hypersync${
        process.env.custom_function_key ?? ''
      }/root`;
    }
    const storage = await Sdk.createStorageClient(
      fusebitContext,
      fusebitContext.fusebit.functionAccessToken,
      storageIdPrefix
    );

    return new HypersyncStorageClient(fusebitContext, storage);
  }

  /**
   * Adds a new Hypersync connection to the connection registry.
   *
   * @param {*} orgId ID of the org in which the connection was made.
   * @param {*} userId ID of the user who made (and owns) the connection.
   * @param {*} connection Information on the connection
   */
  public async addUserConnection(
    orgId: string,
    userId: string,
    connection: IUserConnection
  ) {
    await Logger.info(
      `Adding new Hypersync connection in org ${orgId} for user ${userId}`
    );

    const storageKey = `connections/${orgId}/users/${userId}`;
    const { connections } = await this.getStoredUserConnections(storageKey);

    // Don't add the connection more than once.  If the user authorizes with
    // the same credentials a second time we want to reuse the existing connection.
    const existing = connections.find(
      c =>
        c.type === connection.type && c.vendorUserId === connection.vendorUserId
    );
    if (existing) {
      return existing;
    }

    // Make sure the name is unique for this user.
    let suffix = 2;
    const originalName = connection.name;
    while (
      connections.find(
        c => c.name.toLowerCase() === connection.name.toLowerCase()
      )
    ) {
      connection = {
        ...connection,
        name: `${originalName} ${suffix++}`
      };
    }

    connections.push(connection);
    await this.storage.put({ data: connections }, storageKey);
    return connection;
  }

  /**
   * Gets a user's Hypersync connections from the connection registry.
   *
   * @param {*} orgId ID of the org in which the connection was made.
   * @param {*} userId ID of the user who made (and owns) the connection.
   */
  public async getUserConnections(orgId: string, userId: string) {
    await Logger.info(
      `Retrieving Hypersync connections in org ${orgId} for user ${userId}`
    );
    const storageKey = `connections/${orgId}/users/${userId}`;
    const { connections } = await this.getStoredUserConnections(storageKey);
    return connections;
  }

  /**
   * Gets a map that includes all of the connections in an organization.
   *
   * @param {*} orgId ID of the organization.
   */
  public async getOrgConnectionMap(orgId: string) {
    await Logger.info(`Retrieving Hypersync connection map for org ${orgId}`);

    // For a given org multiple users may have created connections.  Collect
    // all of them and create entries in the map with keys of the form:
    //    hpUserId|type|vendorUserId
    // Returning the map with keys formed this way makes it easy and fast to do
    // lookups on the client.
    const map: { [connectionRef: string]: string } = {};
    const keys = await listAllStorageKeys(
      this.fusebitContext,
      `connections/${orgId}`
    );
    for (const key of keys) {
      const userKey = key.storageId.split('/root/')[1];
      const hpUser = getHpUserFromUserKey(userKey);
      const connections = await this.getUserConnections(
        hpUser.orgId,
        hpUser.id
      );
      for (const connection of connections) {
        map[`${hpUser.id}|${connection.type}|${connection.vendorUserId}`] =
          connection.name;
      }
    }

    return map;
  }

  /**
   * Updates a Hypersync connection in the connection registry.
   *
   * @param orgId ID of the org in which the connection was made.
   * @param userId ID of the user who made (and owns) the connection.
   * @param integrationType Type of integration used to create the connection.
   * @param vendorUserId ID of the vendor user associated with the connection.
   * @param patch Information to update on the connection.
   */
  public async updateUserConnection(
    orgId: string,
    userId: string,
    integrationType: string,
    vendorUserId: string,
    patch: IUserConnectionPatch
  ) {
    await Logger.info(
      `Updating Hypersync connection ${vendorUserId} in org ${orgId} for user ${userId}`
    );
    const storageKey = `connections/${orgId}/users/${userId}`;
    const { connections, etag } = await this.getStoredUserConnections(
      storageKey
    );
    let connection = connections.find(
      c => c.type === integrationType && c.vendorUserId === vendorUserId
    );
    if (!connection) {
      throw createHttpError(
        StatusCodes.NOT_FOUND,
        `Connection for ${vendorUserId} not found.`
      );
    }

    if (patch.name) {
      const patchNameLower = patch.name.toLowerCase();
      const conflict = connections.find(
        c =>
          c.name.toLowerCase() === patchNameLower &&
          (c.type !== integrationType || c.vendorUserId !== vendorUserId)
      );
      if (conflict) {
        throw createHttpError(
          StatusCodes.CONFLICT,
          'Connection name already in use.'
        );
      }
      connection = {
        ...connection,
        name: patch.name
      };
    }

    const updated = connections.map(c =>
      c.type === integrationType && c.vendorUserId === vendorUserId
        ? connection
        : c
    );
    await this.storage.put(
      {
        data: updated,
        etag
      },
      storageKey
    );
    return connection;
  }

  /**
   * Removes a Hypersync connection from the connection registry.
   *
   * @param orgId ID of the org in which the connection was made.
   * @param userId ID of the user who made (and owns) the connection.
   * @param integrationType Type of integration used to create the connection.
   * @param vendorUserId ID of the vendor user associated with the connection.
   */
  public async deleteUserConnection(
    orgId: string,
    userId: string,
    integrationType: string,
    vendorUserId: string
  ) {
    await Logger.info(
      `Deleting Hypersync connection ${vendorUserId} in org ${orgId} for user ${userId}`
    );
    const storageKey = `connections/${orgId}/users/${userId}`;
    const { connections, etag } = await this.getStoredUserConnections(
      storageKey
    );
    const updated = connections.filter(
      c => c.type !== integrationType || c.vendorUserId !== vendorUserId
    );
    if (updated.length > 0) {
      await this.storage.put(
        {
          data: updated,
          etag
        },
        storageKey
      );
    } else {
      await this.storage.delete(storageKey);
    }
  }

  private async getStoredUserConnections(storageKey: string) {
    const entry = await this.storage.get(storageKey);
    return {
      connections: (entry ? entry.data : []) as IUserConnection[],
      etag: entry ? entry.etag : undefined
    };
  }
}

export const createHypersyncStorageClient = async (
  fusebitContext: FusebitContext,
  storageIdPrefix?: string
) => {
  return HypersyncStorageClient.createInstance(fusebitContext, storageIdPrefix);
};
