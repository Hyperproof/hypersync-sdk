# Hypersync SDK Migration Guide

## Version 2.X to Version 3.0

Version 3.0 of the Hypersync SDK includes a number of new capabilities that
require small changes to Hypersync apps that use version 2.1 or earlier.

### Package Versions

The Hypersync SDK functionality is distributed via three Node packages:

| Package                      | Version | Description                 |
| ---------------------------- | ------- | --------------------------- |
| @hyperproof/hyperysnc-sdk    | 3.0.2   | Core Hypersync SDK          |
| @hyperproof/hypersync-models | 5.0.0   | Supporting Hypersync models |
| @hyperproof/integration-sdk  | 1.0.2   | Common integration elements |

All of the functionality needed to develop Hypersync applications is now
exported from `@hyperproof/hypersync-sdk`.  There is no longer a need to
include dependencies to `@hyperproof/hypersync-models` or `@hyperproof/integration-sdk`.

The `dependencies` section of your app's `package.json` file should be updated as follows:

```
  "dependencies": {
    "@hyperproof/hypersync-sdk": "^3.0.2",
    ...
  }
```

If your code imported classes, types, interfaces, or enums from one of the
other packages, those imports will need to be updated after making this change.

### Updated Execution Environment

Hypersync apps in Hyperproof EU execute in an updated execution environment. A couple of
changes need to be made to existing Hypersync apps to allow them to run in Hyperproof EU.

The primary difference between the Hyperproof execution environment and the Hyperproof EU
execution environment is the way that Hypersync apps are started. Hyperproof EU requires
an `up` script in `package.json` which creates an initializes an HTTP server in the app.

#### Add `up` script to `package.json`

The required `up` command should be added to the `scripts` section of `package.json` as follows:

Example:

```
  "scripts": {
    "up": "node ./build/start.js",
    ...
  }
```

#### Create start.ts

After adding the `up` command, create a new file called `start.ts` under your package's
`/src` directory. It should contian the following content:

```
import { MyApp } from './MyApp';

import { HttpServer } from '@hyperproof/integration-sdk';

const server = new HttpServer();
const app = new MyApp();
server.startListening(app.start());

```

Where "MyApp" is the name of your custom app.

After making these changes, when you build your app it will produce `./build/start.js` that is
referenced by the `up` command.

Once you have made this change, your custom Hypersync app will function correctly in either
the Hyperproof or Hyperproof EU environments.

> **NOTE**
>
> If you want to deploy your custom app to Hyperproof EU, you will need [HP CLI version](./hyperproof-cli.md)
> version 1.1.0.0 or higher. See the `--domain` option on the `hp signin` command.
