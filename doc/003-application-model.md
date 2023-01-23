# Application Model

A Hypersync app is a [Node.js](https://nodejs.org/en/) [module](https://nodejs.org/api/modules.html) that connects to an external service, extracts some data, and then packages that data in a specific format so that it can be imported into Hyperproof as proof. Hypersyncs are composed in a specific way so that they work well in the Hyperproof ecosystem. The sections below will give you more information Hypersync apps are constructed and how they operate.

## Code vs. No-Code

Because Hypersync apps are Node.JS modules, they can be built up entirely by writing code. If you are comfortable with TypeScript or JavaScript, and you have knowledge of web technologies like HTTP, REST APIs, etc., building a custom Hypersync app should be relatively straightforward. We have made every attempt to provide you with a modern framework that follows the best practices for Node.JS.

If you are less comfortable with coding, many parts of a custom Hypersync app can be built without writing code. The Hypersync SDK makes it possible to declare how your Hypersync app shoud behave using structured JSON files. You can use these JSON files in your app to:

- Access new REST APIs
- Provide additional criteria options to your users
- Make new proof types available in your Hypersync

In this version of the SDK there are some things which require a bit of code. So if you are starting from one of our templates or from scratch, you will almost certainly have to write some code. But if you are starting from one of our end-to-end samples, we have made every effort to allow you to extend those samples using JSON--without writing a line of code!

Whether you are writing code, extending declaratively, or a little bit of both, the information below will help you to undestand how Hypersync apps work.

## Hypersync App Components

Every Hypersync app is made up of these key components:

- A data source: Connects to an external service and extracts data from that service.
- One or more proof types: Can be selected by the user to bring a specific type of data into Hyperproof from the external service.
- An optional criteria provider that specifies the criteria that must be provided by the user to properly locate and filter the data in the generated proof.

Bringing these components all together is the Hypersync app itself which exposes an interface that allow it to integrate into the Hypersync ecosystem.

![Hypersync App Components](images/architecture.png?raw=true 'Hypersync App Components')

## Data Flow

When a Hyperproof user creates a new Hypersync, they must first select an app. Once they have selected the app, they are prompted to create a connection to the external service. In some cases creating a connection involves providing an email and password to the external service. In other cases, an API key must be provided in order to access the external API. Additional services may require the use of [OAuth 2.0](https://www.oauth.com/) to authorize the user.

Once the user has provided the necessary information, the connection is created and stored in Hyperproof. For more information on how connections are created and managed see [Connections](./004-connections.md).

Once the connection is established, the user is presented with a list of proof types which allow them to specify the kind of data that they are interested in. Each proof type will generally have associated criteria fields that are used to filter the data in the generated proof. Additionally, it is often the case that the same criteria field is used across multiple proof types. The criteria provider component is responsible for managing these criteria fields. It is possible to write a custom criteria provider in a Hypersync app, but most often it is sufficient to declare the fields in a JSON file. See [Criteria](./007-criteria.md) for more information.

Once the user has chosen a proof type, specified the criteria, and then saved the Hypersync, the Hypersync will be instructed to sync for the first time. Using the [data source](./005-data-sources.md) component, the Hypersync app retrieves the data from the external service and parameterizes it using the provided criteria. Once the data has been retrieved it is formatted as specified by the proof type. This formatting can either be done in code, or without code using a declarative JSON file. See [Proof Types](./006-proof-types.md) for more information on proof types.

<br></br>
[Return to Table of Contents](./000-toc.md)
