import createHttpError from 'http-errors';
import { StatusCodes } from 'http-status-codes';
import { IHypersyncField } from './DeclarativeProofProvider';
import { HypersyncFieldType } from './enums';
import { ICriteriaField } from './ICriteriaProvider';
import {
  IHypersyncProofField,
  IHypersyncSchemaField
} from './ProofProviderBase';

// Magic constants that are used to allow the user to choose All, Any or None from a set.
export const ID_ALL = 'fbd4bc94-23b7-40fa-b3bc-b3a0e7faf173';
export const ID_ANY = '3cc42087-3b95-4b7e-82e4-d2d8466daa8f';
export const ID_NONE = 'deeee249-c2eb-4598-8824-3db79927c7a6';

/**
 * Used to map one string value to another.
 */
export type StringMap = { [key: string]: string };

export const formatHypersyncError = (
  err: any,
  objectKey: string,
  text: string
) => {
  const status = err.status || err.statusCode;
  const statusMessage = status ? ` - ${status}` : '';
  text = text ? `${text}\n` : '';
  return `${text}${err.message}${statusMessage}\n\tat ${objectKey}\n${err.stack}`;
};

/**
 * Formats a boolean value into a display value.
 *
 * @param {boolean} value Boolean value to format
 * @param {string} formatString A string of the form "TrueDisplayValue;FalseDisplayValue"
 */
export const formatBoolean = (value: boolean, formatString: string) => {
  const parts = formatString.split(';');
  return value ? parts[0] : parts[1];
};

export const validateProofType = (
  criteriaProofType: string,
  providerProofType: string
) => {
  if (criteriaProofType !== providerProofType) {
    throw createHttpError(
      StatusCodes.BAD_REQUEST,
      `Proof type mismatch, expected: ${providerProofType}, received: ${criteriaProofType}`
    );
  }
};

/**
 * Converts a universal field object from a connector's layouts map into a
 * field that can be used in a generated proof layout.  Note that we only
 * include non-default type information.
 */
export const convertFieldToLayoutField = (
  f: IHypersyncField
): IHypersyncProofField => ({
  property: f.property,
  label: f.label,
  width: f.width,
  type: f.type === HypersyncFieldType.TEXT ? undefined : f.type,
  format: f.format
});

/**
 * Converts a universal field object from a connector's layouts map into a
 * field that can be used in a generated schema.
 */
export const convertFieldToSchemaField = (
  f: IHypersyncField
): IHypersyncSchemaField => ({
  property: f.property,
  label: f.label,
  type: f.type || HypersyncFieldType.TEXT
});

/**
 * Finds the corresponding label for the selected criteria option and field
 */
export const getSelectedOptionLabel = (
  selectedField: string,
  selectedValue: string | number,
  fields: ICriteriaField[]
) => {
  const field = fields.find(field => field.name === selectedField);
  return field?.options?.find(o => o.value === selectedValue)?.label || '';
};

/**
 * Split a given array of objects into a single page of data to process
 *
 * @param {any[]} entities The array of objects to divide
 * @param {number} page The current page being processed
 * @param {number} pageSize The number of items to process per page
 * @returns
 */
export const paginate = (entities: any[], page = 0, pageSize: number) => {
  page = Number(page);
  pageSize = Number(pageSize);
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPage = entities.slice(startIndex, endIndex);
  const nextPage = endIndex < entities.length ? page + 1 : undefined;
  return { currentPage, nextPage: nextPage?.toString(), startIndex, endIndex };
};

const uuidRegex = `[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}`;
const customCriteriaRegEx = RegExp(`^CriterionValue\\|${uuidRegex}$`);
export const isSavedCriteriaValue = (value: string) =>
  customCriteriaRegEx.test(value);

export class LayoutFields {
  private _fields: IHypersyncProofField[];
  constructor(fields: IHypersyncProofField[]) {
    this._fields = fields;
  }

  createArgMap(args: string[]) {
    return args.reduce((map: { [key: string]: any }, arg) => {
      if (typeof arg !== 'string') {
        console.log(
          `Expected string, but found ${typeof arg}. Ignored ${arg}.`
        );
        return map;
      }
      map[arg] = true;
      return map;
    }, {});
  }

  removeFields(...args: string[]) {
    const argMap = this.createArgMap(args);

    const resultFields = [];

    for (const field of this._fields) {
      if (!argMap[field.property]) {
        resultFields.push(field);
      }
    }

    this._fields = resultFields;

    return resultFields;
  }

  removeAllFieldsExcept(...args: string[]) {
    const argMap = this.createArgMap(args);

    const resultFields = [];

    for (const field of this.fields) {
      if (argMap[field.property]) {
        resultFields.push(field);
      }
    }
    this._fields = resultFields;

    return resultFields;
  }

  get fields() {
    return this._fields;
  }

  set fields(fields) {
    this._fields = fields;
  }
}
