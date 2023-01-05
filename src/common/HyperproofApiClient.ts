import Sdk, { FusebitContext } from '@fusebit/add-on-sdk';
import FormData from 'form-data';
import createHttpError from 'http-errors';
import mime from 'mime';
import fetch, { HeadersInit } from 'node-fetch';
import path from 'path';
import queryString from 'query-string';
import {
  HttpHeader,
  HttpMethod,
  InstanceType,
  MimeType,
  ObjectType
} from './enums';
import { ensureHyperproofAccessToken } from './hyperproofTokens';
import { Logger } from './Logger';
import {
  ICommentBody,
  IExternalUser,
  IIntegrationSettingsBase,
  ITaskPatch
} from './models';

const BYTES_IN_KILOBYTE = 1024;
const BYTES_IN_MEGABYTE = BYTES_IN_KILOBYTE * BYTES_IN_KILOBYTE;
const MAX_FILE_SIZE = 100 * BYTES_IN_MEGABYTE;
const TXT_EXTENSION = 'txt';

/**
 * Client interface to the Hyperproof API.
 */
export class HyperproofApiClient {
  private static subscriptionKey?: string =
    process.env.hyperproof_api_subscription_key;
  private accessToken: string;

  private constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  public static setSubscriptionKey(subscriptionKey: string) {
    this.subscriptionKey = subscriptionKey;
  }

  /**
   * Factory method that creates a new HyperproofApiClient instance.
   */
  public static async createInstance(
    fusebitContext: FusebitContext,
    orgId: string,
    userId: string,
    instanceType?: InstanceType
  ) {
    if (!HyperproofApiClient.subscriptionKey) {
      throw new Error('Hyperproof API subscription key not set');
    }

    await Logger.debug(
      `Creating Hyperproof API client using URL ${process.env.hyperproof_api_url}`
    );

    const accessToken = await ensureHyperproofAccessToken(
      fusebitContext,
      orgId,
      userId,
      instanceType
    );

    return new HyperproofApiClient(accessToken);
  }

  /**
   * Retrieves an integration settings instance in Hyperproof.
   */
  public async getOrgIntegrationSettings(integrationId: string) {
    return this.getIntegrationSettings(integrationId);
  }

  public async getIntegrationSettings(
    integrationId: string,
    objectType?: ObjectType,
    objectId?: string,
    forSynchronization?: boolean
  ) {
    const query = queryString.stringify({ forSynchronization });
    let url = `${process.env.hyperproof_api_url}/beta`;
    if (objectType && objectId) {
      url += `/${objectType}s/${objectId}`;
    }
    url += `/integrations/${integrationId}?${query}`;

    const response = await fetch(url, {
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey
      } as HeadersInit
    });

