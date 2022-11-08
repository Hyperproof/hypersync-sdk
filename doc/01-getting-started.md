# Getting Started

The Hypersync SDK makes it easy to create a custom Hypersync application that can be used to bring data from external services into Hyperproof.

Every Hypersync app is a [Node.js](https://nodejs.org/en/) [module](https://nodejs.org/api/modules.html) that is installed into your Hyperproof organization using the [Hyperproof CLI](./hyperproof-cli.md). Once installed, your custom Hypersync app can be used by anyone in your organization to create a connection to the external service and bring data into Hyperproof.

## Prerequisites

To use the Hypersync SDK you will need a Windows, Mac or Linux machine with Node.JS version 16 or later. You will also need to install the [Hyperproof CLI](./hyperproof-cli.md).

For development purposes you will also probably want to create a development organization in Hyperproof. This will allow you to to develop and test your custom Hypersyncs in isolation without affecting the users in your production organization. To create a development organization contact Hyperproof Customer Support at <support@hyperproof.io>.

Finally, we recommend cloning the [hypersync-samples GitHub repository](https://github.com/Hyperproof/hypersync-samples). This is a public repository available on GitHub.com.

## Installing Your First Hypersync App

To easiest way to get started with the Hypersync SDK is to start with one of the samples or templates in the @hyperproof/hypersync-samples GitHub repository.

- Samples are complete Hypersync apps that can be used to bring data from an external service into Hyperproof. Using the Hyperysnc SDK you can customize these samples to meet your needs. The hypersync-samples repository contains samples for Jira, GitHub (**LIST TBD**) and other services. Your will find the samples in the `/samples` directory.

- Templates provide you with the foundation of a Hyperync app and are a great starting point if you are targeting a service for which there is no sample, or if you want to start with a clean slate. Templates can be found in the `/templates` directory.

Once you have decided on the sample or template that you want to start with, follow these steps to install the app into your development organization:

1. Copy the sample or template to another folder on your computer. Feel free to rename the folder if that helps.
2. From the command line run `hp login` to authorize the Hyerproof CLI to access your develoment organization. IMPORTANT: When the authorization screen appears make sure you choose your develoment organization from the dropdown.
3. Change to the directory (`cd`) of your new folder.
4. Next run this command to install the custom Hypersync app.

```
hp customapps import .
```

At this point you will see console output like this:

```
TODO: Include sample output
```

The import might take a minute or two to complete. Once it is done, you are ready to try your app in Hyperproof.

1. In the browser, navigate to <https://hyerproof.io> and sign into your devleopment organization.
2. Navigate to any Control or Label that you have permissions to access.
3. Click on the **Automations** tab.
4. Click the **+New Hypersync** button.

At this point the New Hypersync wizard will appear. All of the built-in Hypersyncs will be shown at the top of the first page. If you scroll down you should see your custom Hypersync app at the bottom of the list. Success!

You can click your custom apps icon to start the process of creating a new Hyperysnc just like you do with the built-in apps.

- If you started with a sample you will be asked to connect to the service first, then choose a proof type and optionally provide some parameters.
- If you started with a template you will be able to see the sample connection screen but won't be able to progress much further than that. Templates need further customization to be used.

## Updating Your Hypersync Application

Whether you started with a sample or template you will almost certainly want to make changes and then publish those changes back to Hyperproof. The Hypersync SDK and Hyperproof CLI make this relatively painless.

1. Using the text editor of choice, edit the `package.json` file at the root of the project.
2. Change the `category` of the app to something different. Any category will do.
3. Save `package.json`.
4. Run the following command to see a list of the apps you have installed:

```
hp customapps list
```

5. There should be only one item in the list--the app you installed a few minutes ago. Copy the ID value of the application.
6. Run this command to update your custom app in Hyperproof:

```
hp customapps import .
```

That's it! You've just made your first edit to an installed Hypersync app. If you navigate to Hyperproof in the browser you will see that your custom category now shows up in the New Hyperysnc wizard underneath the name of your app.

## Uninstalling Your Application

Uninstalling your app is as simple as installing.

1. Run this command to see a list of hte apps you have installed:

```
hp customapps list
```

2. Copy the ID value of the application.
3. Run this command to uninstall the app.

```
hp customapps delete <ID>
```

Note that when a custom Hypersync app is uninstalled it is no longer available to your users in the New Hypersync wizard. But all of the proof that has been previously brought in by Hypersyncs created with the app will remain in the organization.
