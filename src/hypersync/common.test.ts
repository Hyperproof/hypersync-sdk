import { buildProofTypeCatalog, formatLayoutFields, paginate } from './common';

import { HypersyncDataFormat, SchemaCategory } from '@hyperproof/hypersync-models';

describe('paginate', () => {
  it('should paginate first page with default page 0', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should paginate first page when page parameter is omitted', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(entities, undefined, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should paginate middle page', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(entities, 1, 3);

    expect(result.currentPage).toEqual([4, 5, 6]);
    expect(result.nextPage).toBe('2');
    expect(result.startIndex).toBe(3);
    expect(result.endIndex).toBe(6);
  });

  it('should paginate last full page', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = paginate(entities, 2, 3);

    expect(result.currentPage).toEqual([7, 8, 9]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(6);
    expect(result.endIndex).toBe(9);
  });

  it('should paginate last partial page', () => {
    const entities = [1, 2, 3, 4, 5, 6, 7];
    const result = paginate(entities, 2, 3);

    expect(result.currentPage).toEqual([7]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(6);
    expect(result.endIndex).toBe(9);
  });

  it('should handle single item per page', () => {
    const entities = [1, 2, 3, 4, 5];
    const result = paginate(entities, 2, 1);

    expect(result.currentPage).toEqual([3]);
    expect(result.nextPage).toBe('3');
    expect(result.startIndex).toBe(2);
    expect(result.endIndex).toBe(3);
  });

  it('should handle page size larger than array', () => {
    const entities = [1, 2, 3];
    const result = paginate(entities, 0, 10);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(10);
  });

  it('should handle empty array', () => {
    const entities: any[] = [];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle page beyond array length', () => {
    const entities = [1, 2, 3];
    const result = paginate(entities, 5, 3);

    expect(result.currentPage).toEqual([]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(15);
    expect(result.endIndex).toBe(18);
  });

  it('should handle single element array', () => {
    const entities = [1];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle array with exactly pageSize elements', () => {
    const entities = [1, 2, 3];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle array with pageSize + 1 elements', () => {
    const entities = [1, 2, 3, 4];
    const result = paginate(entities, 0, 3);

    expect(result.currentPage).toEqual([1, 2, 3]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(3);
  });

  it('should handle array of objects', () => {
    const entities = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'David' }
    ];
    const result = paginate(entities, 1, 2);

    expect(result.currentPage).toEqual([
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'David' }
    ]);
    expect(result.nextPage).toBeUndefined();
    expect(result.startIndex).toBe(2);
    expect(result.endIndex).toBe(4);
  });

  it('should handle zero page with multiple pages available', () => {
    const entities = [1, 2, 3, 4, 5, 6];
    const result = paginate(entities, 0, 2);

    expect(result.currentPage).toEqual([1, 2]);
    expect(result.nextPage).toBe('1');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(2);
  });
});

describe('formatLayoutFields', () => {
  it('should format simple flat fields', () => {
    const result = formatLayoutFields({
      format: HypersyncDataFormat.Tabular,
      fields: [
        { property: 'a', label: 'Field A' },
        { property: 'b', label: 'Field B' },
        { property: 'c', label: 'Field C' }
      ]
    });
    expect(result).toBe('Field A, Field B, Field C');
  });

  it('should format hierarchical layout with subLayouts', () => {
    const result = formatLayoutFields({
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
    });
    expect(result).toBe('Name\nRules: Priority, Action');
  });

  it('should handle subLayout without label', () => {
    const result = formatLayoutFields({
      format: HypersyncDataFormat.Stacked,
      fields: [{ property: 'title', label: 'Title' }],
      subLayouts: [
        {
          collection: 'details',
          format: HypersyncDataFormat.Stacked,
          fields: [{ property: 'desc', label: 'Description' }]
        }
      ]
    });
    expect(result).toBe('Title\nDescription');
  });

  it('should handle nested subLayouts', () => {
    const result = formatLayoutFields({
      format: HypersyncDataFormat.Tabular,
      fields: [{ property: 'zone', label: 'Zone' }],
      subLayouts: [
        {
          collection: 'ssl',
          label: 'SSL',
          format: HypersyncDataFormat.Stacked,
          fields: [{ property: 'mode', label: 'Mode' }],
          subLayouts: [
            {
              collection: 'hsts',
              label: 'HSTS',
              format: HypersyncDataFormat.Stacked,
              fields: [{ property: 'enabled', label: 'Enabled' }]
            }
          ]
        }
      ]
    });
    expect(result).toBe('Zone\nSSL: Mode\nHSTS: Enabled');
  });

  it('should return empty string for empty fields', () => {
    const result = formatLayoutFields({
      format: HypersyncDataFormat.Tabular,
      fields: []
    });
    expect(result).toBe('');
  });
});

