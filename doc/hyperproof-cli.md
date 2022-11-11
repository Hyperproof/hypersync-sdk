# Hyperproof CLI

## Overview

The Hyperproof command-line interface (Hyperproof CLI) provides a set of commands used to create, read, update and delete data that is stored in a Hyperproof organization.

## Installation

The Hyperproof CLI is a cross-platform command line tool that can be installed the following platforms:

- [Linux (Ubuntu)](#install-on-linux)
- [Windows 10 and 11](#install-on-windows)

The Hyperproof CLI has a dependency on the .Net Runtime 6.0. Before installing the Hyperproof CLI, please install the .Net Runtime 6.0 using the link below.

- [Download .Net 6.0](https://dotnet.microsoft.com/en-us/download/dotnet/6.0).

### Install on Linux

The Hyperproof CLI has been tested on the following Linux distributions.

| Distribution | Version                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Ubuntu       | 18.04 LTS (Bionic Beaver), 20.04 LTS (Focal Fossa), 22.04 (Jammy Jellyfish) |

It may also be installed on other Debian distributions but the Hyperprof CLI has not been tested on these platforms.

Once you have installed the [.Net Runtime 6.0](https://dotnet.microsoft.com/en-us/download/dotnet/6.0), the CLI can be installed by downloading a `.deb` package from the Hyperproof web site. Click the link below to download the latest version of the Hyperproof CLI.

- [Download HP CLI `.deb` for Debian Linux Distributions](https://hpdownload.blob.core.windows.net/hpcli/hpcli_0.8.2-1_amd64.deb)

The `.deb` package installs the HP CLI under `/usr/bin`.

### Install on Windows

For Windows, the Azure CLI is intalled using an installation executable that can be downloaded from the Hyperproof web site.

The Hyperproof CLI has been tested on the following Windows versions.

| Version    |
| ---------- |
| Windows 10 |
| Windows 11 |

Once you have installed the [.Net Runtime 6.0](https://dotnet.microsoft.com/en-us/download/dotnet/6.0), click the link below to download and run the HP CLI Windows installer.

- [Download HP CLI Windows Installer](https://hpdownload.blob.core.windows.net/hpcli/hpcli-0.8.2.exe)

The Hyperproof CLI will be installed under `C:\Program Files\Hyperproof CLI` unless you choose a different installation location. The installation directory should be added to your path.

### Installation Verification

Once the installation is complete the installation by running the following command:

```
hp --version
```
