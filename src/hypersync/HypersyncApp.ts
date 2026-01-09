import { formatHypersyncError, StringMap } from './common';
import { createHypersync } from './hypersyncConnector';
import {
  ICriteriaMetadata,
  ICriteriaPage,
  ICriteriaProvider
} from './ICriteriaProvider';
import {
  DataSetResultStatus,
  IDataSource,
  isRestDataSourceBase,
  SyncMetadata
} from './IDataSource';
import { JsonCriteriaProvider } from './JsonCriteriaProvider';
import { MESSAGES } from './messages';
import { IHypersync } from './models';
import {
  IHypersyncSchema,
  IProofFile,
  ProofProviderBase
} from './ProofProviderBase';
import { IProofTypeConfig, ProofProviderFactory } from './ProofProviderFactory';
import { RestDataSourceBase } from './RestDataSourceBase';
import { IterableObject } from './ServiceDataIterator';
import { IGetProofDataResponse, IHypersyncSyncPlanResponse } from './Sync';

import {
  DataValueMap,
  HypersyncCriteria,
  HypersyncCriteriaFieldType,
  HypersyncPeriod,
  ICriteriaFieldConfig,
  ICriteriaSearchInput,
  IDataSet,
  IHypersyncDefinition,
  SchemaCategory,
  ValueLookup
} from '@hyperproof-int/hypersync-models';
import {
  AuthorizationType,
  createApp,
  createOAuthConnector,
  CustomAuthCredentials,
  ExternalAPIError,
  getAgent,
  IAuthorizationConfigBase,
  ICheckConnectionHealthInvocationPayload,
  ICredentialsMetadata,
  IHyperproofUserContext,
  ILocalizable,
  IntegrationContext,
  IValidateCredentialsResponse,
  ListStorageResult,
  Logger,
  OAuthConnector,
  OAuthTokenResponse,
  ObjectType,
  UserContext
} from '@hyperproof-int/integration-sdk';
import express from 'express';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import { ParsedQs } from 'qs';
import Superagent from 'superagent';

/**
 * Configuration information for a Hypersync app.
 */
export interface IHypersyncAppConfig {
  appRootDir: string;
  connectorName: string;
  messages: StringMap;
  credentialsMetadata?: ICredentialsMetadata;
}

/**
 * Response returned from the validateCredentials method.
 */
export interface IValidatedUser<TUserProfile = object> {
  userId: string;
  profile: TUserProfile;
  userIdPattern?: RegExp;
  hostUrl?: string;
}

/**
 * Interface for a custom proof type saved in Fusebit storage.
 */
interface ICustomProofType extends IProofTypeConfig {
  definition: IHypersyncDefinition;
}

/**
 * Type that maps a proofType string to an ICustomProofType.  Used in
 * loading custom proof types out of Fusebit storage.
 */
type CustomProofTypeMap = { [proofType: string]: ICustomProofType };

export class HypersyncAppConnector extends createHypersync(OAuthConnector) {
  private credentialsMetadata?: ICredentialsMetadata;
  private hypersyncApp: HypersyncApp<any>;

  constructor(
    connectorName: string,
    hypersyncApp: HypersyncApp<any>,
    credentialsMetadata?: ICredentialsMetadata
  ) {
    super(connectorName);
    this.hypersyncApp = hypersyncApp;
    this.credentialsMetadata = credentialsMetadata;
  }

