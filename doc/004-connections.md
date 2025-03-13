# Connections

A Hypersync connection is an object stored in Hyperproof that contains the information necessary to connect to an external service and obtain data from that service's API. The connection must adhere to the authentication and/or authorization rules for that service.

There are many different forms of authentication and authorization used by external services:

- Some REST APIs use [basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication) which requires an email and password formatted in a specific way.
- Other REST APIs require an API Key which is included as a header in each request.
- [OAuth 2.0](https://www.oauth.com/) APIs require that an access token be included in each request.
- Databases like SQL Server and MySQL generally require that a username and password be provided when a connection to the database is established.

In a Hypersync app, there are two types connections: [OAuth connections](#oauth-authorization) and [Custom authentication connections](#custom-authentication).

> **NOTE**
>
> The OAuth references in this document refer to the [OAuth 2.0 Authorization Code flow](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1).
> Services using the Authorization Code flow redirect the user in the browser to the service's
> authorization server, where the user signs in. The user is then presented with a consent form
> where they must explicitly grant authorization to the data stored in the service. After consent
> is granted, an access code is returned via redirect, which the target application may then use
> to obtain an access token.
>
> For services that use [OAuth 2.0's Client Credentials flow](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4),
> a [custom authentication connection](#custom-authentication) should be used.

> **NOTE: API Permissions**
>- Always use the minimum permissions necessary for proofs. Hypersyncs are read-only so use read-only permissions when possible.
>- Use minimum scopes when using OAuth. The Hypersync author is going to be asked to authorize one or more scopes. You only want to ask for what you need.

## OAuth Authorization

For services that use OAuth 2.0 for authorization, the Hypersync SDK includes functionality that obtains and manages the access tokens that these APIs require.

This flow asks the end user to authorize Hyperproof to perform various operations on their behalf. Behind the scenes Hyperproof turns the authorization into an access token used to make API calls. The user only has to complete the authorization flow once.

To configure a Hypersync app for OAuth authorization, begin by setting `authType` in `package.json` to `oauth`. See [Custom Hypersync App package.json Reference](./030-package-json-reference.md) for more information.

Next, make sure you have a `.env` file at the root of your project with the following values:

```
oauth_authorization_url=https://YOUR_EXTERNAL_SERVICE/oauth/v2/auth
oauth_token_url=https://YOUR_EXTERNAL_SERVICE/oauth/v2/token
oauth_scope=obj1.read obj1.update obj2.read obj2.update
oauth_extra_params=
oauth_client_id=YOUR_CLIENT_ID
oauth_client_secret=YOUR_CLIENT_SECRET
```

> Note that in the [Hypersync SDK Samples](https://github.com/Hyperproof/hypersync-sdk-samples) repository, all OAuth sample apps include a `.env.template` file that you can copy to `.env` and then customize for your needs.

Once you've configured your `.env` file, implement the `getUserProfle` method on your HypersyncApp class. This method returns an object containing information about the authorizing user.

```
  interface IMyServiceUser {
    userId: string;
    firstName: string;
    lastName: string;
  }

  async getUserProfile(tokenContext: OAuthTokenResponse) {
    const dataSource = new MyServiceDataSource(tokenContext.access_token);
    const serviceUser = await dataSource.getDataObject('currentUser');
    const userProfile: IMyServiceUser = {
      userId: serviceUser.id
      firstName: serviceUser.givenName,
      lastName: serviceUser.surname
    };
    return userProfile;
  }
```

Finally, implement the `getUserId` and `getUserAccountName` methods. `getUserId` used to uniquely identify the user within the external service. `getUserAccountName` returns a friendly name for the connection. This value is shown in the Connected Accounts page in Hyperproof.

> **IMPORTANT**: The user ID must be unique to the authorizing user!

```
  public async getUserId(userProfile: IMyServiceUser) {
    return userProfile.userId;
  }

  /**
   * Returns a human readable string which identifies the user's account.
   * This string is displayed in Hyperproof's Connected Accounts page to help the
   * user distinguish between multiple connections that use different accounts.
   *
   * @param userProfile The profile of the user returned by getUserProfile.
   */
  public getUserAccountName(userProfile: IMyServiceUser) {
    return `${userProfile.firstName} ${userProfile.lastName}`;
  }
```

## Custom Authentication

All non-OAuth authentication/authorization schemes are classified as "Custom" in the Hyperysnc SDK. If your service does not use OAuth 2.0, you should specify `custom` as your `authType` in `package.json`. See [Custom Hypersync App package.json Reference](./030-package-json-reference.md) for more information.

Custom auth covers any type of authentication where the user provides credentials to make a connection. Credentials can include user name/password, access key/secret key, API Token, and many others. Users may also need to designate the endpoint they’re connecting to - for example by providing a URL or a region.

Your apps' HypersyncApp class must be modified to support custom authentication. Begin by updating the `credentialsMetadata` field in the constructor:

```
  constructor() {
    super({
      appRootDir: __dirname,
      connectorName: 'My Service Connector',
      messages: Messages,
      credentialsMetadata: {
        instructionHeader: 'Please enter your My Service credentials',
        fields: [
          {
            name: 'username',
            type: CredentialFieldType.TEXT,
            label: 'User Name'
          },
          {
            name: 'password',
            type: CredentialFieldType.PASSWORD,
            label: 'Password'
          }
        ]
      }
    });
  }
```

The instruction header along with each of the fields will be shown to the user when they attempt to create a connection to your service.

Next, implement the `validateCredentials` method. This method will be called by Hyperproof as soon as the user provides the credentials and clicks Next.

```
  interface IMyServiceUser {
    firstName: string;
    lastName: string;
  }

  public async validateCredentials(
    credentials: CustomAuthCredentials
  ): Promise<IValidatedUser<IMyServiceUser>> {
    try {
      // Get the username and password provided by the user.
      const { username, password } = credentials as {
        [key: string]: string;
      };

      // TODO: Connect to My Service and validate credentials.  Then
      // retrieve identifying information for the user (e.g. through
      // some sort of /users/me route).
      const userDetails = ...

      return {
        userId: username as string,
        profile: {
          firstName: userDetails.givenName,
          lastName: userDetails.surname
        }
      };
    } catch (err) {
      Logger.debug('My Service credentials validation failed.');
      Logger.debug(err);
      throw createHttpError(
        StatusCodes.UNAUTHORIZED,
        'Invalid Credentials'
      );
    }
  }
```

Finally, implement the `getAccountName` method which returns a friendly name for the connection. This value is shown in the Connected Accounts page in Hyperproof.

```
  public getUserAccountName(userProfile: IMyServiceUser) {
    return `${userProfile.firstName} ${userProfile.lastName}`;
  }

```

<br></br>
[Return to Table of Contents](./000-toc.md)
