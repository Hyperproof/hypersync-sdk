import { compareProofTypeCatalogEntries, formatLayoutFields, StringMap } from './common';
import { ICriteriaProvider } from './ICriteriaProvider';
import { IDataSource } from './IDataSource';
import { JsonProofProvider } from './JsonProofProvider';
import { ProofProviderBase } from './ProofProviderBase';
import { resolveTokens } from './tokens';

import {
  HypersyncCriteria,
  IHypersyncDefinition,
  IHypersyncField,
  IProofCriterionRef,
  IProofType,
  IProofTypeCatalogEntry,
  IProofTypeMap,
  SchemaCategory
} from '@hyperproof/hypersync-models';
import { compareValues } from '@hyperproof/integration-sdk';
import fs from 'fs';
import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import path from 'path';

/**
 * Interface for an object that represents a proof type that can be
 * selected by the user.  Matches configuration information stored in
 * proofTypes.json as well as org-specific proof types created in Hyperproof.
 */
export interface IProofTypeConfig {
  label: string;
  category?: string;
  apiFamily?: string;
  schemaCategory?: SchemaCategory;

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
  private criteriaFilterCallback?: (criteria: IProofCriterionRef[], proofType: string) => IProofCriterionRef[];
  private fieldFilterCallback?: (
    fields: IHypersyncField[],
    proofType: string,
    criteriaValues: HypersyncCriteria
  ) => IHypersyncField[];
  private integrationType: string;