  public onCreate(app: express.Router) {
    super.onCreate(app);

    const errorHandler = async (res: express.Response, err: any) => {
      await Logger.error(err);
      res
        .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ message: err.message });
    };

    app.get(
      '/design/organizations/:orgId/datasource',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.getDataSourceConfig(
              req.fusebit,
              req.params.orgId,
              req.query.vendorUserId as string
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.head(
      '/design/organizations/:orgId/datasource/datasets/:dataSetName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          if (
            !(await this.doesOrgStorageItemExist(
              req.fusebit,
              req.params.orgId,
              'datasource/datasets',
              req.params.dataSetName
            ))
          ) {
            res.status(StatusCodes.NOT_FOUND);
          }
          res.send();
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.put(
      '/design/organizations/:orgId/datasource/datasets/:dataSetName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            dataSet,
            oldDataSetName
          }: {
            dataSet: IDataSet;
            oldDataSetName?: string;
          } = req.body;

          res.json(
            await this.createOrUpdateDataSet(
              req.fusebit,
              req.params.orgId,
              req.params.dataSetName,
              dataSet,
              oldDataSetName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.delete(
      '/design/organizations/:orgId/datasource/datasets/:dataSetName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.deleteDataSet(
              req.fusebit,
              req.params.orgId,
              req.params.dataSetName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.put(
      '/design/organizations/:orgId/datasource/dataset/run',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            dataSet,
            params
          }: { dataSet: IDataSet; params: DataValueMap } = req.body;
          res.json(
            await this.runDataSet(
              req.fusebit,
              req.params.orgId,
              req.query.vendorUserId as string,
              dataSet,
              params
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.head(
      '/design/organizations/:orgId/datasource/valuelookups/:valueLookupName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          if (
            !(await this.doesOrgStorageItemExist(
              req.fusebit,
              req.params.orgId,
              'datasource/valuelookups',
              req.params.valueLookupName
            ))
          ) {
            res.status(StatusCodes.NOT_FOUND);
          }
          res.send();
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.put(
      '/design/organizations/:orgId/datasource/valuelookups/:valueLookupName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            valueLookup,
            oldValueLookupName
          }: {
            valueLookup: ValueLookup;
            oldValueLookupName?: string;
          } = req.body;

          res.json(
            await this.createOrUpdateValueLookup(
              req.fusebit,
              req.params.orgId,
              req.params.valueLookupName,
              valueLookup,
              oldValueLookupName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.delete(
      '/design/organizations/:orgId/datasource/valuelookups/:valueLookupName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.deleteValueLookup(
              req.fusebit,
              req.params.orgId,
              req.params.valueLookupName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.get(
      '/design/organizations/:orgId/criteriafields',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.getCriteriaConfig(
              req.fusebit,
              req.params.orgId,
              req.query.vendorUserId as string
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.head(
      '/design/organizations/:orgId/criteriafields/:criteriaFieldName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          if (
            !(await this.doesOrgStorageItemExist(
              req.fusebit,
              req.params.orgId,
              'criteriafields',
              req.params.criteriaFieldName
            ))
          ) {
            res.status(StatusCodes.NOT_FOUND);
          }
          res.send();
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.put(
      '/design/organizations/:orgId/criteriafields/:criteriaFieldName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            criteriaField,
            oldCriteriaFieldName
          }: {
            criteriaField: ICriteriaFieldConfig;
            oldCriteriaFieldName?: string;
          } = req.body;

          res.json(
            await this.createOrUpdateCriteriaField(
              req.fusebit,
              req.params.orgId,
              req.query.vendorUserId as string,
              req.params.criteriaFieldName,
              criteriaField,
              oldCriteriaFieldName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.delete(
      '/design/organizations/:orgId/criteriafields/:criteriaFieldName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.deleteCriteriaField(
              req.fusebit,
              req.params.orgId,
              req.params.criteriaFieldName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.get(
      '/design/organizations/:orgId/prooftypes',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.getProofTypesConfig(req.fusebit, req.params.orgId)
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.head(
      '/design/organizations/:orgId/proof/:proofType',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          if (
            !(await this.doesOrgStorageItemExist(
              req.fusebit,
              req.params.orgId,
              'proof',
              req.params.proofType
            ))
          ) {
            res.status(StatusCodes.NOT_FOUND);
          }
          res.send();
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.get(
      '/design/organizations/:orgId/proof/:proofType',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.getProofTypeDefinition(
              req.fusebit,
              req.params.orgId,
              req.params.proofType
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.put(
      '/design/organizations/:orgId/proof/:proofType',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            label,
            category,
            definition,
            oldProofType
          }: {
            label: string;
            category: string | undefined;
            definition: IHypersyncDefinition;
            oldProofType?: string;
          } = req.body;

          res.json(
            await this.createOrUpdateProofType(
              req.fusebit,
              req.params.orgId,
              req.params.proofType,
              label,
              category,
              definition,
              oldProofType
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.delete(
      '/design/organizations/:orgId/proof/:proofType',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.deleteProofType(
              req.fusebit,
              req.params.orgId,
              req.params.proofType
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.head(
      '/design/organizations/:orgId/messages/:messageName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const messages = await this.createMessageMap(
            req.fusebit,
            req.params.orgId
          );
          if (!messages[req.params.messageName]) {
            res.status(StatusCodes.NOT_FOUND);
          }
          res.send();
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.get(
      '/design/organizations/:orgId/messages',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(await this.createMessageMap(req.fusebit, req.params.orgId));
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.put(
      '/design/organizations/:orgId/messages/:messageName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            message,
            oldMessageName
          }: {
            message: string;
            oldMessageName?: string;
          } = req.body;

          res.json(
            await this.createOrUpdateMessage(
              req.fusebit,
              req.params.orgId,
              req.params.messageName,
              message,
              oldMessageName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );

    app.delete(
      '/design/organizations/:orgId/messages/:messageName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          res.json(
            await this.deleteMessage(
              req.fusebit,
              req.params.orgId,
              req.params.messageName
            )
          );
        } catch (err: any) {
          errorHandler(res, err);
        }
      }
    );
  }

  public resolveImagePath(imageName: string): string {
    return this.hypersyncApp.resolveImagePath(imageName);
  }

  public async getAuthorizationUrl(
    { configuration }: IntegrationContext,
    state: string,
    redirectUri: string
  ) {
    return this.hypersyncApp.getAuthorizationUrl(
      configuration,
      state,
      redirectUri
    );
  }

  public async getAccessToken(
    { configuration }: IntegrationContext,
    authorizationCode: string,
    redirectUri: string
  ) {
    return this.hypersyncApp.getAccessToken(
      configuration,
      authorizationCode,
      redirectUri
    );
  }

  public async refreshAccessToken(
    { baseUrl, configuration }: IntegrationContext,
    tokenContext: OAuthTokenResponse,
    redirectUri: string
  ) {
    return this.hypersyncApp.refreshAccessToken(
      configuration,
      tokenContext,
      redirectUri || `${baseUrl}/callback`
    );
  }

  public applyAdditionalAuthorizationConfig(
    config: IAuthorizationConfigBase,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    meta: ParsedQs
  ) {
    (config as any).credentialsMetadata = this.credentialsMetadata;
    return config;
  }

  async validateAccessToken(
    integrationContext: IntegrationContext,
    userContext: UserContext,
    accessToken: string,
    body?: ICheckConnectionHealthInvocationPayload
  ): Promise<void> {
    await this.hypersyncApp.validateAccessToken(
      integrationContext,
      userContext,
      accessToken,
      body
    );
  }

  public async validateCredentials(
    credentials: CustomAuthCredentials,
    integrationContext: IntegrationContext,
    hyperproofUserId: string
  ): Promise<IValidateCredentialsResponse> {
    const response: IValidatedUser =
      await this.hypersyncApp.validateCredentials(
        credentials,
        integrationContext.configuration,
        hyperproofUserId
      );

    if (response.userIdPattern) {
      const { userIdPattern, userId } = response;
      if (!userIdPattern.test(userId)) {
        throw createHttpError(
          StatusCodes.FORBIDDEN,
          'External user failed expected pattern validation.',
          {
            extendedMessage: `externalUserId ${userId} fails expected regex pattern test: ${String(
              userIdPattern
            )}`
          }
        );
      }
    }
    return {
      vendorUserId: response.userId,
      vendorUserProfile: response.profile
    };
  }

  public async getUserProfile(tokenContext: OAuthTokenResponse) {
    return this.hypersyncApp.getUserProfile(tokenContext);
  }

  public async getUserId(userContext: UserContext) {
    return this.hypersyncApp.getUserId(userContext.vendorUserProfile);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getUserAccount(userContext: UserContext): string {
    return this.hypersyncApp.getUserAccountName(userContext.vendorUserProfile);
  }

  public async generateCriteriaMetadata(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    criteria: HypersyncCriteria,
    search?: string | ICriteriaSearchInput,
    schemaCategory?: SchemaCategory
  ) {
    const { messages, dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(integrationContext, orgId, vendorUserId);
    return this.hypersyncApp.generateCriteriaMetadata(
      messages,
      dataSource,
      criteriaProvider,
      proofProviderFactory,
      criteria,
      [{ isValid: false, fields: [] }],
      search,
      schemaCategory
    );
  }

  public async generateSchema(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    criteria: HypersyncCriteria
  ) {
    const { dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(integrationContext, orgId, vendorUserId);
    return this.hypersyncApp.generateSchema(
      dataSource,
      criteriaProvider,
      proofProviderFactory,
      criteria
    );
  }

  public async generateSyncPlan(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    criteria: HypersyncCriteria,
    metadata?: SyncMetadata,
    retryCount?: number
  ) {
    const userContext = await this.getUser(integrationContext, vendorUserId);
    if (!userContext) {
      throw createHttpError(
        StatusCodes.UNAUTHORIZED,
        this.getUserNotFoundMessage(vendorUserId)
      );
    }
    const { dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(integrationContext, orgId, vendorUserId);
    return this.hypersyncApp.generateSyncPlan(
      dataSource,
      criteriaProvider,
      proofProviderFactory,
      criteria,
      metadata,
      retryCount
    );
  }

  public async syncNow(
    integrationContext: IntegrationContext,
    orgId: string,
    objectType: ObjectType,
    objectId: string,
    hypersync: IHypersync,
    syncStartDate: string,
    organization: ILocalizable,
    page?: string,
    metadata?: SyncMetadata,
    retryCount?: number,
    iterableSlice?: IterableObject[]
  ) {
    const vendorUserId = hypersync.settings.vendorUserId;
    const userContext = await this.getUser(integrationContext, vendorUserId);
    const { dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(
        integrationContext,
        orgId,
        vendorUserId,
        retryCount
      );

    if (!userContext) {
      throw createHttpError(
        StatusCodes.UNAUTHORIZED,
        this.getUserNotFoundMessage(vendorUserId)
      );
    }
    try {
      const data = await this.hypersyncApp.getProofData(
        dataSource,
        criteriaProvider,
        proofProviderFactory,
        hypersync,
        organization,
        userContext.vendorUserProfile,
        syncStartDate,
        page,
        metadata,
        retryCount,
        iterableSlice
      );
      return Array.isArray(data)
        ? {
            data
          }
        : data;
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
        formatHypersyncError(err, hypersync?.id, 'Sync failure')
      );
      throw err;
    }
  }

  public async keepTokenAlive(
    integrationContext: IntegrationContext,
    userContext: UserContext
  ): Promise<boolean> {
    if (this.authorizationType === AuthorizationType.OAUTH) {
      const { access_token: accessToken } = await this.ensureAccessToken(
        integrationContext,
        userContext
      );
      return this.hypersyncApp.keepTokenAlive(accessToken);
    } else {
      return this.hypersyncApp.keepTokenAlive(
        (userContext as IHyperproofUserContext).keys!
      );
    }
  }

  public override async deleteUser(
    integrationContext: IntegrationContext,
    vendorUserId: string
  ): Promise<void> {
    const userContext = await this.getUser(integrationContext, vendorUserId);
    if (userContext) {
      // We also need to call the Finch's /disconnect API if there are no more users authenticated to the provider company
      const prefixPath = await this.hypersyncApp.getRelatedTokenPath(
        userContext.vendorUserProfile
      );
      const listResponse = await integrationContext.storage.list(
        `vendor-user/${prefixPath}`
      );
      // If we are the last user in the company, disconnect. This invalidates all access_tokens
      // for the company-provider pair for the env client
      if (listResponse.items.length === 1) {
        const tokens = await this.ensureAccessToken(
          integrationContext,
          userContext
        );
        await this.hypersyncApp.onLastUserDeleted(
          userContext.vendorUserProfile,
          tokens.access_token
        );
      }
    }
    return super.deleteUser(integrationContext, vendorUserId);
  }

  private async createResources(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    retryCount?: number
  ) {
    const messages = await this.createMessageMap(integrationContext, orgId);
    const dataSource = await this.createDataSource(
      integrationContext,
      orgId,
      vendorUserId,
      retryCount
    );
    const criteriaProvider = await this.createCriteriaProvider(
      integrationContext,
      orgId,
      dataSource
    );
    const proofProviderFactory = await this.createProofProviderFactory(
      integrationContext,
      orgId,
      messages
    );

    return { messages, dataSource, criteriaProvider, proofProviderFactory };
  }

  private async createMessageMap(
    integrationContext: IntegrationContext,
    orgId: string
  ): Promise<StringMap> {
    let messages = this.hypersyncApp.getMessages();
    await Logger.info('Creating message map.');
    // Add organization customizations if there are any.
    const { items } = await integrationContext.storage.list(
      this.createOrgStorageKey(orgId, 'messages')
    );
    if (items && items.length > 0) {
      messages = { ...messages };
      for (const item of items) {
        const messageKey = item.storageId.split('/root/')[1];
        const messageName = messageKey.split('/')[3];
        const { data } = await integrationContext.storage.get(messageKey);
        messages[messageName] = data;
      }
    }

    return messages;
  }

  private async createDataSource(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    retryCount?: number
  ): Promise<IDataSource> {
    const userContext = await this.getUser(integrationContext, vendorUserId);
    if (!userContext) {
      throw createHttpError(
        StatusCodes.UNAUTHORIZED,
        this.getUserNotFoundMessage(vendorUserId)
      );
    }

    await Logger.info(`Retrieving access token to create data source`);
    let dataSource: IDataSource;
    if (this.authorizationType === AuthorizationType.OAUTH) {
      const { access_token: accessToken } = await this.ensureAccessToken(
        integrationContext,
        userContext
      );
      dataSource = await this.hypersyncApp.createDataSource(accessToken);
    } else {
      const credentials = (userContext as IHyperproofUserContext).keys!;
      const newCredentials = await this.hypersyncApp.refreshCredentials(
        credentials
      );
      if (newCredentials) {
        await this.saveUser(integrationContext, {
          ...userContext,
          keys: credentials
        } as IHyperproofUserContext);
      }
      dataSource = await this.hypersyncApp.createDataSource(
        newCredentials ?? credentials
      );
    }

    // Add organization customizations if there are any.
    if (dataSource instanceof RestDataSourceBase) {
      let result: ListStorageResult;
      result = await integrationContext.storage.list(
        this.createOrgStorageKey(orgId, 'datasource/datasets')
      );
      for (const item of result.items) {
        const { orgStorageKey: dataSetKey, itemName: dataSetName } =
          this.parseOrgStorageKey(item.storageId);
        const { data } = await integrationContext.storage.get(dataSetKey);
        dataSource.addDataSet(dataSetName, data);
      }

      result = await integrationContext.storage.list(
        this.createOrgStorageKey(orgId, 'datasource/valuelookups')
      );
      for (const item of result.items) {
        const { orgStorageKey: valueLookupKey, itemName: valueLookupName } =
          this.parseOrgStorageKey(item.storageId);
        const { data } = await integrationContext.storage.get(valueLookupKey);
        dataSource.addValueLookup(valueLookupName, data);
      }

      if (retryCount) {
        dataSource.setRetryCount(retryCount);
      }
    }

    return dataSource;
  }

  private async getDataSourceConfig(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string
  ) {
    const dataSource = await this.createDataSource(
      integrationContext,
      orgId,
      vendorUserId
    );
    if (!isRestDataSourceBase(dataSource)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        'Hypersync does not support customization.'
      );
    }
    return dataSource.getConfig();
  }

  private async getCriteriaConfig(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string
  ) {
    const dataSource = await this.createDataSource(
      integrationContext,
      orgId,
      vendorUserId
    );
    const criteriaProvider = await this.createCriteriaProvider(
      integrationContext,
      orgId,
      dataSource
    );
    if (!(criteriaProvider instanceof JsonCriteriaProvider)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        'Hypersync does not support customization.'
      );
    }
    return criteriaProvider.getConfig();
  }

  private async getProofTypesConfig(
    integrationContext: IntegrationContext,
    orgId: string
  ) {
    const messages = await this.createMessageMap(integrationContext, orgId);
    const proofProviderFactory = await this.createProofProviderFactory(
      integrationContext,
      orgId,
      messages
    );
    return proofProviderFactory.getConfig();
  }

  private async createCriteriaProvider(
    integrationContext: IntegrationContext,
    orgId: string,
    dataSource: IDataSource
  ) {
    await Logger.info('Creating criteria provider.');
    const criteriaProvider = await this.hypersyncApp.createCriteriaProvider(
      dataSource
    );
    // Add organization customizations if there are any.
    if (criteriaProvider instanceof JsonCriteriaProvider) {
      const { items } = await integrationContext.storage.list(
        this.createOrgStorageKey(orgId, 'criteriafields')
      );
      for (const item of items) {
        const criteriaFieldKey = item.storageId.split('/root/')[1];
        const criteriaFieldName = criteriaFieldKey.split('/')[3];
        const { data } = await integrationContext.storage.get(criteriaFieldKey);
        criteriaProvider.addCriteriaField(criteriaFieldName, data);
      }
    }

    return criteriaProvider;
  }

  private async createProofProviderFactory(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    integrationContext: IntegrationContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    orgId: string,
    messages: StringMap
  ) {
    await Logger.info('Creating proof provider factory.');
    const factory = await this.hypersyncApp.getProofProviderFactory(messages);

    // Load the list of custom org proof types out of storage.
    const customProofTypeMap = await this.getOrgProofTypes(
      integrationContext,
      orgId
    );

    // Add each of the org proof types to the factory.
    for (const [proofType, config] of Object.entries(customProofTypeMap)) {
      factory.addProofType(proofType, config);
    }

    return factory;
  }

  private createOrgStorageKey(
    orgId: string,
    subPath: string,
    itemName?: string
  ) {
    let key = `organizations/${orgId}/${subPath}`;
    if (itemName) {
      key = `${key}/${encodeURIComponent(itemName)}`;
    }
    return key;
  }

  private parseOrgStorageKey(storageId: string) {
    const orgStorageKey = storageId.split('/root/')[1];
    const parts = orgStorageKey.split('/');
    if (parts.length < 3) {
      throw new Error('Invalid org storage key');
    }
    return { orgStorageKey, itemName: decodeURIComponent(parts.pop()!) };
  }

  /**
   * Returns true if an custom object is stored in org storage under
   * the provided subPath with the given name.
   */
  private async doesOrgStorageItemExist(
    integrationContext: IntegrationContext,
    orgId: string,
    subPath: string,
    itemName: string
  ) {
    const result = await integrationContext.storage.list(
      this.createOrgStorageKey(orgId, subPath)
    );

    for (const item of result.items) {
      const { itemName: storedItemName } = this.parseOrgStorageKey(
        item.storageId
      );
      if (storedItemName === itemName) {
        return true;
      }
    }

    return false;
  }

  private async createOrUpdateDataSet(
    integrationContext: IntegrationContext,
    orgId: string,
    dataSetName: string,
    dataSet: IDataSet,
    oldDataSetName?: string
  ) {
    // Make sure the data set name does not conflict with a built-in data set.
    if (this.isBuiltInObject(dataSetName)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Invalid data set name: ${dataSetName}`
      );
    }

    // Save the data set to org storage.
    await integrationContext.storage.put(
      { data: dataSet },
      this.createOrgStorageKey(orgId, 'datasource/datasets', dataSetName)
    );

    // If the object is being renamed, the old name should be passed in
    // as a query string param so that we can clean it up.
    if (oldDataSetName) {
      await integrationContext.storage.delete(
        this.createOrgStorageKey(orgId, 'datasource/datasets', oldDataSetName)
      );
    }

    return { dataSetName, dataSet };
  }

  private async deleteDataSet(
    integrationContext: IntegrationContext,
    orgId: string,
    dataSetName: string
  ) {
    const key = this.createOrgStorageKey(
      orgId,
      'datasource/datasets',
      dataSetName
    );

    const { data: dataSet } = await integrationContext.storage.get(key);
    await integrationContext.storage.delete(key);
    return { dataSetName, dataSet };
  }

  private async runDataSet(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    dataSet: IDataSet,
    params: DataValueMap
  ) {
    const dataSource = await this.createDataSource(
      integrationContext,
      orgId,
      vendorUserId
    );

    if (!(dataSource instanceof RestDataSourceBase)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        'Hypersync does not support data set testing.'
      );
    }

    const dataSetName = '__test__';
    dataSource.addDataSet(dataSetName, dataSet);
    const results = await dataSource.getData(dataSetName, params);

    if (results.status !== DataSetResultStatus.Complete) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        'Dataset did not complete.'
      );
    }

    return results.data;
  }

  private async createOrUpdateValueLookup(
    integrationContext: IntegrationContext,
    orgId: string,
    valueLookupName: string,
    valueLookup: ValueLookup,
    oldMessageLookupName?: string
  ) {
    // Make sure the value lookup name does not conflict with a built-in value lookup.
    if (this.isBuiltInObject(valueLookupName)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Invalid value lookup name: ${valueLookupName}`
      );
    }

    // Save the value lookup to org storage.
    await integrationContext.storage.put(
      { data: valueLookup },
      this.createOrgStorageKey(
        orgId,
        'datasource/valuelookups',
        valueLookupName
      )
    );

    // If the object is being renamed, the old name should be passed in
    // as a query string param so that we can clean it up.
    if (oldMessageLookupName) {
      await integrationContext.storage.delete(
        this.createOrgStorageKey(
          orgId,
          'datasource/valuelookups',
          oldMessageLookupName
        )
      );
    }

    return { valueLookupName, valueLookup };
  }

  private async deleteValueLookup(
    integrationContext: IntegrationContext,
    orgId: string,
    messageLookupName: string
  ) {
    const key = this.createOrgStorageKey(
      orgId,
      'datasource/valuelookups',
      messageLookupName
    );

    const { data: valueLookup } = await integrationContext.storage.get(key);
    await integrationContext.storage.delete(key);
    return { messageLookupName, valueLookup };
  }

  private async createOrUpdateCriteriaField(
    integrationContext: IntegrationContext,
    orgId: string,
    vendorUserId: string,
    criteriaFieldName: string,
    criteriaField: ICriteriaFieldConfig,
    oldCriteriaFieldName?: string
  ) {
    if (this.isBuiltInObject(criteriaFieldName)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Invalid criteria field name: ${criteriaField}`
      );
    }

    // Save the criteria field to org storage.
    await integrationContext.storage.put(
      { data: criteriaField },
      this.createOrgStorageKey(orgId, 'criteriafields', criteriaFieldName)
    );

    // If the object is being renamed, the old name should be passed in
    // as a query string param so that we can clean it up.
    if (oldCriteriaFieldName) {
      await integrationContext.storage.delete(
        this.createOrgStorageKey(orgId, 'criteriafields', oldCriteriaFieldName)
      );
    }

    return { criteriaFieldName, criteriaField };
  }

  private async deleteCriteriaField(
    integrationContext: IntegrationContext,
    orgId: string,
    criteriaFieldName: string
  ) {
    const key = this.createOrgStorageKey(
      orgId,
      'criteriafields',
      criteriaFieldName
    );

    const { data: criteriaField } = await integrationContext.storage.get(key);
    await integrationContext.storage.delete(key);
    return { criteriaFieldName, criteriaField };
  }

  private async getProofTypeDefinition(
    integrationContext: IntegrationContext,
    orgId: string,
    proofType: string
  ) {
    const messages = await this.createMessageMap(integrationContext, orgId);
    const proofProviderFactory = await this.createProofProviderFactory(
      integrationContext,
      orgId,
      messages
    );
    return proofProviderFactory.getProofTypeDefinition(proofType);
  }

  private async createOrUpdateProofType(
    integrationContext: IntegrationContext,
    orgId: string,
    proofType: string,
    label: string,
    category: string | undefined,
    definition: IHypersyncDefinition,
    oldProofType?: string
  ) {
    // Make sure the data set name does not conflict with a built-in data set.
    if (this.isBuiltInObject(proofType)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Invalid proof type name: ${proofType}`
      );
    }

    const customProofType: ICustomProofType = {
      label,
      category,
      definition
    };

    // Save the custom proof type to org storage.
    await integrationContext.storage.put(
      { data: customProofType },
      this.createOrgStorageKey(orgId, 'proof', proofType)
    );

    // Is the proof type is being renamed?
    if (oldProofType) {
      // Delete the old proofs definition.
      await integrationContext.storage.delete(
        this.createOrgStorageKey(orgId, 'proof', oldProofType)
      );
    }

    return {
      [proofType]: { label, category, isJson: true }
    };
  }

  private async deleteProofType(
    integrationContext: IntegrationContext,
    orgId: string,
    proofType: string
  ) {
    const customProofTypeMap = await this.getOrgProofTypes(
      integrationContext,
      orgId
    );

    const proofTypeConfig = customProofTypeMap[proofType];
    if (!proofTypeConfig) {
      throw createHttpError(
        StatusCodes.NOT_FOUND,
        `Proof type ${proofType} not found.`
      );
    }

    // Delete the custom proof type from org storage.
    await integrationContext.storage.delete(
      this.createOrgStorageKey(orgId, 'proof', proofType)
    );

    return {
      [proofType]: { ...proofTypeConfig, isJson: true }
    };
  }

  /**
   * Loads the list of org proof types out of storage.
   */
  private async getOrgProofTypes(
    integrationContext: IntegrationContext,
    orgId: string
  ) {
    const customProofTypes: CustomProofTypeMap = {};

    // Look for all custom proof types for the given org and add them to customProofTypes.
    const proofTypesKey = this.createOrgStorageKey(orgId, 'proof');
    const storageKeys = await integrationContext.storage.list(proofTypesKey);
    for (const storageKey of storageKeys.items) {
      const customProofTypeEntry = await integrationContext.storage.get(
        storageKey.storageId.split('root/')[1]
      );

      const proofType = storageKey.storageId.split('/').at(-1);
      customProofTypes[proofType!] = customProofTypeEntry.data;
    }

    return customProofTypes;
  }

  private async createOrUpdateMessage(
    integrationContext: IntegrationContext,
    orgId: string,
    messageName: string,
    message: string,
    oldMessageName?: string
  ) {
    // Make sure the name does not conflict with a built-in message.
    if (this.isBuiltInObject(messageName)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Invalid message field name: ${messageName}`
      );
    }

    // Save the message to org storage.
    await integrationContext.storage.put(
      { data: message },
      this.createOrgStorageKey(orgId, 'messages', messageName)
    );

    // If the object is being renamed, the old name should be passed in
    // as a query string param so that we can clean it up.
    if (oldMessageName) {
      await integrationContext.storage.delete(
        this.createOrgStorageKey(orgId, 'messages', oldMessageName)
      );
    }

    return { messageName, message };
  }

  private async deleteMessage(
    integrationContext: IntegrationContext,
    orgId: string,
    messageName: string
  ) {
    // It is not possible to delete a built-in message.
    if (this.isBuiltInObject(messageName)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Invalid message field name: ${messageName}`
      );
    }

    const key = this.createOrgStorageKey(orgId, 'messages', messageName);
    const { data: message } = await integrationContext.storage.get(key);
    await integrationContext.storage.delete(key);
    return { messageName, message };
  }

  /**
   * Retruns true if the provided name references a built-in object
   * in a Hypersync app that supports the Hypersync Designer.
   */
  private isBuiltInObject(objectName: string) {
    return objectName.toLowerCase().startsWith('hp_');
  }
}

/**
 * Base class for a Hypersync app.
 */
export class HypersyncApp<TUserProfile = object> {
  protected appRootDir: string;
  private connector: HypersyncAppConnector;
  private messages: StringMap;

  constructor(config: IHypersyncAppConfig) {
    this.appRootDir = config.appRootDir;
    this.connector = new HypersyncAppConnector(
      config.connectorName,
      this,
      config.credentialsMetadata
    );
    this.messages = config.messages;
  }

  /**
   * Initializes the Hypersync app.
   *
   * @returns The initialized object that should be the default export of the app.
   */
  public initialize() {
    return createOAuthConnector(this.connector);
  }

  /**
   * Creates the Express app that processes requests to the integration.
   *
   * @returns An express.Express() instance.
   */
  public start() {
    return createApp(this.connector);
  }

  /**
   * Returns a full path to one of the required custom Hypersync app images.
   *
   * @param imageName The name of the image.
   */
  public resolveImagePath(imageName: string) {
    return path.join(__dirname, `images/${imageName}`);
  }

  /**
   * For OAuth apps, creates the fully formed web authorization URL to start the authorization flow.
   *
   * @param {StringMap} configuration App configuration values.
   * @param {string} state The value of the OAuth state parameter.
   * @param {string} redirectUri The callback URL to redirect to after the authorization flow.
   */
  public async getAuthorizationUrl(
    configuration: StringMap,
    state: string,
    redirectUri: string
  ) {
    await Logger.debug('Retrieving OAuth authorization URL.');
    return [
      configuration.oauth_authorization_url,
      `?response_type=code`,
      `&scope=${encodeURIComponent(configuration.oauth_scope)}`,
      `&state=${state}`,
      `&client_id=${configuration.oauth_client_id}`,
      `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      configuration.oauth_audience
        ? `&audience=${encodeURIComponent(configuration.oauth_audience)}`
        : undefined,
      configuration.oauth_extra_params
        ? `&${configuration.oauth_extra_params}`
        : undefined
    ].join('');
  }

  /**
   * Exchanges the OAuth authorization code for the access and refresh tokens.
   *
   * @param {StringMap} configuration App configuration values.
   * @param {string} authorizationCode The authorization_code supplied to the OAuth callback upon successful authorization flow.
   * @param {string} redirectUri The redirectUri used in the OAuth authorization flow.
   */
  public async getAccessToken(
    configuration: StringMap,
    authorizationCode: string,
    redirectUri: string
  ): Promise<OAuthTokenResponse> {
    await Logger.debug('Retrieving OAuth access token.');
    const response = await Superagent.post(configuration.oauth_token_url)
      .agent(getAgent(configuration.oauth_token_url))
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: authorizationCode,
        client_id: configuration.oauth_client_id,
        client_secret: configuration.oauth_client_secret,
        redirect_uri: redirectUri
      });

    return response.body;
  }

  /**
   * Obtains a new access token using refresh token.
   *
   * @param {StringMap} configuration App configuration values.
   * @param {OAuthTokenResponse} tokenContext An object representing the result of the getAccessToken call.
   * @param {string} redirectUri The redirectUri used in the OAuth authorization flow.
   */
  public async refreshAccessToken(
    configuration: StringMap,
    tokenContext: OAuthTokenResponse,
    redirectUri: string
  ): Promise<OAuthTokenResponse> {
    await Logger.debug('Refreshing OAuth access token.');
    const currentRefreshToken = tokenContext.refresh_token;
    const response = await Superagent.post(configuration.oauth_token_url)
      .agent(getAgent(configuration.oauth_token_url))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: tokenContext.refresh_token,
        client_id: configuration.oauth_client_id,
        client_secret: configuration.oauth_client_secret,
        redirect_uri: redirectUri
      });
    if (!response.body.refresh_token) {
      response.body.refresh_token = currentRefreshToken;
    }
    return response.body;
  }

  /**
   * Validates the credentials provided by the user in a custom auth application.
   *
   * Returns a user profile object for the user in the external system.
   *
   * @param {CustomAuthCredentails} credentials Login credentials provided by the user.
   * @param {StringMap} configuration App configuration values.
   * @param {string} hyperproofUserId ID of the Hyperproof user creating the connection.
   */
  public async validateCredentials(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    credentials: CustomAuthCredentials,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configuration: StringMap,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    hyperproofUserId: string
  ): Promise<IValidatedUser<TUserProfile>> {
    throw new Error(
      'Custom auth Hypersync apps must implement validateCredentials.'
    );
  }

  public async validateAccessToken(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    integrationContext: IntegrationContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    userContext: UserContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    accessToken: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    body?: ICheckConnectionHealthInvocationPayload
  ): Promise<void> {
    throw createHttpError(StatusCodes.NOT_IMPLEMENTED, 'Not Implemented');
  }

  /**
   * Refreshes credentials provided by the user in a custom auth application.
   * Returns updated credentials or undefined if unneeded
   *
   * @param {CustomAuthCredentials} credentials User's current credentials.
   */
  public async refreshCredentials(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    credentials: CustomAuthCredentials
  ): Promise<CustomAuthCredentials | undefined> {
    await Logger.debug('Refreshing custom authentication credentials.');
    return undefined;
  }

  /**
   * Obtains the user profile object after completion of the authorization flow.
   *
   * @param {*} tokenContext An object representing the result of the getAccessToken call.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getUserProfile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tokenContext: OAuthTokenResponse
  ): Promise<TUserProfile> {
    throw new Error('OAuth Hypersync apps must implement getUserProfile.');
  }

  /**
   * Returns a string uniquely identifying the user in the external system. Typically this is a property of
   * the profile object returned by getUserProfile.
   *
   * @param {*} userProfile The profile of the user returned by getUserProfile.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getUserId(userProfile: TUserProfile): Promise<string> {
    throw new Error('OAuth Hypersync apps must implement getUserId.');
  }

  /**
   * Returns a human readable string which identifies the vendor user's account.
   * This string is displayed in Hyperproof's Connected Accounts page to help the
   * user distinguish between multiple connections that use different accounts.
   * It is also included in the Data Collection section at the bottom of generated
   * proof documents.
   *
   * @param {*} userProfile The profile of the user returned by getUserProfile.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getUserAccountName(userProfile: TUserProfile): string {
    throw new Error('Hypersync apps must implement getUserAccountName.');
  }

  /**
   * Keeps an access token alive.  Designed to be overridden in connectors
   * that have tokens that expire.  Behavior varies by connector.
   *
   * @param tokenOrCreds For OAuth apps, an OAuth access token.  For custom auth apps, an object containing user credentials.
   *
   * @returns True if the token was kept alive.
   */
  public async keepTokenAlive(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tokenOrCreds: string | CustomAuthCredentials
  ): Promise<boolean> {
    return true;
  }

  /**
   * Retrieves the messages associated with the app.
   */
  public getMessages(): StringMap {
    return this.messages;
  }

  /**
   * Creates a data source that can be used to retrieve data.
   *
   * @param tokenOrCreds For OAuth apps, an OAuth access token.  For custom auth apps, an object containing user credentials.
   */
  public async createDataSource(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tokenOrCreds: string | CustomAuthCredentials
  ): Promise<IDataSource> {
    throw new Error('Please implement createDataSource in the derived class.');
  }

  /**
   * Creates a critieria provider that can be used to generate criteria metadata.
   */
  public async createCriteriaProvider(
    dataSource: IDataSource
  ): Promise<ICriteriaProvider> {
    return new JsonCriteriaProvider(this.appRootDir, dataSource);
  }

  /**
   * Returns the metadata that is used to generate the user interface
   * that allows the user to specify proof criteria.
   *
   * @param messages Messages assocaited with the app.
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteriaProvider ICriteriaProvider instance used to generate criteria metadata.
   * @param proofProviderFactory Factory object that provides ProofProviderBase objects.
   * @param criteria Current set of proof criterion specified by the user.
   * @param pages One or more criteria metadata pages for display in the UI.
   * @param search Search criteria used in some criteria fields.  Optional.
   */
  public async generateCriteriaMetadata(
    messages: StringMap,
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    proofProviderFactory: ProofProviderFactory,
    criteria: HypersyncCriteria,
    pages: ICriteriaPage[],
    search?: string | ICriteriaSearchInput,
    schemaCategory?: SchemaCategory
  ): Promise<ICriteriaMetadata> {
    await Logger.debug('Generating criteria metadata.');

    // Is there a proof category field?  If so add it before the proof type.
    const categoryField = await criteriaProvider.generateProofCategoryField(
      criteria,
      {
        criteria,
        messages
      }
    );
    if (categoryField) {
      // Make sure we have a well formed proof category field.
      if (
        categoryField.type !== HypersyncCriteriaFieldType.Select ||
        !categoryField.options ||
        categoryField.options.length <= 0 ||
        typeof categoryField.options[0].value !== 'string'
      ) {
        throw new Error('Invalid proof category field.');
      }

      // If there are any custom proof types and if any of them have
      // 'other' listed as the category, add the "Other" option to the
      // category dropdown.  We don't ship any "Other" proof types out
      // of the box so this is special case code to make custom proof
      // type development a little nicer.
      const customProofTypeCategories =
        proofProviderFactory.getCustomProofTypeCategories();
      if (customProofTypeCategories.has('other')) {
        categoryField.options!.push({
          value: 'other',
          label: MESSAGES.ProofCategoryOther
        });
      }

      pages[0].fields.push(categoryField);
    }

    // Grab the list of proof types that match the proof category.
    const proofTypes = proofProviderFactory.getProofTypeOptions(
      categoryField?.value as string | undefined,
      schemaCategory
    );

    // If the previously selected proof type is not found in the set of
    // proof types for the default criteria, then we clear out the proof type
    // value because it seems the user is going a different direction.
    if (
      criteria.proofType &&
      proofTypes &&
      !proofTypes.find(t => t.value === criteria.proofType)
    ) {
      delete criteria.proofType;
    }

    pages[0].fields.push({
      name: 'proofType',
      type: HypersyncCriteriaFieldType.Select,
      label: MESSAGES.ProofType,
      options: proofTypes,
      value: criteria.proofType as string,
      isRequired: true,
      isDisabled: categoryField != null && !categoryField.value
    });

    // If the user hasn't chosen a proof type yet, we can exit at this point.
    // There's no way to create a proof provider until we know the type.
    if (!criteria.proofType) {
      return {
        pages,
        period: HypersyncPeriod.Monthly,
        useVersioning: true,
        suggestedName: '',
        description: '',
        enableExcelOutput: false
      };
    }

    // We have a proofType which means we also have values for any
    // default criteria in this Hyperysnc app.  The first page is valid
    // at this point, but that may change as more fields are added by
    // the proof provider for the selected proof type.
    pages[0].isValid = true;

    // Create a proof provider for the type and let it provide any remaining
    // criteria fields.
    const provider = proofProviderFactory.createProofProvider(
      criteria.proofType!,
      dataSource,
      criteriaProvider
    );

    return provider.generateCriteriaMetadata(criteria, pages, search);
  }

  /**
   * Returns the schema of the proof that will be generated.  This schema is
   * used in automated testing.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteriaProvider ICriteriaProvider instance used to generate criteria metadata.
   * @param proofProviderFactory Factory object that provides ProofProviderBase objects.
   * @param criteria Set of proof criterion selected by the user.
   */
  public async generateSchema(
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    proofProviderFactory: ProofProviderFactory,
    criteria: HypersyncCriteria
  ): Promise<IHypersyncSchema> {
    await Logger.debug(
      `Generating schema for proof type '${criteria.proofType}'.`
    );
    const provider = proofProviderFactory.createProofProvider(
      criteria.proofType!,
      dataSource,
      criteriaProvider
    );
    return provider.generateSchema(criteria);
  }

  /**
   * Returns the sync plan of the proof that will be generated.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteriaProvider ICriteriaProvider instance used to generate criteria metadata.
   * @param proofProviderFactory Factory object that provides ProofProviderBase objects.
   * @param criteria Set of proof criterion selected by the user.
   * @param metadata Arbitrary synchronization state associated with the sync.  Optional.
   * @param retryCount Current retry count of sync. Optional.
   */
  public async generateSyncPlan(
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    proofProviderFactory: ProofProviderFactory,
    criteria: HypersyncCriteria,
    metadata?: SyncMetadata,
    retryCount?: number
  ): Promise<IHypersyncSyncPlanResponse> {
    const provider = proofProviderFactory.createProofProvider(
      criteria.proofType!,
      dataSource,
      criteriaProvider
    );
    return provider.generateSyncPlan(criteria, metadata, retryCount);
  }

  /**
   * Retrieves data from the external source and formats it for rendering.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteriaProvider ICriteriaProvider instance used to generate criteria metadata.
   * @param proofProviderFactory Factory object that provides ProofProviderBase objects.
   * @param hypersync The Hypersync that is synchronizing.
   * @param userProfile Profile object returned by getUserProfile.
   * @param syncStartDate Date and time at which the sync operation was initiated.
   * @param page Current proof page number being synchronized.  Optional.
   * @param metadata Arbitrary synchronization state associated with the sync.  Optional.
   * @param retryCount Current retry count of sync. Optional.
   */
  public async getProofData(
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    proofProviderFactory: ProofProviderFactory,
    hypersync: IHypersync,
    organization: ILocalizable,
    userProfile: TUserProfile,
    syncStartDate: string,
    page?: string,
    metadata?: SyncMetadata,
    retryCount?: number,
    iterableSlice?: IterableObject[]
  ): Promise<IProofFile[] | IGetProofDataResponse> {
    await Logger.debug(
      `Retrieving data for proof type '${hypersync.settings.criteria.proofType}'.`
    );
    const provider = proofProviderFactory.createProofProvider(
      hypersync.settings.criteria.proofType!,
      dataSource,
      criteriaProvider
    );
    return provider.getProofData(
      hypersync,
      organization,
      this.getUserAccountName(userProfile),
      new Date(syncStartDate),
      page,
      metadata,
      retryCount,
      iterableSlice
    );
  }

  public async getRelatedTokenPath(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    user: TUserProfile
  ): Promise<string | undefined> {
    return undefined;
  }

  public async onLastUserDeleted(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    user: TUserProfile,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    accessToken: string
  ): Promise<void> {
    // Does nothing by default
  }

  /**
   * Returns an initialized ProofProviderFactory object.
   *
   * @param messages Messages associated with the app.
   */
  public async getProofProviderFactory(
    messages: StringMap
  ): Promise<ProofProviderFactory> {
    const providersPath = path.resolve(this.appRootDir, 'proof-providers');
    let providers: (typeof ProofProviderBase)[] = [];
    if (fs.existsSync(providersPath)) {
      const exportedProviders = await import(
        path.resolve(this.appRootDir, 'proof-providers')
      );
      providers = Object.values(exportedProviders);
    }
    return new ProofProviderFactory(
      this.connector.connectorName,
      this.appRootDir,
      messages,
      providers
    );
  }
}