describe('buildProofTypeCatalog', () => {
  it('should compute fields from layout', () => {
    const result = buildProofTypeCatalog('testApp', [
      {
        proofType: 'pt1',
        proofTypeName: 'Proof One',
        layout: {
          format: HypersyncDataFormat.Tabular,
          fields: [
            { property: 'name', label: 'Name' },
            { property: 'email', label: 'Email' }
          ]
        }
      }
    ]);
    expect(result[0].fields).toBe('Name, Email');
  });

  it('should compute isActEnabled true for flat layout', () => {
    const result = buildProofTypeCatalog('app', [
      {
        proofType: 'flat',
        proofTypeName: 'Flat',
        layout: {
          format: HypersyncDataFormat.Tabular,
          fields: [{ property: 'id', label: 'ID' }]
        }
      }
    ]);
    expect(result[0].isActEnabled).toBe(true);
  });

  it('should compute isActEnabled false for hierarchical layout', () => {
    const result = buildProofTypeCatalog('app', [
      {
        proofType: 'hier',
        proofTypeName: 'Hierarchical',
        layout: {
          format: HypersyncDataFormat.Tabular,
          fields: [{ property: 'name', label: 'Name' }],
          subLayouts: [
            {
              collection: 'items',
              label: 'Items',
              format: HypersyncDataFormat.Tabular,
              fields: [{ property: 'x', label: 'X' }]
            }
          ]
        }
      }
    ]);
    expect(result[0].isActEnabled).toBe(false);
  });

  it('should default isActEnabled to false when no layout or fields', () => {
    const result = buildProofTypeCatalog('app', [{ proofType: 'empty', proofTypeName: 'Empty' }]);
    expect(result[0].isActEnabled).toBe(false);
  });

  it('should not override explicit fields and isActEnabled', () => {
    const result = buildProofTypeCatalog('app', [
      {
        proofType: 'manual',
        proofTypeName: 'Manual',
        fields: 'Custom Field List',
        isActEnabled: true,
        layout: {
          format: HypersyncDataFormat.Tabular,
          fields: [{ property: 'ignored', label: 'Ignored' }]
        }
      }
    ]);
    expect(result[0].fields).toBe('Custom Field List');
    expect(result[0].isActEnabled).toBe(true);
  });

  it('should auto-detect schemaCategory from proof type value', () => {
    const result = buildProofTypeCatalog('app', [
      { proofType: 'uarApplication', proofTypeName: 'UAR App' },
      { proofType: 'uarDirectory', proofTypeName: 'UAR Dir' },
      { proofType: 'regular', proofTypeName: 'Regular' }
    ]);
    expect(result.find(e => e.proofType === 'uarApplication')!.schemaCategory).toBe(SchemaCategory.UarApplication);
    expect(result.find(e => e.proofType === 'uarDirectory')!.schemaCategory).toBe(SchemaCategory.UarDirectory);
    expect(result.find(e => e.proofType === 'regular')!.schemaCategory).toBeUndefined();
  });

  it('should not override explicit schemaCategory', () => {
    const result = buildProofTypeCatalog('app', [
      { proofType: 'uarApplication', proofTypeName: 'UAR', schemaCategory: SchemaCategory.UarDirectory }
    ]);
    expect(result[0].schemaCategory).toBe(SchemaCategory.UarDirectory);
  });

  it('should sort by category name then proof type name', () => {
    const result = buildProofTypeCatalog('app', [
      { proofType: 'c', proofTypeName: 'Zeta', proofCategoryName: 'Cat B' },
      { proofType: 'a', proofTypeName: 'Alpha', proofCategoryName: 'Cat A' },
      { proofType: 'b', proofTypeName: 'Beta', proofCategoryName: 'Cat B' },
      { proofType: 'd', proofTypeName: 'Delta' }
    ]);
    expect(result.map(e => e.proofType)).toEqual(['d', 'a', 'b', 'c']);
  });
});
