import * as express from 'express';
import { FusebitContext } from '@fusebit/add-on-sdk';
import {
  createOAuthConnector,
  OAuthConnector,
  UserContext
} from '@fusebit/oauth-connector';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import { ParsedQs } from 'qs';
import Superagent from 'superagent';
import {
  AuthorizationType,
  CustomAuthCredentials,
  ExternalAPIError,
  FieldType,
  formatKey,
  IAuthorizationConfigBase,
  ICredentialsMetadata,
  IHyperproofUser,
  IHyperproofUserContext,
  Logger,
  ObjectType
} from '../common';
import { formatHypersyncError, StringMap } from './common';
import { DataSetResultStatus, HypersyncPeriod } from './enums';
import {
  createHypersync,
  IValidateCredentialsResponse
} from './hypersyncConnector';
import {
  ICriteriaMetadata,
  ICriteriaPage,
  ICriteriaProvider
} from './ICriteriaProvider';
import { IDataSource, DataValueMap } from './IDataSource';
import { JsonCriteriaProvider } from './JsonCriteriaProvider';
import { MESSAGES } from './messages';
import { HypersyncCriteria, IHypersync, OAuthTokenResponse } from './models';
import {
  IHypersyncSchema,
  IProofFile,
  ProofProviderBase
} from './ProofProviderBase';
import { ProofProviderFactory } from './ProofProviderFactory';
import { RestDataSourceBase, IDataSet } from './RestDataSourceBase';
import { IGetProofDataResponse, SyncMetadata } from './Sync';

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
}

class HypersyncAppConnector extends createHypersync(OAuthConnector) {
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

