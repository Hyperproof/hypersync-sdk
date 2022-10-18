/* eslint-disable @typescript-eslint/no-unused-vars */
import { IFusebitContext, IStorageItem } from '@fusebit/add-on-sdk';
import { IUserContext, OAuthConnector } from '@fusebit/oauth-connector';
import {
  AuthorizationType,
  createConnector,
  CustomAuthCredentials,
  formatKey,
  formatUserKey,
  getHpUserFromUserKey,
  HYPERPROOF_VENDOR_KEY,
  IHyperproofUserContext,
  IRetryResponse,
  IUserConnection,
  LogContextKey,
  Logger,
  mapObjectTypesParamToType,
  ObjectType
} from '../common';
import * as express from 'express';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { formatHypersyncError } from './common';
import { HypersyncStage } from './enums';
import { createHypersyncStorageClient } from './HypersyncStorageClient';
import { ICriteriaMetadata } from './ICriteriaProvider';
import { HypersyncCriteria, IHypersync } from './models';
import { IHypersyncSchema } from './ProofProviderBase';
import { IGetProofDataResponse, SyncMetadata } from './Sync';

/**
 * Object returned from the validateCredentials method.
 *
 * Ideally all validateCredentials implementers would return only the vendorUserId
 * and vendorUserProfile members.  But for historical reasons we also allow connectors
 * to return other, aribtrary values which will be blended into the persisted user context.
 */
export interface IValidateCredentialsResponse {
  vendorUserId: string;
  vendorUserProfile?: {};
  [key: string]: any;
}

/**
 *
 * @param {*} superclass class that extends OAuthConnector - this allows us to dynamically extend a class which enables mixing inheritance
 * This handles creation and deletion of users that can have multiple hypeproof identities associated with the same
 * vendor identity. This logic enables us to track all hyperproof identities associated with a user, rather than erasing the context
 * of the previous ones on every subsequent save. We do this by adding a hyperproofIdentities key to the user object
 * and only delete the user if there are no more hyperproof identities referring to this user
 */
