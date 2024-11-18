# Hyperproof CLI

## Overview

The Hyperproof command-line interface (Hyperproof CLI) provides a set of commands used to create, read, update and delete data that is stored in a Hyperproof organization.

## Installation

The Hyperproof CLI is a cross-platform command line tool that can be installed the following platforms:

- [Linux (Ubuntu)](#install-on-linux)
- [Windows 10 and 11](#install-on-windows)

The Hyperproof CLI has a dependency on the .Net Runtime 8.0. Before installing the Hyperproof CLI, please install the .Net Runtime 8.0 using the link below.

- [Download .Net 8.0](https://dotnet.microsoft.com/en-us/download/dotnet/8.0).

### Install on Linux

The Hyperproof CLI has been tested on the following Linux distributions.

| Distribution | Version                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Ubuntu       | 18.04 LTS (Bionic Beaver), 20.04 LTS (Focal Fossa), 22.04 (Jammy Jellyfish) |

It may also be installed on other Debian distributions but the Hyperprof CLI has not been tested on these platforms.

Once you have installed the [.Net Runtime 8.0](https://dotnet.microsoft.com/en-us/download/dotnet/8.0), the CLI can be installed by downloading a `.deb` package from the Hyperproof web site. Click the link below to download the latest version of the Hyperproof CLI.

- [Download HP CLI `.deb` for Debian Linux Distributions](https://downloads.hyperproof.app/hpcli/hpcli_1.2.2-1_amd64.deb)

The `.deb` package installs the HP CLI under `/usr/bin`.

### Install on Windows

For Windows, the Hyperproof CLI is intalled using an installation executable that can be downloaded from the Hyperproof web site.

The Hyperproof CLI has been tested on the following Windows versions.

| Version    |
| ---------- |
| Windows 10 |
| Windows 11 |

Once you have installed the [.Net Runtime 8.0](https://dotnet.microsoft.com/en-us/download/dotnet/8.0), click the link below to download and run the HP CLI Windows installer.

- [Download HP CLI Windows Installer](https://downloads.hyperproof.app/hpcli/hpcli-1.2.2.exe)

The Hyperproof CLI will be installed under `C:\Program Files\Hyperproof CLI` unless you choose a different installation location. The installation directory should be added to your path.

### Install on Mac

The Hyperproof CLI for Mac depends on the [.Net Runtime 8.0](https://dotnet.microsoft.com/en-us/download/dotnet/8.0). Use the links on that page to install the appropriate .Net 8.0 Runtime for your system.

Once you have installed the .Net Runtime, you can use Homebrew to install, update and uninstall the Hyperproof CLI. If you don't have Homebrew available on your system, install [Homebrew](https://docs.brew.sh/Installation.html) before continuing.

You can install the Hyperproof CLI on macOS by adding the Hyperproof tap, and then running the install command:

```
brew tap Hyperproof/hyperproof
brew install hyperproof-cli
```

If you have already installed an earlier version of the Hyperproof CLI, you can upgrade to the latest version with this command:

```
brew upgrade hyperproof-cli
```

### Installation Verification

Once the installation is complete, confirm the installation by running the following command:

```
hp --version
```
