import { applyProofLayout, calcLayoutInfo } from './layout';
import { IHypersyncProofField } from './ProofProviderBase';

import { HypersyncDataFormat, HypersyncPageOrientation } from '@hyperproof/hypersync-models';

describe('calcLayoutInfo', () => {
  it('auto-sizes a field that has no explicit width', () => {
    const fields: IHypersyncProofField[] = [{ property: 'name', label: 'Name' }];

    const result = calcLayoutInfo(fields, [{ name: 'Alice' }]);

    // ceil('Alice'.length * 8.5 + 4) = ceil(46.5) = 47
    expect(result.fields[0].width).toBe('47px');
  });

  it('preserves an explicit width and does not auto-size it from the data', () => {
    const fields: IHypersyncProofField[] = [{ property: 'email', label: 'Email', width: '30px' }];

    const result = calcLayoutInfo(fields, [{ email: 'a-very-long-email-address@example.com' }]);

    expect(result.fields[0].width).toBe('30px');
  });

  it('mixes explicit and computed widths in a single call', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'id', label: 'ID', width: '500px' },
      { property: 'name', label: 'Name' }
    ];

    const result = calcLayoutInfo(fields, [{ id: 'x', name: 'Alice' }]);

    expect(result.fields[0].width).toBe('500px');
    expect(result.fields[1].width).toBe('47px');
  });

  it('reports portrait orientation and no zoom when the total width fits the portrait page', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'a', label: 'A', width: '100px' },
      { property: 'b', label: 'B', width: '100px' }
    ];

    const result = calcLayoutInfo(fields, []);

    expect(result.orientation).toBe(HypersyncPageOrientation.Portrait);
    expect(result.zoom).toBe(1);
  });

  it('derives landscape orientation from the final widths when they exceed the portrait limit', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'a', label: 'A', width: '300px' },
      { property: 'b', label: 'B', width: '300px' },
      { property: 'c', label: 'C', width: '300px' }
    ];

    // proofWidth 900 > 698 (portrait) but < 1027 (landscape) → landscape, no zoom
    const result = calcLayoutInfo(fields, []);

    expect(result.orientation).toBe(HypersyncPageOrientation.Landscape);
    expect(result.zoom).toBe(1);
  });

  it('scales zoom down when the total width exceeds the landscape limit', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'a', label: 'A', width: '400px' },
      { property: 'b', label: 'B', width: '400px' },
      { property: 'c', label: 'C', width: '400px' }
    ];

    // proofWidth 1200 > 1027 → zoom = 1027 / 1200
    const result = calcLayoutInfo(fields, []);

    expect(result.orientation).toBe(HypersyncPageOrientation.Landscape);
    expect(result.zoom).toBeCloseTo(1027 / 1200);
  });

  it('scales zoom to its true fit when only moderately wide (no longer floored at 0.75)', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'a', label: 'A', width: '400px' },
      { property: 'b', label: 'B', width: '400px' },
      { property: 'c', label: 'C', width: '400px' },
      { property: 'd', label: 'D', width: '400px' }
    ];

    // proofWidth 1600 → 1027/1600 ≈ 0.64, above the 0.4 floor → not clamped
    const result = calcLayoutInfo(fields, []);

    expect(result.zoom).toBeCloseTo(1027 / 1600);
  });

  it('floors zoom at the minimum (1 / COLUMN_MAX_WIDTH_FACTOR = 0.4) for very wide proofs', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'a', label: 'A', width: '700px' },
      { property: 'b', label: 'B', width: '700px' },
      { property: 'c', label: 'C', width: '700px' },
      { property: 'd', label: 'D', width: '700px' }
    ];

    // proofWidth 2800 → 1027/2800 ≈ 0.37, below the 0.4 floor → clamped to 0.4
    const result = calcLayoutInfo(fields, []);

    expect(result.zoom).toBe(0.4);
  });

  it('calibrates zoom to the portrait width when orientation is pinned to portrait', () => {
    const fields: IHypersyncProofField[] = [
      { property: 'a', label: 'A', width: '400px' },
      { property: 'b', label: 'B', width: '400px' },
      { property: 'c', label: 'C', width: '400px' },
      { property: 'd', label: 'D', width: '400px' }
    ];

    // proofWidth 1600. Derived (no override) it would be landscape → 1027/1600 ≈ 0.64.
    // Pinned portrait, zoom must scale against the portrait width (698) → 698/1600 so
    // the font is not too large for the narrower portrait columns.
    const derived = calcLayoutInfo(fields, []);
    expect(derived.orientation).toBe(HypersyncPageOrientation.Landscape);
    expect(derived.zoom).toBeCloseTo(1027 / 1600);

    const portrait = calcLayoutInfo(fields, [], undefined, HypersyncPageOrientation.Portrait);
    expect(portrait.orientation).toBe(HypersyncPageOrientation.Portrait);
    expect(portrait.zoom).toBeCloseTo(698 / 1600);
  });
});

describe('applyProofLayout', () => {
  it('applies computed widths to sublayout columns from the collection rows', () => {
    const contents = {
      layout: {
        format: HypersyncDataFormat.Tabular,
        fields: [{ property: 'group', label: 'Group' }],
        subLayouts: [
          {
            format: HypersyncDataFormat.Tabular,
            collection: 'members',
            fields: [{ property: 'member', label: 'Member' }]
          }
        ]
      },
      proof: [{ group: 'admins', members: [{ member: 'abcdefghijklmnopqrst' }] }]
    } as any;

    applyProofLayout(contents);

    // The sublayout's 'member' column must be sized from its 20-char data
    // (ceil(20 * 8.5 + 4) = 174px), not left unset — i.e. the calcLayoutInfo
    // result has to be assigned back onto the sublayout fields.
    expect(contents.layout.subLayouts[0].fields[0].width).toBe('174px');
  });
});
