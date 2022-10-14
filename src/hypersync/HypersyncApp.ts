import { IFusebitContext } from '@fusebit/add-on-sdk';
import {
  createOAuthConnector,
  IOAuthTokenResponse,
  IUserContext,
  OAuthConnector
} from '@fusebit/oauth-connector';
import {
  AuthorizationType,
  createHyperproofApiClient,
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
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import { ParsedQs } from 'qs';
import Superagent from 'superagent';
import { formatHypersyncError, StringMap } from './common';
import { HypersyncPeriod } from './enums';
import {
  createHypersync,
  IValidateCredentialsResponse
} from './hypersyncConnector';
import { ICriteriaMetadata, ICriteriaPage } from './ICriteriaProvider';
import { IDataSource } from './IDataSource';
import { MESSAGES } from './messages';
import { HypersyncCriteria, IHypersync } from './models';
import {
  IHypersyncSchema,
  IProofFile,
  ProofProviderBase
} from './ProofProviderBase';
import { ProofProviderFactory } from './ProofProviderFactory';
import { IGetProofDataResponse, SyncMetadata } from './Sync';

/**
 * Configuration information for a Hypersync app.
 */
export interface IHypersyncAppConfig {
  appRootDir: string;
  connectorName: string;
  messages: StringMap;
  authorizationType: AuthorizationType;
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
    authorizationType: AuthorizationType,
    hypersyncApp: HypersyncApp<any>,
    credentialsMetadata?: ICredentialsMetadata
  ) {
    super(connectorName, authorizationType);
    this.hypersyncApp = hypersyncApp;
    this.credentialsMetadata = credentialsMetadata;
  }

  public async getAuthorizationUrl(
    { configuration }: IFusebitContext,
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
    { configuration }: IFusebitContext,
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
    { baseUrl, configuration }: IFusebitContext,
    tokenContext: IOAuthTokenResponse,
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
    fusebitContext: IFusebitContext,
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

  public async getUserProfile(tokenContext: IOAuthTokenResponse) {
    return this.hypersyncApp.getUserProfile(tokenContext);
  }

  public async getUserId(userContext: IUserContext) {
    return this.hypersyncApp.getUserId(userContext.vendorUserProfile);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getUserAccount(userContext: IUserContext): string {
    return this.hypersyncApp.getUserAccountName(userContext.vendorUserProfile);
  }

  public async generateCriteriaMetadata(
    fusebitContext: IFusebitContext,
    vendorUserId: string,
    criteria: HypersyncCriteria,
    search?: string
  ) {
    const dataSource = await this.createDataSource(
      fusebitContext,
      vendorUserId
    );
    return this.hypersyncApp.generateCriteriaMetadata(
      dataSource,
      criteria,
      [{ isValid: false, fields: [] }],
      search
    );
  }

  public async generateSchema(
    fusebitContext: IFusebitContext,
    vendorUserId: string,
    criteria: HypersyncCriteria
  ) {
    const dataSource = await this.createDataSource(
      fusebitContext,
      vendorUserId
    );
    return this.hypersyncApp.generateSchema(dataSource, criteria);
  }

  public async syncNow(
    fusebitContext: IFusebitContext,
    orgId: string,
    objectType: ObjectType,
    objectId: string,
    hypersync: IHypersync,
    userId: string,
    syncStartDate: string,
    page?: number,
    metadata?: SyncMetadata
  ) {
    const vendorUserId = hypersync.settings.vendorUserId;
    const dataSource = await this.createDataSource(
      fusebitContext,
      vendorUserId
    );
    const hyperproofClient = await createHyperproofApiClient(
      fusebitContext,
      orgId,
      userId
    );
    const hyperproofUser = await hyperproofClient.getMe();
    const userContext = await this.getUser(fusebitContext, vendorUserId);

    try {
      const data = await this.hypersyncApp.getProofData(
        dataSource,
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
    fusebitContext: IFusebitContext,
    userContext: IUserContext
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
    fusebitContext: IFusebitContext,
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

  private async createDataSource(
    fusebitContext: IFusebitContext,
    vendorUserId: string
  ): Promise<IDataSource> {
    const userContext = await this.getUser(fusebitContext, vendorUserId);
    if (!userContext) {
      throw createHttpError(
        StatusCodes.UNAUTHORIZED,
        this.getUserNotFoundMessage(vendorUserId)
      );
    }

    if (this.authorizationType === AuthorizationType.OAUTH) {
      const { access_token: accessToken } = await this.ensureAccessToken(
        fusebitContext,
        userContext
      );
      return this.hypersyncApp.createDataSource(accessToken);
    } else {
      return this.hypersyncApp.createDataSource(
        (userContext as IHyperproofUserContext).keys!
      );
    }
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
      config.authorizationType,
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
  ) {
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
   * @param {IOAuthTokenResponse} tokenContext An object representing the result of the getAccessToken call.
   * @param {string} redirectUri The redirectUri used in the OAuth authorization flow.
   */
  public async refreshAccessToken(
    configuration: StringMap,
    tokenContext: IOAuthTokenResponse,
    redirectUri: string
  ) {
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
  ): Promise<IValidatedUser> {
    throw new Error(
      'Custom auth Hypersync apps must implement validateCredentials.'
    );
  }

  /**
   * Obtains the user profile object after completion of the authorization flow.
   *
   * @param {*} tokenContext An object representing the result of the getAccessToken call.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getUserProfile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tokenContext: IOAuthTokenResponse
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
   * Returns the metadata that is used to generate the user interface
   * that allows the user to specify proof criteria.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteria Current set of proof criterion specified by the user.
   * @param pages One or more criteria metadata pages for display in the UI.
   * @param search Search criteria used in some criteria fields.  Optional.
   */
  public async generateCriteriaMetadata(
    dataSource: IDataSource,
    criteria: HypersyncCriteria,
    pages: ICriteriaPage[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    search?: string
  ): Promise<ICriteriaMetadata> {
    const factory = await this.getProofProviderFactory();
    const proofTypes = factory.getProofTypeOptions(criteria);
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
      const provider = factory.createProofProvider(
        criteria.proofType!,
        dataSource
      );
      return provider.generateCriteriaMetadata(criteria, pages);
    }
  }

  /**
   * Returns the schema of the proof that will be generated.  This schema is
   * used in automated testing.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param criteria Set of proof criterion selected by the user.
   */
  public async generateSchema(
    dataSource: IDataSource,
    criteria: HypersyncCriteria
  ): Promise<IHypersyncSchema> {
    const factory = await this.getProofProviderFactory();
    const provider = factory.createProofProvider(
      criteria.proofType!,
      dataSource
    );
    return provider.generateSchema(criteria);
  }

  /**
   * Retrieves data from the external source and formats it for rendering.
   *
   * @param dataSource IDataSource instance used to retrieve data.
   * @param hypersync The Hypersync that is synchronizing.
   * @param hyperproofUser The Hyperproof user who initiated the sync.
   * @param userProfile Profile object returned by getUserProfile.
   * @param syncStartDate Date and time at which the sync operation was initiated.
   * @param page Current proof page number being synchronized.  Optional.
   * @param metadata Arbitrary synchronization state associated with the sync.  Optional.
   */
  public async getProofData(
    dataSource: IDataSource,
    hypersync: IHypersync,
    hyperproofUser: IHyperproofUser,
    userProfile: TUserProfile,
    syncStartDate: string,
    page?: number,
    metadata?: SyncMetadata
  ): Promise<IProofFile[] | IGetProofDataResponse> {
    const factory = await this.getProofProviderFactory();
    const provider = factory.createProofProvider(
      hypersync.settings.criteria.proofType!,
      dataSource
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

  /**
   * Returns an initialized ProofProviderFactory object.
   */
  protected async getProofProviderFactory(): Promise<ProofProviderFactory> {
    if (!this.proofProviderFactory) {
      const providersPath = path.resolve(
        this.appRootDir,
        'build/proof-providers'
      );
      let providers: typeof ProofProviderBase[] = [];
      if (fs.existsSync(providersPath)) {
        const exportedProviders = await import(
          path.resolve(this.appRootDir, 'build/proof-providers')
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
