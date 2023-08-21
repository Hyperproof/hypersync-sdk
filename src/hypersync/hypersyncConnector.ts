/* eslint-disable @typescript-eslint/no-unused-vars */

import { formatHypersyncError } from './common';
import { HypersyncStage } from './enums';
import { createHypersyncStorageClient } from './HypersyncStorageClient';
import { ICriteriaMetadata } from './ICriteriaProvider';
import { SyncMetadata } from './IDataSource';
import { IHypersync } from './models';
import { IHypersyncSchema } from './ProofProviderBase';
import { IGetProofDataResponse } from './Sync';

import { HypersyncCriteria } from '@hyperproof/hypersync-models';
import {
  FusebitContext,
  OAuthConnector,
  StorageItem,
  UserContext
} from '@hyperproof/integration-sdk';
import express from 'express';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';

import {
  AuthorizationType,
  createConnector,
  CustomAuthCredentials,
  formatUserKey,
  getHpUserFromUserKey,
  HttpHeader,
  HYPERPROOF_VENDOR_KEY,
  ICheckConnectionHealthInvocationPayload,
  IConnectionHealth,
  IHyperproofUser,
  IHyperproofUserContext,
  IRetryResponse,
  IUserConnection,
  LogContextKey,
  Logger,
  mapObjectTypesParamToType,
  ObjectType
} from '../common';
import { HealthStatus, InstanceType } from '../common/enums';

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
              req.params.orgId,
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
                [LogContextKey.HypersyncStage]: HypersyncStage.AUTHORING,
                [LogContextKey.StackTrace]: err.stack
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
              req.params.orgId,
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
                  mapObjectTypesParamToType(objectType),
                  objectId,
                  req.body.hypersync,
                  req.body.syncStartDate,
                  req.body.user,
                  req.body.page,
                  req.body.metadata,
                  req.body.retryCount
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
              await Logger.error(
                `Hypersync invoke failure: ${process.env.vendor_name}`,
                formatHypersyncError(
                  err,
                  req.body?.hypersync?.id,
                  'Hypersync invoke failure.'
                )
              );
            }

            await Logger.error('Failed to sync Hypersync', err);
            const statusCode =
              err.status || err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
            res.status(statusCode).json({
              message: err.message,
              extendedError: {
                ...err,
                [LogContextKey.HypersyncStage]: HypersyncStage.SYNCING,
                [LogContextKey.IntegrationId]: req.body.hypersync.id,
                [LogContextKey.HypersyncSettings]: req.body.hypersync.settings,
                [LogContextKey.StackTrace]: err.stack,
                [LogContextKey.StatusCode]: statusCode
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

      // Route that allows static images to be extracted from custom Hyperysncs.
      app.get('/images/:imageName', async (req, res) => {
        try {
          // We only recognize a specific set of images, and they must be SVG.
          const image = req.params.imageName;
          if (
            ![
              'icon-small.svg',
              'icon-medium.svg',
              'icon-large.svg',
              'brand.svg'
            ].includes(image)
          ) {
            await Logger.warn(
              `Received request for unsupported image file: ${image}`
            );
            res.sendStatus(StatusCodes.NOT_FOUND);
            return;
          }

          const filePath = this.resolveImagePath(image);
          if (!fs.existsSync(filePath)) {
            await Logger.error(`Required image file not found: ${image}`);
            res.sendStatus(StatusCodes.NOT_FOUND);
            return;
          }

          const stat = fs.statSync(filePath);
          res.setHeader(HttpHeader.ContentType, 'image/svg+xml');
          res.setHeader(HttpHeader.ContentLength, stat.size);

          const readStream = fs.createReadStream(filePath);
          readStream.pipe(res);
          res.status(StatusCodes.OK);
        } catch (err: any) {
          await Logger.error(err);
          res
            .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: err.message });
        }
      });

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

    outboundOnly(integrationType: string, meta: Express.ParsedQs) {
      return true;
    }

    /**
     * Override the same method in sharedConnector.ts
     * It does nothing since Hypersyncs don't create hyperproof-user due to being outbound only.
     *
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} orgId ID of the Hyperproof organization.
     * @param {*} userId ID of the Hyperproof user.
     * @param {*} instanceType Optional instance type to use when determining which user to delete.
     */
    async deleteHyperproofUserIfUnused(
      fusebitContext: FusebitContext,
      orgId: string,
      userId: string,
      vendorUserId: string,
      instanceType?: InstanceType
    ) {
      return undefined;
    }

    /**
     * Returns a full path to one of the required custom Hypersync app images.
     *
     * @param imageName The name of the image.
     */
    resolveImagePath(imageName: string): string {
      throw new Error('Not implemented');
    }

    override async checkConnectionHealth(
      fusebitContext: FusebitContext,
      orgId: string,
      userId: string,
      vendorUserId: string,
      body?: ICheckConnectionHealthInvocationPayload
    ): Promise<IConnectionHealth> {
      try {
        const userContext = await this.getHyperproofUserContext(
          fusebitContext,
          vendorUserId
        );

        // we'll need to allow JiraHS to find its userContext using hostUrl
        if (!userContext) {
          throw createHttpError(
            StatusCodes.UNAUTHORIZED,
            this.getUserNotFoundMessage(vendorUserId)
          );
        }

        if (this.authorizationType === AuthorizationType.CUSTOM) {
          // NOTE: calling this will not save any token retrieved from the corresponding service to the vendor-user.
          // In the case of AWS, the temporary token for cross-account role auth is saved in vendor-user for each sync, but not saved by validateCredentials itself.
          // Since the token is temporary they will expire in an hour and way before AWS scheduled syncs are run and thus no reason to save it in this step.
          await this.validateCredentials(
            userContext.keys!,
            fusebitContext,
            userId
          );
        } else {
          const tokenResponse = await this.ensureAccessToken(
            fusebitContext,
            userContext
          );

          await this.validateAccessToken(
            fusebitContext,
            userContext,
            tokenResponse.access_token,
            body
          );
        }
      } catch (e: any) {
        // The connector can customize the health result status and message here.
        // However custom connectors' validateCredentials may have already handled the
        // error and threw a different error/status code.
        const healthResult = this.handleHealthError(e);

        if (healthResult.healthStatus === HealthStatus.NotImplemented) {
          Logger.info(
            `Connection health check found the connector did not implement validate credentials function.`
          );
        } else if (healthResult.healthStatus === HealthStatus.Unhealthy) {
          Logger.info(
            `Connection health check returned an unhealthy response: ${healthResult.message}`
          );
        } else if (healthResult.healthStatus === HealthStatus.Unknown) {
          Logger.warn(
            `Connection health check returned an unknown error: ${healthResult.message}`
          );
        }

        return healthResult;
      }

      return {
        healthStatus: HealthStatus.Healthy,
        message: undefined,
        details: undefined,
        statusCode: StatusCodes.OK
      };
    }

    /**
     * Validates custom auth credentials that are provided when creating a new
     * new user connection.  Designed to be overridden.
     *
     * @returns An object containing values to be persisted in UserContext.
     */
    async validateCredentials(
      credentials: CustomAuthCredentials,
      fusebitContext: FusebitContext,
      hyperproofUserId: string
    ): Promise<IValidateCredentialsResponse> {
      throw createHttpError(StatusCodes.NOT_IMPLEMENTED, 'Not Implemented');
    }

    /**
     * Validate access token of the OAuth connector. This must be implemented by the connector.
     *
     * The connector's implementation should not handle any error so that it can be handled in checkConnectionHealth
     */
    async validateAccessToken(
      fusebitContext: FusebitContext,
      userContext: UserContext,
      accessToken: string,
      body?: ICheckConnectionHealthInvocationPayload
    ): Promise<void> {
      throw createHttpError(StatusCodes.NOT_IMPLEMENTED, 'Not Implemented');
    }

    /**
     * This can be overriden by the connector in order to provide better health check result with more information or to process/filter errors.
     */
    handleHealthError(error: any): IConnectionHealth {
      const extendedErrorMessage = error[LogContextKey.ExtendedMessage];
      const healthResult: Readonly<IConnectionHealth> = {
        healthStatus: HealthStatus.Unknown,
        message: `Error: ${
          extendedErrorMessage ? extendedErrorMessage : error.message
        }`,
        details: undefined,
        statusCode: error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR
      };
      switch (error.statusCode) {
        case StatusCodes.UNAUTHORIZED:
        case StatusCodes.FORBIDDEN:
          return {
            ...healthResult,
            healthStatus: HealthStatus.Unhealthy,
            message: extendedErrorMessage ? extendedErrorMessage : error.message
          };
        case StatusCodes.NOT_IMPLEMENTED:
          return {
            ...healthResult,
            healthStatus: HealthStatus.NotImplemented,
            message: 'The function for validating token is not implemented.'
          };
      }

      return healthResult;
    }

    /**
     * Returns a human readable string which identifies the vendor user's account.
     * This string is displayed in Hypersync's Connected Accounts page to help the
     * user distinguish between multiple connections that use different accounts.
     *
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    getUserAccount(userContext: UserContext): string {
      throw Error('Not implemented.');
    }

    async getUserConnection(
      fusebitContext: FusebitContext,
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
    async onNewUser(fusebitContext: FusebitContext, userContext: UserContext) {
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
      fusebitContext: FusebitContext,
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

    /**
     * Execute a sync operation
     */
    async syncNow(
      fusebitContext: FusebitContext,
      orgId: string,
      objectType: ObjectType,
      objectId: string,
      hypersync: IHypersync,
      syncStartDate: string,
      hyperproofUser: IHyperproofUser,
      page?: string,
      metadata?: SyncMetadata,
      retryCount?: number
    ): Promise<IGetProofDataResponse | IRetryResponse> {
      throw Error('Not implemented');
    }

    /**
     * Generate the fields necessary to configure a Hypersync
     */
    async generateCriteriaMetadata(
      fusebitContext: FusebitContext,
      orgId: string,
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
      fusebitContext: FusebitContext,
      orgId: string,
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
      fusebitContext: FusebitContext,
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
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     *
     * @returns True if the token was kept alive.
     */
    async keepTokenAlive(
      fusebitContext: FusebitContext,
      userContext: IHyperproofUserContext
    ): Promise<boolean> {
      return true;
    }

    /**
     * Keeps all stored connections alive for the connector.
     *
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     *
     * @returns An array of booleans representing the kept alive status for each token.
     */
    async keepAllTokensAlive(
      fusebitContext: FusebitContext
    ): Promise<boolean[]> {
      const vendorUserPath = 'vendor-user';
      const storage = fusebitContext.storage;
      const listResponse = await storage.list(vendorUserPath);
      return Promise.all(
        listResponse.items.map(async (item: StorageItem) => {
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
    async deleteOrganization(fusebitContext: FusebitContext, orgId: string) {
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
