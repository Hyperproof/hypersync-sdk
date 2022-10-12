import { IFusebitContext } from '@fusebit/add-on-sdk';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import Superagent from 'superagent';
import { IAuthorizationConfig, IAuthorizationConfigBase } from './authModels';
import { formatUserKey } from './common';
import { AuthorizationType, InstanceType } from './enums';
import { Logger } from './Logger';

/**
 * Hyperproof user information is stored under this storage root.
 */
export const HYPERPROOF_USER_STORAGE_ID = 'hyperproof-user';

/**
 * Access tokens returned from the ensureHyperproofAccesstoken method will expire no
 * earlier than ACCESS_TOKEN_EXPIRATION_BUFFER milliseconds in the future.
 */
const ACCESS_TOKEN_EXPIRATION_BUFFER = 30000;

/**
 * Milliseconds to delay before retrying when token refresh fails.
 */
const TOKEN_REFRESH_RETRY_DELAY = 1000;

interface IHyperproofUserToken {
  expires_at: number;
  expires_in: number;
  token_type: string;
  access_token: string;
  refresh_token: string;
  refresh_token_expires_in: number;
}

interface IHyperproofUserContext {
  orgId: string;
  userId: string;
  vendorUserIds: string[];
  vendorUserId?: string; // Deprecated
  hyperproofToken: IHyperproofUserToken;
}

let hyperproofClientSecret = process.env.hyperproof_oauth_client_secret;

/**
 * Sets the client secret used to get and refresh access tokens.
 *
 * @param clientSecret The secret value.
 */
export const setHyperproofClientSecret = (clientSecret: string) => {
  hyperproofClientSecret = clientSecret;
};

/**
 * Retrieves a redirect URL that can be used when retrieving a Hyperproof
 * access token.  Not actually used since we avoid the first part of the
 * OAuth authorization flow but needed to complete the auth code exchange.
 */
export const getHyperproofRedirectUrl = (fusebitContext: IFusebitContext) => {
  return `${fusebitContext.baseUrl}/callback`;
};

/**
 * Awaitable sleep function.
 *
 * @param {} ms Milliseconds to sleep.
 */
const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retrieves the authorization configuration for a connector.  The Hyperproof
 * UI uses this information to determine how authorization takes place.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param integrationType The type of integration.
 * @param authorizationType The authorization type.
 * @param outboundOnly True if this is a one-way (i.e. outbound only) integration.
 *
 * @returns An authorization config structure that can be sent to Hyperproof.
 */
export const getHyperproofAuthConfig = (
  fusebitContext: IFusebitContext,
  integrationType: string,
  authorizationType: AuthorizationType,
  outboundOnly: boolean
) => {
  const baseConfig: IAuthorizationConfigBase = {
    integrationType,
    authorizationType,
    outboundOnly,
    vendorPrefix: process.env.vendor_prefix!
  };

  // One way integrations do not require auth back into Hyperproof.
  if (outboundOnly) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    hyperproofClientId: process.env.hyperproof_oauth_client_id,
    hyperproofRedirectUrl: getHyperproofRedirectUrl(fusebitContext),
    hyperproofScopes: process.env.hyperproof_oauth_scope!.split(' ')
  } as IAuthorizationConfig;
};

/**
 * Sets an expires_at value on a token bundle to make refresh easier.
 */
const setExpiresAt = (token: IHyperproofUserToken) => {
  if (!isNaN(token.expires_in)) {
    token.expires_at = Date.now() + +token.expires_in * 1000;
  }
};

/**
 * Exchanges a Hyperproof authorization code for an access token and
 * refresh token package.  Stores the result along with the vendor ID
 * in Fusebit storage.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param orgId Unique ID of the org where the connection is being created.
 * @param userId Unique ID of the Hyperproof user.
 * @param vendorUserId Unique ID of the user in the external service.
 * @param authorizationCode OAuth authorization code provided by Hyperproof.
 * @param instanceType Optional instance type to use when saving the token.
 */
