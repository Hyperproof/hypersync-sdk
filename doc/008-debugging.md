# Debugging

As you are developing your custom Hypersync app you may find that your app isn't working the way that you intended. In these situations you will need to debug your app to figure out what is going wrong.

The Hypersync SDK provides a logging infrastructure that will allow you to monitor your app as it executes. This can be an effective means of debugging many problems.

The Network tab in your browser's Developer Tools area can also be helpful.

## Logging

The SDK provides a `Logger` class that you can use to write out logging information as your app runs. The Logger class has four logging methods that differ only in the severity that is attached to the log output:

```
Logger.debug(message, detail)
Logger.info(message, detail)
Logger.warn(message, detail)
Logger.error(message, detail)
```

Each of these methods are async (i.e. they return a `Promise`) so to use them you will generally want to use the `await` keyword. e.g.:

```
await Logger.info('Creating my data source.');
```

The SDK itself also uses the `Logger` class internally so even if you have little to no logging in your code, the `Logger` statements in the SDK will provide some diagnostic information.

To view the logs as your app is executing, you must first obtain your app's ID. You can get this with the following Hyperproof CLI command:

```
hp customapps list
```

Once you have your app's ID in hand, use this CLI command to view a live stream of the logs:

```
hp customapps logs --id <MY_APP_ID>
```

While the `logs` command is running, actions performed on your app in Hyperproof (e.g. creating a new Hypersync, synchronizing, etc.) will produce logging output in your terminal window. Note that there may be a short delay between the execution of the `Logger` statement and the displaying of that value in the terminal.

To exit the `logs` command, press escape or Ctrl-C.

## Browser Network Tab

All supported browsers have a Developer Tools feature that can also be helpful when diagnoting problems with your app.

When you encounter an unexpectd problem using your app, open the Developer Tools and navigate to the Network tab. Once you've done that, repeat the operation and look for network calls that are flagged as errors (shown in red in Google Chrome for example). You can inspect the response bodies of these requests to learn more about what failed.
