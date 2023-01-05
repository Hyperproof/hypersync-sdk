# Application Model

A Hypersync app is a [Node.js](https://nodejs.org/en/) [module](https://nodejs.org/api/modules.html) that connects to an external service, extracts some data, and then packages that data in a specific format so that it can be imported into Hyperproof as a proof file. Hypersyncs are composed in a specific way so that they work well in the Hyperproof ecosystem. The sections below will give you more information Hypersync apps are constructed and how they operate.

## Imperative vs. Declarative

Because Hypersync apps are Node.JS modules, they can be built up entirely by writing code if you are comfortable with JavaScript/TypeScript, HTTP, REST APIs, etc. We have endeavored to provide you with a modern framework that follows the best practices for Node.JS.

If you are less comfortable with coding and/or these technologies, many parts of a Hypersync application can be build up declaratively. What this means is that if you are familiar with JSON, it is possible to create and edit JSON files in your application to:

- Access new REST APIs
- Provide additional criteria options to your users
- Make new proof types available in your Hypersync

In this version of the SDK there are some things which can't be done declaratively. So if you are starting from one of our templates or from scratch, you will almost certainly have to write some code. But if you are starting from one of our end-to-end samples, we have made every effort to allow you to extend those samples declaratively--without writing a line of code!

Whether you are writing code, extending declaratively, or a little bit of both, the information below will help you to undestand how Hypersync apps work.

## Hypersync App Components

Every Hypersync app is made up of these key components:

- A data source: Connects to an external service and extracts data from that service.
- Proof providers: Formats data provided by the data source into meaningful PDF and XLSX proof files
- An optional criteria provider that specifies the criteria that must be provided by the user to properly locate and filter the data in the generated proof.

Bringing these components all together is the Hypersync app itself which exposes an interface that allow it to integrate into the Hypersync ecosystem.

![Hypersync App Components](images/architecture.png?raw=true 'Hypersync App Components')

<br></br>
[Return to Table of Contents](./000-toc.md)