export function createHypersync(superclass: typeof OAuthConnector) {
  return class HypersyncConnector extends createConnector(superclass) {
    /**
     * Called during connector initialization to allow the connector to register additional, application-specific
     * routes on the provided Express router.
     * @param {*} app Express router
     */
    onCreate(app: express.Router) {
      super.onCreate(app);

      /**
       * Adds a new non-oauth user connection
       */
      app.post(
        '/organizations/:orgId/users/:userId',
        this.checkAuthorized(),
        async (req, res) => {
          try {
            const fusebitContext = req.fusebit;
            const { orgId, userId } = req.params;
            const keys: {
              [key: string]: string;
            } = req.body;
            const response = await this.validateCredentials(
              keys,
              fusebitContext,
              userId
            );

            // The returned vendorUser object must contain a vendorUserId field.
            // Guard against this case in non-TypeScript connectors.
            if (!response.vendorUserId) {
              throw createHttpError(
                StatusCodes.INTERNAL_SERVER_ERROR,
                'vendorUserId not found on vendorUser.'
              );
            }

            // If there isn't already a saved userContext for this vendor user,
            // save the keys along with some user information in Fusebit storage.
            let userContext = await this.getHyperproofUserContext(
              fusebitContext,
              response.vendorUserId
            );

            // To support legacy Hypersync connectors, the values in the response are spread
            // directly into the userContext object which could lead to property conflicts.
            // All new Hypersync connectors should return user profile information in
            // `response.vendorUserProfile` which will avoid these conflicts.
            if (!userContext) {
              userContext = {
                vendorUserProfile: {},
                ...response,
                keys,
                foreignOAuthIdentities: {}, // Set below
                hyperproofIdentities: {}, // Set in saveUser
                timestamp: Date.now()
              };
            } else {
              // Update the existing user context
              userContext = {
                ...userContext,
                ...response,
                keys
              };
            }

            // The foreignOAuthIdentities member is only capable of holding a
            // single hyperproof identity.  To match the behavior of the OAuth
            // connectors it will always store the user key for the last
            // connection made by the user.
            userContext.foreignOAuthIdentities = {
              hyperproof: {
                userId: formatUserKey(orgId, userId),
                connectorBaseUrl: fusebitContext.baseUrl!
              }
            };

            await this.onNewUser(fusebitContext, userContext);
            await this.saveUser(fusebitContext, userContext);

            const connection = await this.getUserConnectionFromUserContext(
              userContext,
              userId
            );
            res.json(connection);
          } catch (err: any) {
            await Logger.error('Failed to add user connection', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      /**
       * Returns the metadata that is used to generate the user interface
       * that allows the user to specify proof criteria.
       */
      app.put(
        '/organizations/:orgId/users/:userId/generatecriteriametadata',
        async (req, res) => {
          try {
            const result = await this.generateCriteriaMetadata(
              req.fusebit,
              req.body.vendorUserId,
              req.body.criteria,
              req.body.search
            );
            res.json(result);
          } catch (err: any) {
            await Logger.error('Failed to generate criteria metdata', err);
            res.status(err.status || StatusCodes.INTERNAL_SERVER_ERROR).json({
              message: err.message,
              extendedError: {
                ...err,
                [LogContextKey.HypersyncCriteria]: req.body.criteria,
                [LogContextKey.HypersyncStage]: HypersyncStage.AUTHORING
              }
            });
          }
        }
      );

      /**
       * Returns the schema of the proof that will be generated.
       */
      app.put(
        '/organizations/:orgId/users/:userId/generateschema',
        async (req, res) => {
          try {
            const result = await this.generateSchema(
              req.fusebit,
              req.body.vendorUserId,
              req.body.criteria
            );
            res.json(result);
          } catch (err: any) {
            await Logger.error('Failed to generate schema', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      app.patch(
        '/organizations/:orgId/users/:userId/connections/:vendorUserId',
        this.checkAuthorized(),
        async (req, res) => {
          try {
            const storage = await createHypersyncStorageClient(req.fusebit);
            const connection = await storage.updateUserConnection(
              req.params.orgId,
              req.params.userId,
              this.integrationType,
              req.params.vendorUserId,
              req.body
            );
            res.json(connection);
          } catch (err: any) {
            await Logger.error('Failed to patch connection', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      app.post(
        '/organizations/:orgId/:objectType/:objectId/invoke',
        this.checkAuthorized(),
        async (req, res) => {
          const { orgId, objectType, objectId } = req.params;
          let data;

          try {
            switch (req.body.action) {
              case 'syncNow':
                data = await this.syncNow(
                  req.fusebit,
                  orgId,
                  mapObjectTypesParamToType(req.params.objectType),
                  objectId,
                  req.body.hypersync,
                  req.body.userId,
                  req.body.syncStartDate,
                  req.body.page,
                  req.body.metadata
                );
                res.json(data);
                break;

              default:
                break;
            }
          } catch (err: any) {
            const status =
              err.status || err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
            if (status >= StatusCodes.INTERNAL_SERVER_ERROR) {
              const objectKey = formatKey(
                orgId,
                objectType as ObjectType,
                objectId
              );
              await Logger.error(
                `Hypersync invoke failure: ${process.env.vendor_name}`,
                formatHypersyncError(
                  err,
                  objectKey,
                  'Hypersync invoke failure.'
                )
              );
            }

            await Logger.error('Failed to sync Hypersync', err);
            res.status(err.status || StatusCodes.INTERNAL_SERVER_ERROR).json({
              message: err.message,
              extendedError: {
                ...err,
                [LogContextKey.HypersyncStage]: HypersyncStage.SYNCING,
                [LogContextKey.IntegrationId]: req.body.hypersync.id,
                [LogContextKey.HypersyncSettings]: req.body.hypersync.settings,
                [LogContextKey.StackTrace]: err.stack
              }
            });
          }
        }
      );

      /**
       * Delete all user connections and integrations for an org. Called when
       * a Hyperproof organization is permanently deleted
       *
       * TODO: HYP-27706: Unify all org delete routes
       */
      app.delete(
        '/organizations/:orgId',
        this.checkAuthorized(),
        async (req, res) => {
          try {
            const fusebitContext = req.fusebit;
            const orgId = req.params.orgId;
            await Logger.info(
              `Received DELETE /organizations/${orgId} request. Starting deletion of all connections in the org`
            );
            await this.deleteOrganization(fusebitContext, orgId);
            res.json({
              success: true,
              message: 'Successfully deleted connections'
            });
          } catch (err: any) {
            await Logger.error(err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message });
          }
        }
      );

      // Register a handler that listens for CRON invocations, set by the
      // "schedule.cron" parameter in the configuration file
      app.use(async (req, res, next) => {
        if (req.method === 'CRON') {
          await Logger.debug(`Connector invoked via CRON`);
          // Only invoke if the child connector has defined an API method to call
          await this.keepAllTokensAlive(req.fusebit);
          return res.status(StatusCodes.OK).send();
        } else {
          next();
        }
      });
    }

    /**
     * Validates custom auth credentials that are provided when creating a new
     * new user connection.  Designed to be overridden.
     *
     * @returns An object containing values to be persisted in IUserContext.
     */
    async validateCredentials(
      credentials: CustomAuthCredentials,
      fusebitContext: IFusebitContext,
      hyperproofUserId: string
    ): Promise<IValidateCredentialsResponse> {
      throw new Error('Not implemented.');
    }

    /**
     * Returns a human readable string which identifies the vendor user's account.
     * This string is displayed in Hypersync's Connected Accounts page to help the
     * user distinguish between multiple connections that use different accounts.
     *
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    getUserAccount(userContext: IUserContext): string {
      throw Error('Not implemented.');
    }

    async getUserConnection(
      fusebitContext: IFusebitContext,
      orgId: string,
      userId: string,
      vendorUserId: string
    ): Promise<IUserConnection> {
      const storage = await createHypersyncStorageClient(fusebitContext);
      const connections = await storage.getUserConnections(orgId, userId);
      const connection = connections.find(
        c => c.type === this.integrationType && c.vendorUserId === vendorUserId
      );
      if (!connection) {
        throw new Error('No connection');
      }
      return connection;
    }

    /**
     * Called after a new user successfuly completed a configuration flow and was persisted in the system. This extensibility
     * point allows for creation of any artifacts required to serve this new user, for example creation of additional
     * Fusebit functions.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    async onNewUser(
      fusebitContext: IFusebitContext,
      userContext: IUserContext
    ) {
      const hpUser = this.getHpUserFromUserContext(userContext);
      if (hpUser) {
        const storage = await createHypersyncStorageClient(fusebitContext);
        await storage.addUserConnection(
          hpUser.orgId,
          hpUser.id,
          await this.getUserConnectionFromUserContext(userContext, hpUser.id)
        );
        await super.onNewUser(fusebitContext, userContext);
      }
    }

    /**
     * Deletes all artifacts associated with a vendor user. This is an opportunity to remove any artifacts created in
     * onNewUser, for example Fusebit functions.
     * @param {FusebitContext} fusebitContext The Fusebit context
     * @param {*} user Informtion about the user being deleted
     * @param {string} vendorUserId The vendor user id
     * @param {string} vendorId If specified, vendorUserId represents the identity of the user in another system.
     * The vendorId must correspond to an entry in userContext.foreignOAuthIdentities.
     */
    async deleteUserIfLast(
      fusebitContext: IFusebitContext,
      user: IHyperproofUserContext,
      vendorUserId: string,
      vendorId?: string
    ) {
      if (vendorId !== HYPERPROOF_VENDOR_KEY) {
        throw new Error(
          'Hypersync users must be deleted using a Hyperproof user key.'
        );
      }
      await super.deleteUserIfLast(
        fusebitContext,
        user,
        vendorUserId,
        vendorId
      );
      const hpUser = getHpUserFromUserKey(vendorUserId);
      const storage = await createHypersyncStorageClient(fusebitContext);
      await storage.deleteUserConnection(
        hpUser.orgId,
        hpUser.id,
        this.integrationType,
        user.vendorUserId.toString()
      );
    }

    async deleteUser(
      fusebitContext: IFusebitContext,
      vendorUserId: string,
      vendorId?: string
    ) {
      if (
        this.authorizationType &&
        this.authorizationType === AuthorizationType.CUSTOM
      ) {
        throw Error(
          'The deleteUser method must be overriden for custom auth Hypersyncs'
        );
      }
      return super.deleteUser(fusebitContext, vendorUserId, vendorId);
    }

    /**
     * Execute a sync operation
     */
    async syncNow(
      fusebitContext: IFusebitContext,
      orgId: string,
      objectType: ObjectType,
      objectId: string,
      hypersync: IHypersync,
      userId: string,
      syncStartDate: string,
      page: number,
      metadata?: SyncMetadata
    ): Promise<IGetProofDataResponse | IRetryResponse> {
      throw Error('Not implemented');
    }

    /**
     * Generate the fields necessary to configure a Hypersync
     */
    async generateCriteriaMetadata(
      fusebitContext: IFusebitContext,
      vendorUserId: string,
      criteria: HypersyncCriteria,
      search?: string
    ): Promise<ICriteriaMetadata> {
      throw Error('Not implemented');
    }

    /**
     * Returns the schema of the proof that will be generated.
     */
    async generateSchema(
      fusebitContext: IFusebitContext,
      vendorUserId: string,
      criteria: HypersyncCriteria
    ): Promise<IHypersyncSchema> {
      throw createHttpError(
        StatusCodes.NOT_FOUND,
        'Hypersync connector does not support schema generation.'
      );
    }

    /**
     * Returns the HTML of the web page that initiates the authorization flow to the authorizationUrl. Return
     * undefined if you don't want to present any HTML to the user but instead redirect the user directly to
     * the authorizationUrl.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {string} authorizationUrl The fully formed authorization url to redirect the user to
     */
    async getAuthorizationPageHtml(
      fusebitContext: IFusebitContext,
      authorizationUrl: string
    ) {
      return undefined;
    }

    /**
     * Returns the file names that constitute the app's definition
     */
    async getAppDefinitionFiles() {
      const images = fs.readdirSync('__dirname/static/images');
      const metadata = fs.readdirSync('__dirname/static');
      return [...images, ...metadata];
    }

    getUserNotFoundMessage(vendorUserId: string) {
      return `No ${this.connectorName} account found with id ${vendorUserId}. The connection may have been deleted.`;
    }

    /**
     * Keeps an access token alive.  Designed to be overridden in connectors
     * that have tokens that expire.  Behavior varies by connector.
     *
     * @param {IFusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     *
     * @returns True if the token was kept alive.
     */
    async keepTokenAlive(
      fusebitContext: IFusebitContext,
      userContext: IHyperproofUserContext
    ): Promise<boolean> {
      return true;
    }

    /**
     * Keeps all stored connections alive for the connector.
     *
     * @param {IFusebitContext} fusebitContext The Fusebit context of the request
     *
     * @returns An array of booleans representing the kept alive status for each token.
     */
    async keepAllTokensAlive(
      fusebitContext: IFusebitContext
    ): Promise<boolean[]> {
      const vendorUserPath = 'vendor-user';
      const storage = fusebitContext.storage;
      const listResponse = await storage.list(vendorUserPath);
      return Promise.all(
        listResponse.items.map(async (item: IStorageItem) => {
          const vendorUserResponse = await storage.get(
            item.storageId.split('root/')[1]
          );
          return this.keepTokenAlive(
            fusebitContext,
            vendorUserResponse.data
          ).catch(async err => {
            await Logger.error('Failed to keep token alive', err);
            return false;
          });
        })
      );
    }

    // Delete all the user connections in the organization
    async deleteOrganization(fusebitContext: IFusebitContext, orgId: string) {
      // Get all vendor-user entries
      const users = await this.getAllOrgUsers(fusebitContext, orgId);
      await Logger.info(
        `Found ${users.length} to delete. Deleting the ${orgId} hyperproof users from these entries.`,
        users.map(u => u.vendorUserId).join(', ')
      );
      // Delete the hyperproof identities attached to those vendor-user entries
      // one at a time while ensuring that any hyperproof users not in the target org are unaffected
      await this.deleteUserConnections(fusebitContext, users, orgId);
    }
  };
}
