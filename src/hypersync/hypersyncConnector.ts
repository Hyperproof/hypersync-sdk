/* eslint-disable @typescript-eslint/no-unused-vars */

import { formatHypersyncError } from './common';
import { HypersyncStage } from './enums';
import { ICriteriaMetadata } from './ICriteriaProvider';
import { SyncMetadata } from './IDataSource';
import { formatMessage, MESSAGES } from './messages';
import { IHypersync } from './models';
import { IHypersyncSchema } from './ProofProviderBase';
import { IGetProofDataResponse } from './Sync';

import {
  HypersyncCriteria,
  SchemaCategory
} from '@hyperproof/hypersync-models';
import {
  AuthorizationType,
  createConnector,
  CustomAuthCredentials,
  ExternalAPIError,
  formatUserKey,
  HealthStatus,
  HttpHeader,
  ICheckConnectionHealthInvocationPayload,
  IConnectionHealth,
  IHyperproofUser,
  IHyperproofUserContext,
  IntegrationContext,
  IRetryResponse,
  LogContextKey,
  Logger,
  mapObjectTypesParamToType,
  OAuthConnector,
  ObjectType,
  StorageItem,
  UserContext
} from '@hyperproof/integration-sdk';
import express from 'express';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';

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
            const integrationContext = req.fusebit;
            const { orgId, userId } = req.params;
            const keys: {
              [key: string]: string;
            } = req.body;
            const response = await this.validateCredentials(
              keys,
              integrationContext,
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
            // save the keys along with some user information in integration storage.
            let userContext = await this.getHyperproofUserContext(
              integrationContext,
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
                connectorBaseUrl: integrationContext.baseUrl!
              }
            };

            await this.onNewUser(integrationContext, userContext);
            await this.saveUser(integrationContext, userContext);

            const connection = await this.getUserConnectionFromUserContext(
              userContext,
              userId
            );
            res.json(connection);
          } catch (err: any) {
            await Logger.error('Failed to add user connection', err);
            res
              .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
              .json({ message: err.message, extendedError: err });
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
              req.body.search,
              req.body.schemaCategory
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
          } catch (syncErr: any) {
            let err = syncErr;
            if (err instanceof ExternalAPIError && err.canRetry()) {
              try {
                const retryResponse = await err.computeRetry();
                return res.json(retryResponse);
              } catch (retryErr) {
                err = retryErr;
              }
            }

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

            const headers = err.headers || err.response?.headers;
            if (headers) {
              const rateLimitKeys = [
                'x-ratelimit-limit',
                'x-ratelimit-remaining',
                'x-ratelimit-retryafter',
                'x-ratelimit-reset',
                'x-ratelimit-used'
              ];
              const rateLimitHeaders = Object.keys(headers)
                .filter(key => rateLimitKeys.includes(key))
                .reduce((obj, key) => {
                  return { ...obj, [key]: headers[key] };
                }, {});
              await Logger.info(
                `Rate limit headers found: ${JSON.stringify(rateLimitHeaders)}`
              );
            }

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
       * Hypersyncs do not manage user connections, so there are no artifacts to clean up
       * when an organization is deleted.
       *
       * Called when a Hyperproof organization is permanently deleted
       *
       * TODO: HYP-27706: Unify all org delete routes
       */
      app.delete(
        '/organizations/:orgId',
        this.checkAuthorized(),
        async (req, res) => {
          try {
            const orgId = req.params.orgId;
            await Logger.info(
              `Received DELETE /organizations/${orgId} request.`
            );
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

      app.put('/keeptokensalive', this.checkAuthorized(), async (req, res) => {
        try {
          await this.keepAllTokensAlive(req.fusebit);
          return res
            .status(StatusCodes.OK)
            .json({ integrationType: this.integrationType, success: true });
        } catch (err: any) {
          await Logger.error(err);
          res.status(err.status || StatusCodes.INTERNAL_SERVER_ERROR).json({
            integrationType: this.integrationType,
            success: false,
            message: err.message
          });
        }
      });
    }

    override outboundOnly(integrationType: string, meta: Express.ParsedQs) {
      return true;
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
      integrationContext: IntegrationContext,
      orgId: string,
      userId: string,
      vendorUserId: string,
      body?: ICheckConnectionHealthInvocationPayload
    ): Promise<IConnectionHealth> {
      try {
        const userContext = await this.getHyperproofUserContext(
          integrationContext,
          vendorUserId
        );

        // we'll need to allow JiraHS to find its userContext using hostUrl
        if (!userContext) {
          throw createHttpError(
            StatusCodes.NOT_FOUND,
            this.getUserNotFoundMessage(vendorUserId)
          );
        }

        if (this.authorizationType === AuthorizationType.CUSTOM) {
          // NOTE: calling this will not save any token retrieved from the corresponding service to the vendor-user.
          // In the case of AWS, the temporary token for cross-account role auth is saved in vendor-user for each sync, but not saved by validateCredentials itself.
          // Since the token is temporary they will expire in an hour and way before AWS scheduled syncs are run and thus no reason to save it in this step.
          await this.validateCredentials(
            userContext.keys!,
            integrationContext,
            userId
          );
        } else {
          const tokenResponse = await this.ensureAccessToken(
            integrationContext,
            userContext
          );

          await this.validateAccessToken(
            integrationContext,
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
          await Logger.info(
            `Connection health check found the connector did not implement validate credentials function.`
          );
        } else if (healthResult.healthStatus === HealthStatus.Unhealthy) {
          if (healthResult.statusCode === StatusCodes.NOT_FOUND) {
            await Logger.info(
              `Connection health check returned an unhealthy response: ${this.getUserNotFoundMessage(
                vendorUserId
              )}`
            );
          } else {
            await Logger.info(
              `Connection health check returned an unhealthy response: ${healthResult.message}`
            );
          }
        } else if (healthResult.healthStatus === HealthStatus.Unknown) {
          await Logger.warn(
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
      integrationContext: IntegrationContext,
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
      integrationContext: IntegrationContext,
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
      const errorMessage = error.message;
      const extendedErrorMessage = error[LogContextKey.ExtendedMessage];
      const healthResult: Readonly<IConnectionHealth> = {
        healthStatus: HealthStatus.Unknown,
        message: `Error: ${
          extendedErrorMessage ? extendedErrorMessage : errorMessage
        }`,
        details: undefined,
        statusCode: error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR
      };
      switch (error.statusCode) {
        case StatusCodes.NOT_FOUND:
          return {
            ...healthResult,
            healthStatus: HealthStatus.Unhealthy,
            message: formatMessage(MESSAGES.NoAccountFound, {
              [MESSAGES.App]: this.connectorName
            })
          };
        case StatusCodes.UNAUTHORIZED:
        case StatusCodes.FORBIDDEN:
          return {
            ...healthResult,
            healthStatus: HealthStatus.Unhealthy,
            message: extendedErrorMessage ? extendedErrorMessage : errorMessage
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
    override getUserAccount(userContext: UserContext): string {
      throw Error('Not implemented.');
    }

    /**
     * Execute a sync operation
     */
    async syncNow(
      integrationContext: IntegrationContext,
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
      integrationContext: IntegrationContext,
      orgId: string,
      vendorUserId: string,
      criteria: HypersyncCriteria,
      search?: string,
      schemaCategory?: SchemaCategory
    ): Promise<ICriteriaMetadata> {
      throw Error('Not implemented');
    }

    /**
     * Returns the schema of the proof that will be generated.
     */
    async generateSchema(
      integrationContext: IntegrationContext,
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
     * @param {IntegrationContext} integrationContext The integration context of the request
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     *
     * @returns True if the token was kept alive.
     */
    async keepTokenAlive(
      integrationContext: IntegrationContext,
      userContext: IHyperproofUserContext
    ): Promise<boolean> {
      return true;
    }

    /**
     * Keeps all stored connections alive for the connector.
     *
     * @param {IntegrationContext} integrationContext The integration context of the request
     *
     * @returns An array of booleans representing the kept alive status for each token.
     */
    async keepAllTokensAlive(
      integrationContext: IntegrationContext
    ): Promise<boolean[]> {
      const vendorUserPath = 'vendor-user';
      const storage = integrationContext.storage;
      const listResponse = await storage.list(vendorUserPath);
      return Promise.all(
        listResponse.items.map(async (item: StorageItem) => {
          const vendorUserResponse = await storage.get(
            item.storageId.split('root/')[1]
          );
          return this.keepTokenAlive(
            integrationContext,
            vendorUserResponse.data
          ).catch(async err => {
            await Logger.error('Failed to keep token alive', err);
            return false;
          });
        })
      );
    }
  };
}
