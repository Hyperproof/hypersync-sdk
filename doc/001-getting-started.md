# Getting Started

The Hypersync SDK makes it easy to create a custom Hypersync app that can be used to bring data from external services into Hyperproof.

Every Hypersync app is a [Node.js](https://nodejs.org/en/) [module](https://nodejs.org/api/modules.html) that is installed into your Hyperproof organization using the [Hyperproof CLI](./hyperproof-cli.md). Once installed, your custom Hypersync app can be used by anyone in your organization to create a connection to the external service and bring data into Hyperproof.

## Prerequisites

To use the Hypersync SDK you will need a Windows, Mac or Linux computer with a few software packages installed.

Since each Hypersync is a Node.js module, you will need to have Node.js installed in order to build custom Hypersyncs. The Hypersync platform uses Node.js version 16 which you can install here:

- [Node JS version 16](https://nodejs.org/download/release/v16.18.1/).

You will also need to install the yarn package manager using the link below.

- [yarn package manager](https://yarnpkg.com/)

Finally, you will need to install the Hyperproof CLI to publish and manage your custom Hypersyncs:

- [Hyperproof CLI](./hyperproof-cli.md)

Finally, we recommend cloning the [Hypersync SDK Samples GitHub repository](https://github.com/Hyperproof/hypersync-sdk-samples). This is a public repository available on GitHub.com.

- The samples repository contains several complete Hypersync apps that can be used to bring data from an external service into Hyperproof. Using the Hyperysnc SDK you can customize these samples to meet your needs. The hypersync-sdk-samples repository contains samples for MySQL, Zoho and other services. Your will find the these Hypersync apps in the `/apps` directory.

- The samples repository also includes a handful of templates to get you started building your own Hypersyncs from scatch. Templates can be found in the `/templates` directory. See the `README.md` files in each template directory for more information on using the templates.

## Development Organization

For development purposes you will also want to create a development organization in Hyperproof. This will allow you to to develop and test your custom Hypersyncs in isolation without affecting the users in your production Hyperproof organization. To create a development organization, contact Hyperproof Customer Support at <support@hyperproof.io>.

## Next Steps

Once you have installed the prerequisites and obtained a development organization, you are ready to install your first custom HypersyncApp. Follow the guidance in [App Development Workflow](./002-dev-workflow.md) to install, use and update one of the pre-built sample apps in the Hypersync SDK Samples repo.

<br></br>
[Return to Table of Contents](./000-toc.md)
