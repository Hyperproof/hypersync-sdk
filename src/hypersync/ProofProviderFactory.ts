import { StringMap } from './common';
import { ICriteriaProvider } from './ICriteriaProvider';
import { IDataSource } from './IDataSource';
import { JsonProofProvider } from './JsonProofProvider';
import { ProofProviderBase } from './ProofProviderBase';
import { resolveTokens } from './tokens';

import {
  IHypersyncDefinition,
  IProofType,
  IProofTypeMap
} from '@hyperproof/hypersync-models';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';

import { compareValues } from '../common';

/**
 * Interface for an object that represents a proof type that can be
 * selected by the user.  Matches configuration information stored in
 * proofTypes.json as well as org-specific proof types created in Hyperproof.
 */
export interface IProofTypeConfig {
  label: string;
  category?: string;

  // Definition property only used for org-specific proof types.
  definition?: IHypersyncDefinition;
}

/**
 * Interface for an object that maps a proofType value to either an
 * IProofTypeConfig instance or a class that derives from ProofProviderBase.
 * The former is used for no-code, JSON-based proof types, and the latter
 * is used for proof providers that are built up in code.
 */
interface IProofProviders {
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
  private providers: IProofProviders;

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
   * Adds a a custom proof type to the set of known proof types.
   */
  public addProofType(proofType: string, config: IProofTypeConfig) {
    if (!config.definition) {
      throw new Error('Custom proof type is missing a definition.');
    }
    if (Object.prototype.hasOwnProperty.call(this.providers, proofType)) {
      throw new Error('A proof type with that name already exists.');
    }
    this.providers[proofType] = config;
  }

  /**
   * Returns the configuration info proof providers managed by this factory.
   */
  public getConfig = () => {
    const config: IProofTypeMap = {};

    // The items in this.providers reference declarative proof types or
    // proof types that were created in code.  Turn them all into
    // IProofType instances for transmittal over the wire.
    Object.keys(this.providers).reduce((acc, key) => {
      const provider = this.providers[key];
      let proofTypeConfig: IProofType;
      if (typeof provider === 'function') {
        proofTypeConfig = {
          label: provider.proofTypeLabel,
          isJson: false
        };
      } else {
        proofTypeConfig = {
          ...provider,
          isJson: true
        };
      }
      acc[key] = proofTypeConfig;
      return acc;
    }, config);

    return config;
  };

  /**
   * Returns the definition of a proof type managed by this factory.
   */
  public getProofTypeDefinition = async (
    proofType: string
  ): Promise<IHypersyncDefinition> => {
    if (!Object.prototype.hasOwnProperty.call(this.providers, proofType)) {
      throw createHttpError(StatusCodes.NOT_FOUND, 'Proof type not found.');
    }

    const provider = this.providers[proofType];
    if (typeof provider === 'function') {
      throw createHttpError(StatusCodes.BAD_REQUEST, 'Proof type is not JSON.');
    }

    if (provider.definition) {
      return provider.definition;
    } else {
      return ProofProviderFactory.loadProofTypeJsonFile(
        this.appRootDir,
        proofType
      );
    }
  };

  /**
   * Returns a collection of option values for known proof types.
   *
   * @param category Proof category chosen by the user ahead of choosing the proof type.
   */
  public getProofTypeOptions = (category?: string) => {
    let providers = Object.entries(this.providers);
    if (category) {
      providers = providers.filter(([, provider]) => {
        // If this is an imported provider (i.e. a class) then ask the
        // provider whether or not the criteria matches.
        if (typeof provider === 'function') {
          return provider.matchesCategory(category);
        }

        // For declarative proof types we do the criteria matching here.
        return provider.category === category;
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

  /**
   * Retrieves the distinct set of proof categories associated with custom proof types.
   */
  public getCustomProofTypeCategories = (): Set<string | undefined> => {
    const set = new Set<string | undefined>();
    Object.values(this.providers)
      .filter(p => typeof p !== 'function' && p.definition)
      .forEach(p => set.add((p as IProofTypeConfig).category));
    return set;
  };

  public createProofProvider = (
    proofType: string,
    dataSource: IDataSource,
    criteriaProvider: ICriteriaProvider
  ) => {
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
        proofType,
        dataSource,
        criteriaProvider,
        this.messages,
        () =>
          provider.definition
            ? Promise.resolve(provider.definition)
            : ProofProviderFactory.loadProofTypeJsonFile(
                this.appRootDir,
                proofType
              )
      );
    }
  };

  /**
   * Loads a declarative proof type JSON file from the file system.
   */
  private static loadProofTypeJsonFile = async (
    appRootDir: string,
    proofType: string
  ): Promise<IHypersyncDefinition> => {
    return Promise.resolve(
      JSON.parse(
        fs.readFileSync(
          path.resolve(appRootDir, `json/proof/${proofType}.json`),
          'utf8'
        )
      )
    );
  };
}

module.exports = { ProofProviderFactory };
