import { IHypersyncProofField } from './ProofProviderBase';

import { HypersyncPageOrientation } from '@hyperproof/hypersync-models';

const DEFAULT_A4_WIDTH_PIXELS = 794;
const DEFAULT_A4_LENGTH_PIXELS = 1123;
const CHARACTER_WIDTH_FACTOR = 7.5; // our width calculation counts characters, but 1px is not enough room for 1 character. multiplying by 7.5 gives us enough room
const COLUMN_BUFFER_PIXELS = 4;
const COLUMN_MAX_WIDTH_FACTOR = 2.5;

type FieldLengthMap = { [property: string]: number };

/**
 * Calculates proper field widths, orientation and zoom for a proof
 * based on the provided fields and data
 *
 * @param {array} fields The layout's fields.
 * @param {string} data The proof's data OR the subLayouts collection.
 * @param {string} maxZoom The maximum zoom ratio, 1 == no zoom, default .75.
 */
export const calcLayoutInfo = (
  fields: IHypersyncProofField[],
  data: any[],
  maxZoom = 0.75
) => {
  const maxWidthForColumn =
    (DEFAULT_A4_LENGTH_PIXELS / fields.length) * COLUMN_MAX_WIDTH_FACTOR;
  const maxLengthForColumn = maxWidthForColumn / CHARACTER_WIDTH_FACTOR;

  // init lengths w/column label lengths
  const columnLengths: FieldLengthMap = {};
  fields.forEach(
    field =>
      (columnLengths[field.property] = getDataLength(
        field.label,
        maxLengthForColumn
      ))
  );

  // update lengths max data lengths
  data.forEach(function (row) {
    for (const prop in row) {
      if (columnLengths[prop]) {
        columnLengths[prop] = Math.max(
          columnLengths[prop],
          getDataLength(row[prop], maxLengthForColumn)
        );
      }
    }
  });

  // update fields widths with max lengths
  fields.forEach(
    field => (field.width = getFieldWidth(columnLengths[field.property]) + 'px')
  );

  // size proof
  const maxPortrait = DEFAULT_A4_WIDTH_PIXELS;
  const maxLandscape = DEFAULT_A4_LENGTH_PIXELS;
  const proofWidth = getProofWidth(columnLengths);
  const orientation =
    proofWidth <= maxPortrait
      ? HypersyncPageOrientation.Portrait
      : HypersyncPageOrientation.Landscape;
  let zoom = proofWidth < maxLandscape ? 1 : maxLandscape / proofWidth;
  zoom = zoom < maxZoom ? maxZoom : zoom;

  return { fields: fields, orientation: orientation, zoom: zoom };
};

const getDataLength = (value: any, maxLengthForColumn: number) => {
  return value ? Math.min(value.toString().length, maxLengthForColumn) : 0;
};

const getFieldWidth = (length: number) => {
  const width = length * CHARACTER_WIDTH_FACTOR;
  return Math.ceil(width + COLUMN_BUFFER_PIXELS);
};

const getProofWidth = (columnLengths: FieldLengthMap) => {
  let proofWidth = 0;
  for (const column in columnLengths) {
    proofWidth += getFieldWidth(columnLengths[column]);
  }
  return proofWidth;
};