    Sdk.debug(`GET ${url} - ${response.status}`);

    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Updates an integration settings instance from Hyperproof.
   */
  public async updateIntegrationSettings(
    objectType: ObjectType,
    objectId: string,
    integrationId: string,
    settings: IIntegrationSettingsBase,
    suffix?: string
  ) {
    let url = `${process.env.hyperproof_api_url}/beta`;
    if (objectType && objectId) {
      url += `/${objectType}s/${objectId}`;
    }
    url += `/integrations/${integrationId}`;
    if (suffix) {
      url += `/${suffix}`;
    }
    const response = await fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(settings),
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });

    Sdk.debug(`PATCH ${url} - ${response.status}`);

    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }
    try {
      return await response.json();
    } catch (err) {
      // swallow for 204;
    }
  }

  /**
   * Creates an integration settings instance from Hyperproof.
   */
  public async createIntegrationSettings(
    settings: IIntegrationSettingsBase,
    objectType?: ObjectType,
    objectId?: string
  ) {
    let url = `${process.env.hyperproof_api_url}/beta`;
    if (objectType && objectId) {
      url += `/${objectType}s/${objectId}`;
    }
    url += `/integrations`;
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(settings),
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });

    Sdk.debug(`POST ${url} - ${response.status}`);

    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Posts a proof file to a Hyperproof organization or object.
   *
   * @param file File to upload.
   * @param filename Name of the file.
   * @param mimeType MIME type for the file.
   * @param objectType Type of object to which the file should be uploaded.
   * @param objectId Unique ID of the object.
   * @param sourceId (optional) id of the source of the proof
   * @param sourceFileId (optional) id of file in source
   * @param sourceModifiedOn (optional) ISO8601 date representing when this piece of proof was modified in the source
   * @param user (optional) External user that is uploading this proof
   * @param size (optional) Size of the file being uploaded.
   */
  public async postProof(
    file: Buffer,
    filename: string,
    mimeType: string,
    objectType: ObjectType,
    objectId: string,
    sourceId?: string,
    sourceFileId?: string,
    sourceModifiedOn?: string,
    user?: IExternalUser,
    size?: number
  ) {
    const formData = this.buildProofFormData(
      file,
      filename,
      mimeType,
      sourceId,
      sourceFileId,
      sourceModifiedOn,
      user,
      size
    );

    return this.postNewProof(objectType, objectId, formData);
  }

  public async postProofVersion(
    file: Buffer,
    filename: string,
    mimeType: string,
    proofId: string,
    sourceId: string,
    sourceFileId: string,
    sourceModifiedOn?: string,
    user?: IExternalUser,
    size?: number
  ) {
    const formData = this.buildProofFormData(
      file,
      filename,
      mimeType,
      sourceId,
      sourceFileId,
      sourceModifiedOn,
      user,
      size
    );

    const url = `${process.env.hyperproof_api_url}/beta/proof/${proofId}/versions`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]:
          process.env.hyperproof_api_subscription_key!
      }
    });
    Sdk.debug(`POST ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }
    return response.json();
  }

  /**
   * Retrieves the task statuses for Hyperproof org.
   */
  public async getTaskStatuses() {
    const url = `${process.env.hyperproof_api_url}/beta/taskstatuses`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });
    Sdk.debug(`GET ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Updates a hyperproof task
   *
   * @param objectId Unique ID of the task.
   * @param patch Updates to patch task with
   */
  public async patchTask(objectId: string, patch: ITaskPatch) {
    const url = `${process.env.hyperproof_api_url}/beta/tasks/${objectId}`;
    if (patch.externalUser && !patch.externalUser.id) {
      delete patch.externalUser;
    }
    const response = await fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });
    Sdk.debug(`POST ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Retrieves a hyperproof task
   *
   * @param objectId Unique ID of the task.
   */
  public async getTask(objectId: string) {
    const url = `${process.env.hyperproof_api_url}/beta/tasks/${objectId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });
    Sdk.debug(`GET ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Gets metadata of task proof
   *
   * @param objectId Unique ID of the task this proof is associated with.
   * @param sourceFileId Unique ID of the proof in the external system.  Optional.
   */
  public async getTaskProofMeta(objectId: string, sourceFileId?: string) {
    const query = queryString.stringify({ sourceFileId });
    const url = `${process.env.hyperproof_api_url}/beta/tasks/${objectId}/proof?${query}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });
    Sdk.debug(`POST ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Unlinks proof linked to a task based on a sourceFileId
   *
   * @param objectId Unique ID of the task this proof is associated with.
   * @param sourceFileId Unique ID of the proof in the external system
   * @param user External user who performed the unlink.
   */
  public async archiveTaskProofLink(
    objectId: string,
    sourceFileId: string,
    user: IExternalUser
  ) {
    const proofMeta = await this.getTaskProofMeta(objectId, sourceFileId);
    const results = [];
    for (const proof of proofMeta) {
      const url = `${process.env.hyperproof_api_url}/beta/proof/${proof.id}/links/${objectId}/archive?objectType=task`;
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(user),
        headers: {
          [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
          [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
          [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
        } as HeadersInit
      });

      if (!response.ok && response.status !== 404) {
        throw createHttpError(response.status, await response.text());
      }
      const proofArchive = await response.json();
      results.push(proofArchive);
    }
    return results;
  }
  /**
   * Gets the comments in an object's activity feed
   *
   * @param objectType Type of the object
   * @param objectId Unique ID of the object
   */
  public async getComments(objectType: ObjectType, objectId: string) {
    const url = `${process.env.hyperproof_api_url}/beta/${objectType}s/${objectId}/comments`;
    const response = await fetch(url, {
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey
      } as HeadersInit
    });

    Sdk.debug(`GET ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Posts a comment to the target object's activity feed
   *
   * @param commentBody - Contains information about the comment to be posted.
   * @param objectType Type of the object
   * @param objectId Unique ID of the object
   * @param parentObjectType Optional - Type of the parent object
   * @param parentObjectId Optional - Unique ID of the parent object
   */
  public async postComment(
    commentBody: ICommentBody,
    objectType: ObjectType,
    objectId: string,
    parentObjectType?: ObjectType,
    parentObjectId?: string
  ) {
    return this.sendCommentRequest(
      commentBody,
      HttpMethod.POST,
      objectType,
      objectId,
      parentObjectType,
      parentObjectId
    );
  }

  /**
   * Patches a comment to the target object's activity feed based on id of activity in hyperproof or sourceCommentId from external source
   *
   * @param commentBody - contains appId, commentTextFormatted, externalUser (author), mentionedExternalUsers, sourceCommentId, sourceUpdatedOn
   * @param objectType Type of the object
   * @param objectId Unique ID of the object
   * @param commentId - If patch is of a specific comment (to add a sourceId after syncing)
   */
  public async patchComment(
    commentBody: ICommentBody,
    objectType: ObjectType,
    objectId: string,
    commentId?: string
  ) {
    return this.sendCommentRequest(
      commentBody,
      HttpMethod.PATCH,
      objectType,
      objectId,
      undefined, // parentObjectType not used
      undefined, // parentObjectId not used
      commentId
    );
  }

  /**
   * Gets user object for current user
   *
   */
  public async getMe() {
    const url = `${process.env.hyperproof_api_url}/v1/users/me`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });
    Sdk.debug(`GET ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  private async postNewProof(
    objectType: ObjectType,
    objectId: string,
    formData: FormData
  ) {
    let url = `${process.env.hyperproof_api_url}`;
    if (objectType === ObjectType.TASK) {
      url += `/beta`;
    } else {
      url += '/v1';
    }
    if (objectType !== ObjectType.ORGANIZATION) {
      url += `/${objectType}s/${objectId}/proof`;
    } else {
      url += `/proof`;
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey
      } as HeadersInit
    });
    Sdk.debug(`POST ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Updates or creates a comment in the target object's activity feed
   *
   * @param commentBody - contains appId, commentTextFormatted, externalUser (author), mentionedExternalUsers, sourceCommentId, sourceUpdatedOn
   * @param method - POST or PATCH
   * @param objectType Type of the object
   * @param objectId Unique ID of the object
   * @param parentObjectType Optional - Type of the parent object
   * @param parentObjectId Optional - Unique ID of the parent object
   * @param commentId Optional - Unique id of comment in source system (i.e. in hyperproof or in jira)
   */
  private async sendCommentRequest(
    commentBody: ICommentBody,
    method: HttpMethod,
    objectType: ObjectType,
    objectId: string,
    parentObjectType?: ObjectType,
    parentObjectId?: string,
    commentId?: string
  ) {
    const parentPrefix =
      parentObjectType && parentObjectId
        ? `${parentObjectType}s/${parentObjectId}/`
        : '';
    let url = `${process.env.hyperproof_api_url}/beta/${parentPrefix}${objectType}s/${objectId}/comments`;
    if (commentId) {
      url += `/${commentId}`;
    }
    const response = await fetch(url, {
      method,
      body: JSON.stringify({
        ...commentBody,
        objectType,
        objectId
      }),
      headers: {
        [HttpHeader.Authorization]: `Bearer ${this.accessToken}`,
        [HttpHeader.SubscriptionKey]: HyperproofApiClient.subscriptionKey,
        [HttpHeader.ContentType]: MimeType.APPLICATION_JSON
      } as HeadersInit
    });
    Sdk.debug(`${method} ${url} - ${response.status}`);
    if (!response.ok) {
      throw createHttpError(response.status, await response.text());
    }
    return response.json();
  }

  private formatFilename(filename: string, mimeType: string) {
    const { name: nameWithoutExtension, ext: existingExtension } =
      path.parse(filename);
    const mimeForExistingExtension =
      existingExtension && mime.getType(existingExtension);

    if (mimeForExistingExtension !== mimeType) {
      const fileExtension = mime.getExtension(mimeType);
      // we special case csv, jira sometimes gives us the wrong mime type (text/plain)
      // even though the extension is csv. If the file extension is csv it's okay to ignore
      // this check and just process as a csv. See: HYP-17979 for more context
      if (
        mimeForExistingExtension === MimeType.CSV_MIME &&
        fileExtension === TXT_EXTENSION
      ) {
        mimeType = mimeForExistingExtension;
      } else {
        // otherwise we replace the extension with the extension that maps to its mime type
        if (fileExtension && !filename.endsWith(fileExtension)) {
          filename = `${nameWithoutExtension}.${fileExtension}`;
        }
      }
    }

    // Escaping other special characters is not necessary since the export will sanitize
    // the filename
    return { filename: filename.replace(/\//g, ' '), mimeType };
  }

  private buildProofFormData(
    file: Buffer,
    filename: string,
    mimeType: string,
    sourceId?: string,
    sourceFileId?: string,
    sourceModifiedOn?: string,
    user?: IExternalUser,
    size?: number
  ) {
    if (size && Number(size) >= MAX_FILE_SIZE) {
      const err = new Error(
        `Proof from source ${sourceId} is larger than max file size.`
      );
      Sdk.debug(err.message);
      throw err;
    }

    const fileResults = this.formatFilename(filename, mimeType);
    filename = fileResults.filename;
    mimeType = fileResults.mimeType;

    const formData = new FormData();
    formData.append('proof', file, { filename, contentType: mimeType });
    if (sourceId) {
      formData.append('hp-proof-source-id', sourceId);
    }
    if (sourceFileId) {
      formData.append('hp-proof-source-file-id', sourceFileId);
    }
    if (sourceModifiedOn) {
      formData.append('hp-proof-source-modified-on', sourceModifiedOn);
    }
    if (user) {
      formData.append('hp-proof-ext-user-id', user.id);
      formData.append('hp-proof-ext-user-given-name', user.givenName);
      formData.append('hp-proof-ext-user-surname', user.surname);
      if (user.email) {
        formData.append('hp-proof-ext-user-email', user.email);
      }
      if (user.resource) {
        formData.append('hp-proof-ext-user-resource', user.resource);
      }
    }

    return formData;
  }
}

export const createHyperproofApiClient = async (
  fusebitContext: FusebitContext,
  orgId: string,
  userId: string,
  instanceType?: InstanceType
) => {
  return HyperproofApiClient.createInstance(
    fusebitContext,
    orgId,
    userId,
    instanceType
  );
};