export const getHyperproofAccessToken = async (
  fusebitContext: IFusebitContext,
  orgId: string,
  userId: string,
  vendorUserId: string,
  authorizationCode: string,
  instanceType?: InstanceType
) => {
  await Logger.info(
    'Exchanging Hyperproof authorization code for an access token.'
  );
  const response = await Superagent.post(
    process.env.hyperproof_oauth_token_url!
  )
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: process.env.hyperproof_oauth_client_id,
      client_secret: hyperproofClientSecret,
      redirect_uri: getHyperproofRedirectUrl(fusebitContext)
    });
  const hyperproofToken: IHyperproofUserToken = response.body;
  setExpiresAt(hyperproofToken);

  // Save the token along with some user information in Fusebit storage.
  const hpUserContext = {
    orgId,
    userId,
    hyperproofToken,
    vendorUserIds: [vendorUserId]
  };
  await fusebitContext.storage.put(
    { data: hpUserContext },
    `${HYPERPROOF_USER_STORAGE_ID}/${formatUserKey(
      orgId,
      userId,
      instanceType
    )}`
  );

  return hpUserContext;
};

/**
 * Obtains a new Hyperproof access token using refresh token.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param hpUserContext An object representing the result of the getHyperproofAccessToken call.
 */
const refreshHyperproofAccessToken = async (
  fusebitContext: IFusebitContext,
  hpUserContext: IHyperproofUserContext
) => {
  await Logger.debug(
    `Refreshing Hyperproof API client using URL ${process.env.hyperproof_oauth_token_url}`
  );
  const currentRefreshToken = hpUserContext.hyperproofToken.refresh_token;
  const response = await Superagent.post(
    process.env.hyperproof_oauth_token_url!
  )
    .type('form')
    .send({
      grant_type: 'refresh_token',
      refresh_token: hpUserContext.hyperproofToken.refresh_token,
      client_id: process.env.hyperproof_oauth_client_id,
      client_secret: hyperproofClientSecret,
      redirect_uri: getHyperproofRedirectUrl(fusebitContext)
    });
  if (!response.body.refresh_token) {
    response.body.refresh_token = currentRefreshToken;
  }
  return response.body;
};

/**
 * Returns a valid access token to Hyperproof for the given user in the given org.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param orgId Unique ID of the organization.
 * @param userId Unique ID of the Hyperproof user.
 * @param instanceType Optional instance type to use when reading the token.
 * @param retryOnFailedRefresh Whether or not we should retry if the refresh fails.
 */