    app.put(
      '/design/organizations/:orgId/datasource/datasets',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const {
            dataSetName,
            dataSet,
            oldDataSetName
          }: {
            dataSetName: string;
            dataSet: IDataSet;
            oldDataSetName?: string;
          } = req.body;

          res.json(
            await this.createorUpdateDataSet(
              req.fusebit,
              req.params.orgId,
              req.query.vendorUserId as string,
              dataSetName,
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

    app.head(
      '/design/organizations/:orgId/datasource/datasets/:dataSetName',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const config = await this.getDataSourceConfig(
            req.fusebit,
            req.params.orgId,
            req.query.vendorUserId as string
          );
          if (
            !Object.prototype.hasOwnProperty.call(
              config.dataSets,
              req.params.dataSetName
            )
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

    app.get(
      '/design/organizations/:orgId/criteriafields',
      this.checkAuthorized(),
      async (req: express.Request, res: express.Response) => {
        try {
          const dataSource = await this.createDataSource(
            req.fusebit,
            req.params.orgId,
            req.query.vendorUserId as string
          );
          const criteriaProvider = await this.createCriteriaProvider(
            req.fusebit,
            req.params.orgId,
            dataSource
          );
          if (!(criteriaProvider instanceof JsonCriteriaProvider)) {
            throw createHttpError(
              StatusCodes.BAD_REQUEST,
              'Hypersync does not support customization.'
            );
          }
          res.json(criteriaProvider.getConfig());
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
          const { proofProviderFactory } = await this.createResources(
            req.fusebit,
            req.params.orgId,
            req.query.vendorUserId as string
          );
          res.json(proofProviderFactory.getConfig());
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
          const fileContents = await this.hypersyncApp.getJsonFile(
            'messages.json'
          );
          res.contentType('application/json');
          res.send(fileContents);
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
    { configuration }: FusebitContext,
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
    { configuration }: FusebitContext,
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
    { baseUrl, configuration }: FusebitContext,
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

  public async validateCredentials(
    credentials: CustomAuthCredentials,
    fusebitContext: FusebitContext,
    hyperproofUserId: string
  ): Promise<IValidateCredentialsResponse> {
    const response = await this.hypersyncApp.validateCredentials(
      credentials,
      fusebitContext.configuration,
      hyperproofUserId
    );
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
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string,
    criteria: HypersyncCriteria,
    search?: string
  ) {
    const { dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(fusebitContext, orgId, vendorUserId);
    return this.hypersyncApp.generateCriteriaMetadata(
      dataSource,
      criteriaProvider,
      proofProviderFactory,
      criteria,
      [{ isValid: false, fields: [] }],
      search
    );
  }

  public async generateSchema(
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string,
    criteria: HypersyncCriteria
  ) {
    const { dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(fusebitContext, orgId, vendorUserId);
    return this.hypersyncApp.generateSchema(
      dataSource,
      criteriaProvider,
      proofProviderFactory,
      criteria
    );
  }

  public async syncNow(
    fusebitContext: FusebitContext,
    orgId: string,
    objectType: ObjectType,
    objectId: string,
    hypersync: IHypersync,
    syncStartDate: string,
    hyperproofUser: IHyperproofUser,
    page?: string,
    metadata?: SyncMetadata
  ) {
    const vendorUserId = hypersync.settings.vendorUserId;
    const userContext = await this.getUser(fusebitContext, vendorUserId);
    const { dataSource, criteriaProvider, proofProviderFactory } =
      await this.createResources(fusebitContext, orgId, vendorUserId);

    try {
      const data = await this.hypersyncApp.getProofData(
        dataSource,
        criteriaProvider,
        proofProviderFactory,
        hypersync,
        hyperproofUser,
        userContext.vendorUserProfile,
        syncStartDate,
        page,
        metadata
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
      const objectKey = formatKey(orgId, objectType, objectId);
      await Logger.error(
        `Hypersync Sync Error: ${process.env.vendor_name}`,
        formatHypersyncError(err, objectKey, 'Sync failure')
      );
      throw err;
    }
  }

  public async keepTokenAlive(
    fusebitContext: FusebitContext,
    userContext: UserContext
  ): Promise<boolean> {
    if (this.authorizationType === AuthorizationType.OAUTH) {
      const { access_token: accessToken } = await this.ensureAccessToken(
        fusebitContext,
        userContext
      );
      return this.hypersyncApp.keepTokenAlive(accessToken);
    } else {
      return this.hypersyncApp.keepTokenAlive(
        (userContext as IHyperproofUserContext).keys!
      );
    }
  }

  public async deleteUserIfLast(
    fusebitContext: FusebitContext,
    userContext: IHyperproofUserContext,
    vendorUserId: string,
    vendorId?: string
  ) {
    // We also need to call the Finch's /disconnect API if there are no more users authenticated to the provider company
    const prefixPath = await this.hypersyncApp.getRelatedTokenPath(
      userContext.vendorUserProfile
    );
    const listResponse = await fusebitContext.storage.list(
      `vendor-user/${prefixPath}`
    );
    // If we are the last user in the company, disconnect. This invalidates all access_tokens
    // for the company-provider pair for the env client
    if (listResponse.items.length === 1) {
      const tokens = await this.ensureAccessToken(fusebitContext, userContext);
      await this.hypersyncApp.onLastUserDeleted(
        userContext.vendorUserProfile,
        tokens.access_token
      );
    }

    return super.deleteUserIfLast(
      fusebitContext,
      userContext,
      vendorUserId,
      vendorId
    );
  }

  private async createResources(
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string
  ) {
    const dataSource = await this.createDataSource(
      fusebitContext,
      orgId,
      vendorUserId
    );
    const criteriaProvider = await this.createCriteriaProvider(
      fusebitContext,
      orgId,
      dataSource
    );
    const proofProviderFactory = await this.createProofProviderFactory(
      fusebitContext,
      orgId
    );

    return { dataSource, criteriaProvider, proofProviderFactory };
  }

  private async createDataSource(
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string
  ): Promise<IDataSource> {
    const userContext = await this.getUser(fusebitContext, vendorUserId);
    if (!userContext) {
      throw createHttpError(
        StatusCodes.UNAUTHORIZED,
        this.getUserNotFoundMessage(vendorUserId)
      );
    }

    let dataSource: IDataSource;
    if (this.authorizationType === AuthorizationType.OAUTH) {
      const { access_token: accessToken } = await this.ensureAccessToken(
        fusebitContext,
        userContext
      );
      dataSource = await this.hypersyncApp.createDataSource(accessToken);
    } else {
      const credentials = (userContext as IHyperproofUserContext).keys!;
      const newCredentials = await this.hypersyncApp.refreshCredentials(
        credentials
      );
      if (newCredentials) {
        await this.saveUser(fusebitContext, {
          ...(userContext as IHyperproofUserContext),
          keys: credentials
        });
      }
      dataSource = await this.hypersyncApp.createDataSource(
        newCredentials ?? credentials
      );
    }

    // Add organization customizations if there are any.
    if (dataSource instanceof RestDataSourceBase) {
      const { items } = await fusebitContext.storage.list(
        this.createOrgStorageKey(orgId, 'datasource/datasets')
      );
      for (const item of items) {
        const dataSetKey = item.storageId.split('/root/')[1];
        const dataSetName = dataSetKey.split('/')[4];
        const { data } = await fusebitContext.storage.get(dataSetKey);
        data.isCustom = true;
        dataSource.addDataSet(dataSetName, data);
      }
    }

    return dataSource;
  }

  private async getDataSourceConfig(
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string
  ) {
    const dataSource = await this.createDataSource(
      fusebitContext,
      orgId,
      vendorUserId
    );
    if (!(dataSource instanceof RestDataSourceBase)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        'Hypersync does not support customization.'
      );
    }
    return dataSource.getConfig();
  }

  private async createCriteriaProvider(
    fusebitContext: FusebitContext,
    orgId: string,
    dataSource: IDataSource
  ) {
    const criteriaProvider = await this.hypersyncApp.createCriteriaProvider(
      dataSource
    );

    if (criteriaProvider instanceof JsonCriteriaProvider) {
      // TODO: HYP-32281: Add org customizations
    }

    return criteriaProvider;
  }

  private async createProofProviderFactory(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fusebitContext: FusebitContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    orgId: string
  ) {
    const factory = this.hypersyncApp.getProofProviderFactory();
    // TODO: HYP-32282: Add org customizations
    return factory;
  }

  private createOrgStorageKey(
    orgId: string,
    subPath: string,
    itemName?: string
  ) {
    let key = `organizations/${orgId}/${subPath}`;
    if (itemName) {
      key = `${key}/${itemName}`;
    }
    return key;
  }

  private async createorUpdateDataSet(
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string,
    dataSetName: string,
    dataSet: IDataSet,
    oldDataSetName?: string
  ) {
    // Make sure the data set name does not conflict with a built-in data set.
    const config = await this.getDataSourceConfig(
      fusebitContext,
      orgId,
      vendorUserId as string
    );
    if (Object.prototype.hasOwnProperty.call(config.dataSets, dataSetName)) {
      if (!config.dataSets[dataSetName].isCustom) {
        throw createHttpError(
          StatusCodes.BAD_REQUEST,
          `Invalid data set name: ${dataSetName}`
        );
      }
    }

    // Save the data set to org storage.
    await fusebitContext.storage.put(
      { data: dataSet },
      this.createOrgStorageKey(orgId, 'datasource/datasets', dataSetName)
    );

    // If the object is being renamed, the old name should be passed in
    // as a query string param so that we can clean it up.
    if (oldDataSetName) {
      await fusebitContext.storage.delete(
        this.createOrgStorageKey(orgId, 'datasource/datasets', oldDataSetName)
      );
    }

    dataSet.isCustom = true;
    return { dataSetName, dataSet };
  }

  private async deleteDataSet(
    fusebitContext: FusebitContext,
    orgId: string,
    dataSetName: string
  ) {
    const key = this.createOrgStorageKey(
      orgId,
      'datasource/datasets',
      dataSetName
    );

    const { data: dataSet } = await fusebitContext.storage.get(key);
    await fusebitContext.storage.delete(key);
    return { dataSetName, dataSet };
  }

  private async runDataSet(
    fusebitContext: FusebitContext,
    orgId: string,
    vendorUserId: string,
    dataSet: IDataSet,
    params: DataValueMap
  ) {
    const dataSource = await this.createDataSource(
      fusebitContext,
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
}

/**
 * Base class for a Hypersync app.
 */
export class HypersyncApp<TUserProfile = object> {
  protected proofProviderFactory?: ProofProviderFactory;
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

  /**
   * Refreshes credentials provided by the user in a custom auth application.
   * Returns updated credentials or undefined if unneeded
   *
   * @param {CustomAuthCredentails} credentials User's current credentials.
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
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteriaProvider ICriteriaProvider instance used to generate criteria metadata.
   * @param proofProviderFactory Factory object that provides ProofProviderBase objects.
   * @param criteria Current set of proof criterion specified by the user.
   * @param pages One or more criteria metadata pages for display in the UI.
   * @param search Search criteria used in some criteria fields.  Optional.
   */
  public async generateCriteriaMetadata(
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    proofProviderFactory: ProofProviderFactory,
    criteria: HypersyncCriteria,
    pages: ICriteriaPage[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    search?: string
  ): Promise<ICriteriaMetadata> {
    await Logger.debug('Generating criteria metadata.');
    const proofTypes = proofProviderFactory.getProofTypeOptions(criteria);
    pages[0].fields.push({
      name: 'proofType',
      type: FieldType.SELECT,
      label: MESSAGES.ProofType,
      options: proofTypes,
      value: criteria.proofType as string,
      isRequired: true
    });

    if (!criteria.proofType) {
      return {
        pages,
        period: HypersyncPeriod.MONTHLY,
        useVersioning: true,
        suggestedName: '',
        description: '',
        enableExcelOutput: false
      };
    } else {
      const provider = proofProviderFactory.createProofProvider(
        criteria.proofType!,
        dataSource,
        criteriaProvider
      );
      return provider.generateCriteriaMetadata(criteria, pages);
    }
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
   * Retrieves data from the external source and formats it for rendering.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteriaProvider ICriteriaProvider instance used to generate criteria metadata.
   * @param proofProviderFactory Factory object that provides ProofProviderBase objects.
   * @param hypersync The Hypersync that is synchronizing.
   * @param hyperproofUser The Hyperproof user who initiated the sync.
   * @param userProfile Profile object returned by getUserProfile.
   * @param syncStartDate Date and time at which the sync operation was initiated.
   * @param page Current proof page number being synchronized.  Optional.
   * @param metadata Arbitrary synchronization state associated with the sync.  Optional.
   */
  public async getProofData(
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider,
    proofProviderFactory: ProofProviderFactory,
    hypersync: IHypersync,
    hyperproofUser: IHyperproofUser,
    userProfile: TUserProfile,
    syncStartDate: string,
    page?: string,
    metadata?: SyncMetadata
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
      hyperproofUser,
      this.getUserAccountName(userProfile),
      new Date(syncStartDate),
      page,
      metadata
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

  // TODO: HYP-32283: Get rid of this.
  public async getJsonFile(filename: string) {
    if (!['messages.json'].includes(filename)) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Unrecognized filename: ${filename}`
      );
    }

    await Logger.info(`Retrieving JSON file: ${filename}`);
    const filePath = path.resolve(this.appRootDir, `json/${filename}`);
    const contents = fs.readFileSync(filePath, 'utf8');
    return contents;
  }

  /**
   * Returns an initialized ProofProviderFactory object.
   */
  public async getProofProviderFactory(): Promise<ProofProviderFactory> {
    if (!this.proofProviderFactory) {
      const providersPath = path.resolve(this.appRootDir, 'proof-providers');
      let providers: typeof ProofProviderBase[] = [];
      if (fs.existsSync(providersPath)) {
        const exportedProviders = await import(
          path.resolve(this.appRootDir, 'proof-providers')
        );
        providers = Object.values(exportedProviders);
      }
      this.proofProviderFactory = new ProofProviderFactory(
        this.connector.connectorName,
        this.appRootDir,
        this.messages,
        providers
      );
    }

    return this.proofProviderFactory;
  }
}