  constructor(
    connectorName: string,
    appRootDir: string,
    messages: StringMap,
    importedProviders: (typeof ProofProviderBase)[],
    fieldFilterCallback?: (
      fields: IHypersyncField[],
      proofType: string,
      criteriaValues: HypersyncCriteria
    ) => IHypersyncField[],
    integrationType?: string,
    criteriaFilterCallback?: (criteria: IProofCriterionRef[], proofType: string) => IProofCriterionRef[]
  ) {
    this.connectorName = connectorName;
    this.appRootDir = appRootDir;
    this.messages = messages;
    this.fieldFilterCallback = fieldFilterCallback;
    this.criteriaFilterCallback = criteriaFilterCallback;
    this.integrationType = integrationType ?? process.env.integration_type!;
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
        throw createHttpError(StatusCodes.INTERNAL_SERVER_ERROR, `Duplicate proof type: ${provider.proofType}`);
      }
      this.providers[provider.proofType] = provider;
    }
  }

  /**
   * Removes a proof type from the set of known proof types.
   */
  public removeProofType(proofType: string) {
    delete this.providers[proofType];
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
   * Returns a catalog of all built-in proof types with resolved names,
   * category info, and schema category.
   *
   * @param categoryLabels Optional mapping of category ID to display name.
   */
  public getProofTypeCatalog = async (
    categoryLabels: Record<string, string> = {}
  ): Promise<IProofTypeCatalogEntry[]> => {
    const catalog: IProofTypeCatalogEntry[] = [];
    const tokenContext = { messages: this.messages };
    const criteriaFieldLabels = this.loadCriteriaFieldLabels(tokenContext);

    for (const [proofType, provider] of Object.entries(this.providers)) {
      const isClass = typeof provider === 'function';
      const metadata = isClass
        ? await this.extractCodeProviderMetadata(provider, tokenContext)
        : this.extractJsonProofMetadata(proofType, provider, tokenContext, criteriaFieldLabels);
      catalog.push({
        appId: this.integrationType,
        proofType,
        proofTypeName: isClass ? provider.proofTypeLabel : resolveTokens(provider.label, tokenContext),
        proofCategoryId: provider.category,
        proofCategoryName: provider.category ? categoryLabels[provider.category] : undefined,
        schemaCategory: provider.schemaCategory,
        ...metadata
      });
    }

    return catalog.sort(compareProofTypeCatalogEntries);
  };

  /**
   * Loads a mapping of criteria field names to their resolved display labels
   * from criteriaFields.json.
   */
  private loadCriteriaFieldLabels(tokenContext: { messages: StringMap }): Record<string, string> {
    const labels: Record<string, string> = {};
    try {
      const configFile = path.resolve(this.appRootDir, 'json/criteriaFields.json');
      if (fs.existsSync(configFile)) {
        const criteriaFields = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        for (const [name, config] of Object.entries(criteriaFields)) {
          const cfg = config as { label?: string };
          if (cfg.label) {
            labels[name] = resolveTokens(cfg.label, tokenContext);
          }
        }
      }
    } catch {
      // If criteria fields can't be loaded, proceed without them.
    }
    return labels;
  }

  /**
   * Extracts catalog metadata from a code-based provider by creating a catalog
   * instance.  Uses getLayout() for fields, falling back to generateSchema()
   * for providers that define fields only there (e.g. GitLab package providers).
   * Also determines isActEnabled from generateSchema() (has schema + not hierarchical).
   */
  private async extractCodeProviderMetadata(
    provider: typeof ProofProviderBase,
    tokenContext: { messages: StringMap }
  ): Promise<{ fields?: string; isActEnabled?: boolean; hasDynamicFields?: boolean }> {
    const instance = provider.createForCatalog();
    let fields: string | undefined;
    let isActEnabled: boolean | undefined;

    // Try getLayout() for fields and isActEnabled.
    try {
      const layout = instance.getLayout();
      const hasFields = layout?.fields?.length > 0;
      const hasSubLayouts = (layout?.subLayouts?.length ?? 0) > 0;
      if (hasFields || hasSubLayouts) {
        fields = formatLayoutFields(resolveTokens(layout, tokenContext));
        isActEnabled = hasFields && !hasSubLayouts;
      }
    } catch {
      // getLayout not available or failed.
    }

    // Fall back to generateSchema() for providers that define fields only there.
    if (!fields) {
      try {
        const schema = await instance.generateSchema({} as any);
        if (schema?.fields?.length) {
          fields = schema.fields.map((f: IHypersyncField) => f.label).join(', ');
          isActEnabled = !schema.isHierarchical;
        }
      } catch {
        // generateSchema not available or failed.
      }
    }

    return { fields, isActEnabled: isActEnabled ?? false, hasDynamicFields: provider.hasDynamicFields };
  }

  /**
   * Extracts fields from a JSON proof type definition.  Resolves message tokens
   * in field labels and prepends criteria field labels.
   */
  private extractJsonProofMetadata(
    proofType: string,
    provider: IProofTypeConfig,
    tokenContext: { messages: StringMap },
    criteriaFieldLabels: Record<string, string>
  ): { fields?: string; isActEnabled?: boolean } {
    try {
      const definition = provider.definition
        ? provider.definition
        : JSON.parse(fs.readFileSync(path.resolve(this.appRootDir, `json/proof/${proofType}.json`), 'utf8'));
      const spec = definition.proofSpec;

      // Apply criteria exclusions before extracting labels.
      const criteria: IProofCriterionRef[] =
        this.criteriaFilterCallback && definition.criteria
          ? this.criteriaFilterCallback(definition.criteria, proofType)
          : definition.criteria;

      // Prepend criteria labels (e.g. Tenant, Subscription, Resource Group)
      // to the field list since they appear in the proof output.
      const criteriaFields: IHypersyncField[] = [];
      if (criteria) {
        for (const criterion of criteria) {
          const criteriaLabel = criteriaFieldLabels[criterion.name];
          if (criteriaLabel) {
            criteriaFields.push({ property: criterion.name, label: criteriaLabel });
          }
        }
      }

      // Apply field exclusions before building the catalog field list.
      const specFields: IHypersyncField[] | undefined =
        this.fieldFilterCallback && spec.fields
          ? this.fieldFilterCallback(spec.fields, proofType, {} as HypersyncCriteria)
          : spec.fields;

      const resolvedLayout = {
        fields: [...criteriaFields, ...(specFields ? resolveTokens(specFields, tokenContext) : [])],
        subLayouts: spec.subLayouts ? resolveTokens(spec.subLayouts, tokenContext) : undefined
      };
      const fields = formatLayoutFields(resolvedLayout);
      const isActEnabled = spec.fields?.length > 0 && !spec.subLayouts;

      return { fields, isActEnabled };
    } catch {
      // If the definition file can't be loaded, return empty metadata.
    }
    return { isActEnabled: false };
  }

  /**
   * Returns the definition of a proof type managed by this factory.
   */
  public getProofTypeDefinition = async (proofType: string): Promise<IHypersyncDefinition> => {
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
      return ProofProviderFactory.loadProofTypeJsonFile(this.appRootDir, proofType);
    }
  };

  /**
   * Returns a collection of option values for known proof types.
   *
   * @param category Proof category chosen by the user ahead of choosing the proof type.
   */
  public getProofTypeOptions = (category?: string, schemaCategory?: SchemaCategory) => {
    let providers = Object.entries(this.providers);

    providers = providers.filter(([, provider]) => provider.schemaCategory === schemaCategory);

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

  public createProofProvider = (proofType: string, dataSource: IDataSource, criteriaProvider: ICriteriaProvider) => {
    const provider = this.providers[proofType];
    if (!provider) {
      throw createHttpError(StatusCodes.BAD_REQUEST, `Unrecognized Hypersync proof type: ${proofType}`);
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
            : ProofProviderFactory.loadProofTypeJsonFile(this.appRootDir, proofType),
        this.fieldFilterCallback,
        this.integrationType,
        this.criteriaFilterCallback
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
      JSON.parse(fs.readFileSync(path.resolve(appRootDir, `json/proof/${proofType}.json`), 'utf8'))
    );
  };
}

module.exports = { ProofProviderFactory };