export const ensureHyperproofAccessToken = async (
  fusebitContext: IFusebitContext,
  orgId: string,
  userId: string,
  instanceType?: InstanceType,
  retryOnFailedRefresh = true
): Promise<string> => {
  const userKey = formatUserKey(orgId, userId, instanceType);
  const userEntryKey = `${HYPERPROOF_USER_STORAGE_ID}/${userKey}`;
  const userEntry = await fusebitContext.storage.get(userEntryKey);
  if (!userEntry) {
    const errMessage = `No Hyperproof access token found for '${userEntryKey}'. The connection may have been deleted`;
    await Logger.error(errMessage);
    throw createHttpError(StatusCodes.UNAUTHORIZED, errMessage);
  }

  const hpUserContext: IHyperproofUserContext = userEntry.data;
  const hyperproofToken = hpUserContext.hyperproofToken;

  if (
    hyperproofToken.access_token &&
    (hyperproofToken.expires_at === undefined ||
      hyperproofToken.expires_at > Date.now() + ACCESS_TOKEN_EXPIRATION_BUFFER)
  ) {
    await Logger.info(
      `Returning current Hyperpoof access token for user ${userKey}`
    );
    return hyperproofToken.access_token;
  }

  if (!hyperproofToken.refresh_token) {
    const errMessage =
      'Hyperproof access token is missing or expired but no refresh token exists.';
    await Logger.error(errMessage);
    throw createHttpError(StatusCodes.UNAUTHORIZED, errMessage);
  }

  await Logger.info(
    `Hyperproof access token is missing or expired. Refreshing access token for user/${userId} in org/${orgId}.`
  );
  try {
    hpUserContext.hyperproofToken = await refreshHyperproofAccessToken(
      fusebitContext,
      hpUserContext
    );
  } catch (err: any) {
    // If we received a bad request result it may be because another thread
    // refreshed the token at the same time.  Catch this case and try again.
    if (err.status === StatusCodes.BAD_REQUEST && retryOnFailedRefresh) {
      await Logger.info(
        `Hyperproof access token is missing or expired. Refreshing access token for user/${userId} in org/${orgId}.`
      );
      return sleep(TOKEN_REFRESH_RETRY_DELAY).then(() => {
        return ensureHyperproofAccessToken(
          fusebitContext,
          orgId,
          userId,
          instanceType,
          false
        );
      });
    } else {
      throw err;
    }
  }
  setExpiresAt(hpUserContext.hyperproofToken);

  try {
    // Note that we provide no etag here. We always want to force-write the
    // new token because it matches what exists in the Hyperproof database.
    await fusebitContext.storage.put(
      { data: hpUserContext },
      `${HYPERPROOF_USER_STORAGE_ID}/${userKey}`
    );
  } catch (err: any) {
    // HYP-16748: If we got an error saving the token, raise an alert.
    await Logger.error(
      `OAuth Access Token Error: Got new access token from Hyperproof for organizations/${orgId}/users/${userId}, but save to storage failed with status: ${err.status}`,
      err
    );
    throw err;
  }

  return hpUserContext.hyperproofToken.access_token;
};

/**
 * Retrieves the list of vendorUserIds associated with a Hyperproof user.
 *
 * In a two-way connection the connector stores a reference under
 * /hyperproof-user which points to one or more vendor user tokens stored under
 * /vendor-user.  This function looks up those reference values.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param orgId Unique ID of the Hyperproof organization.
 * @param userId Unique ID of the Hyperproof user.
 * @param instanceType Optional instance type to use when reading the Hyperproof user data.
 */
export const getVendorUserIdsFromHyperproofUser = async (
  fusebitContext: IFusebitContext,
  orgId: string,
  userId: string,
  instanceType?: InstanceType
) => {
  const entry = await fusebitContext.storage.get(
    `${HYPERPROOF_USER_STORAGE_ID}/${formatUserKey(
      orgId,
      userId,
      instanceType
    )}`
  );
  if (!entry) {
    throw createHttpError(StatusCodes.UNAUTHORIZED, 'User is not authorized.');
  }

  // In the initial implementation we only supported one vendorUserId per Hyperproof
  // user.  We have since expanded to support multiple.  If we find an array of
  // vendorUserIds in storage return that.  Otherwise turn the old single vendorUserId
  // into an array and use that.  If the Hyperproof user ever adds a second connection
  // we will convert to the array form and delete the old vendorUserId.
  return entry.data.vendorUserIds
    ? entry.data.vendorUserIds
    : [entry.data.vendorUserId.toString()]; // See HYP-16740
};

/**
 * Adds a new vendorUserId link to an existing Hyperproof user storage entry.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param orgId Unique ID of the Hyperproof organization.
 * @param userId Unique ID of the Hyperproof user.
 * @param vendorUserId Vendor user ID to add.
 * @param instanceType Optional instance type to use when update the Hyperproof user.
 */
