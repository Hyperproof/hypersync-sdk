import { convertFieldToSchemaField, ProofProviderBase } from './';

import { HypersyncDataFormat, HypersyncFieldType } from '@hyperproof/hypersync-models';

describe('ProofProviderBase.createForCatalog', () => {
  it('should create an instance without arguments', () => {
    const instance = ProofProviderBase.createForCatalog();
    expect(instance).toBeInstanceOf(ProofProviderBase);
  });

  it('should return empty layout by default', () => {
    const instance = ProofProviderBase.createForCatalog();
    const layout = instance.getLayout();
    expect(layout.format).toBe(HypersyncDataFormat.Tabular);
    expect(layout.fields).toEqual([]);
  });

  it('should call subclass getLayout via createForCatalog', () => {
    class TestProvider extends ProofProviderBase {
      static proofType = 'test';
      static proofTypeLabel = 'Test';

      getLayout() {
        return {
          format: HypersyncDataFormat.Tabular,
          fields: [
            { property: 'name', label: 'Name', type: HypersyncFieldType.Text },
            { property: 'email', label: 'Email', type: HypersyncFieldType.Text }
          ]
        };
      }
    }

    const instance = TestProvider.createForCatalog();
    expect(instance).toBeInstanceOf(TestProvider);
    const layout = instance.getLayout();
    expect(layout.fields).toHaveLength(2);
    expect(layout.fields[0].label).toBe('Name');
    expect(layout.fields[1].label).toBe('Email');
  });

  it('should work with subclass that has required constructor params', () => {
    class TypedProvider extends ProofProviderBase<string> {
      constructor(client: string, criteriaProvider: any) {
        super(client, criteriaProvider);
      }

      getLayout() {
        return {
          format: HypersyncDataFormat.Stacked,
          fields: [{ property: 'id', label: 'ID', type: HypersyncFieldType.Text }]
        };
      }
    }

    const instance = TypedProvider.createForCatalog();
    expect(instance.getLayout().fields[0].label).toBe('ID');
    expect(instance.getLayout().format).toBe(HypersyncDataFormat.Stacked);
  });

  it('should support hierarchical layouts with subLayouts', () => {
    class HierarchicalProvider extends ProofProviderBase {
      static proofType = 'hierarchical';
      static proofTypeLabel = 'Hierarchical';

      getLayout() {
        return {
          format: HypersyncDataFormat.Tabular,
          fields: [{ property: 'name', label: 'Name' }],
          subLayouts: [
            {
              collection: 'rules',
              label: 'Rules',
              format: HypersyncDataFormat.Tabular,
              fields: [
                { property: 'priority', label: 'Priority' },
                { property: 'action', label: 'Action' }
              ]
            }
          ]
        };
      }
    }

    const instance = HierarchicalProvider.createForCatalog();
    const layout = instance.getLayout();
    expect(layout.fields).toHaveLength(1);
    expect(layout.subLayouts).toHaveLength(1);
    expect(layout.subLayouts![0].label).toBe('Rules');
    expect(layout.subLayouts![0].fields).toHaveLength(2);
  });
});

describe('ProofProviderBase.createForCatalog + generateSchema', () => {
  it('should return schema with fields and isHierarchical for a flat provider', async () => {
    class FlatProvider extends ProofProviderBase {
      static proofType = 'flat';
      static proofTypeLabel = 'Flat';

      getLayout() {
        return {
          format: HypersyncDataFormat.Tabular,
          fields: [
            { property: 'name', label: 'Name', type: HypersyncFieldType.Text },
            { property: 'active', label: 'Active', type: HypersyncFieldType.Boolean }
          ]
        };
      }

      async generateSchema() {
        const layout = this.getLayout();
        return {
          format: layout.format,
          isHierarchical: false,
          fields: layout.fields.map(convertFieldToSchemaField)
        };
      }
    }

    const instance = FlatProvider.createForCatalog();
    const schema = await instance.generateSchema({} as any);
    expect(schema.isHierarchical).toBe(false);
    expect(schema.fields).toHaveLength(2);
    expect(schema.fields[0].label).toBe('Name');
    expect(schema.fields[1].label).toBe('Active');
  });

  it('should return isHierarchical true for a provider with subLayouts', async () => {
    class HierarchicalProvider extends ProofProviderBase {
      static proofType = 'hier';
      static proofTypeLabel = 'Hierarchical';

      getLayout() {
        return {
          format: HypersyncDataFormat.Tabular,
          fields: [{ property: 'id', label: 'ID', type: HypersyncFieldType.Text }],
          subLayouts: [
            {
              collection: 'items',
              label: 'Items',
              format: HypersyncDataFormat.Tabular,
              fields: [{ property: 'name', label: 'Name', type: HypersyncFieldType.Text }]
            }
          ]
        };
      }

      async generateSchema() {
        const layout = this.getLayout();
        return {
          format: layout.format,
          isHierarchical: layout.subLayouts !== undefined,
          fields: layout.fields.map(convertFieldToSchemaField)
        };
      }
    }

    const instance = HierarchicalProvider.createForCatalog();
    const schema = await instance.generateSchema({} as any);
    expect(schema.isHierarchical).toBe(true);
    expect(schema.fields).toHaveLength(1);
  });

  it('should throw for base class generateSchema (not implemented)', async () => {
    const instance = ProofProviderBase.createForCatalog();
    await expect(instance.generateSchema({} as any)).rejects.toThrow('generateSchema must be implemented');
  });
});
