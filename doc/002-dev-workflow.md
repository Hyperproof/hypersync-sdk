# App Development Workflow

To easiest way to get started with the Hypersync SDK is to start with one of the sample apps in the [Hypersync SDK Samples GitHub Repository](https://github.com/Hyperproof/hypersync-sdk-samples). This article will show you how to install and update the [Open Library sample app](https://github.com/Hyperproof/hypersync-sdk-samples/tree/main/apps/open-library) in that repository. Once you have completed the steps below, you should have a good idea of the development workflow for your own custom Hypersync apps.

> NOTE: The Open Library Hypersync app imports book and author information from a the public [Open Library API](https://openlibrary.org/developers/api). This Hypersync app has been provided for illustrative purposes only--you wouldn't generally use this sort of information in a compliance program.

## Importing using the Hyperproof CLI

Custom Hypersync apps are added to a Hyperproof organization using the [Hyperproof CLI](./hyperproof-cli.md). Please install the CLI for your operating system now if you haven't already.

### CLI Authorization

After installing the CLI, you will first need to sign in using this command:

```
hp signin
```

This command will launch a new browser window and allow you to sign in (if you are not already signed in) and then authorize CLI access to your Hyperproof organization.

> NOTE: If you are a member of more than one organization, you will be asked to choose the organization on the authorization screen. Make sure you choose your development organization.

### Importing Your Hypersync App

Once you have signed in and authorized the CLI, you are ready to import your custom app. Begin by making a copy of the Open Library folder.

1. Find the `apps/open-library/` directory in your clone of the Hypersync SDK Samples repository.
2. Make a copy of that folder somewhere else on your computer. Feel free to rename the folder if that helps.
3. In your terminal window, navigate to the root of your new folder.
4. Make sure the package dependencies are installed:

```
yarn install
```

5. Next, since the Open Library sample is written in TypeScript, you will need to build the project:

```
yarn build
```

6. Import the Open Library Hypersync app using this command:

```
hp customapps import -d .
```

At this point you will see console output like this:

```
janedoe:mycomputer:~/code/open-library:$ hp customapps import -d .
Creating a new custom app................
Custom app import complete.
```

The import might take a minute or two to complete. Once it is done, you are ready to try your app in Hyperproof.

### Using a Your Hypersync App

1. In the browser, navigate to <https://hyperproof.io> and sign into your development organization.
2. Navigate to any Control or Label that you have permissions to access.
3. Click on the **Automations** tab.
4. Click the **+New Hypersync** button.

At this point the New Hypersync wizard will appear. All of the built-in Hypersyncs will be shown at the top of the first page. If you scroll down you should see the custom Open Library Hypersync app at the bottom of the list.

You can use this new app icon to build a new Hypersync.

1. Click the **Open Library** icon.
2. On the **Create Connection** page, click **Next**.

> Because the Open Library API is anonymous, there is no need for you to provide any credentials like you will in most other Hypersyncs.

3. Choose **Books by Author** as the proof type.
4. Type "Gibson, William" into the search field.
5. Choose "William F. Gibson" from the **Author** list.
6. Click **Next**.
7. On the **Configure Workflow** page, choose **New Files**.
8. Click **Next**.
9. Click **Save and Sync**.

At this point your custom app will retrieve the list of books written by William F. Gibson and then generate a PDF showing you those books.

### Updating Your Hypersync App

Because custom Hypersync apps are just Node.js modules, updating them is a straightforward process. Additionally, many of the elements inside a Hypersync app can be represented as easy-to-edit JSON files. It is often possible to make the changes you need just by editing these files--no code required!

Once you've made changes to your app, you are just a couple of steps away from publishing those updates to your Hyperproof organization.

1. Using the text editor of choice, edit the `decl/proof/booksByAuthor.json` file in your Open Library project.

   > This `.json` file describes one proof type in the Open Library application.

2. Find the `key` property block. Move it down after the `updated` property block.

```
...
      {
        "property": "updated",
        "label": "{{messages.LABEL_UPDATED}}",
        "width": "100px",
        "type": "text"
      },
      {
        "property": "key",
        "label": "{{messages.LABEL_KEY}}",
        "width": "200px",
        "type": "text"
      }
```

3. Save `booksByAuthor.json`.
4. In the terminal window run:

```
yarn build
```

5. Finally, run this command to update your custom app in Hyperproof:

```
hp customapps import .
```

That's it! You've just made your first edit to an installed Hypersync app.

If you navigate to Hyperproof in the browser and then re-run the Hypersync that you created earlier, you will notice that the Key column now appears on the right side of the table.

## Uninstalling Your App

The Hyperproof CLI makes uninstalling your app is as simple as installing.

1. Run this command to see a list of the custom Hypersync apps you have installed:

```
hp customapps list
```

2. Copy the ID value of the app that you want to uninstall.
3. Run this command to uninstall the app.

```
hp customapps delete --id <ID>
```

Note that when a custom Hypersync app is uninstalled it is no longer available to your users in the New Hypersync wizard. But all of the proof that has been previously brought in by Hypersyncs created with the app will remain in the organization.

<br></br>
[Return to Table of Contents](./000-toc.md)
