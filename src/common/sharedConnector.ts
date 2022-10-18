import { IFusebitContext } from '@fusebit/add-on-sdk';
import { IUserContext, OAuthConnector } from '@fusebit/oauth-connector';
import * as express from 'express';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import { CustomAuthCredentials, IAuthorizationConfigBase } from './authModels';
import {
  formatUserKey,
  getHpUserFromUserKey,
  listAllStorageKeys,
  parseStorageKeyFromStorageId
} from './common';
import {
  AuthorizationType,
  FOREIGN_VENDOR_USER,
  HttpHeader,
  HYPERPROOF_VENDOR_KEY,
  InstanceType
} from './enums';
import { HyperproofApiClient } from './HyperproofApiClient';
import {
  addVendorUserIdToHyperproofUser,
  deleteHyperproofUser,
  getHyperproofAccessToken,
  getHyperproofAuthConfig,
  getVendorUserIdsFromHyperproofUser,
  HYPERPROOF_USER_STORAGE_ID,
  removeVendorUserIdFromHyperproofUser,
  setHyperproofClientSecret
} from './hyperproofTokens';
import { Logger, LoggerContextKey } from './Logger';

/**
 * Representation of a user's connection to an external service.
 */
export interface IUserConnection {
  vendorUserId: string;
  type: string;
  name: string;
  account: string;
  enabled: boolean;
  createdBy: string;
  createdOn: string;

  // Jira-specific values.
  hostUrl?: string;
  instanceType?: InstanceType;
}

/**
 * Model for the patch object used to update a stored user connection.
 */
export interface IUserConnectionPatch {
  name?: string;
}

/**
 * Model for user data stored in Fusebit by Hyperproof integrations.  We extend
 * Fusebit's built-in user context object with some additional properties.
 */
export interface IHyperproofUserContext<TUserProfile = object>
  extends IUserContext<TUserProfile> {
  // Object which tracks the Hyperproof users which are associated with the
  // vendor user.  The user key is generally of the form '/orgs/orgid/users/userid'
  // although variants do exist for certain integrations like Jira.
  //
  // This is necessary for two reasons:
  //   a) A given user may use the same credentials to connect to a service in two
  //      different Hyperproof organizations.
  //   b) Two users may use the same crednetials to connect to a service in the same
  //      Hyperproof organization.
  //
  // In these scenarios when the user chooses to delete their connection, we don't
  // want to delete the persisted user context until the last Hyperproof identity
  // has been removed.
  hyperproofIdentities: {
    [userKey: string]: { userId: string; connectorBaseUrl: string };
  };

  // For non-Oauth connectors, an object that stores the credentials for the user.
  keys?: CustomAuthCredentials;

  // Jira-specific value.
  instanceType?: InstanceType;
}

/**
 * Dynamically creates a connector class that can be used as a base for a Hyperproof integration.
 *
 * @param {*} superclass class that extends OAuthConnector
 *
 * Hyperproof connectors derive from OAuthConnector, AtlassianConnector, AsanaConnector and FusebitBot.
 * These are all built on OAuthConnector, but they are otherwise black boxes--we aren't able to easily
 * extend them by introducing our own HyperproofConnector which derives from OAuthConnector.
 *
 * createConnector allows us to dynamically extend all of these classes in the same way.  The extensions
 * provided here handle the creation and deletion of users that can have multiple hypeproof identities
 * associated with the same vendor identity. This logic enables us to track all hyperproof identities
 * associated with a user, rather than erasing the context of the previous ones on every subsequent save.
 * We do this by adding a hyperproofIdentities key to the user object and only delete the user if there
 * are no more hyperproof identities referring to this user
 */