export const addVendorUserIdToHyperproofUser = async (
  fusebitContext: IFusebitContext,
  orgId: string,
  userId: string,
  vendorUserId: string,
  instanceType?: InstanceType
) => {
  const storageKey = `${HYPERPROOF_USER_STORAGE_ID}/${formatUserKey(
    orgId,
    userId,
    instanceType
  )}`;
  const entry = await fusebitContext.storage.get(storageKey);

  // If the Hyperproof user entry does not exist there is no work to do.
  // The link will be created when the Hyperproof token is stored in Fusebit.
  // See getHyperproofAccessToken.
  if (!entry) {
    return;
  }

  await Logger.info(
    `Adding vendor user ${vendorUserId} to user ${userId} in org ${orgId}.`
  );

  // In the initial implementation we only stored a single vendorUserId.  Convert
  // that entry to an array if we are adding a new vendor user link.
  const hpUserContext: IHyperproofUserContext = entry.data;
  const vendorUserIds = new Set(
    hpUserContext.vendorUserIds
      ? hpUserContext.vendorUserIds.map(id => id.toString())
      : [hpUserContext.vendorUserId!.toString()]
  );

  vendorUserIds.add(vendorUserId.toString());
  hpUserContext.vendorUserIds = [...vendorUserIds];
  delete hpUserContext.vendorUserId;

  await fusebitContext.storage.put(
    { data: hpUserContext, etag: entry.etag },
    storageKey
  );
};

/**
 * Removes a vendorUserId link from an existing Hyperproof user storage entry.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param orgId Unique ID of the Hyperproof organization.
 * @param userId Unique ID of the Hyperproof user.
 * @param vendorUserId Vendor user ID to remove.
 * @param instanceType Optional instance type to use when updating the Hyperproof user.
 */
export const removeVendorUserIdFromHyperproofUser = async (
  fusebitContext: IFusebitContext,
  orgId: string,
  userId: string,
  vendorUserId: string,
  instanceType?: InstanceType
) => {
  await Logger.info(
    `Removing vendor user ${vendorUserId} from user ${userId} in org ${orgId}.`
  );
  const storageKey = `${HYPERPROOF_USER_STORAGE_ID}/${formatUserKey(
    orgId,
    userId,
    instanceType
  )}`;
  const entry = await fusebitContext.storage.get(storageKey);
  if (!entry) {
    throw createHttpError(StatusCodes.UNAUTHORIZED, 'User is not authorized.');
  }

  const hpUserContext: IHyperproofUserContext = entry.data;
  if (hpUserContext.vendorUserIds) {
    hpUserContext.vendorUserIds = hpUserContext.vendorUserIds.filter(
      v => v !== vendorUserId
    );
  }

  await fusebitContext.storage.put(
    { data: hpUserContext, etag: entry.etag },
    storageKey
  );
};

/**
 * Deletes a Hyperproof user stored in connector storage.
 *
 * @param fusebitContext The Fusebit context of the request.
 * @param orgId Unique ID of the Hyperproof organization.
 * @param userId Unique ID of the Hyperproof user.?
 * @param instanceType Optional instance type which identifies the Hyperproof user to delete.
 */
export const deleteHyperproofUser = async (
  fusebitContext: IFusebitContext,
  orgId: string,
  userId: string,
  instanceType?: InstanceType
) => {
  // Notify Hyperproof that we are deleting the user but don't hold
  // up the actual delete for this--it isn't the end of the world if
  // we can't reach Hyperproof for some reason, nor is it all that
  // bad if Hyperproof fails to delete the token.
  try {
    await Logger.info(
      `Notifying Hyperproof that user is being deleted. org: ${orgId} user: ${userId} instanceType ${instanceType}`
    );
    const accessToken = await ensureHyperproofAccessToken(
      fusebitContext,
      orgId,
      userId,
      instanceType
    );
    await Superagent.delete(
      `${process.env.hyperproof_oauth_token_url}/organizations/${orgId}`
    )
      .send({ client_secret: hyperproofClientSecret })
      .set('Authorization', `Bearer ${accessToken}`);
  } catch (err: any) {
    await Logger.error(
      'Failed to notify Hyperproof that user is being deleted.',
      err
    );
  }

  return fusebitContext.storage.delete(
    `${HYPERPROOF_USER_STORAGE_ID}/${formatUserKey(
      orgId,
      userId,
      instanceType
    )}`
  );
};
