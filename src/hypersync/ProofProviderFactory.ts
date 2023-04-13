import { compareValues } from '../common';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import { StringMap } from './common';
import { ICriteriaProvider } from './ICriteriaProvider';
import { DataValueMap, IDataSource } from './IDataSource';
import { JsonProofProvider } from './JsonProofProvider';
import { HypersyncCriteria } from './models';
import { ProofProviderBase } from './ProofProviderBase';
import { resolveTokens } from './tokens';

/**
 * Interface for an object that represents a proof type that can be
 * selected by the user.
 */
export interface IProofTypeConfig {
  proofType: string;
  label: string;
  criteria: DataValueMap;
}

/**
 * Interface for an object that maps a proofType value to either an
 * IProofTypeConfig instance or a class that derives from ProofProviderBase.
 * The former is used for no-code, JSON-based proof types, and the latter
 * is used for proof providers that are built up in code.
 */
export interface IProofTypeMap {
  [proofType: string]: IProofTypeConfig | typeof ProofProviderBase;
}

/**
 * Read all the proof providers and add them to the providers map
 * Runs once on startup
 */

export class ProofProviderFactory {
  private connectorName: string;
  private appRootDir: string;
  private messages: StringMap;
  private providers: IProofTypeMap;

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
    const proofProvidersPath = path.resolve(appRootDir, 'json/proofTypes.json');
    if (fs.existsSync(proofProvidersPath)) {
      this.providers = JSON.parse(fs.readFileSync(proofProvidersPath, 'utf8'));
      // If a JSON schema ref was provided, remove it from map.
      delete this.providers['$schema'];
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
   * Returns the configuration info for declarative proof providers.
   */
  public getConfig() {
    return this.providers;
  }

  /**
   * Returns a collection of option values for known proof types.
   *
   * @param criteria Criteria chosen by the user ahead of choosing the proof type.
   */
  public getProofTypeOptions(criteria: HypersyncCriteria) {
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
  }

  public createProofProvider(
    proofType: string,
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider
  ) {
    const provider = this.providers[proofType];
    if (!provider) {
      throw createHttpError(
        StatusCodes.BAD_REQUEST,
        `Unrecognized Hypersync proof type: ${proofType}`
      );
    }

    if (typeof provider === 'function') {
      return new provider(dataSource, criteriaProvider);
    } else {
      return new JsonProofProvider(
        this.connectorName,
        this.appRootDir,
        proofType,
        dataSource,
        criteriaProvider,
        this.messages
      );
    }
  }
}

module.exports = { ProofProviderFactory };