export function createConnector(superclass: typeof OAuthConnector) {
  return class Connector extends superclass {
    public integrationType: string;
    public connectorName: string;
    public authorizationType: AuthorizationType;

    constructor(connectorName: string, authorizationType: AuthorizationType) {
      super();
      if (!process.env.integration_type) {
        throw new Error(
          'process.env.integration_type not set for this connector'
        );
      }
      this.integrationType = process.env.integration_type;
      this.connectorName = connectorName;
      this.authorizationType = authorizationType;
      this.checkAuthorized = this.checkAuthorized.bind(this);
    }

    /**
     * Called during connector initialization to allow the connector to register additional, application-specific
     * routes on the provided Express router.
     * @param {*} app Express router
     */
    onCreate(app: express.Router) {
      super.onCreate(app);

      /**
       * Sets up the logger instance and logs that a request was received.
       */
      app.use(async (req, res, next) => {
        // When Hyperproof sends a request to an integration it includes the public API
        // subscription key and the Hyperproof OAuth client secret as headers.  If
        // these values are present in the request, stash them away for future use.
        const subscriptionKey = req.headers[
          HttpHeader.SubscriptionKey
        ] as string;
        const clientSecret = req.headers[
          HttpHeader.HyperproofClientSecret
        ] as string;
        if (subscriptionKey) {
          HyperproofApiClient.setSubscriptionKey(subscriptionKey);
        }
        if (clientSecret) {
          setHyperproofClientSecret(clientSecret);
        }

        Logger.init(
          {
            [LoggerContextKey.IntegrationType]: this.integrationType,
            [LoggerContextKey.OrgId]: req.params.orgId,
            [LoggerContextKey.UserId]: req.params.userId
          },
          subscriptionKey ?? process.env.hyperproof_api_subscription_key
        );
        await Logger.info(`${req.method} ${req.originalUrl}`);

        // It would be nice to be able to add additional logging in the response's
        // finish event (i.e. use res.on('finish'...)) but our asynchronous logging
        // does not complete reliably in this case--the connection to Hyperproof is
        // often disconnected.

        next();
      });

      /**
       * Checks if the connector exists and is reachable
       */
      app.head('/', async (req: express.Request, res: express.Response) => {
        res.end();
      });

      /**
       * Returns authorization configuration information.
       */
      app.get(
        '/authorization/config',
        async (req: express.Request, res: express.Response) => {
          const integrationType =
            (req.query.integrationType as string | undefined) ||
            this.integrationType;
          const config = getHyperproofAuthConfig(
            req.fusebit,
            integrationType,
            this.authorizationType,
            this.outboundOnly(integrationType, req.query)
          );
          this.applyAdditionalAuthorizationConfig(config, req.query);
          res.json(config);
        }
      );

      /**
       * Sets a Hyperproof authorization code for a user.
       */
      app.put(
        [
          '/organizations/:orgId/users/:userId/authorization/code',
          '/organizations/:orgId/users/:userId/:type/authorization/code'
        ],
        this.checkAuthorized(),
        async (req: express.Request, res: express.Response) => {
          const fusebitContext = req.fusebit;

          // Some vendors use a purely numeric ID.  Make sure we treat
          // all vendor user IDs as strings.
          const vendorUserId = req.body.vendorUserId.toString();

          // For Jira the type route param is an InstanceType value.
          // For Slack the type route param is an integration type value.
          // For other connectors the type param is not specified.
          // TODO: HYP-23126: Figure out how to make this less confusing.

          try {
            // Exchange the authorization code for an access token. This will also
            // save the access token to Fusebit storage.
            await getHyperproofAccessToken(
              fusebitContext,
              req.params.orgId,
              req.params.userId,
              vendorUserId,
              req.body.authorizationCode,
              this.includeTypeInToken()
                ? (req.params.type as InstanceType)
                : undefined
            );

            res.send(
              await this.getUserConnection(
                fusebitContext,
                req.params.orgId,
                req.params.userId,
                vendorUserId,
                req.params.type
              )
            );
          } catch (err: any) {
            await Logger.error('Set authorization code failed.', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      /**
       * Retrieves a list of connections created by a user.
       */
      app.get(
        [
          '/organizations/:orgId/users/:userId/connections',
          '/organizations/:orgId/users/:userId/:type/connections'
        ],
        this.checkAuthorized(),
        async (req: express.Request, res: express.Response) => {
          try {
            const fusebitContext = req.fusebit;
            const { orgId, userId, type } = req.params;

            const connections = await this.getUserConnections(
              fusebitContext,
              orgId,
              userId,
              type
            );
            if (connections.length > 0) {
              return res.json(connections);
            } else {
              return res
                .status(StatusCodes.NOT_FOUND)
                .json({ message: `no user with userId ${userId} found` });
            }
          } catch (err: any) {
            await Logger.error('Failed to retrieve connections', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      /**
       * Retrieves a user connection by connection ID.
       */
      app.get(
        [
          '/organizations/:orgId/users/:userId/connections/:vendorUserId',
          '/organizations/:orgId/users/:userId/:type/connections/:vendorUserId'
        ],
        this.checkAuthorized(),
        async (req: express.Request, res: express.Response) => {
          try {
            const fusebitContext = req.fusebit;
            const { orgId, userId, vendorUserId, type } = req.params;

            const connection = await this.getUserConnection(
              fusebitContext,
              orgId,
              userId,
              vendorUserId,
              type
            );
            if (connection) {
              res.json(connection);
            } else {
              res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: `Connection with id ${vendorUserId} not found for user ${userId} in org ${orgId}.`
              });
            }
          } catch (err: any) {
            await Logger.error('Failed to retrieve user connection', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );
      /**
       * Deletes all connections for a given integration and Hyperproof user id.
       * This is invoked when a Hyperproof user is deactivated.
       */
      app.delete(
        [
          '/organizations/:orgId/users/:userId/connections',
          '/organizations/:orgId/users/:userId/:type/connections'
        ],
        this.checkAuthorized(),
        async (req: express.Request, res: express.Response) => {
          try {
            const fusebitContext = req.fusebit;
            const { orgId, userId, type } = req.params;

            // In the Slack connector the type passed in is an integration type value.
            // In the Jira connector type type passed in is an InstanceType value.
            // For all other connections the type route parameter is not used.
            // TODO: HYP-23126: Figure out how to make this less confusing.

            const connections = await this.getUserConnections(
              fusebitContext,
              orgId,
              userId,
              type
            );

            const results: {
              [vendorUserId: string]: { success: boolean; err: any };
            } = {};

            for (const connection of connections) {
              let success = true;
              let err = undefined;
              try {
                // In the Jira connector the type passed in is the instance type.
                await this.deleteUserConnection(
                  fusebitContext,
                  orgId,
                  userId,
                  connection.vendorUserId,
                  this.includeTypeInToken()
                    ? (type as InstanceType)
                    : undefined,
                  connection.hostUrl
                );
              } catch (error: any) {
                success = false;
                err = error.message;
              }
              results[connection.vendorUserId] = {
                success,
                err
              };
            }

            res.json({
              message: `Attempted to delete connections for user ${userId} in organization ${orgId}`,
              results
            });
          } catch (err: any) {
            await Logger.error('Failed to delete connections', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      /**
       * Deletes a user connection by connection ID.
       */
      app.delete(
        [
          '/organizations/:orgId/users/:userId/connections/:vendorUserId',
          '/organizations/:orgId/users/:userId/:type/connections/:vendorUserId'
        ],
        this.checkAuthorized(),
        async (req: express.Request, res: express.Response) => {
          try {
            const fusebitContext = req.fusebit;
            const { orgId, userId, vendorUserId } = req.params;
            const { instanceType, resource } = req.query;

            // TODO: HYP-23126: In the Jira case the type parameter is an InstanceType value.
            // In the Slack case it is an integration type value.  So technically in the Slack
            // case the cast below is invalid.  But Slack overrides `deleteUserConnection` and
            // ignores the type parameter, so there is no issue.  Still, we should clean this up.

            await this.deleteUserConnection(
              fusebitContext,
              orgId,
              userId,
              vendorUserId,
              instanceType as InstanceType,
              resource as string
            );

            res.json({
              message: `Connection for user ${formatUserKey(
                orgId,
                userId
              )} successfully deleted`
            });
          } catch (err: any) {
            await Logger.error('Failed to delete connection', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      /**
       * Retrieve this app's definition
       */
      app.get('/files', this.checkAuthorized(), async (req, res) => {
        try {
          if (!req.query.fileName) {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
              message: `Specify a fileName query parameter to retrieve`
            });
            return;
          }
          this.serveStaticFile(req.query.fileName as string, res);
        } catch (err: any) {
          await Logger.error('Failed to retrieve app definition', err);
          res
            .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: err.message });
        }
      });
    }

    /**
     * Whether this connector only communicates outbound from hyperproof. By default all connectors are 2 way
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    outboundOnly(integrationType: string, meta: Express.ParsedQs) {
      return false;
    }

    /**
     * Shared express middleware that authorizes the requesting users permissions to access this connector function
     */
    checkAuthorized() {
      return this.authorize({
        action: 'function:execute',
        resourceFactory: req =>
          `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${req.fusebit.boundaryId}/function/${req.fusebit.functionId}/`
      });
    }

    /**
     * Returns a string uniquely identifying the user in vendor's system. Typically this is a property of
     * userContext.vendorUserProfile. Default implementation is opportunistically returning userContext.vendorUserProfile.id
     * if it exists.
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    getUserId(userContext: IUserContext): Promise<string> {
      // Derived classes will generally override this method.
      return super.getUserId(userContext);
    }

    /**
     * Returns a human readable string which identifies the vendor user's account.
     * This string is displayed in Hypersync's Connected Accounts page to help the
     * user distinguish between multiple connections that use different accounts.
     *
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getUserAccount(userContext: IUserContext): string {
      throw new Error('getUserAccount must be implemented by derived class');
    }

    /**
     * Formats the foreign-vendor-user/hyperproof storage key that points to the vendorUser token credentials. Overriden
     * by jira and slack as their keys are formatted slightly differently
     */
    getHyperproofUserStorageKey(
      orgId: string,
      userId: string,
      resource?: string,
      suffix?: string
    ) {
      return formatUserKey(orgId, userId, suffix);
    }

    /**
     * Returns whether we should append a type parameter to the storage location of the user token, override and return true for this to occur
     */
    includeTypeInToken() {
      return false;
    }

    /**
     * Can be overriden to add more parameters to the authorization config returned by the /config route as AWS does.
     */
    applyAdditionalAuthorizationConfig(
      config: IAuthorizationConfigBase,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      meta: Express.ParsedQs
    ) {
      return config;
    }

    /**
     * Can be overriden as a custom error handling callback on the call to delete users
     * swallow by default as failure to delete here should not impede the rest of the delete logic
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async deleteUserErrorCallback(err: any) {
      // override in derived class
    }

    /**
     * Deletes all artifacts associated with a vendor user. This is an opportunity to remove any artifacts created in
     * onNewUser, for example Fusebit functions.
     * @param {FusebitContext} fusebitContext The Fusebit context
     * @param {string} vendorUserId The vendor user id
     * @param {string} vendorId If specified, vendorUserId represents the identity of the user in another system.
     * The vendorId must correspond to an entry in userContext.foreignOAuthIdentities.
     */
    async deleteUser(
      fusebitContext: IFusebitContext,
      vendorUserId: string,
      vendorId?: string
    ) {
      await Logger.info(`Deleting user ${vendorUserId} for vendor ${vendorId}`);
      const user = await this.getHyperproofUserContext(
        fusebitContext,
        vendorUserId,
        vendorId
      );

      if (vendorId) {
        if (user) {
          await this.deleteUserIfLast(
            fusebitContext,
            user,
            vendorUserId,
            vendorId
          );
        } else {
          throw createHttpError(
            StatusCodes.NOT_FOUND,
            `No user with id ${vendorUserId} vendor: ${vendorId}`
          );
        }
      } else {
        const state = this.decodeState(fusebitContext);
        const hpUserId = state?.data?.hyperproof_oauth_user_id;
        // this delete came from authorizing
        if (user) {
          if (state && user.hyperproofIdentities) {
            await this.deleteUserIfLast(
              fusebitContext,
              user,
              hpUserId,
              'hyperproof'
            );
          } else {
            await Logger.info(
              `no vendorId specified for user ${vendorUserId}, deleting user`
            );
            await super.deleteUser(fusebitContext, vendorUserId, vendorId);
          }
        }
      }
    }

    async deleteUserIfLast(
      fusebitContext: IFusebitContext,
      user: IHyperproofUserContext,
      vendorUserId: string,
      vendorId: string
    ) {
      const hyperproofIdentities = user.hyperproofIdentities || {};
      delete hyperproofIdentities[vendorUserId];
      const numIdentities = Object.keys(hyperproofIdentities);
      if (numIdentities.length > 0) {
        await Logger.info(
          `user ${vendorUserId} for vendor ${vendorId} has ${numIdentities.length} remaining hyperproof identities, not deleting user`
        );
        await super.saveUser(fusebitContext, user);
        await fusebitContext.storage.delete(
          `${FOREIGN_VENDOR_USER}/${vendorId}/${vendorUserId}`
        );
      } else {
        await Logger.info(
          `user ${vendorUserId} for vendor ${vendorId} has no remaining hyperproof identities, DELETING user`
        );
        await fusebitContext.storage.delete(
          `${FOREIGN_VENDOR_USER}/${vendorId}/${vendorUserId}`
        );
        await super.deleteUser(fusebitContext, user.vendorUserId);
      }
    }

    /**
     * Deletes the user's Hyperproof token unless there are other user connections
     * which are depending on that token.
     *
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} orgId ID of the Hyperproof organization.
     * @param {*} userId ID of the Hyperproof user.
     * @param {*} instanceType Optional instance type to use when determining which user to delete.
     */
    async deleteHyperproofUserIfUnused(
      fusebitContext: IFusebitContext,
      orgId: string,
      userId: string,
      vendorUserId: string,
      instanceType?: InstanceType
    ) {
      const connections = await this.getUserConnections(
        fusebitContext,
        orgId,
        userId
      );

      if (
        connections.filter(
          c => !instanceType || c.instanceType === instanceType
        ).length === 0
      ) {
        await deleteHyperproofUser(
          fusebitContext,
          orgId,
          userId,
          instanceType
        ).catch(this.deleteUserErrorCallback);
      } else {
        await Logger.info(
          `Not deleting Hyperproof user ${userId} because other connections exist for this user.`
        );
        await removeVendorUserIdFromHyperproofUser(
          fusebitContext,
          orgId,
          userId,
          vendorUserId,
          instanceType
        );
      }
    }

    /**
     * Saves user context in storage for future use.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    async saveUser(
      fusebitContext: IFusebitContext,
      userContext: IHyperproofUserContext
    ) {
      const existingUser = await this.getHyperproofUserContext(
        fusebitContext,
        userContext.vendorUserId
      );

      const hyperproofIdentities =
        (existingUser && existingUser.hyperproofIdentities) || {};

      if (userContext.foreignOAuthIdentities) {
        hyperproofIdentities[
          userContext.foreignOAuthIdentities.hyperproof.userId
        ] = userContext.foreignOAuthIdentities.hyperproof;
      }

      userContext.hyperproofIdentities = hyperproofIdentities;

      const hpUser = this.getHpUserFromUserContext(userContext);
      // Integrations that don't require an associated hyperproof user will not have
      // this. For example, the workspace vendor-user entry for Slack integrations
      if (hpUser) {
        await addVendorUserIdToHyperproofUser(
          fusebitContext,
          hpUser.orgId,
          hpUser.id,
          userContext.vendorUserId
        );
      }

      return super.saveUser(fusebitContext, userContext);
    }

    /**
     * Gets the Hyperproof user context representing the user with vendorUserId id.
     * Returned object contains vendorToken and vendorUserProfile properties.
     *
     * @param {FusebitContext} fusebitContext The Fusebit context
     * @param {string} vendorUserId The vendor user id
     * @param {string} vendorId If specified, vendorUserId represents the identity of the user in another system.
     */
    async getHyperproofUserContext(
      fusebitContext: IFusebitContext,
      vendorUserId: string,
      vendorId?: string
    ) {
      return (await this.getUser(
        fusebitContext,
        vendorUserId,
        vendorId
      )) as IHyperproofUserContext;
    }

    /**
     * Extracts linked Hyperproof user information from a Fusebit userContext object.
     * @param {*} userContext The user context representing the vendor's user. Contains
     *  vendorToken and vendorUserProfile, representing responses from getAccessToken and
     *  getUserProfile, respectively.
     *
     * WARNING: This pulls data out of userContext.foreignOAuthIdentities.hyperproof which
     * is a singleton.  For multi-org scenarios, the value is correct upon adding a new
     * connection to an org, but as connections are deleted the org ID inside the user key
     * can be come stale.  See HYP-16177 for an example.
     */
    getHpUserFromUserContext(userContext: IUserContext) {
      const userKey = userContext.foreignOAuthIdentities
        ? userContext.foreignOAuthIdentities.hyperproof.userId
        : undefined;
      if (!userKey) {
        return undefined;
      }
      return getHpUserFromUserKey(userKey);
    }

    /**
     * Retrieves the list of connections to the service made by a given user
     * in a Hyperproof organization.
     *
     * @param fusebitContext Fusebit context use.
     * @param orgId Unique ID of the Hyperproof organization.
     * @param userId Unique ID of the Hyperproof user.
     * @param type Type of integration (optional).  Used by connectors like Slack
     *             that implement multiple integrations in one connector.
     * @returns An array of connections.
     */
    async getUserConnections(
      fusebitContext: IFusebitContext,
      orgId: string,
      userId: string,
      type?: string
    ) {
      const connections = [];
      try {
        const vendorUserIds = await getVendorUserIdsFromHyperproofUser(
          fusebitContext,
          orgId,
          userId
        );
        const userKey = formatUserKey(orgId, userId, type);
        for (const vendorUserId of vendorUserIds) {
          const userContext = await this.getHyperproofUserContext(
            fusebitContext,
            vendorUserId
          );
          if (userContext && userContext.hyperproofIdentities[userKey]) {
            connections.push(
              await this.getUserConnectionFromUserContext(
                userContext,
                userId,
                userContext.hyperproofIdentities[userKey].userId
              )
            );
          }
        }
      } catch (err: any) {
        if (err.status === StatusCodes.UNAUTHORIZED) {
          // Hyperproof user does not exist.  Therefore there are no
          // corresponding vendorUserIds.
          return [];
        } else {
          throw err;
        }
      }
      return connections;
    }

    /**
     * Retreives a single connection for a Hyperproof user by vendorUserId.
     *
     * @param fusebitContext Fusebit context use.
     * @param orgId Unique ID of the Hyperproof organization.
     * @param userId Unique ID of the Hyperproof user.
     * @param vendorUserId ID of the vendor user which uniquely identifies the connection.
     * @param integrationType Type of integration (optional).
     */
    async getUserConnection(
      fusebitContext: IFusebitContext,
      orgId: string,
      userId: string,
      vendorUserId: string,
      integrationType?: string
    ): Promise<IUserConnection> {
      const userContext = await this.getHyperproofUserContext(
        fusebitContext,
        vendorUserId
      );
      const userKey = formatUserKey(orgId, userId, integrationType);
      if (!userContext.hyperproofIdentities) {
        return this.getUserConnectionFromUserContext(userContext, userId);
      } else if (userContext.hyperproofIdentities[userKey]) {
        return this.getUserConnectionFromUserContext(
          userContext,
          userId,
          userContext.hyperproofIdentities[userKey].userId
        );
      }
      throw new Error('No connection');
    }

    /**
     * Builds a connection object from the data stored in user context.
     *
     * @param userContext User context from which to build the connection.
     * @param userId ID of the Hyperproof user that created the connection.
     */
    async getUserConnectionFromUserContext(
      userContext: IUserContext,
      userId: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      userKey?: string
    ): Promise<IUserConnection> {
      // Some connectors have a numeric user ID (e.g. Jamf and Github) but we
      // always want to deal with them as strings, hence toString below.
      return {
        vendorUserId: userContext.vendorUserId.toString(),
        type: this.integrationType,
        name: this.connectorName,
        account: this.getUserAccount(userContext),
        enabled: true,
        createdBy: userId,
        createdOn: new Date(userContext.timestamp).toISOString()
      };
    }

    /**
     * Deletes a collection of users in an organization.
     *
     * @param {*} fusebitContext Fusebit context to use.
     * @param {*} userContexts Candidate set of vendor users to delete.
     * @param {*} orgId ID of the organization where users are being deleted.
     * @param {*} resource Optional resource to filter for.
     */
    async deleteUserConnections(
      fusebitContext: IFusebitContext,
      userContexts: IHyperproofUserContext[],
      orgId: string,
      resource?: string
    ): Promise<void> {
      // Must be deleted sequentially since deleteUserIfLast removes one
      // identity and saves the storage entry. Concurrent writing to one place
      // causes a conflict error
      for (const userContext of userContexts) {
        if (!userContext) {
          return;
        }
        // The vendor user may be linked to a Hyperproof user in multiple
        // organizations.  We only want to delete the Hyperproof users in
        // the specified organization.
        const identityKeys = Object.keys(userContext.hyperproofIdentities);
        let identitiesToDelete = identityKeys.filter(key =>
          key.includes(orgId)
        );

        // If the optional resource was provided, use it to filter the identities.
        if (resource) {
          identitiesToDelete = identitiesToDelete.filter(key =>
            key.includes(resource)
          );
        }

        // Delete the matching identities.  Note that when we delete the last
        // identity on the vendor user, the vendor user will be deleted.
        await Logger.info(
          `On ${
            userContext.vendorUserId
          }, deleting identities: ${identitiesToDelete.toString()}`
        );
        for (const identity of identitiesToDelete) {
          await this.deleteUserIfLast(
            fusebitContext,
            userContext,
            identity,
            HYPERPROOF_VENDOR_KEY
          );
        }

        // Delete the Hyperproof token if it is not being used by another connection.
        const hpUserId = this.getHpUserFromUserContext(userContext)!.id;
        await Logger.info(`Deleting hyperproof token for ${hpUserId}`);
        await this.deleteHyperproofUserIfUnused(
          fusebitContext,
          orgId,
          hpUserId,
          userContext.vendorUserId,
          userContext.instanceType
        );
        await Logger.info(
          `Deletion finished for user ${userContext.vendorUserId}`
        );
      }
    }

    /**
     * Deletes a user connection from storage.
     *
     * @param fusebitContext Fusebit context to use.
     * @param orgId Unique ID of the Hyperproof organization.
     * @param userId Unique ID of the Hyperproof user.
     * @param vendorUserId ID of the vendor user which uniquely identifies the connection.
     * @param instanceType Optional instance type to identifying which connection to delete.
     * @param resource Resource to which the connection applies (optional)
     */
    async deleteUserConnection(
      fusebitContext: IFusebitContext,
      orgId: string,
      userId: string,
      vendorUserId: string,
      instanceType?: InstanceType,
      resource?: string
    ) {
      const user = await this.getHyperproofUserContext(
        fusebitContext,
        vendorUserId
      );

      if (!user) {
        throw createHttpError(
          StatusCodes.NOT_FOUND,
          `No connection found for user ${userId} in org ${orgId} with an ID of ${vendorUserId}`
        );
      }

      const userKey = this.getHyperproofUserStorageKey(
        orgId,
        userId,
        resource,
        instanceType
      );

      await this.deleteUserIfLast(
        fusebitContext,
        user,
        userKey,
        HYPERPROOF_VENDOR_KEY
      );

      await this.deleteHyperproofUserIfUnused(
        fusebitContext,
        orgId,
        userId,
        vendorUserId,
        instanceType
      );
    }

    async getAllOrgUsers(fusebitContext: IFusebitContext, orgId: string) {
      try {
        const location = `${HYPERPROOF_USER_STORAGE_ID}/organizations/${orgId}`;
        const items = await listAllStorageKeys(fusebitContext, location);
        const users = [];
        const processedUsers = new Set();
        for (const item of items) {
          const hyperproofUserKey = parseStorageKeyFromStorageId(item);
          const userKey = hyperproofUserKey.split(
            `${HYPERPROOF_USER_STORAGE_ID}/`
          )[1];
          const hpUser = getHpUserFromUserKey(userKey);

          if (!processedUsers.has(hpUser.id)) {
            const storageEntry = await fusebitContext.storage.get(
              hyperproofUserKey
            );
            const vendorUserIds = storageEntry.data.vendorUserIds || [
              storageEntry.data.vendorUserId
            ];
            for (const vendorUserId of vendorUserIds) {
              const userData = (await this.getUser(
                fusebitContext,
                vendorUserId
              )) as IHyperproofUserContext;
              users.push(userData);
            }
            processedUsers.add(hpUser.id);
          }
        }
        await Logger.info(
          `Found ${users.length} vendor-users, connected to ${items.length} hyperproof-users`
        );
        return users;
      } catch (err) {
        await Logger.error(err);
        return [];
      }
    }

    decodeState(fusebitContext: IFusebitContext) {
      if (fusebitContext.query && fusebitContext.query.state)
        return JSON.parse(
          Buffer.from(fusebitContext.query.state as string, 'base64').toString()
        );
    }

    async serveStaticFile(fileName: string, res: express.Response) {
      const filePath = this.getAbsolutePath(fileName);
      const fileExtension = filePath.slice(filePath.lastIndexOf('.'));
      let rawData: string;
      switch (fileExtension) {
        case '.json': {
          rawData = fs.readFileSync(filePath, { encoding: 'utf8' });
          const jsonData = JSON.parse(rawData);
          res.json(jsonData);
          break;
        }
        case '.svg': {
          rawData = fs.readFileSync(filePath, { encoding: 'utf8' });
          res.set('Content-Type', 'image/svg+xml');
          res.end(rawData);
          break;
        }
        default: {
          res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: `File type ${fileExtension} is not supported` });
          break;
        }
      }
    }

    getAbsolutePath(fileName: string) {
      const relativePath = `./app/static/${fileName}`;
      const absolutePath = path.resolve(relativePath);
      return absolutePath;
    }
  };
}
