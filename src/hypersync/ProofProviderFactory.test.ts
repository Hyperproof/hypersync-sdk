import { ProofProviderFactory } from './ProofProviderFactory';

import { HypersyncCriteria, IHypersyncField, IProofCriterionRef } from '@hyperproof/hypersync-models';
import path from 'path';

// Use the merge package's real JSON files for testing.
const MERGE_APP_ROOT = path.resolve(__dirname, '../../../merge/src');
const messages = require(path.resolve(MERGE_APP_ROOT, 'json/messages.json'));

describe('ProofProviderFactory.getProofTypeCatalog', () => {
  it('returns all fields when no filter callbacks are provided', async () => {
    const factory = new ProofProviderFactory(
      'merge-app',
      MERGE_APP_ROOT,
      messages,
      [], // no code providers
      undefined, // no field filter
      'testIntegration',
      undefined // no criteria filter
    );

    // Keep only the accounting chart of accounts proof type.
    const config = factory.getConfig();
    for (const proofType of Object.keys(config)) {
      if (proofType !== 'hp_accountingChartOfAccounts') {
        factory.removeProofType(proofType);
      }
    }

    const catalog = await factory.getProofTypeCatalog();
    expect(catalog).toHaveLength(1);

    const entry = catalog[0];
    // Without filters, all fields should be present including classification,
    // status, parentAccount, and the criteria-derived "Status" label.
    expect(entry.fields).toContain('Classification');
    expect(entry.fields).toContain('Status');
    expect(entry.fields).toContain('Parent Account');
  });

  it('applies field exclusions via fieldFilterCallback', async () => {
    // Simulate Clear Books field exclusions for hp_accountingChartOfAccounts:
    // ["classification", "status", "parentAccount"]
    const excludedFields: Record<string, string[]> = {
      hp_accountingChartOfAccounts: ['classification', 'status', 'parentAccount']
    };

    const fieldFilter = (fields: IHypersyncField[], proofType: string, _criteria: HypersyncCriteria) => {
      const excluded = excludedFields[proofType] || [];
      return fields.filter(f => !excluded.includes(f.property));
    };

    const factory = new ProofProviderFactory(
      'merge-app',
      MERGE_APP_ROOT,
      messages,
      [],
      fieldFilter,
      'clearBooksMerge',
      undefined
    );

    const config = factory.getConfig();
    for (const proofType of Object.keys(config)) {
      if (proofType !== 'hp_accountingChartOfAccounts') {
        factory.removeProofType(proofType);
      }
    }

    const catalog = await factory.getProofTypeCatalog();
    expect(catalog).toHaveLength(1);

    const entry = catalog[0];
    // Excluded fields should NOT appear.
    expect(entry.fields).not.toContain('Classification');
    expect(entry.fields).not.toContain('Parent Account');
    // Remaining fields should still appear.
    expect(entry.fields).toContain('Account Number');
    expect(entry.fields).toContain('Account Name');
    expect(entry.fields).toContain('Account Type');
    expect(entry.fields).toContain('Current Balance');
    expect(entry.fields).toContain('Remote ID');
  });

  it('applies criteria exclusions via criteriaFilterCallback', async () => {
    // Simulate Clear Books criteria exclusions for hp_accountingChartOfAccounts:
    // ["hp_accountingAccountStatus"]
    const excludedCriteria: Record<string, string[]> = {
      hp_accountingChartOfAccounts: ['hp_accountingAccountStatus']
    };

    const criteriaFilter = (criteria: IProofCriterionRef[], proofType: string) => {
      const excluded = excludedCriteria[proofType] || [];
      return criteria.filter(c => !excluded.includes(c.name));
    };

    const factory = new ProofProviderFactory(
      'merge-app',
      MERGE_APP_ROOT,
      messages,
      [],
      undefined,
      'clearBooksMerge',
      criteriaFilter
    );

    const config = factory.getConfig();
    for (const proofType of Object.keys(config)) {
      if (proofType !== 'hp_accountingChartOfAccounts') {
        factory.removeProofType(proofType);
      }
    }

    const catalog = await factory.getProofTypeCatalog();
    expect(catalog).toHaveLength(1);

    const entry = catalog[0];
    // The hp_accountingAccountStatus criteria field resolves to "Status" label.
    // It should NOT be prepended to the fields since it's excluded.
    // The field-level "Status" (property: "status") is still present since
    // we didn't set a field filter here.
    const fields = entry.fields!.split(', ');
    // "Status" from the criteria should not be the first field.
    // Without exclusion, it would be prepended before "Account Number".
    expect(fields[0]).not.toBe('Status');
    expect(fields[0]).toBe('Account Number');
  });

  it('applies both field and criteria exclusions together (Clear Books scenario)', async () => {
    const fieldExclusions: Record<string, string[]> = {
      hp_accountingChartOfAccounts: ['classification', 'status', 'parentAccount']
    };
    const criteriaExclusions: Record<string, string[]> = {
      hp_accountingChartOfAccounts: ['hp_accountingAccountStatus']
    };

    const factory = new ProofProviderFactory(
      'merge-app',
      MERGE_APP_ROOT,
      messages,
      [],
      (fields, proofType) => {
        const excluded = fieldExclusions[proofType] || [];
        return fields.filter(f => !excluded.includes(f.property));
      },
      'clearBooksMerge',
      (criteria, proofType) => {
        const excluded = criteriaExclusions[proofType] || [];
        return criteria.filter(c => !excluded.includes(c.name));
      }
    );

    const config = factory.getConfig();
    for (const proofType of Object.keys(config)) {
      if (proofType !== 'hp_accountingChartOfAccounts') {
        factory.removeProofType(proofType);
      }
    }

    const catalog = await factory.getProofTypeCatalog();
    const entry = catalog[0];

    // Should only contain: Account Number, Account Name, Account Type,
    // Current Balance, Remote ID
    // Excluded: Classification, Status (field), Parent Account
    // Also excluded: Status (criteria-derived)
    expect(entry.fields).toBe('Account Number, Account Name, Account Type, Current Balance, Remote ID');
  });
});
