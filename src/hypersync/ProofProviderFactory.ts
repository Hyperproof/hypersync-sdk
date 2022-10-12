import { compareValues } from '../common';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import { StringMap } from './common';
import { DeclarativeProofProvider } from './DeclarativeProofProvider';
import { HypersyncCriteria } from './models';
import { ProofProviderBase } from './ProofProviderBase';
import { DataValueMap, IDataSource } from './IDataSource';
import { resolveTokens } from './tokens';

interface IDeclarativeProofTypeRef {
  proofType: string;
  label: string;
  criteria: DataValueMap;
}

interface IProviderMap {
  [integrationType: string]:
    | IDeclarativeProofTypeRef
    | typeof ProofProviderBase;
}

/**
 * Read all the proof providers and add them to the providers map
 * Runs once on startup
 */

export class ProofProviderFactory {
  private connectorName: string;
  private appRootDir: string;
  private messages: StringMap;
  private providers: IProviderMap;

  constructor(
    connectorName: string,
    appRootDir: string,
    messages: StringMap,
    importedProviders: typeof ProofProviderBase[]
  ) {
    this.connectorName = connectorName;
    this.appRootDir = appRootDir;
    this.messages = messages;

    // If there are any declarative proof providers, load those now.
    const proofProvidersPath = path.resolve(
      appRootDir,
      'build/decl/proofProviders.json'
    );
    if (fs.existsSync(proofProvidersPath)) {
      this.providers = JSON.parse(fs.readFileSync(proofProvidersPath, 'utf8'));
    } else {
      this.providers = {};
    }

    // For all of the imported proof providers, map of all the proof types where
    // the key is the proof type and the value is the Proof Type class.
    for (const provider of importedProviders) {
      if (provider.proofType in this.providers) {
        throw createHttpError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          `Duplicate proof type: ${provider.proofType}`
        );
      }
      this.providers[provider.proofType] = provider;
    }
  }

  /**
   * Returns a collection of option values for known proof types.
   *
   * @param criteria Criteria chosen by the user ahead of choosing the proof type.
   */
  getProofTypeOptions = (criteria: HypersyncCriteria) => {
    let providers = Object.entries(this.providers);
    if (criteria) {
      providers = providers.filter(([, provider]) => {
        // If this is an imported provider (i.e. a class) then ask the
        // provider whether or not the criteria matches.
        if (typeof provider === 'function') {
          return provider.matchesCriteria(criteria);
        }

        // For declarative proof types we do the criteria matching here.
        if (provider.criteria) {
          for (const key of Object.keys(provider.criteria)) {
            if (criteria[key] !== provider.criteria[key]) {
              return false;
            }
          }
        }
        return true;
      });
    }

    const options = [];
    for (const [proofType, provider] of providers) {
      options.push({
        value: proofType,
        label:
          typeof provider !== 'function'
            ? resolveTokens(provider.label, { messages: this.messages })
            : provider.proofTypeLabel
      });
    }
    return options.sort((a, b) => compareValues(a.label, b.label));
  };

  createProofProvider = (proofType: string, dataSource: IDataSource) => {
    const provider = this.providers[proofType];
    if (!provider) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Unrecognized Hypersync proof type: ${proofType}`
      );
    }

    if (typeof provider === 'function') {
      return new provider(dataSource);
    } else {
      return new DeclarativeProofProvider(
        this.connectorName,
        this.appRootDir,
        proofType,
        dataSource,
        this.messages
      );
    }
  };
}

module.exports = { ProofProviderFactory };
