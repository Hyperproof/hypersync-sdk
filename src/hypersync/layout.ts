import {
  IHypersyncContents,
  IHypersyncProofField,
  IHypersyncProofLayout,
  IHypersyncProofSubLayout
} from './ProofProviderBase';

import { DataObject, HypersyncDataFormat, HypersyncPageOrientation } from '@hyperproof/hypersync-models';

const MARGIN_PIXELS = 96; // 0.5in × 2 sides @ 96dpi
const DEFAULT_A4_WIDTH_PIXELS = 794 - MARGIN_PIXELS; // 698  (portrait content)
const DEFAULT_A4_LENGTH_PIXELS = 1123 - MARGIN_PIXELS; // 1027 (landscape content)
// our width calculation counts characters, but 1px is not enough room for 1 character. multiplying by 8.5 gives us enough room
// Note: It was 7.5, but with the switch from Open Sans (~7.2 factor sufficient) to Geist (~8.0 factor sufficient) we needed to bump
const CHARACTER_WIDTH_FACTOR = 8.5;
const COLUMN_BUFFER_PIXELS = 4;
const COLUMN_MAX_WIDTH_FACTOR = 2.5;

type FieldLengthMap = { [property: string]: number };

/**
 * Calculates proper field widths, orientation and zoom for a proof
 * based on the provided fields and data
 *
 * @param {array} fields The layout's fields.
 * @param {string} data The proof's data OR the subLayouts collection.
 * @param {number} minZoom Floor for the computed zoom — the proof is never scaled
 *   below this even when it overflows. Defaults to 1 / COLUMN_MAX_WIDTH_FACTOR (0.4):
 *   each column is capped at COLUMN_MAX_WIDTH_FACTOR × its fair share, so a proof's
 *   total width can never exceed the landscape width × COLUMN_MAX_WIDTH_FACTOR, which
 *   means 0.4 is the smallest zoom any proof can actually need. Flooring there lets
 *   the widest proofs scale down enough for text to fit its columns (instead of
 *   wrapping or breaking mid-word) without ever shrinking more than necessary.
 * @param {HypersyncPageOrientation} orientationOverride When the proofSpec pins an
 *   orientation, pass it here so zoom is calibrated to the width of the page the proof
 *   is actually rendered on. Without it a portrait-pinned proof is scaled for the wider
 *   landscape page, leaving the font too large for its (narrower) portrait columns so
 *   text overflows / breaks mid-word. Omitted, orientation is derived from the width.
 */
export const calcLayoutInfo = (
  fields: IHypersyncProofField[],
  data: any[],
  minZoom = 1 / COLUMN_MAX_WIDTH_FACTOR,
  orientationOverride?: HypersyncPageOrientation
) => {
  const maxWidthForColumn = (DEFAULT_A4_LENGTH_PIXELS / fields.length) * COLUMN_MAX_WIDTH_FACTOR;
  const maxLengthForColumn = maxWidthForColumn / CHARACTER_WIDTH_FACTOR;

  // init lengths w/column label lengths
  const columnLengths: FieldLengthMap = {};
  fields.forEach(field => (columnLengths[field.property] = getDataLength(field.label, maxLengthForColumn)));

  // update lengths max data lengths
  data.forEach(function (row) {
    for (const prop in row) {
      if (columnLengths[prop]) {
        columnLengths[prop] = Math.max(columnLengths[prop], getDataLength(row[prop], maxLengthForColumn));
      }
    }
  });

  // Auto-size only columns that don't already declare an explicit width;
  // a width set on the field is intentional and must be preserved. Produce NEW
  // field objects rather than mutating the input: providers commonly pass a
  // shared layout singleton (e.g. LAYOUT_MAP), and writing field.width back
  // would freeze the first sync's widths for every later sync in the
  // long-lived connector process. Callers use the returned `fields`.
  const sizedFields = fields.map(field =>
    field.width ? field : { ...field, width: getFieldWidth(columnLengths[field.property]) + 'px' }
  );

  // size proof — zoom/orientation must reflect the final widths (explicit + computed)
  const maxPortrait = DEFAULT_A4_WIDTH_PIXELS;
  const maxLandscape = DEFAULT_A4_LENGTH_PIXELS;
  const proofWidth = sizedFields.reduce((sum, field) => sum + (parseInt(field.width as string, 10) || 0), 0);
  const orientation =
    orientationOverride ??
    (proofWidth <= maxPortrait ? HypersyncPageOrientation.Portrait : HypersyncPageOrientation.Landscape);
  // Calibrate zoom to the page the proof is actually rendered on: a portrait proof
  // scales against the portrait width, not the wider landscape width.
  const pageWidth = orientation === HypersyncPageOrientation.Landscape ? maxLandscape : maxPortrait;
  let zoom = proofWidth < pageWidth ? 1 : pageWidth / proofWidth;
  zoom = zoom < minZoom ? minZoom : zoom;

  return { fields: sizedFields, orientation, zoom };
};

const getDataLength = (value: any, maxLengthForColumn: number) => {
  return value ? Math.min(value.toString().length, maxLengthForColumn) : 0;
};

const getFieldWidth = (length: number) => {
  const width = length * CHARACTER_WIDTH_FACTOR;
  return Math.ceil(width + COLUMN_BUFFER_PIXELS);
};

/**
 * Applies calcLayoutInfo to a finished proof's contents so EVERY provider —
 * declarative or programmatic — gets computed widths / orientation / zoom.
 * Meant to run at the central proof chokepoint. Honors an orientation the
 * provider pinned; calcLayoutInfo preserves explicit widths, so this is
 * idempotent for the declarative path (which already ran it) and for any
 * columns a provider hand-sized.
 */
export const applyProofLayout = (contents: IHypersyncContents): void => {
  const layout = contents?.layout as IHypersyncProofLayout | undefined;
  if (!layout) {
    return;
  }
  const proof: DataObject[] = Array.isArray(contents.proof) ? contents.proof : [];
  if (layout.format === HypersyncDataFormat.Tabular && layout.fields?.length) {
    // calcLayoutInfo returns fresh field objects (it never mutates its input),
    // so assigning the result here cannot pollute a provider's shared layout
    // singleton.
    const info = calcLayoutInfo(layout.fields, proof, undefined, contents.orientation);
    layout.fields = info.fields;
    contents.orientation = info.orientation;
    contents.zoom = info.zoom;
  }
  applyProofSubLayoutWidths(layout.subLayouts, proof);
};

// Size nested sublayout columns from that collection's rows across all parent
// items (widths only — orientation / zoom are top-level concerns).
const applyProofSubLayoutWidths = (
  subLayouts: IHypersyncProofSubLayout[] | undefined,
  parentRows: DataObject[]
): void => {
  for (const sub of subLayouts ?? []) {
    const rows: DataObject[] = [];
    for (const row of parentRows) {
      const collection = (row as Record<string, unknown>)[sub.collection];
      if (Array.isArray(collection)) {
        rows.push(...(collection as DataObject[]));
      }
    }
    if (sub.format === HypersyncDataFormat.Tabular && sub.fields?.length) {
      // calcLayoutInfo is non-mutating: it returns freshly-sized fields rather
      // than writing widths back into the input. Assign the result so the
      // computed sublayout widths actually take effect.
      sub.fields = calcLayoutInfo(sub.fields, rows).fields;
    }
    applyProofSubLayoutWidths(sub.subLayouts, rows);
  }
};
